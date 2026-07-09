import {
  MeshToonMaterial,
  DataTexture,
  RedFormat,
  NearestFilter,
  Color,
  type ColorRepresentation,
  type Texture,
  type Material,
  MeshStandardMaterial,
  MeshLambertMaterial,
} from "three";

// Shared stylized toon shading. A lifted shadow floor keeps props readable
// in shade (ship / player / asteroids) without full PBR darkness.

let cachedGradient: DataTexture | null = null;
let cachedReadableGradient: DataTexture | null = null;

export function toonGradient(): DataTexture {
  if (cachedGradient) return cachedGradient;
  const steps = new Uint8Array([70, 130, 190, 255]);
  const tex = new DataTexture(steps, steps.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  cachedGradient = tex;
  return tex;
}

// Softer ramp: darkest band stays ~45% so silhouettes never crush to black.
export function readableToonGradient(): DataTexture {
  if (cachedReadableGradient) return cachedReadableGradient;
  const steps = new Uint8Array([115, 155, 200, 255]);
  const tex = new DataTexture(steps, steps.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  cachedReadableGradient = tex;
  return tex;
}

export function createTerrainMaterial(): MeshToonMaterial {
  return new MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonGradient(),
  });
}

export function createToonMaterial(color: ColorRepresentation): MeshToonMaterial {
  return new MeshToonMaterial({
    color: new Color(color),
    gradientMap: readableToonGradient(),
  });
}

export function createTexturedToonMaterial(map: Texture): MeshToonMaterial {
  return new MeshToonMaterial({
    map,
    gradientMap: readableToonGradient(),
  });
}

// Convert an existing mesh material to a readable toon look (keeps map/color).
export function makeReadableToon(src: Material): MeshToonMaterial {
  const s = src as MeshStandardMaterial & MeshLambertMaterial & MeshToonMaterial;
  const out = new MeshToonMaterial({
    gradientMap: readableToonGradient(),
    fog: false,
  });
  if (s.map) out.map = s.map;
  if (s.color) out.color.copy(s.color).multiplyScalar(1.15);
  else out.color.set("#c8c8c8");
  if (s.emissive && s.emissiveIntensity) {
    out.emissive.copy(s.emissive);
    out.emissiveIntensity = Math.min(0.25, s.emissiveIntensity);
  }
  out.opacity = s.opacity ?? 1;
  out.transparent = !!s.transparent;
  return out;
}
