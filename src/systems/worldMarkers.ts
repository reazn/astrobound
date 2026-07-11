import type { Vector3, Object3D, Scene, Camera } from "three";
import {
  CSS2DRenderer, CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { kindIconSvg } from "../ui/icons";

export interface MarkerBody {
  id: string;
  name: string;
  kind: "planet" | "station" | "ship" | "player";
  color: string;
  parent: Object3D;
  systemPosition: Vector3;
  radius: number;
  showWhen?: ReadonlyArray<"onFoot" | "ship">;
}

interface Marker {
  body: MarkerBody;
  obj: CSS2DObject;
  nameEl: HTMLElement;
  distEl: HTMLElement;
}

export interface WorldMarkers {
  update(possessedSystemPos: Vector3, mode: "onFoot" | "ship"): void;
  setBodies(bodies: MarkerBody[]): void;
  render(scene: Scene, camera: Camera): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

function formatDist(u: number): string {
  return u > 9999 ? `${(u / 1000).toFixed(1)}k u` : `${u.toFixed(0)} u`;
}

function makeMarker(body: MarkerBody): Marker {
  const root = document.createElement("div");
  root.className = "pointer-events-none -translate-y-1/2 select-none whitespace-nowrap text-center font-['Exo_2',system-ui,sans-serif] text-[#e8f0f8] opacity-95 [text-shadow:0_2px_8px_rgba(0,0,0,0.85)]";
  root.innerHTML =
    `<div class="mx-auto flex size-[18px] items-center justify-center [&_svg]:size-4" style="color:${body.color};">${kindIconSvg(body.kind, body.color)}</div>` +
    `<div class="mt-1 text-xs font-semibold uppercase tracking-[0.08em]" data-marker-name>${body.name}</div>` +
    `<div class="text-[9px] uppercase tracking-[0.14em] opacity-55">${body.kind}</div>` +
    `<div class="mt-0.5 font-mono text-[11px] text-[#7fd6ff] opacity-85" data-marker-dist></div>`;
  const obj = new CSS2DObject(root);
  obj.position.set(0, 0, 0);
  obj.center.set(0.5, 0.5);
  body.parent.add(obj);
  return {
    body,
    obj,
    nameEl: root.querySelector("[data-marker-name]") as HTMLElement,
    distEl: root.querySelector("[data-marker-dist]") as HTMLElement,
  };
}

export function createWorldMarkers(container: HTMLElement, bodies: MarkerBody[]): WorldMarkers {
  const renderer = new CSS2DRenderer();
  const el = renderer.domElement;
  el.style.position = "absolute";
  el.style.top = "0";
  el.style.left = "0";
  el.style.pointerEvents = "none";
  el.style.zIndex = "5";
  container.appendChild(el);

  let markers: Marker[] = bodies.map(makeMarker);

  return {
    update(possessedSystemPos, mode) {
      for (const m of markers) {
        const modes = m.body.showWhen;
        const show = !modes || modes.includes(mode);
        m.obj.visible = show;
        if (!show) continue;
        if (m.nameEl.textContent !== m.body.name) m.nameEl.textContent = m.body.name;
        const d = Math.max(0, possessedSystemPos.distanceTo(m.body.systemPosition) - m.body.radius);
        m.distEl.textContent = formatDist(d);
      }
    },
    setBodies(next) {
      for (const m of markers) m.body.parent.remove(m.obj);
      markers = next.map(makeMarker);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    },
    setSize(w, h) {
      renderer.setSize(w, h);
    },
    dispose() {
      for (const m of markers) m.body.parent.remove(m.obj);
      container.removeChild(el);
    },
  };
}
