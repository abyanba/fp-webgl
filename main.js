import { parseMTL } from './parseMTL.js';
import { parseOBJ } from './parseOBJ.js';
import { setupMouseControl } from './mouseControl.js';

async function main() {
  // Mendapatkan WebGL context
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL tidak tersedia!");
    return;
  }

  // Shader vertex
  const vs = `
  attribute vec4 a_position;
  attribute vec3 a_normal;
  attribute vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;

  varying vec3 v_normal;
  varying vec3 v_surfaceToView;
  varying vec4 v_color;

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_color = a_color;
  }
  `;

  // Shader fragment
  const fs = `
  precision highp float;

  varying vec3 v_normal;
  varying vec3 v_surfaceToView;
  varying vec4 v_color;

  uniform vec3 diffuse;
  uniform vec3 ambient;
  uniform vec3 emissive;
  uniform vec3 specular;
  uniform float shininess;
  uniform float opacity;
  uniform vec3 u_lightDirection;
  uniform vec3 u_ambientLight;

  void main () {
    vec3 normal = normalize(v_normal);

    vec3 surfaceToViewDirection = normalize(v_surfaceToView);
    vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);

    vec3 effectiveDiffuse = diffuse * v_color.rgb;
    float effectiveOpacity = opacity * v_color.a;

    gl_FragColor = vec4(
        emissive +
        ambient * u_ambientLight +
        effectiveDiffuse * fakeLight +
        specular * pow(specularLight, shininess),
        effectiveOpacity);
  }
  `;

  // Mengompilasi shader dan menghubungkan program
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  // Memuat file .obj
  const objHref = './panci.obj';
  const response = await fetch(objHref);
  const text = await response.text();
  const obj = parseOBJ(text);

  // Memuat file .mtl
  const baseHref = new URL(objHref, window.location.href);
  const matTexts = await Promise.all(obj.materialLibs.map(async filename => {
    const matHref = new URL(filename, baseHref).href;
    const response = await fetch(matHref);
    return await response.text();
  }));
  const materials = parseMTL(matTexts.join('\n'));

  // Menyiapkan data geometris untuk WebGL
  const parts = obj.geometries.map(({ material, data }) => {
    if (data.color) {
      if (data.position.length === data.color.length) {
        data.color = { numComponents: 3, data: data.color };
      }
    } else {
      data.color = { value: [1, 1, 1, 1] };
    }

    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: materials[material] || defaultMaterial,
      bufferInfo,
    };
  });

  // Mendapatkan ukuran objek 3D
  function getExtents(positions) {
    const min = positions.slice(0, 3);
    const max = positions.slice(0, 3);
    for (let i = 3; i < positions.length; i += 3) {
      for (let j = 0; j < 3; ++j) {
        const v = positions[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }
    return { min, max };
  }

  function getGeometriesExtents(geometries) {
    return geometries.reduce(({ min, max }, { data }) => {
      const minMax = getExtents(data.position);
      return {
        min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
        max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
      };
    }, {
      min: Array(3).fill(Number.POSITIVE_INFINITY),
      max: Array(3).fill(Number.NEGATIVE_INFINITY),
    });
  }

  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  const objOffset = m4.scaleVector(m4.addVectors(extents.min, m4.scaleVector(range, 0.5)), -1);

  const cameraTarget = [0, 0, 0];
  const radius = m4.length(range) * 1.2;
  const cameraPosition = m4.addVectors(cameraTarget, [0, 0, radius]);

  const zNear = radius / 100;
  const zFar = radius * 3;

  function degToRad(deg) { return deg * Math.PI / 180; }

  // Fungsi untuk render
  let currentWorldMatrix = m4.identity();
  function render(time) {
    time *= 0.001; // Konversi waktu ke detik

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);
    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([5, 5, 5]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
    };

    gl.useProgram(meshProgramInfo.program);
    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

    let u_world = m4.multiply(m4.yRotation(time), currentWorldMatrix);
    u_world = m4.translate(u_world, ...objOffset);

    for (const { bufferInfo, material } of parts) {
      // Menyiapkan uniforms material dari MTL
      const materialUniforms = {
        diffuse: material.diffuse || [1, 1, 1],
        ambient: material.ambient || [0.1, 0.1, 0.1],
        emissive: material.emissive || [0, 0, 0],
        specular: material.specular || [1, 1, 1],
        shininess: material.shininess || 32.0,
        opacity: material.opacity || 1.0,
        // Properti PBR baru
        clearCoat: material.clearCoat || 0.0,
        clearCoatRoughness: material.clearCoatRoughness || 0.5,
        specularIntensity: material.specularIntensity || 1.0,
        anisotropy: material.anisotropy || 0.0,
        anisotropyRotation: material.anisotropyRotation || 0.0,
      };

      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      webglUtils.setUniforms(meshProgramInfo, { u_world, ...materialUniforms });
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }

    requestAnimationFrame(render);
  }

  // Memulai render
  requestAnimationFrame(render);

  // Menambahkan kontrol mouse untuk rotasi objek
  const mouseControlCleanup = setupMouseControl(canvas, (deltaX, deltaY) => {
    const rotationSpeed = 0.005;
    const rotationX = deltaY * rotationSpeed;
    const rotationY = deltaX * rotationSpeed;

    // Matriks rotasi berdasarkan input mouse
    const rotationMatrix = m4.multiply(
      m4.xRotation(rotationX),
      m4.yRotation(rotationY)
    );

    // Memperbarui world matrix untuk rotasi objek
    currentWorldMatrix = m4.multiply(rotationMatrix, currentWorldMatrix);
  });
  console.log(parseOBJ(text));
}

main();