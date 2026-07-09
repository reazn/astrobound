import {
  Mesh, BufferGeometry, BufferAttribute, MeshToonMaterial, ShaderMaterial,
  FrontSide, BackSide, Vector3, Color,
} from "three";
import type { Planet } from "../worldgen/planet";
import type { PlanetLiquid } from "../content/planets/types";
import { toonGradient } from "./toonMaterial";

// Liquid uses the same spherified-cube topology + flat facets as terrain.
// MeshToonMaterial (not a raw ShaderMaterial) so logarithmic depth matches land.

export interface PlanetLiquidMesh {
  mesh: Mesh;
  kind: PlanetLiquid["kind"];
  level: number;
  seaRadius: number;
  update(sunDir: Vector3, dayFactor: number, camPlanetLocal: Vector3 | null): void;
}

const FACES = [
  { dir: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { dir: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { dir: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { dir: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { dir: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { dir: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
] as const;

function spherify(x: number, y: number, z: number, out: [number, number, number]) {
  const x2 = x * x, y2 = y * y, z2 = z * z;
  out[0] = x * Math.sqrt(1 - y2 * 0.5 - z2 * 0.5 + (y2 * z2) / 3);
  out[1] = y * Math.sqrt(1 - z2 * 0.5 - x2 * 0.5 + (z2 * x2) / 3);
  out[2] = z * Math.sqrt(1 - x2 * 0.5 - y2 * 0.5 + (x2 * y2) / 3);
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  out[0] /= len; out[1] /= len; out[2] /= len;
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Cheap hash in [0,1) — breaks regular sine tiling on facets.
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildLiquidGeometry(
  planet: Planet,
  seaRadius: number,
  segments: number,
  baseColor: [number, number, number],
  deepColor: [number, number, number],
  foamColor: [number, number, number],
  _isLava: boolean,
  waveAmp: number,
): BufferGeometry {
  const S = Math.max(12, segments);
  const perFace = (S + 1) * (S + 1);
  const shared = new Float32Array(perFace * 6 * 3);
  const depths = new Float32Array(perFace * 6);
  const dir: [number, number, number] = [0, 0, 0];
  let vOff = 0;
  let dOff = 0;
  let maxDepth = 1;
  // Keep a land fringe so waves lifting the surface don't open a gap at shore.
  const bury = Math.max(1.8, waveAmp * 3.5);
  const keepMin = -bury;

  for (const face of FACES) {
    for (let j = 0; j <= S; j++) {
      const b = (j / S) * 2 - 1;
      for (let i = 0; i <= S; i++) {
        const a = (i / S) * 2 - 1;
        const cx = face.dir[0] + face.u[0] * a + face.v[0] * b;
        const cy = face.dir[1] + face.u[1] * a + face.v[1] * b;
        const cz = face.dir[2] + face.u[2] * a + face.v[2] * b;
        spherify(cx, cy, cz, dir);
        const terrainR = planet.surfaceRadius(dir[0], dir[1], dir[2]);
        // Signed: positive = under water, negative = land above sea.
        const depth = seaRadius - terrainR;
        if (depth > maxDepth) maxDepth = depth;
        // Pull land-fringe verts slightly into the ground so waves can't lift a gap.
        const r = depth < 0
          ? seaRadius - Math.min(bury, -depth * 0.35 + waveAmp * 1.2)
          : seaRadius;
        shared[vOff++] = dir[0] * r;
        shared[vOff++] = dir[1] * r;
        shared[vOff++] = dir[2] * r;
        depths[dOff++] = depth;
      }
    }
  }

  const row = S + 1;
  let wetTris = 0;
  for (let f = 0; f < 6; f++) {
    const faceBase = f * perFace;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const aI = faceBase + i + j * row;
        const bI = aI + 1;
        const cI = aI + row;
        const dI = cI + 1;
        if ((depths[aI] + depths[bI] + depths[dI]) / 3 > keepMin) wetTris++;
        if ((depths[aI] + depths[dI] + depths[cI]) / 3 > keepMin) wetTris++;
      }
    }
  }

  if (wetTris === 0) {
    return new BufferGeometry();
  }

  const positions = new Float32Array(wetTris * 9);
  const normals = new Float32Array(wetTris * 9);
  const colors = new Float32Array(wetTris * 9);
  let t = 0;

  const pushTri = (i0: number, i1: number, i2: number) => {
    const ax = shared[i0 * 3], ay = shared[i0 * 3 + 1], az = shared[i0 * 3 + 2];
    const bx = shared[i1 * 3], by = shared[i1 * 3 + 1], bz = shared[i1 * 3 + 2];
    const cx = shared[i2 * 3], cy = shared[i2 * 3 + 1], cz = shared[i2 * 3 + 2];
    const avgD = (depths[i0] + depths[i1] + depths[i2]) / 3;
    if (avgD <= keepMin) return;

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const mx = (ax + bx + cx) / 3, my = (ay + by + cy) / 3, mz = (az + bz + cz) / 3;
    if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }

    const wetDepth = Math.max(0, avgD);
    const deepT = Math.min(1, Math.pow(wetDepth / Math.max(10, maxDepth * 0.7), 0.65));
    const shoreT = avgD < 4 ? 1 - Math.min(1, Math.max(0, avgD) / 7) : 0;
    let col = lerp3(baseColor, deepColor, deepT);
    if (shoreT > 0.1) col = lerp3(col, foamColor, shoreT * 0.55);

    // Subtle per-facet brightness only — keep hue close to the liquid base.
    const h = hash3(mx * 0.07, my * 0.09, mz * 0.06);
    const bright = 0.94 + h * 0.1;
    col = [
      Math.min(1, Math.max(0, col[0] * bright)),
      Math.min(1, Math.max(0, col[1] * bright)),
      Math.min(1, Math.max(0, col[2] * bright)),
    ];

    const o = t * 9;
    positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz;
    for (let k = 0; k < 3; k++) {
      normals[o + k * 3] = nx;
      normals[o + k * 3 + 1] = ny;
      normals[o + k * 3 + 2] = nz;
      colors[o + k * 3] = col[0];
      colors[o + k * 3 + 1] = col[1];
      colors[o + k * 3 + 2] = col[2];
    }
    t++;
  };

  for (let f = 0; f < 6; f++) {
    const faceBase = f * perFace;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const aI = faceBase + i + j * row;
        const bI = aI + 1;
        const cI = aI + row;
        const dI = cI + 1;
        pushTri(aI, bI, dI);
        pushTri(aI, dI, cI);
      }
    }
  }

  const trim = t * 9;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions.slice(0, trim), 3));
  geometry.setAttribute("normal", new BufferAttribute(normals.slice(0, trim), 3));
  geometry.setAttribute("color", new BufferAttribute(colors.slice(0, trim), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPlanetLiquid(
  planet: Planet,
  segments?: number,
): PlanetLiquidMesh | null {
  const liq = planet.def.liquid;
  if (!liq) return null;

  // Sit clearly above the basin floor so it wins the depth test vs terrain.
  const seaRadius = Math.max(planet.minR + 2, planet.seaLevel) + 1.6;
  const isLava = liq.kind === "lava";
  const base = hexRgb(liq.color);
  const deep: [number, number, number] = isLava
    ? [base[0] * 0.35, base[1] * 0.18, base[2] * 0.08]
    : lerp3(base, [0.04, 0.1, 0.16], 0.75);
  const foam = lerp3(base, isLava ? [1, 0.85, 0.35] : [0.78, 0.92, 1], 0.6);

  const segs = segments ?? Math.max(28, Math.round(planet.def.faceSegments / 5));
  const waveAmp = isLava ? 0.22 : 0.38;
  const geometry = buildLiquidGeometry(
    planet, seaRadius, segs, base, deep, foam, isLava, waveAmp,
  );
  if (!geometry.getAttribute("position") || geometry.getAttribute("position").count === 0) {
    return null;
  }

  const opacity = Math.min(0.9, Math.max(0.78, liq.opacity + 0.18));
  const waveUniforms = {
    uWaveTime: { value: 0 },
    uWaveAmp: { value: waveAmp },
    uSeaR: { value: seaRadius },
  };

  const mat = new MeshToonMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    fog: false,
    gradientMap: toonGradient(),
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  if (isLava) {
    mat.emissive = new Color(liq.color);
    mat.emissiveIntensity = 0.45;
  }
  // Cheap radial ripple — two sines, no textures. Keeps MeshToon + log-depth.
  // Waves fade out near/under sea radius so the buried shore fringe stays put.
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaveTime = waveUniforms.uWaveTime;
    shader.uniforms.uWaveAmp = waveUniforms.uWaveAmp;
    shader.uniforms.uSeaR = waveUniforms.uSeaR;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
        uniform float uWaveTime;
        uniform float uWaveAmp;
        uniform float uSeaR;
        `,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        {
          float r0 = length(transformed);
          vec3 n0 = r0 > 1e-5 ? transformed / r0 : vec3(0.0, 1.0, 0.0);
          float open = smoothstep(uSeaR - 1.2, uSeaR + 0.4, r0);
          float w = sin(n0.x * 18.0 + n0.z * 14.0 + uWaveTime * 1.35)
                  + sin(n0.y * 16.0 + n0.x * 11.0 - uWaveTime * 0.95) * 0.55;
          transformed += n0 * (w * uWaveAmp * open);
        }
        `,
      );
  };
  mat.customProgramCacheKey = () => `liquid-wave-v2-${isLava ? "lava" : "water"}`;

  const mesh = new Mesh(geometry, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;

  // Volume shell — includes log-depth chunks so it works with the renderer.
  const volMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: BackSide,
    fog: false,
    vertexColors: true,
    uniforms: {
      uOpacity: { value: isLava ? 0.5 : 0.4 },
      uUnder: { value: 0 },
      uCamLocal: { value: new Vector3(0, seaRadius + 100, 0) },
      uSeaR: { value: seaRadius },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vColor = color * 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      uniform float uOpacity, uUnder, uSeaR;
      uniform vec3 uCamLocal;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float camR = length(uCamLocal);
        float under = mix(0.4, 1.1, clamp((uSeaR - camR) / 30.0, 0.0, 1.0));
        float a = uOpacity * under * mix(0.3, 1.0, uUnder);
        if (a < 0.02) discard;
        gl_FragColor = vec4(vColor, a);
      }
    `,
  });
  const volume = new Mesh(geometry.clone(), volMat);
  volume.scale.setScalar(0.99);
  volume.renderOrder = 1;
  mesh.add(volume);

  return {
    mesh,
    kind: liq.kind,
    level: liq.level,
    seaRadius,
    update(_sunDir, _dayFactor, camPlanetLocal) {
      waveUniforms.uWaveTime.value = performance.now() * 0.001;
      mat.opacity = opacity;
      if (camPlanetLocal) {
        volMat.uniforms.uCamLocal.value.copy(camPlanetLocal);
        const under = camPlanetLocal.length() < seaRadius - 0.4 ? 1 : 0;
        volMat.uniforms.uUnder.value = under;
        mesh.visible = under < 0.5;
        volume.visible = true;
      } else {
        volMat.uniforms.uUnder.value = 0;
        mesh.visible = true;
      }
    },
  };
}
