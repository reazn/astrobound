import type { Vector3, Object3D, Scene, Camera } from "three";
import {
  CSS2DRenderer, CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { kindIconSvg } from "../ui/icons";
import "../ui/hud.css";

export interface MarkerBody {
  name: string;
  kind: "planet" | "station";
  color: string;
  parent: Object3D;
  systemPosition: Vector3;
  radius: number;
}

interface Marker {
  body: MarkerBody;
  obj: CSS2DObject;
  distEl: HTMLElement;
}

export interface WorldMarkers {
  update(possessedSystemPos: Vector3, visible: boolean): void;
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
    root.style.cssText =
      "font-family:'Exo 2',system-ui,sans-serif;color:#e8f0f8;text-align:center;" +
      "transform:translateY(-50%);text-shadow:0 2px 8px rgba(0,0,0,0.85);" +
      "opacity:0.94;white-space:nowrap;pointer-events:none;";
    root.innerHTML =
      `<div style="width:18px;height:18px;margin:0 auto;color:${body.color};">${kindIconSvg(body.kind, body.color)}</div>` +
      `<div style="font-size:12px;font-weight:600;letter-spacing:0.08em;margin-top:4px;text-transform:uppercase;">${body.name}</div>` +
      `<div style="font-size:9px;opacity:0.55;letter-spacing:0.14em;text-transform:uppercase;">${body.kind}</div>` +
      `<div class="mk-dist" style="font-family:'Share Tech Mono',monospace;font-size:11px;opacity:0.85;margin-top:2px;color:#7fd6ff;"></div>`;
    const obj = new CSS2DObject(root);
    obj.position.set(0, 0, 0);
    obj.center.set(0.5, 0.5);
    body.parent.add(obj);
    return { body, obj, distEl: root.querySelector(".mk-dist") as HTMLElement };
  });

  return {
    update(possessedSystemPos, visible) {
      for (const m of markers) {
        m.obj.visible = visible;
        if (!visible) continue;
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
