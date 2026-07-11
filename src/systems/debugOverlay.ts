import type { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { LOD_DEBUG_COLORS, type TerrainLodLevel } from "../worldgen/planetInstance";
import { countVisibleTriangles } from "../engine/meshStats";
import type { DebugEntityCounts } from "./debugEntities";

export interface DebugTiming {
  simMs: number;
  renderPrepMs: number;
  gpuSubmitMs: number;
  frameMs: number;
}

export interface DebugOverlayFrame {
  planets: PlanetInstance[];
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  scene: Scene;
  timing: DebugTiming;
  mode: string;
  shipMode: string;
  coords: Vector3;
  planetLocal: Vector3 | null;
  velocity: Vector3;
  planetName: string | null;
  systemName: string;
  tick: number;
  gameTime: number;
  lightLevel: number;
  dayFactor: number;
  uncapped: boolean;
  flashlight: boolean;
  entities?: DebugEntityCounts;
  extras?: { label: string; tris: number }[];
}

export interface DebugOverlay {
  readonly enabled: boolean;
  toggle(): boolean;
  setEnabled(on: boolean): void;
  applyPlanetTints(planets: PlanetInstance[]): void;
  update(frame: DebugOverlayFrame): void;
  dispose(): void;
}

type PerfMemory = { usedJSHeapSize: number; jsHeapSizeLimit: number };

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "--";
  return n.toFixed(digits);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function levelLabel(level: TerrainLodLevel): string {
  if (level === "high") return "HIGH";
  if (level === "mid") return "MID";
  if (level === "low") return "LOW";
  return "—";
}

function levelColor(level: TerrainLodLevel): string {
  if (level === "high") return LOD_DEBUG_COLORS.high;
  if (level === "mid") return LOD_DEBUG_COLORS.mid;
  if (level === "low") return LOD_DEBUG_COLORS.low;
  return "#888";
}

function readJsHeap(): PerfMemory | null {
  const perf = performance as Performance & { memory?: PerfMemory };
  return perf.memory ?? null;
}

function readGpuName(renderer: WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  if (!ext) return "unavailable";
  return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? "unknown");
}

const GRAPH_W = 220;
const GRAPH_H = 56;
const GRAPH_SAMPLES = 120;
const DEBUG_LINE_CLASS = "overflow-hidden text-ellipsis whitespace-nowrap";
const DEBUG_LABEL_CLASS = "mb-1 font-['Exo_2',system-ui,sans-serif] text-[10px] uppercase tracking-[0.14em] text-[rgba(200,220,240,0.55)]";
const DEBUG_SEP = `<div class="my-2 h-px bg-[#7fd6ff]/20"></div>`;
const DEBUG_MUTED_CLASS = "whitespace-normal text-[11px] text-[rgba(200,220,240,0.55)]";

export function createDebugOverlay(root: HTMLElement): DebugOverlay {
  const el = document.createElement("div");
  el.className = "pointer-events-none fixed inset-0 z-40 flex select-none items-start justify-between px-3.5 py-3 font-mono text-xs leading-snug text-[#e8f4ff] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]";
  el.hidden = true;
  root.appendChild(el);

  const left = document.createElement("div");
  left.className = "max-w-[min(420px,46vw)] border border-[#7fd6ff]/20 bg-[rgba(4,10,18,0.72)] px-3 py-2.5 backdrop-blur";
  const right = document.createElement("div");
  right.className = "max-w-[min(420px,46vw)] border border-[#7fd6ff]/20 bg-[rgba(4,10,18,0.72)] px-3 py-2.5 text-left backdrop-blur";
  el.appendChild(left);
  el.appendChild(right);

  const graphWrap = document.createElement("div");
  graphWrap.className = "my-1.5 mb-2";
  const graphCanvas = document.createElement("canvas");
  graphCanvas.width = GRAPH_W * 2;
  graphCanvas.height = GRAPH_H * 2;
  graphCanvas.className = "block h-14 w-[220px] border border-[#7fd6ff]/20 bg-black/25";
  graphWrap.appendChild(graphCanvas);
  const gctx = graphCanvas.getContext("2d")!;

  let enabled = false;
  let gpuName = "";
  let fpsEma = 60;
  let fpsMin = 9999;
  let fpsMax = 0;
  let lastUpdate = 0;
  const UPDATE_MS = 100;
  const fpsHist = new Float32Array(GRAPH_SAMPLES);
  const msHist = new Float32Array(GRAPH_SAMPLES);
  let histI = 0;
  let histFill = 0;

  const setEnabled = (on: boolean) => {
    enabled = on;
    el.hidden = !on;
    if (on) {
      fpsMin = 9999;
      fpsMax = 0;
      histI = 0;
      histFill = 0;
    }
  };

  const applyPlanetTints = (planets: PlanetInstance[]) => {
    for (const p of planets) p.setLodDebugTint(enabled);
  };

  const drawGraph = (instFps: number, frameMs: number) => {
    fpsHist[histI] = instFps;
    msHist[histI] = frameMs;
    histI = (histI + 1) % GRAPH_SAMPLES;
    histFill = Math.min(GRAPH_SAMPLES, histFill + 1);

    const w = graphCanvas.width;
    const h = graphCanvas.height;
    gctx.clearRect(0, 0, w, h);
    gctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    gctx.fillRect(0, 0, w, h);

    let maxFps = 60;
    for (let i = 0; i < histFill; i++) {
      const v = fpsHist[(histI - 1 - i + GRAPH_SAMPLES) % GRAPH_SAMPLES];
      if (v > maxFps) maxFps = v;
    }
    maxFps = Math.max(60, Math.ceil(maxFps / 30) * 30);

    gctx.strokeStyle = "rgba(127, 214, 255, 0.2)";
    gctx.lineWidth = 1;
    for (const mark of [60, 144, 240]) {
      if (mark > maxFps) continue;
      const y = h - (mark / maxFps) * (h - 8) - 4;
      gctx.beginPath();
      gctx.moveTo(0, y);
      gctx.lineTo(w, y);
      gctx.stroke();
    }

    gctx.beginPath();
    gctx.strokeStyle = "#7dffb0";
    gctx.lineWidth = 2;
    for (let i = 0; i < histFill; i++) {
      const idx = (histI - histFill + i + GRAPH_SAMPLES) % GRAPH_SAMPLES;
      const x = (i / (GRAPH_SAMPLES - 1)) * w;
      const y = h - (fpsHist[idx] / maxFps) * (h - 8) - 4;
      if (i === 0) gctx.moveTo(x, y);
      else gctx.lineTo(x, y);
    }
    gctx.stroke();

    gctx.fillStyle = "rgba(232, 240, 248, 0.75)";
    gctx.font = "20px ui-monospace, monospace";
    gctx.fillText(`0–${maxFps} fps`, 8, 22);
  };

  return {
    get enabled() {
      return enabled;
    },
    toggle() {
      setEnabled(!enabled);
      return enabled;
    },
    setEnabled,
    applyPlanetTints,
    update(frame) {
      if (!enabled) return;
      const now = performance.now();
      const frameMs = Math.max(0.001, frame.timing.frameMs);
      const instFps = 1000 / frameMs;
      fpsEma = fpsEma * 0.88 + instFps * 0.12;
      fpsMin = Math.min(fpsMin, instFps);
      fpsMax = Math.max(fpsMax, instFps);
      drawGraph(instFps, frameMs);

      if (now - lastUpdate < UPDATE_MS) return;
      lastUpdate = now;

      if (!gpuName) gpuName = readGpuName(frame.renderer);

      const info = frame.renderer.info;
      const heap = readJsHeap();

      const terrainRows = frame.planets
        .map((p) => {
          const d = p.getTerrainLodDebug(frame.camera);
          return {
            name: p.def.name,
            level: d.level,
            segments: d.segments,
            tris: d.triangles,
            dist: d.camDist,
            highLoaded: d.highLoaded,
            highBuilding: d.highBuilding,
            liquidTris: p.liquid && p.liquid.mesh.visible
              ? p.liquid.visibleTriangleCount()
              : 0,
          };
        })
        .sort((a, b) => b.tris - a.tris);

      const terrainTotal = terrainRows.reduce((s, r) => s + r.tris, 0);
      const liquidTotal = terrainRows.reduce((s, r) => s + r.liquidTris, 0);

      const categoryRows: { label: string; tris: number }[] = [
        { label: "Terrain (active LOD)", tris: terrainTotal },
        { label: "Liquid", tris: liquidTotal },
        ...(frame.extras ?? []),
      ];
      categoryRows.sort((a, b) => b.tris - a.tris);
      const categorySum = categoryRows.reduce((s, r) => s + r.tris, 0);
      const sceneTris = countVisibleTriangles(frame.scene);
      const drawnTris = info.render.triangles;

      const simShare = (frame.timing.simMs / frameMs) * 100;
      const prepShare = (frame.timing.renderPrepMs / frameMs) * 100;
      const gpuShare = (frame.timing.gpuSubmitMs / frameMs) * 100;

      const c = frame.coords;
      const pl = frame.planetLocal;
      const v = frame.velocity;
      const yaw = Math.atan2(-frame.camera.matrixWorld.elements[8], -frame.camera.matrixWorld.elements[10]);
      const facing = ((yaw * 180) / Math.PI + 360) % 360;
      const lightPct = Math.round(Math.min(1, Math.max(0, frame.lightLevel)) * 100);
      const dayPct = Math.round(Math.min(1, Math.max(0, frame.dayFactor)) * 100);
      const ents = frame.entities;

      left.innerHTML =
        `<div class="mb-1.5 font-['Exo_2',system-ui,sans-serif] text-[13px] font-semibold uppercase tracking-[0.08em] text-[#7fd6ff]">Astrobound debug <span class="ml-1 inline-block rounded-[3px] border border-[#7fd6ff]/45 px-1 text-[11px] text-white">L</span></div>` +
        `<div class="${DEBUG_LINE_CLASS}"><span class="font-semibold text-[#7dffb0]">${fmt(fpsEma, 0)} fps</span>` +
        ` · ${fmt(frameMs, 2)} ms` +
        (frame.uncapped ? ` · <span class="font-semibold tracking-[0.06em] text-[#ffb85a]">UNCAPPED</span>` : " · vsync") +
        `</div>` +
        `<div class="${DEBUG_LINE_CLASS}">min ${fmt(fpsMin, 0)} · max ${fmt(fpsMax, 0)}` +
        ` · ${frame.renderer.getPixelRatio().toFixed(2)}x DPR</div>` +
        `<div data-debug-graph-host></div>` +
        `<div class="${DEBUG_LINE_CLASS}">xyz: ${fmt(c.x, 1)} / ${fmt(c.y, 1)} / ${fmt(c.z, 1)}</div>` +
        (pl
          ? `<div class="${DEBUG_LINE_CLASS}">local: ${fmt(pl.x, 1)} / ${fmt(pl.y, 1)} / ${fmt(pl.z, 1)}` +
            ` · r ${fmt(pl.length(), 1)}</div>`
          : `<div class="${DEBUG_LINE_CLASS}">local: —</div>`) +
        `<div class="${DEBUG_LINE_CLASS}">vel: ${fmt(v.length(), 2)} u/s` +
        ` (${fmt(v.x, 1)}, ${fmt(v.y, 1)}, ${fmt(v.z, 1)})</div>` +
        `<div class="${DEBUG_LINE_CLASS}">facing: ${fmt(facing, 0)}° · fov ${fmt(frame.camera.fov, 0)}</div>` +
        `<div class="${DEBUG_LINE_CLASS}">light: ${lightPct}%` +
        ` <span class="mx-1 inline-block h-[7px] w-[72px] overflow-hidden border border-[#7fd6ff]/25 bg-white/12 align-middle"><i class="block h-full bg-gradient-to-r from-[#2a3a55] to-[#ffe14a]" style="width:${lightPct}%"></i></span>` +
        ` · day ${dayPct}%</div>` +
        `<div class="${DEBUG_LINE_CLASS}">mode: ${frame.mode}` +
        (frame.shipMode ? ` · ship ${frame.shipMode}` : "") +
        (frame.flashlight ? " · flashlight" : "") +
        `</div>` +
        `<div class="${DEBUG_LINE_CLASS}">planet: ${frame.planetName ?? "—"} · system: ${frame.systemName}</div>` +
        `<div class="${DEBUG_LINE_CLASS}">tick ${fmtInt(frame.tick)} · t ${fmt(frame.gameTime, 1)}s</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_LABEL_CLASS}">Polys</div>` +
        `<div class="${DEBUG_LINE_CLASS}"><span class="font-semibold text-[#7dffb0]">total ${fmtInt(sceneTris)}</span>` +
        ` visible · drawn ${fmtInt(drawnTris)}</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_LABEL_CLASS}">Entities</div>` +
        `<div class="${DEBUG_LINE_CLASS}">ships ${ents?.ships ?? 0}` +
        ` · chars ${ents?.characters ?? 0}` +
        ` · ores nearby ${ents?.ores ?? 0}` +
        ` · stations ${ents?.stations ?? 0}</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_LABEL_CLASS}">Frame budget (approx)</div>` +
        `<div class="${DEBUG_LINE_CLASS}">sim ${fmt(frame.timing.simMs, 2)} ms (${fmt(simShare, 0)}%)</div>` +
        `<div class="${DEBUG_LINE_CLASS}">render prep ${fmt(frame.timing.renderPrepMs, 2)} ms (${fmt(prepShare, 0)}%)</div>` +
        `<div class="${DEBUG_LINE_CLASS}">GPU submit ${fmt(frame.timing.gpuSubmitMs, 2)} ms (${fmt(gpuShare, 0)}%)</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_LABEL_CLASS}">Memory / GPU</div>` +
        `<div class="${DEBUG_LINE_CLASS}">JS heap: ${heap
          ? `${fmtBytes(heap.usedJSHeapSize)} / ${fmtBytes(heap.jsHeapSizeLimit)}`
          : "n/a (Chrome only)"}</div>` +
        `<div class="${DEBUG_LINE_CLASS}">geometries ${info.memory.geometries}` +
        ` · textures ${info.memory.textures}</div>` +
        `<div class="${DEBUG_LINE_CLASS}">draw calls ${fmtInt(info.render.calls)}</div>` +
        `<div class="${DEBUG_LINE_CLASS} ${DEBUG_MUTED_CLASS}">${gpuName}</div>`;

      const host = left.querySelector("[data-debug-graph-host]");
      if (host && graphWrap.parentElement !== host) host.appendChild(graphWrap);

      const legend =
        `<div class="mb-1.5 flex gap-3 text-[11px]">` +
        `<span class="inline-flex items-center gap-1"><i class="inline-block size-2.5 rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style="background:${LOD_DEBUG_COLORS.high}"></i>HIGH</span>` +
        `<span class="inline-flex items-center gap-1"><i class="inline-block size-2.5 rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style="background:${LOD_DEBUG_COLORS.mid}"></i>MID</span>` +
        `<span class="inline-flex items-center gap-1"><i class="inline-block size-2.5 rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style="background:${LOD_DEBUG_COLORS.low}"></i>LOW</span>` +
        `</div>`;

      const terrainTable = terrainRows.map((r) => {
        const flag = r.highBuilding ? " …" : r.highLoaded ? "" : "";
        return (
          `<div class="grid grid-cols-[48px_1fr_auto_auto] items-baseline gap-2">` +
          `<span class="text-[11px] font-semibold" style="color:${levelColor(r.level)}">${levelLabel(r.level)}${flag}</span>` +
          `<span class="overflow-hidden text-ellipsis whitespace-nowrap">${r.name}</span>` +
          `<span class="text-right tabular-nums text-[#7fd6ff]">${fmtInt(r.tris)}</span>` +
          `<span class="min-w-[7em] text-right text-[11px] text-[rgba(200,220,240,0.55)]">S${r.segments} · ${fmt(r.dist, 0)}u</span>` +
          `</div>`
        );
      }).join("");

      const catTable = categoryRows.map((r) => {
        const pct = categorySum > 0 ? (r.tris / categorySum) * 100 : 0;
        return (
          `<div class="grid grid-cols-[1fr_auto_auto] items-baseline gap-2">` +
          `<span class="overflow-hidden text-ellipsis whitespace-nowrap">${r.label}</span>` +
          `<span class="text-right tabular-nums text-[#7fd6ff]">${fmtInt(r.tris)}</span>` +
          `<span class="min-w-[7em] text-right text-[11px] text-[rgba(200,220,240,0.55)]">${fmt(pct, 0)}%</span>` +
          `</div>`
        );
      }).join("");

      right.innerHTML =
        `<div class="${DEBUG_LABEL_CLASS}">Terrain LOD (tinted)</div>` +
        legend +
        `<div class="mb-1.5 text-[11px] text-[rgba(200,220,240,0.55)]">Rendered terrain · sorted by tris</div>` +
        `<div class="flex flex-col gap-0.5">${terrainTable || `<div class="${DEBUG_MUTED_CLASS}">none</div>`}</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_LABEL_CLASS}">Poly breakdown</div>` +
        `<div class="mb-1.5 text-[11px] text-[rgba(200,220,240,0.55)]">total ${fmtInt(sceneTris)} · drawn ${fmtInt(drawnTris)}</div>` +
        `<div class="flex flex-col gap-0.5">${catTable}</div>` +
        DEBUG_SEP +
        `<div class="${DEBUG_MUTED_CLASS}">Debug on = uncapped frame loop (not stuck at monitor Hz). F flashlight · wireframe boxes = entities.</div>`;
    },
    dispose() {
      el.remove();
    },
  };
}
