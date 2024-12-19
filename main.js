import { parseMTL } from './parsers/parseMTL.js';
import { parseOBJ } from './parsers/parseOBJ.js';
import { setupMouseControl } from './controls/mouseControl.js';

async function main() {
  // Mendapatkan WebGL context
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL tidak tersedia!");
    return;
  }

  const vs = await fetch('./shaders/vertexShader.glsl').then(res => res.text());
  const fs = await fetch('./shaders/fragmentShader.glsl').then(res => res.text());

  // Mengompilasi shader dan menghubungkan program
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  // Memuat file .obj
  const objHref = './assets/panci.obj';
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