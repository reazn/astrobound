export interface LoadingScreen {
  setProgress(p: number, label?: string): void;
  done(): void;
}

export function createLoadingScreen(root: HTMLElement): LoadingScreen {
  const el = document.createElement("div");
  el.className = "sb-loading";
  el.innerHTML =
    `<div class="sb-loading-inner">` +
    `<div class="sb-loading-title">Astrobound</div>` +
    `<div class="sb-loading-label">Preparing system…</div>` +
    `<div class="sb-loading-track"><div class="sb-loading-fill"></div></div>` +
    `<div class="sb-loading-pct">0%</div>` +
    `</div>`;
  root.appendChild(el);
  const fill = el.querySelector(".sb-loading-fill") as HTMLElement;
  const labelEl = el.querySelector(".sb-loading-label") as HTMLElement;
  const pctEl = el.querySelector(".sb-loading-pct") as HTMLElement;
  let current = 0;

  return {
    setProgress(p, label) {
      current = Math.max(current, Math.min(1, p));
      fill.style.width = `${(current * 100).toFixed(1)}%`;
      pctEl.textContent = `${Math.round(current * 100)}%`;
      if (label) labelEl.textContent = label;
    },
    done() {
      el.classList.add("is-done");
      window.setTimeout(() => el.remove(), 420);
    },
  };
}
