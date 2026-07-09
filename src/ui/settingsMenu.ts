import type { PerspectiveCamera } from "three";
import type { Input } from "../engine/input";
import { settings, persistSettings } from "../config/settings";
import { SHIPS } from "../content/ships";
import { CHARACTERS } from "../content/characters";
import { createModelPreview, type ModelPreview } from "./modelPreview";

// ESC settings menu. A DOM overlay that pauses input and releases the mouse so
// the game can be tweaked live. Includes ship/character pickers with a spinning
// 3D preview. Opening is triggered either by ESC (when the cursor is free) or
// by input's "unexpected unlock" callback (ESC while locked).

export interface AppearanceCallbacks {
  onShipChange: (shipId: string) => void | Promise<void>;
  onCharacterChange: (characterId: string) => void | Promise<void>;
}

export interface SettingsMenu {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  dispose(): void;
}

export function createSettingsMenu(
  input: Input,
  camera: PerspectiveCamera,
  appearance?: AppearanceCallbacks,
): SettingsMenu {
  let isOpen = false;

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;display:none;align-items:center;justify-content:center;" +
    "background:rgba(8,10,18,0.55);backdrop-filter:blur(3px);pointer-events:auto;z-index:50;" +
    "font-family:system-ui,sans-serif;color:#f4f1e8;overflow:auto;padding:24px;";

  const panel = document.createElement("div");
  panel.style.cssText =
    "min-width:360px;max-width:min(520px,94vw);padding:22px 24px;border-radius:14px;" +
    "background:rgba(20,24,34,0.94);box-shadow:0 20px 60px rgba(0,0,0,0.5);" +
    "border:1px solid rgba(255,255,255,0.08);";
  overlay.appendChild(panel);

  const title = document.createElement("div");
  title.textContent = "Settings";
  title.style.cssText =
    "font-size:20px;font-weight:600;margin-bottom:18px;letter-spacing:0.02em;";
  panel.appendChild(title);

  const row = () => {
    const r = document.createElement("label");
    r.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:16px;" +
      "margin:12px 0;font-size:14px;";
    panel.appendChild(r);
    return r;
  };

  const addSlider = (
    label: string, min: number, max: number, step: number,
    get: () => number, set: (v: number) => void,
  ) => {
    const r = row();
    const span = document.createElement("span");
    span.textContent = label;
    const val = document.createElement("span");
    val.style.cssText = "opacity:0.6;min-width:44px;text-align:right;font-variant-numeric:tabular-nums;";
    const inputEl = document.createElement("input");
    inputEl.type = "range";
    inputEl.min = String(min); inputEl.max = String(max); inputEl.step = String(step);
    inputEl.value = String(get());
    inputEl.style.flex = "1";
    const refresh = () => (val.textContent = String(Number(get()).toFixed(step < 0.01 ? 4 : 0)));
    inputEl.oninput = () => { set(Number(inputEl.value)); refresh(); persistSettings(); };
    refresh();
    r.append(span, inputEl, val);
  };

  const addToggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const r = row();
    const span = document.createElement("span");
    span.textContent = label;
    const inputEl = document.createElement("input");
    inputEl.type = "checkbox";
    inputEl.checked = get();
    inputEl.style.cssText = "width:18px;height:18px;accent-color:#e8623a;";
    inputEl.onchange = () => { set(inputEl.checked); persistSettings(); };
    r.append(span, inputEl);
  };

  addSlider("Mouse sensitivity", 0.0004, 0.004, 0.0001,
    () => settings.mouseSensitivity, (v) => (settings.mouseSensitivity = v));
  addToggle("Invert look (Y)", () => settings.invertY, (v) => (settings.invertY = v));
  addToggle("Lock mouse to camera", () => settings.cursorLocked, (v) => {
    settings.cursorLocked = v;
    if (!v) input.exitLock();
  });
  addSlider("Field of view", 45, 95, 1, () => settings.fov, (v) => {
    settings.fov = v;
    camera.fov = v;
    camera.updateProjectionMatrix();
  });
  addSlider("Zoom distance", settings.minZoom, settings.maxZoom, 1,
    () => settings.cameraDistance, (v) => (settings.cameraDistance = v));

  const section = (label: string) => {
    const h = document.createElement("div");
    h.textContent = label;
    h.style.cssText =
      "margin:22px 0 10px;font-size:13px;font-weight:600;letter-spacing:0.06em;" +
      "text-transform:uppercase;opacity:0.55;";
    panel.appendChild(h);
    return h;
  };

  type PickerItem = { id: string; name: string; url: string; yaw?: number; playIdle?: boolean };
  const warmers: Array<() => void> = [];
  const previews: ModelPreview[] = [];
  let previewsWarmed = false;

  const addAppearancePicker = (
    label: string,
    items: PickerItem[],
    getId: () => string,
    onPick: (id: string) => void | Promise<void>,
  ) => {
    section(label);
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch;margin-bottom:4px;";
    panel.appendChild(wrap);

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;";
    wrap.appendChild(list);

    const previewBox = document.createElement("div");
    previewBox.style.cssText =
      "border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);" +
      "background:#0c1018;min-height:160px;aspect-ratio:11/8;";
    wrap.appendChild(previewBox);

    const preview: ModelPreview = createModelPreview(240, 175);
    previewBox.appendChild(preview.canvas);
    previews.push(preview);

    const buttons: HTMLButtonElement[] = [];
    const styleBtn = (btn: HTMLButtonElement, active: boolean) => {
      btn.style.cssText =
        "text-align:left;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:13px;" +
        "border:1px solid " + (active ? "rgba(232,98,58,0.7)" : "rgba(255,255,255,0.08)") + ";" +
        "background:" + (active ? "rgba(232,98,58,0.22)" : "rgba(255,255,255,0.04)") + ";" +
        "color:#f4f1e8;font-weight:" + (active ? "600" : "500") + ";";
    };

    const refreshPreview = () => {
      const id = getId();
      const item = items.find((x) => x.id === id) ?? items[0];
      for (const b of buttons) styleBtn(b, b.dataset.id === id);
      void preview.setUrl(item.url, {
        playIdle: item.playIdle !== false,
        yaw: item.yaw ?? 0,
      });
    };

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.name;
      btn.dataset.id = item.id;
      btn.onclick = async () => {
        await onPick(item.id);
        persistSettings();
        refreshPreview();
      };
      list.appendChild(btn);
      buttons.push(btn);
      styleBtn(btn, item.id === getId());
    }

    warmers.push(refreshPreview);
  };

  if (appearance) {
    addAppearancePicker(
      "Spaceship",
      SHIPS.map((s) => ({
        id: s.id, name: s.name, url: s.url, yaw: s.noseYaw, playIdle: false,
      })),
      () => settings.selectedShipId,
      async (id) => {
        settings.selectedShipId = id;
        await appearance.onShipChange(id);
      },
    );
    addAppearancePicker(
      "Astronaut",
      CHARACTERS.map((c) => ({
        id: c.id, name: c.name, url: c.url, yaw: c.modelYaw, playIdle: true,
      })),
      () => settings.selectedCharacterId,
      async (id) => {
        settings.selectedCharacterId = id;
        await appearance.onCharacterChange(id);
      },
    );
  }

  const hint = document.createElement("div");
  hint.style.cssText = "margin-top:8px;font-size:12px;opacity:0.45;line-height:1.45;max-width:460px;";
  hint.textContent = "ESC resume · Shift boost (unlimited) · N toggles momentum while flying";
  panel.appendChild(hint);

  const resume = document.createElement("button");
  resume.textContent = "Resume";
  resume.style.cssText =
    "margin-top:18px;width:100%;padding:10px;border:0;border-radius:9px;cursor:pointer;" +
    "background:#e8623a;color:#fff;font-size:15px;font-weight:600;";
  resume.onclick = () => close();
  panel.appendChild(resume);

  document.body.appendChild(overlay);

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    overlay.style.display = "flex";
    input.setPaused(true);
    input.exitLock();
    // Warm previews once on first open (uses shared GLTF cache after that).
    if (!previewsWarmed) {
      previewsWarmed = true;
      for (const r of warmers) r();
    }
  };
  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    overlay.style.display = "none";
    input.setPaused(false);
    input.requestLock();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") {
      e.preventDefault();
      isOpen ? close() : open();
    }
  };
  window.addEventListener("keydown", onKey);

  return {
    open, close,
    get isOpen() { return isOpen; },
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      for (const p of previews) p.dispose();
      overlay.remove();
    },
  };
}
