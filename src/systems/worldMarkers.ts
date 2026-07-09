import type { Vector3, Object3D, Scene, Camera } from "three";
import {
  CSS2DRenderer, CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { kindIconSvg } from "../ui/icons";
import "../ui/hud.css";

export interface MarkerBody {
  id: string;
  name: string;
  kind: "planet" | "station" | "ship" | "player";
  color: string;
  parent: Object3D;
  systemPosition: Vector3;
  radius: number;
  // If set, only visible in these possession modes.
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
  render(scene: Scene, camera: Camera): void;
  setSize(w: number, h: number): void;
  dispose(): void;
}

function formatDist(u: number): string {
  return u > 9999 ? `${(u / 1000).toFixed(1)}k u` : `${u.toFixed(0)} u`;
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

  const markers: Marker[] = bodies.map((body) => {
    const root = document.createElement("div");
    root.className = "sb-wmark";
    root.innerHTML =
      `<div class="sb-wmark-icon" style="color:${body.color};">${kindIconSvg(body.kind, body.color)}</div>` +
      `<div class="sb-wmark-name">${body.name}</div>` +
      `<div class="sb-wmark-kind">${body.kind}</div>` +
      `<div class="sb-wmark-dist"></div>`;
    const obj = new CSS2DObject(root);
    obj.position.set(0, 0, 0);
    obj.center.set(0.5, 0.5);
    body.parent.add(obj);
    return {
      body,
      obj,
      nameEl: root.querySelector(".sb-wmark-name") as HTMLElement,
      distEl: root.querySelector(".sb-wmark-dist") as HTMLElement,
    };
  });

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
