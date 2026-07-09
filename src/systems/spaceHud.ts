import type { Vector3 } from "three";
import {
  findLookTarget, computeCompassEntries,
  type HudMarker, type LookTargetInfo,
} from "./hudNav";
import { icons, kindIconSvg } from "../ui/icons";
import "../ui/hud.css";

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

export function createSpaceHud(root: HTMLElement): SpaceHud {
  const hud = document.createElement("div");
  hud.className = "sb-hud";
  root.appendChild(hud);

  const warpFx = document.createElement("div");
  warpFx.className = "sb-warp-fx";
  hud.appendChild(warpFx);

  const prompt = document.createElement("div");
  prompt.className = "sb-prompt";
  hud.appendChild(prompt);

  const flight = document.createElement("div");
  flight.className = "sb-flight sb-panel";
  flight.innerHTML =
    `<div class="sb-label">Velocity</div>` +
    `<div class="sb-speed-row">` +
    `<div><span class="sb-speed-value" id="sb-rel">0</span><span class="sb-speed-unit">u/s rel</span></div>` +
    `</div>` +
    `<div class="sb-speed-abs">${icons.activity("#7fd6ff")}<span>Universe <strong id="sb-abs">0</strong> u/s</span></div>` +
    `<div class="sb-meter">` +
    `<div class="sb-meter-head"><span class="sb-label">${icons.gauge("#7fd6ff")} Throttle</span><span class="sb-meter-val" id="sb-thr-v">0%</span></div>` +
    `<div class="sb-track"><div class="sb-fill sb-fill-throttle" id="sb-thr"></div></div>` +
    `</div>` +
    `<div class="sb-boost-hint" id="sb-bst-hint">${icons.zap("#ffb85a")}<span>Shift boost</span></div>` +
    `<div class="sb-momentum" id="sb-mom"><span class="sb-mom-key">N</span><span class="sb-mom-label" id="sb-mom-l">Brake</span></div>` +
    `<div class="sb-warp" id="sb-warp">` +
    `<div class="sb-warp-title">${icons.sparkles()} Hyperdrive</div>` +
    `<div class="sb-warp-sub" id="sb-warp-sub">Charging…</div>` +
    `<div class="sb-track" style="margin-top:6px"><div class="sb-fill sb-fill-warp" id="sb-warp-f"></div></div>` +
    `</div>`;
  hud.appendChild(flight);

  const relEl = flight.querySelector("#sb-rel") as HTMLElement;
  const absEl = flight.querySelector("#sb-abs") as HTMLElement;
  const thrFill = flight.querySelector("#sb-thr") as HTMLElement;
  const thrVal = flight.querySelector("#sb-thr-v") as HTMLElement;
  const bstHint = flight.querySelector("#sb-bst-hint") as HTMLElement;
  const momEl = flight.querySelector("#sb-mom") as HTMLElement;
  const momLabel = flight.querySelector("#sb-mom-l") as HTMLElement;
  const warpBox = flight.querySelector("#sb-warp") as HTMLElement;
  const warpSub = flight.querySelector("#sb-warp-sub") as HTMLElement;
  const warpFill = flight.querySelector("#sb-warp-f") as HTMLElement;

  const compass = document.createElement("div");
  compass.className = "sb-compass";
  compass.innerHTML =
    `<div class="sb-compass-frame">` +
    `<div class="sb-compass-center"></div>` +
    `<div class="sb-compass-tick" style="left:25%"></div>` +
    `<div class="sb-compass-tick" style="left:75%"></div>` +
    `<div class="sb-compass-markers" id="sb-cmarks"></div>` +
    `</div>`;
  hud.appendChild(compass);
  const compassMarkers = compass.querySelector("#sb-cmarks") as HTMLElement;

  const lookPanel = document.createElement("div");
  lookPanel.className = "sb-look sb-panel";
  lookPanel.innerHTML =
    `<div class="sb-look-kind" id="sb-look-kind"></div>` +
    `<div class="sb-look-name" id="sb-look-name"></div>` +
    `<div class="sb-look-meta" id="sb-look-meta"></div>`;
  hud.appendChild(lookPanel);
  const lookKind = lookPanel.querySelector("#sb-look-kind") as HTMLElement;
  const lookTitle = lookPanel.querySelector("#sb-look-name") as HTMLElement;
  const lookMeta = lookPanel.querySelector("#sb-look-meta") as HTMLElement;

  const reticle = document.createElement("div");
  reticle.className = "sb-reticle";
  reticle.innerHTML =
    `<div class="sb-reticle-ring"></div>` +
    `<div class="sb-reticle-cross"></div>` +
    `<div class="sb-steer-dot" id="sb-steer"></div>`;
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
      el.className = "sb-cmark";
      el.style.left = `${x}%`;
      el.style.opacity = behind ? "0.4" : "1";
      el.innerHTML =
        `<div class="sb-cmark-icon">${kindIconSvg(e.marker.kind, e.marker.color)}</div>` +
        `<div class="sb-cmark-name">${e.marker.name}</div>`;
      compassMarkers.appendChild(el);
    }
  }

  function updateLookPanel(look: LookTargetInfo | null, dt: number) {
    if (!look) {
      lookPanel.classList.remove("is-on");
      smoothLook = null;
      return;
    }
    if (!smoothLook || smoothLook.id !== look.marker.id) {
      smoothLook = { dist: look.dist, eta: look.eta, id: look.marker.id };
    }
    smoothLook.dist = smoothToward(smoothLook.dist, look.dist, dt, 3);
    smoothLook.eta = smoothToward(smoothLook.eta, look.eta, dt, 2.5);
    lookPanel.classList.add("is-on");
    lookKind.innerHTML = `${kindIconSvg(look.marker.kind, look.marker.color)} ${look.marker.kind}`;
    lookTitle.textContent = look.marker.name;
    lookTitle.style.color = look.marker.color;
    lookMeta.textContent = `${formatDist(smoothLook.dist)}  ·  ETA ${formatEta(smoothLook.eta)}`;
  }

  return {
    setPrompt(text) {
      prompt.textContent = text;
      prompt.classList.add("is-on");
    },
    clearPrompt() {
      prompt.classList.remove("is-on");
    },
    setPilotingVisible(visible) {
      pilotingVisible = visible;
      flight.classList.toggle("is-on", visible);
      reticle.classList.toggle("is-on", visible);
      if (!visible) {
        lookPanel.classList.remove("is-on");
        warpFx.classList.remove("is-on");
      }
      if (visible) {
        compassVisible = true;
        compass.classList.add("is-on");
      }
    },
    setCompassVisible(visible) {
      compassVisible = visible;
      compass.classList.toggle("is-on", visible);
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
      bstHint.classList.toggle("is-hot", boosting);

      const coast = !!maintainMomentum;
      momEl.classList.toggle("is-coast", coast);
      momLabel.textContent = coast ? "Momentum" : "Brake";

      if (warpPhase !== "idle") {
        warpBox.classList.add("is-on");
        warpFx.classList.add("is-on");
        const lock = warpTargetName ? ` → ${warpTargetName}` : "";
        warpSub.textContent = warpPhase === "charging"
          ? `Locking${lock} · ${(warpT * 100).toFixed(0)}% — Space to cancel`
          : `Engaged${lock} — Space to exit`;
        warpFill.style.width = `${Math.min(100, warpT * 100)}%`;
      } else {
        warpBox.classList.remove("is-on");
        warpFx.classList.remove("is-on");
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
