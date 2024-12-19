"use strict";

export function parseMTL(text) {
    const materials = {};
    let material;
  
    const keywords = {
      newmtl(parts, unparsedArgs) {
        material = {};
        materials[unparsedArgs] = material;
      },
      /* eslint brace-style:0 */
      Ns(parts) { material.shininess = parseFloat(parts[0]); },
      Ka(parts) { material.ambient = parts.map(parseFloat); },
      Kd(parts) { material.diffuse = parts.map(parseFloat); },
      Ks(parts) { material.specular = parts.map(parseFloat); },
      Ke(parts) { material.emissive = parts.map(parseFloat); },
      Ni(parts) { material.opticalDensity = parseFloat(parts[0]); },
      d(parts) { material.opacity = parseFloat(parts[0]); },
      illum(parts) { material.illum = parseInt(parts[0]); },
  
      // Tambahkan penanganan untuk properti tambahan
      Pr(parts) { material.phongExponent = parseFloat(parts[0]); },
      Pm(parts) { material.phongMaterial = parseFloat(parts[0]); },
      Ps(parts) { material.specularIntensity = parseFloat(parts[0]); },
      Pc(parts) { material.clearCoat = parseFloat(parts[0]); },
      Pcr(parts) { material.clearCoatRoughness = parseFloat(parts[0]); },
      aniso(parts) { material.anisotropy = parseFloat(parts[0]); },
      anisor(parts) { material.anisotropyRotation = parseFloat(parts[0]); },
    };
  
    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
      const line = lines[lineNo].trim();
      if (line === '' || line.startsWith('#')) {
        continue;
      }
      const m = keywordRE.exec(line);
      if (!m) {
        continue;
      }
      const [, keyword, unparsedArgs] = m;
      const parts = line.split(/\s+/).slice(1);
      const handler = keywords[keyword];
      if (!handler) {
        console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
        continue;
      }
      handler(parts, unparsedArgs);
    }
  
    return materials;
  }