import {
  SURFACE_LOD,
  SPACE_LOD,
  LOD_STEP,
  lodDebugColorHex,
  lodRingOuterRadius,
  treeDepthToLod,
  lodToTreeDepth,
  type LodViewMode,
  type CubeSphereLodDebug,
} from "../worldgen/cubeSphereLod";

// On-screen LOD key (L). Uses standard numbering: LOD 0 = finest.

export interface LodDebugLegend {
  setVisible(on: boolean): void;
  update(dbg: CubeSphereLodDebug | null): void;
  dispose(): void;
}

export const createLodDebugLegend = (): LodDebugLegend => {
  const root = document.createElement("div");
  root.className = "sb-lod-legend";
  root.hidden = true;

  const title = document.createElement("div");
  title.className = "sb-lod-legend-title";
  title.textContent = "LOD KEY (0 = finest)";
  root.appendChild(title);

  const live = document.createElement("div");
  live.className = "sb-lod-legend-live";
  root.appendChild(live);

  const list = document.createElement("div");
  list.className = "sb-lod-legend-list";
  root.appendChild(list);

  const hint = document.createElement("div");
  hint.className = "sb-lod-legend-hint";
  hint.textContent = "Say e.g. “LOD 2 denser” or “add a step between LOD 1–2”";
  root.appendChild(hint);

  document.body.appendChild(root);

  let lastMode: LodViewMode | "" = "";
  let lastMin = -1;
  let lastMax = -1;

  const rebuildRows = (mode: LodViewMode, minDepth: number, maxDepth: number, fineR: number) => {
    list.replaceChildren();
    const maxLod = treeDepthToLod(minDepth, maxDepth);
    for (let lod = 0; lod <= maxLod; lod++) {
      const treeDepth = lodToTreeDepth(lod, maxDepth);
      const row = document.createElement("div");
      row.className = "sb-lod-legend-row";
      row.dataset.lod = String(lod);

      const swatch = document.createElement("span");
      swatch.className = "sb-lod-legend-swatch";
      swatch.style.background = lodDebugColorHex(lod);

      const num = document.createElement("span");
      num.className = "sb-lod-legend-num";
      num.textContent = `LOD ${lod}`;

      const meta = document.createElement("span");
      meta.className = "sb-lod-legend-meta";
      const outer = lodRingOuterRadius(fineR, maxDepth, treeDepth);
      const inner = lod === 0 ? 0 : lodRingOuterRadius(fineR, maxDepth, lodToTreeDepth(lod - 1, maxDepth));
      if (lod === 0) {
        meta.textContent = `finest · 0–${Math.round(outer)}u`;
      } else if (lod === maxLod) {
        meta.textContent = `coarsest · ${Math.round(inner)}u+`;
      } else {
        meta.textContent = `${Math.round(inner)}–${Math.round(outer)}u`;
      }

      row.append(swatch, num, meta);
      list.appendChild(row);
    }

    const note = document.createElement("div");
    note.className = "sb-lod-legend-note";
    if (mode === "surface") {
      note.textContent = `Surface LOD 0–${maxLod} · step ×${LOD_STEP} · coarser than LOD ${maxLod} = space-only`;
    } else {
      note.textContent = `Space LOD 0–${maxLod} · step ×${LOD_STEP}`;
    }
    list.appendChild(note);
  };

  return {
    setVisible(on) {
      root.hidden = !on;
    },
    update(dbg) {
      if (root.hidden || !dbg) return;
      const cfg = dbg.mode === "surface" ? SURFACE_LOD : SPACE_LOD;
      const minD = cfg.minDepth;
      const maxD = cfg.maxDepth;
      if (dbg.mode !== lastMode || minD !== lastMin || maxD !== lastMax) {
        lastMode = dbg.mode;
        lastMin = minD;
        lastMax = maxD;
        rebuildRows(dbg.mode, minD, maxD, dbg.fineRadius);
      }

      const underLod = dbg.lodUnderCam ?? treeDepthToLod(dbg.depthUnderCam, maxD);
      for (const row of list.querySelectorAll<HTMLElement>(".sb-lod-legend-row")) {
        row.classList.toggle("is-underfoot", Number(row.dataset.lod) === underLod);
      }

      const ring = underLod === 0
        ? `0–${Math.round(dbg.fineRadius)}u`
        : `~${Math.round(lodRingOuterRadius(dbg.fineRadius, maxD, lodToTreeDepth(underLod, maxD)))}u band`;
      live.innerHTML =
        `<b>Underfoot LOD ${underLod}</b>`
        + ` · ${dbg.mode}`
        + ` · leaves ${dbg.leaves}`
        + ` · ${ring}`
        + (dbg.impostor ? " · IMPOSTOR" : "");
    },
    dispose() {
      root.remove();
    },
  };
};
