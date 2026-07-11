import type { Vector3 } from "three";
import {
  findLookTarget, computeCompassEntries,
  type HudMarker, type LookTargetInfo,
} from "./hudNav";
import { icons, kindIconSvg } from "../ui/icons";

export interface NavTarget {
  id: string;
  name: string;
  kind: "planet" | "station" | "player" | "ship";
  color: string;
  systemPosition: Vector3;
  radius: number;
}

export interface FlightHudView {
  camPos: Vector3;
  camForward: Vector3;
  camRight: Vector3;
}

export interface SpaceHud {
  setPrompt(text: string): void;
  clearPrompt(): void;
  updateFlight(
    view: FlightHudView,
    shipPos: Vector3,
    relSpeed: number,
    absSpeed: number,
    throttle: number,
    boostFuel: number,
    boosting: boolean,
    steerX: number,
    steerY: number,
    targets: NavTarget[],
    warpPhase: string,
    warpT: number,
    dt: number,
    warpTargetName?: string | null,
    maintainMomentum?: boolean,
  ): void;
  updateCompass(view: FlightHudView, targets: NavTarget[]): void;
  setPilotingVisible(visible: boolean): void;
  setCompassVisible(visible: boolean): void;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds > 359999) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  return h > 0
    ? `${h}h ${m.toString().padStart(2, "0")}m`
    : `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatDist(u: number): string {
  return u > 9999 ? `${(u / 1000).toFixed(1)}k u` : `${u.toFixed(0)} u`;
}

function formatSpeed(u: number): string {
  if (u >= 10000) return `${(u / 1000).toFixed(1)}k`;
  if (u >= 1000) return u.toFixed(0);
  return u.toFixed(1);
}

function smoothToward(current: number, target: number, dt: number, rate: number) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}

const PANEL_CLASS = "border border-[#7fd6ff]/30 bg-[rgba(6,12,22,0.72)] shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md";
const LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(200,220,240,0.55)]";
const TRACK_CLASS = "relative h-1.5 overflow-hidden border border-white/8 bg-white/8";
const FILL_CLASS = "h-full w-0 transition-[width] duration-75";

export function createSpaceHud(root: HTMLElement): SpaceHud {
  const hud = document.createElement("div");
  hud.className = "pointer-events-none fixed inset-0 z-20 select-none font-['Exo_2',system-ui,sans-serif] text-[#e8f0f8]";
  root.appendChild(hud);

  const warpFx = document.createElement("div");
  warpFx.className = "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(40,20,80,0.35)_100%),linear-gradient(90deg,rgba(80,40,160,0.18),transparent_18%,transparent_82%,rgba(80,40,160,0.18))]";
  hud.appendChild(warpFx);

  const prompt = document.createElement("div");
  prompt.className = "absolute bottom-[20%] left-1/2 hidden -translate-x-1/2 whitespace-nowrap border border-[#7fd6ff]/30 bg-[rgba(6,12,22,0.72)] px-[18px] py-2 text-[13px] uppercase tracking-[0.1em]";
  hud.appendChild(prompt);

  const flight = document.createElement("div");
  flight.className = `${PANEL_CLASS} absolute bottom-[22px] left-[18px] hidden w-[268px] px-4 pb-4 pt-3.5`;
  flight.innerHTML =
    `<div class="${LABEL_CLASS}">Velocity</div>` +
    `<div class="flex items-baseline justify-between gap-2.5">` +
    `<div><span class="font-mono text-[28px] font-bold leading-none tracking-[0.02em] text-[#7fd6ff] [text-shadow:0_0_18px_rgba(127,214,255,0.45)]" id="sb-rel">0</span><span class="ml-1 text-[11px] tracking-[0.12em] text-[rgba(200,220,240,0.55)]">u/s rel</span></div>` +
    `</div>` +
    `<div class="mt-2 flex items-center gap-1.5 font-mono text-xs text-[rgba(200,220,240,0.55)] [&_svg]:size-[13px] [&_strong]:font-semibold [&_strong]:text-[#e8f0f8]">${icons.activity("#7fd6ff")}<span>Universe <strong id="sb-abs">0</strong> u/s</span></div>` +
    `<div class="mt-3">` +
    `<div class="mb-1 flex items-center justify-between"><span class="${LABEL_CLASS} inline-flex items-center gap-1.5 [&_svg]:size-3">${icons.gauge("#7fd6ff")} Throttle</span><span class="font-mono text-[11px] text-[#e8f0f8]" id="sb-thr-v">0%</span></div>` +
    `<div class="${TRACK_CLASS}"><div class="${FILL_CLASS} bg-gradient-to-r from-[#3a8fb8] to-[#7fd6ff] shadow-[0_0_10px_rgba(127,214,255,0.35)]" id="sb-thr"></div></div>` +
    `</div>` +
    `<div class="mt-2.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[rgba(200,220,240,0.55)] [&_svg]:size-3" id="sb-bst-hint">${icons.zap("#ffb85a")}<span>Shift boost</span></div>` +
    `<div class="mt-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-[rgba(200,220,240,0.55)]" id="sb-mom"><span class="flex h-[18px] min-w-[18px] items-center justify-center border border-[#7fd6ff]/35 px-1 text-[10px] text-[#7fd6ff]" id="sb-mom-key">N</span><span id="sb-mom-l">Brake</span></div>` +
    `<div class="mt-3 hidden border-t border-[#7fd6ff]/12 pt-2.5" id="sb-warp">` +
    `<div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#c4a8ff] [&_svg]:size-3.5 [&_svg]:stroke-[#c4a8ff]">${icons.sparkles()} Hyperdrive</div>` +
    `<div class="mt-0.5 text-[11px] text-[rgba(200,220,240,0.55)]" id="sb-warp-sub">Charging…</div>` +
    `<div class="${TRACK_CLASS} mt-1.5"><div class="${FILL_CLASS} bg-gradient-to-r from-[#6a4fc4] to-[#c4a8ff] shadow-[0_0_12px_rgba(176,155,255,0.5)]" id="sb-warp-f"></div></div>` +
    `</div>`;
  hud.appendChild(flight);

  const relEl = flight.querySelector("#sb-rel") as HTMLElement;
  const absEl = flight.querySelector("#sb-abs") as HTMLElement;
  const thrFill = flight.querySelector("#sb-thr") as HTMLElement;
  const thrVal = flight.querySelector("#sb-thr-v") as HTMLElement;
  const bstHint = flight.querySelector("#sb-bst-hint") as HTMLElement;
  const momEl = flight.querySelector("#sb-mom") as HTMLElement;
  const momKey = flight.querySelector("#sb-mom-key") as HTMLElement;
  const momLabel = flight.querySelector("#sb-mom-l") as HTMLElement;
  const warpBox = flight.querySelector("#sb-warp") as HTMLElement;
  const warpSub = flight.querySelector("#sb-warp-sub") as HTMLElement;
  const warpFill = flight.querySelector("#sb-warp-f") as HTMLElement;

  const compass = document.createElement("div");
  compass.className = "absolute left-1/2 top-3.5 hidden h-14 w-[min(560px,90vw)] -translate-x-1/2";
  compass.innerHTML =
    `<div class="relative h-full overflow-hidden border border-[#7fd6ff]/30 bg-[linear-gradient(180deg,rgba(6,12,22,0.78),rgba(6,12,22,0.55))] [clip-path:polygon(18px_0,calc(100%_-_18px)_0,100%_50%,calc(100%_-_18px)_100%,18px_100%,0_50%)]">` +
    `<div class="absolute bottom-0 left-1/2 top-0 z-10 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-[#7fd6ff] to-transparent shadow-[0_0_10px_#7fd6ff]"></div>` +
    `<div class="absolute bottom-0 top-0 w-px bg-white/8" style="left:25%"></div>` +
    `<div class="absolute bottom-0 top-0 w-px bg-white/8" style="left:75%"></div>` +
    `<div class="absolute inset-0" id="sb-cmarks"></div>` +
    `</div>`;
  hud.appendChild(compass);
  const compassMarkers = compass.querySelector("#sb-cmarks") as HTMLElement;

  const lookPanel = document.createElement("div");
  lookPanel.className = `${PANEL_CLASS} absolute left-1/2 top-[36%] hidden min-w-[220px] -translate-x-1/2 -translate-y-1/2 px-[18px] pb-3.5 pt-3 text-center`;
  lookPanel.innerHTML =
    `<div class="mb-1 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[rgba(200,220,240,0.55)] [&_svg]:size-3" id="sb-look-kind"></div>` +
    `<div class="text-xl font-bold uppercase tracking-[0.06em]" id="sb-look-name"></div>` +
    `<div class="mt-1.5 font-mono text-xs text-[rgba(200,220,240,0.55)]" id="sb-look-meta"></div>`;
  hud.appendChild(lookPanel);
  const lookKind = lookPanel.querySelector("#sb-look-kind") as HTMLElement;
  const lookTitle = lookPanel.querySelector("#sb-look-name") as HTMLElement;
  const lookMeta = lookPanel.querySelector("#sb-look-meta") as HTMLElement;

  const reticle = document.createElement("div");
  reticle.className = "absolute left-1/2 top-1/2 hidden size-24 -translate-x-1/2 -translate-y-1/2";
  reticle.innerHTML =
    `<div class="absolute inset-2 rounded-full border border-[#7fd6ff]/40 shadow-[inset_0_0_18px_rgba(127,214,255,0.08)]"></div>` +
    `<div class="absolute left-1/2 top-[5px] h-2 w-px -translate-x-1/2 bg-[#7fd6ff]/55"></div>` +
    `<div class="absolute bottom-[5px] left-1/2 h-2 w-px -translate-x-1/2 bg-[#7fd6ff]/55"></div>` +
    `<div class="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2"><div class="absolute left-0 right-0 top-1/2 h-px bg-[#7fd6ff]/70"></div><div class="absolute bottom-0 left-1/2 top-0 w-px bg-[#7fd6ff]/70"></div></div>` +
    `<div class="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7fd6ff] shadow-[0_0_12px_#7fd6ff]" id="sb-steer"></div>`;
  hud.appendChild(reticle);
  const steerDot = reticle.querySelector("#sb-steer") as HTMLElement;

  let pilotingVisible = false;
  let compassVisible = false;
  let smoothRel = 0;
  let smoothAbs = 0;
  let smoothLook: { dist: number; eta: number; id: string } | null = null;
  const COMPASS_HALF = 1.35;

  function renderCompass(entries: ReturnType<typeof computeCompassEntries>) {
    compassMarkers.innerHTML = "";
    for (const e of entries) {
      const behind = e.bearingRad < -Math.PI * 0.5 || e.bearingRad > Math.PI * 0.5;
      const clamped = Math.max(-COMPASS_HALF, Math.min(COMPASS_HALF, e.bearingRad));
      const x = 50 + (clamped / COMPASS_HALF) * 46;
      const el = document.createElement("div");
      el.className = "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-150";
      el.style.left = `${x}%`;
      el.style.opacity = behind ? "0.4" : "1";
      el.innerHTML =
        `<div class="mx-auto flex size-[18px] items-center justify-center [&_svg]:size-4">${kindIconSvg(e.marker.kind, e.marker.color)}</div>` +
        `<div class="mt-0.5 max-w-[72px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] uppercase tracking-[0.08em] opacity-80">${e.marker.name}</div>`;
      compassMarkers.appendChild(el);
    }
  }

  function updateLookPanel(look: LookTargetInfo | null, dt: number) {
    if (!look) {
      lookPanel.classList.add("hidden");
      smoothLook = null;
      return;
    }
    if (!smoothLook || smoothLook.id !== look.marker.id) {
      smoothLook = { dist: look.dist, eta: look.eta, id: look.marker.id };
    }
    smoothLook.dist = smoothToward(smoothLook.dist, look.dist, dt, 3);
    smoothLook.eta = smoothToward(smoothLook.eta, look.eta, dt, 2.5);
    lookPanel.classList.remove("hidden");
    lookKind.innerHTML = `${kindIconSvg(look.marker.kind, look.marker.color)} ${look.marker.kind}`;
    lookTitle.textContent = look.marker.name;
    lookTitle.style.color = look.marker.color;
    lookMeta.textContent = `${formatDist(smoothLook.dist)}  ·  ETA ${formatEta(smoothLook.eta)}`;
  }

  return {
    setPrompt(text) {
      prompt.textContent = text;
      prompt.classList.remove("hidden");
    },
    clearPrompt() {
      prompt.classList.add("hidden");
    },
    setPilotingVisible(visible) {
      pilotingVisible = visible;
      flight.classList.toggle("hidden", !visible);
      reticle.classList.toggle("hidden", !visible);
      if (!visible) {
        lookPanel.classList.add("hidden");
        warpFx.classList.remove("opacity-100");
        warpFx.classList.add("opacity-0");
      }
      if (visible) {
        compassVisible = true;
        compass.classList.remove("hidden");
      }
    },
    setCompassVisible(visible) {
      compassVisible = visible;
      compass.classList.toggle("hidden", !visible);
      if (!visible) compassMarkers.innerHTML = "";
    },
    updateCompass(view, targets) {
      if (!compassVisible) return;
      const markers: HudMarker[] = targets.map((t) => ({
        id: t.id, name: t.name, kind: t.kind, color: t.color,
        systemPosition: t.systemPosition, radius: t.radius,
      }));
      renderCompass(computeCompassEntries(view.camPos, view.camForward, view.camRight, markers));
    },
    updateFlight(
      view, _shipPos, relSpeed, absSpeed, throttle, _boostFuel, boosting,
      steerX, steerY, targets, warpPhase, warpT, dt, warpTargetName, maintainMomentum,
    ) {
      if (!pilotingVisible) return;

      smoothRel = smoothToward(smoothRel, relSpeed, dt, 4);
      smoothAbs = smoothToward(smoothAbs, absSpeed, dt, 4);
      relEl.textContent = formatSpeed(smoothRel);
      relEl.style.color = boosting ? "#ffb85a" : warpPhase !== "idle" ? "#c4a8ff" : "#7fd6ff";
      absEl.textContent = formatSpeed(smoothAbs);

      const thrPct = Math.round(Math.abs(throttle) * 100);
      thrFill.style.width = `${Math.max(0, Math.min(100, (throttle * 0.5 + 0.5) * 100))}%`;
      thrVal.textContent = `${throttle < -0.05 ? "−" : ""}${thrPct}%`;
      bstHint.classList.toggle("text-[#ffb85a]", boosting);
      bstHint.classList.toggle("text-[rgba(200,220,240,0.55)]", !boosting);

      const coast = !!maintainMomentum;
      momEl.classList.toggle("text-[#c4a8ff]", coast);
      momEl.classList.toggle("text-[rgba(200,220,240,0.55)]", !coast);
      momKey.classList.toggle("border-[#c4a8ff]/55", coast);
      momKey.classList.toggle("text-[#c4a8ff]", coast);
      momKey.classList.toggle("border-[#7fd6ff]/35", !coast);
      momKey.classList.toggle("text-[#7fd6ff]", !coast);
      momLabel.textContent = coast ? "Momentum" : "Brake";

      if (warpPhase !== "idle") {
        warpBox.classList.remove("hidden");
        warpFx.classList.remove("opacity-0");
        warpFx.classList.add("opacity-100");
        const lock = warpTargetName ? ` → ${warpTargetName}` : "";
        warpSub.textContent = warpPhase === "charging"
          ? `Locking${lock} · ${(warpT * 100).toFixed(0)}% — Space to cancel`
          : `Engaged${lock} — Space to exit`;
        warpFill.style.width = `${Math.min(100, warpT * 100)}%`;
      } else {
        warpBox.classList.add("hidden");
        warpFx.classList.remove("opacity-100");
        warpFx.classList.add("opacity-0");
      }

      steerDot.style.left = `${50 + steerX * 38}%`;
      steerDot.style.top = `${50 + steerY * 38}%`;

      const markers: HudMarker[] = targets.map((t) => ({
        id: t.id, name: t.name, kind: t.kind, color: t.color,
        systemPosition: t.systemPosition, radius: t.radius,
      }));

      const look = findLookTarget(view.camPos, view.camForward, markers, Math.max(relSpeed, absSpeed * 0.15));
      updateLookPanel(look, dt);
      renderCompass(computeCompassEntries(view.camPos, view.camForward, view.camRight, markers));
    },
  };
}
