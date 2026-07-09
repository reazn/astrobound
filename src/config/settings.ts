// Runtime, user-tweakable settings. This is a single mutable object shared by
// input, camera and the settings menu. Defaults here; the ESC menu edits them
// live. Ship/character picks persist to localStorage.

import { DEFAULT_SHIP_ID } from "../content/ships";
import { DEFAULT_CHARACTER_ID } from "../content/characters";

export interface Settings {
  mouseSensitivity: number;
  invertY: boolean;
  cursorLocked: boolean; // false => "normal mouse", pointer lock disabled

  // Camera zoom (scroll wheel), clamped to [minZoom, maxZoom].
  cameraDistance: number;
  minZoom: number;
  maxZoom: number;

  fov: number;

  // When false (default), releasing thrust brakes you toward the local orbital
  // rest frame so you can match stations/asteroids easily. When true, vacuum
  // coasting keeps your relative velocity (NMS-style momentum).
  maintainMomentum: boolean;

  selectedShipId: string;
  selectedCharacterId: string;
}

const STORAGE_KEY = "astrobound.settings.v1";

const defaults: Settings = {
  mouseSensitivity: 0.0014,
  invertY: false,
  cursorLocked: true,

  cameraDistance: 11,
  minZoom: 5,
  maxZoom: 28,

  fov: 62,

  maintainMomentum: false,

  selectedShipId: DEFAULT_SHIP_ID,
  selectedCharacterId: DEFAULT_CHARACTER_ID,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export const settings: Settings = load();

export function persistSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mouseSensitivity: settings.mouseSensitivity,
      invertY: settings.invertY,
      cursorLocked: settings.cursorLocked,
      cameraDistance: settings.cameraDistance,
      fov: settings.fov,
      maintainMomentum: settings.maintainMomentum,
      selectedShipId: settings.selectedShipId,
      selectedCharacterId: settings.selectedCharacterId,
    }));
  } catch { /* ignore quota / private mode */ }
}
