import {
  Group,
  Mesh,
  BufferGeometry,
  BufferAttribute,
  Vector3,
  Color,
  FrontSide,
  SphereGeometry,
  MeshToonMaterial,
  MeshBasicMaterial,
  Frustum,
  Matrix4,
  Sphere,
  type Camera,
  type Material,
} from "three";
import type { Planet } from "./planet";
import {
  buildChunkBuffers,
  buildLiquidChunkBuffers,
  CUBE_FACES,
  spherify,
} from "./chunkBuffers";
import { buildPlanetMeshAsync, geometryFromBuffers } from "./planetMesh";
import { buildMeshBuffers } from "./meshBuffers";
import type { PlanetDef } from "../content/planets/types";
import { toonGradient } from "../visuals/toonMaterial";

// Player-centered cube-sphere LOD.
// All distance → depth steps are hard-coded in LOD_BANDS (no geometric falloff).

export type LodViewMode = "surface" | "space";

const IMPOSTOR_SEGS = 40;
const COLLIDER_SEGS = 48;
const CHUNK_RANGE_MULT = 6;

export interface LodBand {
  /** Display / debug index. 0 = finest. */
  lod: number;
  /** Quadtree depth for this band. */
  depth: number;
  /** Outer radius (player-local units). Inclusive; last band uses Infinity. */
  outer: number;
}

/**
 * Hard-coded concentric LOD ladder. Edit these numbers to tune.
 * LOD 0 = underfoot finest; higher lod = farther / coarser.
 */
export const LOD_BANDS: readonly LodBand[] = [
  { lod: 0, depth: 10, outer: 100 },
  { lod: 1, depth: 9, outer: 300 },
  { lod: 2, depth: 8, outer: 1000 },
  { lod: 3, depth: 7, outer: 6000 },
  { lod: 4, depth: 6, outer: 40000 },
  { lod: 5, depth: 5, outer: 100000 },
  { lod: 6, depth: 4, outer: Number.POSITIVE_INFINITY },
];

/** @deprecated kept as alias — prefer LOD_BANDS[0].outer */
export const LOD_STEP = 1;

export const SURFACE_LOD = {
  maxDepth: 12,
  minDepth: 3,
  maxLeaves: 5000,
  maxSplits: 16,
  maxMerges: 32,
  maxBuilds: 32,
  fineRadius: LOD_BANDS[0].outer,
  impostorAlt: 3.5,
};

export const SPACE_LOD = {
  maxDepth: 7,
  minDepth: 3,
  maxLeaves: 96,
  maxSplits: 3,
  maxMerges: 6,
  maxBuilds: 6,
  fineRadius: 800,
  impostorAlt: 1.2,
};

const SURFACE = SURFACE_LOD;
const SPACE = SPACE_LOD;

/** Index = standard LOD level (0 = finest). Warm → cool as detail drops. */
export const LOD_DEBUG_COLORS = [
  "#ff0044", // LOD 0 finest
  "#ff6600", // 1
  "#ffaa00", // 2
  "#ffee00", // 3
  "#aaff00", // 4
  "#44ff00", // 5
  "#00ff88", // 6
  "#00ffcc", // 7
  "#00aaff", // 8
  "#0066ff", // 9
  "#4400ff", // 10
  "#8800ff", // 11
  "#aa00ff", // 12
  "#ff00cc", // 13
  "#ff66aa", // 14
  "#ffffff", // 15+ coarsest
] as const;

function segsForDepth(depth: number): number {
  if (depth <= 4) return 6;
  if (depth <= 6) return 8;
  if (depth <= 8) return 12;
  if (depth <= 10) return 14;
  if (depth <= 12) return 16;
  if (depth <= 14) return 18;
  return 20;
}

function waveScaleForDepth(_depth: number): number {
  return 0.45;
}

/** Hard-coded distance → target tree depth, clamped to mode min/max. */
function targetDepthForDist(
  dist: number,
  maxDepth: number,
  minDepth: number,
): number {
  let depth = LOD_BANDS[LOD_BANDS.length - 1].depth;
  for (const band of LOD_BANDS) {
    if (dist <= band.outer) {
      depth = band.depth;
      break;
    }
  }
  return Math.min(maxDepth, Math.max(minDepth, depth));
}

/** Quadtree depth → LOD index from the hard-coded table. */
export function treeDepthToLod(treeDepth: number, _maxDepth?: number): number {
  for (const band of LOD_BANDS) {
    if (treeDepth >= band.depth) return band.lod;
  }
  return LOD_BANDS[LOD_BANDS.length - 1].lod;
}

/** LOD index → tree depth from the hard-coded table. */
export function lodToTreeDepth(lod: number, _maxDepth?: number): number {
  const i = Math.max(0, Math.min(LOD_BANDS.length - 1, lod));
  return LOD_BANDS[i].depth;
}

export function lodDebugColorHex(lod: number): string {
  const i = Math.max(0, Math.min(LOD_DEBUG_COLORS.length - 1, lod));
  return LOD_DEBUG_COLORS[i];
}

export function lodLevelCount(): number {
  return LOD_BANDS.length;
}

/** Outer radius for a display LOD index (0 = finest). */
export function lodIndexOuterRadius(lod: number): number {
  const i = Math.max(0, Math.min(LOD_BANDS.length - 1, lod));
  const outer = LOD_BANDS[i].outer;
  return Number.isFinite(outer)
    ? outer
    : LOD_BANDS[Math.max(0, i - 1)].outer * 2;
}

/** Inner radius for a display LOD index. */
export function lodIndexInnerRadius(lod: number): number {
  if (lod <= 0) return 0;
  return lodIndexOuterRadius(lod - 1);
}

export function lodRingOuterRadius(treeDepth: number): number {
  return lodIndexOuterRadius(treeDepthToLod(treeDepth));
}

function debugColorForTreeDepth(treeDepth: number): Color {
  return new Color(lodDebugColorHex(treeDepthToLod(treeDepth)));
}

/** @deprecated — use LOD_BANDS */
export const SURFACE_BAND_DEPTHS = LOD_BANDS.map((b) => b.depth);
/** @deprecated — use LOD_BANDS */
export const SURFACE_RING_OUTERS = LOD_BANDS.slice(0, -1).map((b) => b.outer);

export interface CubeSphereLodDebug {
  leaves: number;
  maxDepth: number;
  minDepth: number;
  /** Quadtree depth under camera (internal). */
  depthUnderCam: number;
  /** Standard LOD under camera (0 = finest). */
  lodUnderCam: number;
  camDist: number;
  altitude: number;
  impostor: boolean;
  chunksVisible: boolean;
  mode: LodViewMode;
  fineRadius: number;
  debugVisuals: boolean;
}

export interface CubeSphereLod {
  group: Group;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
  seaRadius: number;
  update(
    camera: Camera,
    planetRenderPos: Vector3,
    focusPlanetLocal?: Vector3,
    mode?: LodViewMode,
  ): void;
  updateLiquid(camPlanetLocal: Vector3 | null): void;
  setDebugVisuals(on: boolean): void;
  debug(): CubeSphereLodDebug;
  depthAlong(dir: Vector3): number;
  dispose(): void;
  readonly leafCount: number;
  readonly hasLiquid: boolean;
}

interface LodNode {
  face: number;
  depth: number;
  u0: number;
  v0: number;
  size: number;
  children: LodNode[] | null;
  mesh: Mesh | null;
  /** Kept while subdivided so merge can restore without a rebuild. */
  stash: Mesh | null;
  liquidMesh: Mesh | null;
  center: Vector3;
  boundR: number;
  cullR: number;
}

function estimateNodeBounds(
  planet: Planet,
  face: number,
  u0: number,
  v0: number,
  size: number,
  outCenter: Vector3,
): number {
  const f = CUBE_FACES[face];
  const dir: [number, number, number] = [0, 0, 0];
  const a = u0 + size * 0.5;
  const b = v0 + size * 0.5;
  const x = f.dir[0] + f.u[0] * a + f.v[0] * b;
  const y = f.dir[1] + f.u[1] * a + f.v[1] * b;
  const z = f.dir[2] + f.u[2] * a + f.v[2] * b;
  spherify(x, y, z, dir);
  const r = planet.radius;
  outCenter.set(dir[0] * r, dir[1] * r, dir[2] * r);
  return planet.radius * size * 0.95 + planet.amplitude * 0.55 + 40;
}

function makeGeometry(
  positions: Float32Array,
  normals: Float32Array,
  colors: Float32Array,
): BufferGeometry {
  return geometryFromBuffers(positions, normals, colors);
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function createCubeSphereLod(
  planet: Planet,
  material: Material,
): CubeSphereLod {
  const group = new Group();
  const def = planet.def;
  const camLocal = new Vector3();
  const camDir = new Vector3();
  const nodeDir = new Vector3();
  const viewDir = new Vector3();
  const toTile = new Vector3();

  const hasLiquid = false;
  const seaRadius = planet.seaLevel;
  const isLava = def.liquid?.kind === "lava";
  const waveAmp = 0;
  const baseCol = hasLiquid
    ? hexRgb(def.liquid!.color)
    : ([0, 0, 0] as [number, number, number]);
  const deepCol: [number, number, number] = isLava
    ? [baseCol[0] * 0.35, baseCol[1] * 0.18, baseCol[2] * 0.08]
    : lerp3(baseCol, [0.04, 0.1, 0.16], 0.75);
  const foamCol = lerp3(
    baseCol,
    isLava ? [1, 0.85, 0.35] : [0.78, 0.92, 1],
    0.6,
  );

  const waveUniforms = {
    uWaveTime: { value: 0 },
    uWaveAmp: { value: waveAmp },
    uSeaR: { value: seaRadius },
  };

  let liquidMat: MeshToonMaterial | null = null;
  if (hasLiquid) {
    const opacity = Math.min(
      0.9,
      Math.max(0.78, (def.liquid!.opacity ?? 0.8) + 0.18),
    );
    liquidMat = new MeshToonMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      side: FrontSide,
      fog: false,
      gradientMap: toonGradient(),
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    if (isLava) {
      liquidMat.emissive = new Color(def.liquid!.color);
      liquidMat.emissiveIntensity = 0.45;
    }
    liquidMat.onBeforeCompile = (shader) => {
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
          attribute float aWaveScale;
          `,
        )
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
          {
            float r0 = length(transformed);
            vec3 n0 = r0 > 1e-5 ? transformed / r0 : vec3(0.0, 1.0, 0.0);
            float wScale = aWaveScale > 0.0 ? aWaveScale : 1.0;
            float amp = uWaveAmp * wScale;
            float open = smoothstep(uSeaR - max(14.0, amp * 6.0), uSeaR + max(1.0, amp * 0.4), r0);
            float freq = mix(2.2, 5.5, wScale);
            float w = sin(n0.x * freq + n0.z * (freq * 0.78) + uWaveTime * 0.55)
                    + sin(n0.y * (freq * 0.9) + n0.x * (freq * 0.6) - uWaveTime * 0.38) * 0.35;
            transformed += n0 * (w * amp * open * 0.55);
          }
          `,
        );
    };
    liquidMat.customProgramCacheKey = () =>
      `liquid-chunk-wave-${isLava ? "lava" : "water"}`;
  }

  const impostorBuf = buildMeshBuffers(
    (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
    planet.minR,
    planet.maxR,
    def.palette,
    def.noise.mottleFreq,
    IMPOSTOR_SEGS,
    false,
    planet.seaLevel,
  );
  const impostor = new Mesh(
    makeGeometry(
      impostorBuf.positions,
      impostorBuf.normals,
      impostorBuf.colors,
    ),
    material,
  );
  impostor.frustumCulled = true;
  impostor.receiveShadow = false;
  impostor.castShadow = false;
  impostor.renderOrder = 0;
  impostor.visible = false;
  group.add(impostor);

  let liquidImpostor: Mesh | null = null;
  if (hasLiquid) {
    const farLiqMat = new MeshToonMaterial({
      color: new Color(def.liquid!.color),
      transparent: true,
      opacity: Math.min(
        0.88,
        Math.max(0.75, (def.liquid!.opacity ?? 0.8) + 0.1),
      ),
      depthWrite: false,
      fog: false,
      gradientMap: toonGradient(),
    });
    if (isLava) {
      farLiqMat.emissive = new Color(def.liquid!.color);
      farLiqMat.emissiveIntensity = 0.4;
    }
    liquidImpostor = new Mesh(new SphereGeometry(seaRadius, 48, 32), farLiqMat);
    liquidImpostor.frustumCulled = true;
    liquidImpostor.renderOrder = 2;
    liquidImpostor.visible = false;
    group.add(liquidImpostor);
  }

  const colliderBuf = buildMeshBuffers(
    (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
    planet.minR,
    planet.maxR,
    def.palette,
    def.noise.mottleFreq,
    COLLIDER_SEGS,
    true,
    planet.seaLevel,
  );

  const chunkRoot = new Group();
  group.add(chunkRoot);
  const liquidRoot = new Group();
  group.add(liquidRoot);

  const roots: LodNode[] = [];
  for (let f = 0; f < 6; f++) {
    const center = new Vector3();
    const boundR = estimateNodeBounds(planet, f, -1, -1, 2, center);
    roots.push({
      face: f,
      depth: 0,
      u0: -1,
      v0: -1,
      size: 2,
      children: null,
      mesh: null,
      stash: null,
      liquidMesh: null,
      center,
      boundR,
      cullR: boundR,
    });
  }

  let leafMeshes = 0;
  let splitsThisFrame = 0;
  let mergesThisFrame = 0;
  let buildsThisFrame = 0;
  let frameCounter = 0;
  let lastCamDist = 0;
  let lastAlt = 0;
  let lastImpostor = false;
  let viewMode: LodViewMode = "surface";
  let maxDepthCap = SURFACE.maxDepth;
  let minDepthCap = SURFACE.minDepth;
  let maxLeafCap = SURFACE.maxLeaves;
  let maxSplitsCap = SURFACE.maxSplits;
  let maxMergesCap = SURFACE.maxMerges;
  let maxBuildsCap = SURFACE.maxBuilds;
  let fineRadius = SURFACE.fineRadius;
  let debugVisuals = false;
  let horizonDot = -0.25;
  const viewFrustum = new Frustum();
  const projScreen = new Matrix4();
  const worldSphere = new Sphere();
  const tmpWorldCenter = new Vector3();
  const cameraPos = new Vector3();

  const debugMeshMats = new Map<number, MeshBasicMaterial>();

  const debugMatForDepth = (treeDepth: number) => {
    const lod = treeDepthToLod(treeDepth);
    let m = debugMeshMats.get(lod);
    if (!m) {
      m = new MeshBasicMaterial({
        color: debugColorForTreeDepth(treeDepth),
        transparent: true,
        opacity: 0.82,
        depthWrite: true,
        fog: false,
      });
      debugMeshMats.set(lod, m);
    } else {
      m.color.copy(debugColorForTreeDepth(treeDepth));
    }
    return m;
  };

  const applyDebugTint = (node: LodNode) => {
    if (!node.mesh) return;
    if (!node.mesh.userData.origMat) node.mesh.userData.origMat = material;
    node.mesh.userData.lodDepth = node.depth;
    if (debugVisuals) node.mesh.material = debugMatForDepth(node.depth);
    else node.mesh.material = material;
  };

  const refreshDebugTints = () => {
    const walk = (n: LodNode) => {
      if (n.children) {
        for (const c of n.children) walk(c);
        return;
      }
      applyDebugTint(n);
    };
    for (const r of roots) walk(r);
  };

  const disposeMesh = (node: LodNode) => {
    if (node.mesh) {
      chunkRoot.remove(node.mesh);
      node.mesh.geometry.dispose();
      node.mesh = null;
      leafMeshes = Math.max(0, leafMeshes - 1);
    }
    if (node.stash) {
      node.stash.geometry.dispose();
      node.stash = null;
    }
    if (node.liquidMesh) {
      liquidRoot.remove(node.liquidMesh);
      node.liquidMesh.geometry.dispose();
      node.liquidMesh = null;
    }
  };

  const stashMesh = (node: LodNode) => {
    if (!node.mesh) return;
    chunkRoot.remove(node.mesh);
    if (node.depth >= maxDepthCap - 3) {
      if (node.stash) node.stash.geometry.dispose();
      node.stash = node.mesh;
    } else {
      node.mesh.geometry.dispose();
      if (node.stash) {
        node.stash.geometry.dispose();
        node.stash = null;
      }
    }
    node.mesh = null;
    leafMeshes = Math.max(0, leafMeshes - 1);
  };

  const restoreStash = (node: LodNode): boolean => {
    if (!node.stash) return false;
    node.mesh = node.stash;
    node.stash = null;
    chunkRoot.add(node.mesh);
    leafMeshes++;
    node.mesh.visible = true;
    applyDebugTint(node);
    return true;
  };

  const buildLiquidFor = (node: LodNode, countBudget = true) => {
    if (!hasLiquid || !liquidMat) return;
    if (node.depth < minDepthCap) return;
    if (node.liquidMesh) {
      node.liquidMesh.visible = true;
      return;
    }
    if (countBudget) {
      if (buildsThisFrame >= maxBuildsCap) return;
      buildsThisFrame++;
    }
    const buf = buildLiquidChunkBuffers(
      (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
      seaRadius,
      node.face,
      node.u0,
      node.v0,
      node.size,
      segsForDepth(node.depth),
      baseCol,
      deepCol,
      foamCol,
      waveAmp,
    );
    if (!buf) return;
    const mesh = new Mesh(
      makeGeometry(buf.positions, buf.normals, buf.colors),
      liquidMat,
    );
    const wScale = waveScaleForDepth(node.depth);
    const vertCount = buf.positions.length / 3;
    const waveAttr = new Float32Array(vertCount);
    waveAttr.fill(wScale);
    mesh.geometry.setAttribute("aWaveScale", new BufferAttribute(waveAttr, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    if (mesh.geometry.boundingSphere) {
      mesh.geometry.boundingSphere.center.copy(node.center);
      mesh.geometry.boundingSphere.radius = Math.max(
        mesh.geometry.boundingSphere.radius,
        node.cullR,
        buf.boundRadius,
      );
    }
    node.liquidMesh = mesh;
    liquidRoot.add(mesh);
  };

  const buildNodeSync = (node: LodNode, allowLiquid = true) => {
    if (node.mesh) {
      node.mesh.visible = true;
      applyDebugTint(node);
      if (allowLiquid) buildLiquidFor(node, false);
      return true;
    }
    if (buildsThisFrame >= maxBuildsCap) return false;
    buildsThisFrame++;
    let segs = segsForDepth(node.depth);
    {
      const f = CUBE_FACES[node.face];
      const cornerDir: [number, number, number] = [0, 0, 0];
      const cornerR = (u: number, v: number) => {
        const x = f.dir[0] + f.u[0] * u + f.v[0] * v;
        const y = f.dir[1] + f.u[1] * u + f.v[1] * v;
        const z = f.dir[2] + f.u[2] * u + f.v[2] * v;
        spherify(x, y, z, cornerDir);
        return planet.surfaceRadius(cornerDir[0], cornerDir[1], cornerDir[2]);
      };
      const r00 = cornerR(node.u0, node.v0);
      const r10 = cornerR(node.u0 + node.size, node.v0);
      const r01 = cornerR(node.u0, node.v0 + node.size);
      const r11 = cornerR(node.u0 + node.size, node.v0 + node.size);
      const rMin = Math.min(r00, r10, r01, r11);
      const rMax = Math.max(r00, r10, r01, r11);
      if (rMax - rMin > planet.amplitude * 0.12) {
        segs = Math.min(segs + 6, 28);
      }
    }
    const buf = buildChunkBuffers(
      (nx, ny, nz) => planet.surfaceRadius(nx, ny, nz),
      planet.minR,
      planet.maxR,
      def.palette,
      def.noise.mottleFreq,
      node.face,
      node.u0,
      node.v0,
      node.size,
      segs,
      planet.seaLevel,
      node.depth >= minDepthCap + 1,
      {
        biomeAt: (nx, ny, nz) => planet.biomeAt(nx, ny, nz),
        biomeWeights: (nx, ny, nz) => planet.biomeWeights(nx, ny, nz),
        colors: planet.biomeColors,
      },
    );
    const mesh = new Mesh(
      makeGeometry(buf.positions, buf.normals, buf.colors),
      material,
    );
    mesh.frustumCulled = true;
    mesh.receiveShadow = node.depth >= minDepthCap + 2;
    mesh.castShadow = false;
    mesh.renderOrder = 1;
    node.center.set(buf.center[0], buf.center[1], buf.center[2]);
    node.boundR = buf.boundRadius;
    node.cullR = buf.cullRadius;
    if (mesh.geometry.boundingSphere) {
      mesh.geometry.boundingSphere.center.copy(node.center);
      mesh.geometry.boundingSphere.radius = node.cullR;
    }
    node.mesh = mesh;
    chunkRoot.add(mesh);
    leafMeshes++;
    applyDebugTint(node);
    if (allowLiquid) buildLiquidFor(node, false);
    return true;
  };

  const splitNode = (node: LodNode): LodNode[] => {
    if (node.children) return node.children;
    const h = node.size * 0.5;
    const kids: LodNode[] = [];
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const center = new Vector3();
        const u0 = node.u0 + i * h;
        const v0 = node.v0 + j * h;
        const boundR = estimateNodeBounds(planet, node.face, u0, v0, h, center);
        kids.push({
          face: node.face,
          depth: node.depth + 1,
          u0,
          v0,
          size: h,
          children: null,
          mesh: null,
          stash: null,
          liquidMesh: null,
          center,
          boundR,
          cullR: boundR,
        });
      }
    }
    node.children = kids;
    return kids;
  };

  const mergeNode = (node: LodNode): boolean => {
    if (!node.children) return false;
    const canRestore = !!node.stash || !!node.mesh;
    if (!canRestore && buildsThisFrame >= maxBuildsCap) return false;
    for (const c of node.children) {
      if (c.children && !mergeNode(c)) return false;
      disposeMesh(c);
    }
    node.children = null;
    if (restoreStash(node)) return true;
    if (node.mesh) {
      node.mesh.visible = true;
      return true;
    }
    return buildNodeSync(node, false);
  };

  // Closest distance from player to any part of the tile (sphere around player).
  const distToNode = (node: LodNode) => {
    const half = planet.radius * node.size * 0.55;
    return Math.max(0, camLocal.distanceTo(node.center) - half);
  };

  const wantDepth = (node: LodNode) =>
    targetDepthForDist(distToNode(node), maxDepthCap, minDepthCap);

  const faceOfDir = (dir: Vector3) => {
    const ax = Math.abs(dir.x),
      ay = Math.abs(dir.y),
      az = Math.abs(dir.z);
    if (ax >= ay && ax >= az) return dir.x > 0 ? 0 : 1;
    if (ay >= ax && ay >= az) return dir.y > 0 ? 2 : 3;
    return dir.z > 0 ? 4 : 5;
  };

  const pickChild = (node: LodNode, dir: Vector3): LodNode | null => {
    if (!node.children) return null;
    let best: LodNode | null = null;
    let bestDot = -2;
    for (const c of node.children) {
      nodeDir.copy(c.center).normalize();
      const dot = nodeDir.dot(dir);
      if (dot > bestDot) {
        bestDot = dot;
        best = c;
      }
    }
    return best;
  };

  const depthAt = (dir: Vector3) => {
    let node: LodNode | null = roots[faceOfDir(dir)];
    let d = 0;
    while (node?.children) {
      const next = pickChild(node, dir);
      if (!next) break;
      node = next;
      d = node.depth;
    }
    return d;
  };

  const splitAndBuild = (node: LodNode): boolean => {
    if (node.children) return true;
    if (node.depth >= maxDepthCap) return false;
    if (splitsThisFrame >= maxSplitsCap) return false;
    const need = 4 - (node.mesh ? 1 : 0);
    if (leafMeshes + need > maxLeafCap) return false;
    if (buildsThisFrame + 4 > maxBuildsCap) return false;
    const kids = splitNode(node);
    for (const c of kids) buildNodeSync(c, false);
    stashMesh(node);
    if (node.liquidMesh) {
      liquidRoot.remove(node.liquidMesh);
      node.liquidMesh.geometry.dispose();
      node.liquidMesh = null;
    }
    splitsThisFrame++;
    return true;
  };

  // Collapse over-detailed tiles farthest from the player first.
  const mergePass = () => {
    const candidates: { node: LodNode; dist: number }[] = [];
    const collect = (n: LodNode) => {
      if (!n.children) return;
      for (const c of n.children) collect(c);
      if (!n.children.every((c) => !c.children)) return;
      if (n.depth < minDepthCap) return;
      let maxChildWant = 0;
      let minChildDist = 1e30;
      for (const c of n.children) {
        const dist = distToNode(c);
        if (dist < minChildDist) minChildDist = dist;
        const want = wantDepth(c);
        if (want > maxChildWant) maxChildWant = want;
      }
      // Hysteresis above the floor only. At minDepth, must allow want==minDepth
      // or depth-(minDepth+1) leaves can never merge and the budget locks.
      const threshold = n.depth > minDepthCap ? n.depth - 1 : n.depth;
      if (maxChildWant <= threshold)
        candidates.push({ node: n, dist: minChildDist });
    };
    for (const r of roots) collect(r);
    candidates.sort((a, b) => b.dist - a.dist);
    for (const { node } of candidates) {
      if (mergesThisFrame >= maxMergesCap) break;
      if (buildsThisFrame >= maxBuildsCap) break;
      if (!node.children) continue;
      if (!mergeNode(node)) break;
      mergesThisFrame++;
    }
  };

  const freeBudget = (need: number) => {
    let guard = 0;
    while (leafMeshes + need > maxLeafCap && guard++ < 40) {
      if (buildsThisFrame >= maxBuildsCap) break;
      let farthest: LodNode | null = null;
      let farDist = -1;
      const find = (n: LodNode) => {
        if (!n.children) return;
        if (!n.children.every((c) => !c.children)) {
          for (const c of n.children) find(c);
          return;
        }
        // Allow merging at minDepth so far mid-tiles can free budget.
        if (n.depth < minDepthCap) return;
        const dist = distToNode(n);
        if (dist < fineRadius * 0.5) return;
        if (dist > farDist) {
          farDist = dist;
          farthest = n;
        }
      };
      for (const r of roots) find(r);
      if (!farthest) break;
      if (!mergeNode(farthest)) break;
      mergesThisFrame++;
    }
  };

  // Fill inner rings first (LOD 0 → 1 → 2), then nearest within a ring.
  const splitPass = () => {
    const candidates: {
      node: LodNode;
      dist: number;
      gap: number;
      want: number;
    }[] = [];
    const collect = (n: LodNode) => {
      if (n.children) {
        for (const c of n.children) collect(c);
        return;
      }
      const dist = distToNode(n);
      const want = wantDepth(n);
      if (n.depth < want) {
        candidates.push({ node: n, dist, gap: want - n.depth, want });
      }
    };
    for (const r of roots) collect(r);
    candidates.sort(
      (a, b) => b.want - a.want || a.dist - b.dist || b.gap - a.gap,
    );
    for (const { node } of candidates) {
      if (splitsThisFrame >= maxSplitsCap) break;
      if (buildsThisFrame + 4 > maxBuildsCap) break;
      if (node.children) continue;
      const need = 4 - (node.mesh ? 1 : 0);
      if (leafMeshes + need > maxLeafCap) freeBudget(need);
      if (leafMeshes + need > maxLeafCap) break;
      splitAndBuild(node);
    }
  };

  const leafAtUv = (face: number, u: number, v: number): LodNode | null => {
    let node: LodNode | null = roots[face];
    while (node?.children) {
      let next: LodNode | null = null;
      for (const c of node.children) {
        if (
          u >= c.u0 - 1e-9 &&
          u <= c.u0 + c.size + 1e-9 &&
          v >= c.v0 - 1e-9 &&
          v <= c.v0 + c.size + 1e-9
        ) {
          next = c;
          break;
        }
      }
      if (!next) return node;
      node = next;
    }
    return node;
  };

  const balancePass = () => {
    const toSplit: LodNode[] = [];
    const visit = (n: LodNode) => {
      if (n.children) {
        for (const c of n.children) visit(c);
        return;
      }
      if (distToNode(n) > lodIndexOuterRadius(LOD_BANDS.length - 1)) return;
      const midU = n.u0 + n.size * 0.5;
      const midV = n.v0 + n.size * 0.5;
      const samples: [number, number][] = [
        [n.u0 - n.size * 0.5, midV],
        [n.u0 + n.size * 1.5, midV],
        [midU, n.v0 - n.size * 0.5],
        [midU, n.v0 + n.size * 1.5],
      ];
      for (const [u, v] of samples) {
        if (u < -1.001 || u > 1.001 || v < -1.001 || v > 1.001) continue;
        const nb = leafAtUv(n.face, u, v);
        if (nb && nb !== n && nb.depth > n.depth + 1) {
          toSplit.push(n);
          return;
        }
      }
    };
    for (const r of roots) visit(r);
    for (const n of toSplit) {
      if (splitsThisFrame >= maxSplitsCap) break;
      if (buildsThisFrame + 4 > maxBuildsCap) break;
      if (n.children) continue;
      const need = 4 - (n.mesh ? 1 : 0);
      if (leafMeshes + need > maxLeafCap) freeBudget(need);
      splitAndBuild(n);
    }
  };

  // Spread liquid mesh builds across frames (land first).
  const liquidCatchupPass = () => {
    if (!hasLiquid) return;
    const queue: { node: LodNode; dist: number }[] = [];
    const visit = (n: LodNode) => {
      if (n.children) {
        for (const c of n.children) visit(c);
        return;
      }
      if (!n.mesh || n.liquidMesh || n.depth < minDepthCap) return;
      queue.push({ node: n, dist: distToNode(n) });
    };
    for (const r of roots) visit(r);
    queue.sort((a, b) => a.dist - b.dist);
    for (const { node } of queue) {
      if (buildsThisFrame >= maxBuildsCap) break;
      buildLiquidFor(node);
    }
  };

  const cullPass = (planetRenderPos: Vector3) => {
    const apply = (n: LodNode) => {
      if (n.children) {
        for (const c of n.children) apply(c);
        return;
      }
      if (!n.mesh) return;
      nodeDir.copy(n.center).normalize();
      if (nodeDir.dot(camDir) < horizonDot) {
        n.mesh.visible = false;
        if (n.liquidMesh) n.liquidMesh.visible = false;
        return;
      }
      tmpWorldCenter.copy(n.center).add(planetRenderPos);
      toTile.copy(tmpWorldCenter).sub(cameraPos);
      if (toTile.dot(viewDir) < -n.cullR) {
        n.mesh.visible = false;
        if (n.liquidMesh) n.liquidMesh.visible = false;
        return;
      }
      worldSphere.center.copy(tmpWorldCenter);
      worldSphere.radius = n.cullR;
      const show = viewFrustum.intersectsSphere(worldSphere);
      n.mesh.visible = show;
      if (n.liquidMesh) n.liquidMesh.visible = show;
    };
    for (const r of roots) apply(r);
  };

  // Bootstrap without the per-frame build cap.
  const bootBuilds = maxBuildsCap;
  maxBuildsCap = 10_000;
  buildsThisFrame = 0;
  for (const r of roots) {
    buildNodeSync(r, false);
    splitAndBuild(r);
  }
  maxBuildsCap = bootBuilds;
  splitsThisFrame = 0;
  buildsThisFrame = 0;

  return {
    group,
    colliderVertices: colliderBuf.colliderVertices,
    colliderIndices: colliderBuf.colliderIndices,
    seaRadius,
    get leafCount() {
      return leafMeshes;
    },
    get hasLiquid() {
      return hasLiquid;
    },
    depthAlong(dir) {
      return depthAt(dir);
    },
    debug() {
      const depthUnder = depthAt(camDir.lengthSq() > 0 ? camDir : camLocal);
      return {
        leaves: leafMeshes,
        maxDepth: maxDepthCap,
        minDepth: minDepthCap,
        depthUnderCam: depthUnder,
        lodUnderCam: treeDepthToLod(depthUnder),
        camDist: lastCamDist,
        altitude: lastAlt,
        impostor: lastImpostor,
        chunksVisible: chunkRoot.visible,
        mode: viewMode,
        fineRadius,
        debugVisuals,
      };
    },
    update(camera, planetRenderPos, focusPlanetLocal, mode = "space") {
      viewMode = mode;
      const cfg = mode === "surface" ? SURFACE : SPACE;
      maxDepthCap = cfg.maxDepth;
      minDepthCap = cfg.minDepth;
      maxLeafCap = cfg.maxLeaves;
      maxSplitsCap = cfg.maxSplits;
      maxMergesCap = cfg.maxMerges;
      maxBuildsCap = cfg.maxBuilds;
      fineRadius = cfg.fineRadius;

      if (focusPlanetLocal) camLocal.copy(focusPlanetLocal);
      else camLocal.copy(camera.position).sub(planetRenderPos);
      lastCamDist = camLocal.length();
      lastAlt = Math.max(0, lastCamDist - planet.maxR);
      const useImpostor = lastAlt > planet.radius * cfg.impostorAlt;
      const near = lastCamDist < planet.maxR * CHUNK_RANGE_MULT;
      lastImpostor = useImpostor || !near;

      impostor.visible = lastImpostor;
      impostor.scale.setScalar(1);
      if (liquidImpostor) liquidImpostor.visible = lastImpostor;
      chunkRoot.visible = near && !useImpostor;
      liquidRoot.visible = near && !useImpostor && hasLiquid;

      if (!near) return;

      if (useImpostor) {
        mergesThisFrame = 0;
        splitsThisFrame = 0;
        buildsThisFrame = 0;
        const prevBuilds = maxBuildsCap;
        maxBuildsCap = 64;
        for (const r of roots) {
          if (!r.children) {
            buildNodeSync(r, false);
            splitAndBuild(r);
          }
          if (!r.children) continue;
          for (const c of r.children) {
            if (c.children) mergeNode(c);
            else buildNodeSync(c, false);
          }
        }
        maxBuildsCap = prevBuilds;
        return;
      }

      if (camLocal.lengthSq() < 1e-8) return;
      camDir.copy(camLocal).normalize();

      horizonDot =
        lastAlt < planet.radius * 0.08
          ? -0.28
          : Math.max(
              -0.15,
              planet.minR / Math.max(lastCamDist, planet.minR) - 0.15,
            );

      camera.updateMatrixWorld(true);
      camera.getWorldDirection(viewDir);
      cameraPos.copy(camera.position);
      projScreen.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      viewFrustum.setFromProjectionMatrix(projScreen);

      splitsThisFrame = 0;
      mergesThisFrame = 0;
      buildsThisFrame = 0;
      frameCounter++;

      mergePass();
      // Keep the bubble movable: reclaim far leaves before refining underfoot.
      if (leafMeshes > maxLeafCap - 100) freeBudget(64);
      splitPass();
      if (frameCounter % 2 === 0) balancePass();
      liquidCatchupPass();

      cullPass(planetRenderPos);
      if (debugVisuals) refreshDebugTints();
    },
    updateLiquid(camPlanetLocal) {
      if (!hasLiquid) return;
      waveUniforms.uWaveTime.value = performance.now() * 0.001;
      if (!camPlanetLocal) return;
      const under = camPlanetLocal.length() < seaRadius - 0.4;
      if (under) {
        liquidRoot.visible = false;
        if (liquidImpostor) liquidImpostor.visible = false;
      }
    },
    setDebugVisuals(on) {
      debugVisuals = on;
      refreshDebugTints();
    },
    dispose() {
      impostor.geometry.dispose();
      if (liquidImpostor) {
        liquidImpostor.geometry.dispose();
        const m = liquidImpostor.material;
        if (m && !Array.isArray(m)) m.dispose();
      }
      liquidMat?.dispose();
      for (const m of debugMeshMats.values()) m.dispose();
      for (const r of roots) {
        mergeNode(r);
        disposeMesh(r);
      }
      group.removeFromParent();
    },
  };
}

export async function buildImpostorGeometry(
  def: PlanetDef,
  seed: string,
  seaLevel: number,
  segments = IMPOSTOR_SEGS,
): Promise<BufferGeometry> {
  return buildPlanetMeshAsync(def, seed, segments, seaLevel);
}
