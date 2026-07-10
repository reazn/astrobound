import {
  LOD_BANDS,
  lodDebugColorHex,
  lodIndexOuterRadius,
  lodIndexInnerRadius,
  treeDepthToLod,
  type CubeSphereLodDebug,
} from "../worldgen/cubeSphereLod";

// On-screen LOD key (L). Always lists every hard-coded LOD_BANDS entry.

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

  document.body.appendChild(root);

  let built = false;

  const rebuildRows = () => {
    list.replaceChildren();
    const last = LOD_BANDS.length - 1;
    for (const band of LOD_BANDS) {
      const row = document.createElement("div");
      row.className = "sb-lod-legend-row";
      row.dataset.lod = String(band.lod);

      const swatch = document.createElement("span");
      swatch.className = "sb-lod-legend-swatch";
      swatch.style.background = lodDebugColorHex(band.lod);

      const num = document.createElement("span");
      num.className = "sb-lod-legend-num";
      num.textContent = `LOD ${band.lod}`;

      const meta = document.createElement("span");
      meta.className = "sb-lod-legend-meta";
      const inner = lodIndexInnerRadius(band.lod);
      const outer = lodIndexOuterRadius(band.lod);
      if (band.lod === 0) {
        meta.textContent = `depth ${band.depth} · 0–${Math.round(outer)}u`;
      } else if (band.lod === last) {
        meta.textContent = `depth ${band.depth} · ${Math.round(inner)}u+`;
      } else {
        meta.textContent = `depth ${band.depth} · ${Math.round(inner)}–${Math.round(outer)}u`;
      }

      row.append(swatch, num, meta);
      list.appendChild(row);
    }

    const note = document.createElement("div");
    note.className = "sb-lod-legend-note";
    note.textContent = `${LOD_BANDS.length} hard-coded bands · edit LOD_BANDS in cubeSphereLod.ts`;
    list.appendChild(note);
    built = true;
  };

  return {
    setVisible(on) {
      root.hidden = !on;
      if (on && !built) rebuildRows();
    },
    update(dbg) {
      if (root.hidden || !dbg) return;
      if (!built) rebuildRows();

      const underLod = dbg.lodUnderCam ?? treeDepthToLod(dbg.depthUnderCam);
      for (const row of list.querySelectorAll<HTMLElement>(".sb-lod-legend-row")) {
        row.classList.toggle("is-underfoot", Number(row.dataset.lod) === underLod);
      }

      const band = LOD_BANDS[Math.min(underLod, LOD_BANDS.length - 1)];
      const ring = underLod === 0
        ? `0–${Math.round(band.outer)}u`
        : `${Math.round(lodIndexInnerRadius(underLod))}–${Number.isFinite(band.outer) ? Math.round(band.outer) : "∞"}u`;
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
