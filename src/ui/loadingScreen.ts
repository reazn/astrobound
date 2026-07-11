export interface LoadingScreen {
  setProgress(p: number, label?: string): void;
  done(): void;
}

const LOADING_CLASS = "fixed inset-0 z-[100] flex select-none items-center justify-center bg-[radial-gradient(ellipse_at_50%_30%,rgba(40,70,110,0.45),transparent_55%),linear-gradient(180deg,#071018_0%,#050810_100%)] font-['Exo_2',system-ui,sans-serif] transition-[opacity,visibility] duration-[400ms]";
const INNER_CLASS = "w-[min(360px,82vw)] text-center";
const TITLE_CLASS = "mb-7 text-[28px] font-bold uppercase tracking-[0.22em] text-[#e8f0f8]";
const LABEL_CLASS = "mb-3 text-[11px] uppercase tracking-[0.16em] text-[rgba(200,220,240,0.55)]";
const TRACK_CLASS = "h-1 overflow-hidden border border-[#7fd6ff]/20 bg-[#7fd6ff]/10";
const FILL_CLASS = "h-full w-[8%] bg-gradient-to-r from-[#3a8fb8] to-[#7fd6ff] transition-[width] duration-200";
const PCT_CLASS = "mt-2.5 font-mono text-xs text-[#7fd6ff]";

export function createLoadingScreen(root: HTMLElement): LoadingScreen {
  let el = document.getElementById("boot-loading") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "boot-loading";
    el.className = LOADING_CLASS;
    el.innerHTML =
      `<div class="${INNER_CLASS}">` +
      `<div class="${TITLE_CLASS}">Astrobound</div>` +
      `<div class="${LABEL_CLASS}" data-loading-label>Preparing system…</div>` +
      `<div class="${TRACK_CLASS}"><div class="${FILL_CLASS}" data-loading-fill></div></div>` +
      `<div class="${PCT_CLASS}" data-loading-pct>0%</div>` +
      `</div>`;
    root.appendChild(el);
  } else {
    el.className = LOADING_CLASS;
  }
  const fill = el.querySelector("[data-loading-fill]") as HTMLElement;
  const labelEl = el.querySelector("[data-loading-label]") as HTMLElement;
  const pctEl = el.querySelector("[data-loading-pct]") as HTMLElement;
  let current = 0;

  return {
    setProgress(p, label) {
      current = Math.max(current, Math.min(1, p));
      if (fill) fill.style.width = `${(current * 100).toFixed(1)}%`;
      if (pctEl) pctEl.textContent = `${Math.round(current * 100)}%`;
      if (label && labelEl) labelEl.textContent = label;
    },
    done() {
      el!.classList.add("opacity-0", "invisible", "pointer-events-none");
      window.setTimeout(() => el!.remove(), 420);
    },
  };
}
