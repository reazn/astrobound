import { settings } from "../config/settings";

// Keyboard + mouse + wheel input. No "click to play" gate: movement works
// immediately. When settings.cursorLocked is on, we grab pointer lock on the
// first gesture so the mouse drives the camera instead of the OS cursor. ESC
// releases the lock; the settings menu (which pauses input) can re-grab it.
//
// Pointer-lock look uses raw deltas when the browser supports it
// (`unadjustedMovement: true`) so OS mouse acceleration doesn't warp aim.
// High-Hz mice (500–1000Hz) can still emit rare Chromium spikes on lock /
// focus; we only suppress those briefly after lock, and never drop normal
// motion mid-look (aggressive EMA/caps feel like "polling stutter").

export interface Input {
  held(code: string): boolean;
  justPressed(code: string): boolean;
  beginFrame(): void;
  consumeMouse(): { dx: number; dy: number };
  peekMouse(): { dx: number; dy: number };
  consumeWheel(): number;
  clearFrame(): void;
  readonly locked: boolean;
  setPaused(paused: boolean): void;
  requestLock(): void;
  exitLock(): void;
  dispose(): void;
}

function requestRawPointerLock(el: HTMLElement) {
  const anyEl = el as HTMLElement & {
    requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => unknown;
  };
  try {
    const result = anyEl.requestPointerLock({ unadjustedMovement: true });
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch(() => {
        try { el.requestPointerLock(); } catch { /* */ }
      });
    }
  } catch {
    try { el.requestPointerLock(); } catch { /* */ }
  }
}

export function createInput(
  canvas: HTMLElement,
  onUnexpectedUnlock: () => void,
): Input {
  const down = new Set<string>();
  const pressed = new Set<string>();
  let mdx = 0, mdy = 0, wheel = 0;
  let batchDx = 0, batchDy = 0;
  let mouseConsumed = false;
  let locked = false;
  let paused = false;
  let intentionalExit = false;
  let skipUntil = 0;

  // Only used right after lock / focus regain — not during normal look.
  const SKIP_MS_AFTER_LOCK = 60;
  // Soft per-event clamp for pathological Chromium bursts (thousands of px).
  // Keep this high so 1000Hz mice aren't chopped into stuttery chunks.
  const MAX_EVENT = 200;

  const tryAutoLock = () => {
    if (settings.cursorLocked && !locked && !paused) requestRawPointerLock(canvas);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const blockBrowser = locked || !paused;
    if (blockBrowser) {
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      if (
        e.code === "Space" || e.code === "Tab" || e.code === "Slash" ||
        e.code === "Backspace" || e.code === "F1" || e.code === "F3" ||
        e.code === "F5" || e.code === "F6" || e.code === "F7"
      ) {
        e.preventDefault();
      }
      if (mod) e.preventDefault();
    }
    if (paused) return;
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    tryAutoLock();
  };
  const onKeyUp = (e: KeyboardEvent) => down.delete(e.code);
  const onMouseMove = (e: MouseEvent) => {
    if (!locked || paused) return;
    if (performance.now() < skipUntil) return;
    // movementX/Y are already relative; with unadjustedMovement they are raw.
    const dx = Math.max(-MAX_EVENT, Math.min(MAX_EVENT, e.movementX || 0));
    const dy = Math.max(-MAX_EVENT, Math.min(MAX_EVENT, e.movementY || 0));
    if (dx === 0 && dy === 0) return;
    mdx += dx;
    mdy += dy;
  };
  const onWheel = (e: WheelEvent) => {
    if (paused) return;
    e.preventDefault();
    wheel += Math.sign(e.deltaY);
  };
  const onPointerDown = () => tryAutoLock();
  const onVisibility = () => {
    mdx = 0;
    mdy = 0;
    if (document.hidden) skipUntil = performance.now() + 100;
  };
  const onLock = () => {
    const nowLocked = document.pointerLockElement === canvas;
    const wasLocked = locked;
    locked = nowLocked;
    if (nowLocked) {
      skipUntil = performance.now() + SKIP_MS_AFTER_LOCK;
      mdx = 0;
      mdy = 0;
    }
    if (!nowLocked) {
      down.clear();
      if (wasLocked && !intentionalExit && settings.cursorLocked && !paused) {
        onUnexpectedUnlock();
      }
      intentionalExit = false;
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  document.addEventListener("mousemove", onMouseMove);
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointerlockchange", onLock);

  return {
    held: (code) => !paused && down.has(code),
    justPressed: (code) => !paused && pressed.has(code),
    beginFrame: () => {
      batchDx = mdx;
      batchDy = mdy;
      mdx = 0;
      mdy = 0;
      mouseConsumed = false;
    },
    peekMouse: () => ({ dx: batchDx, dy: batchDy }),
    consumeMouse: () => {
      if (mouseConsumed) return { dx: 0, dy: 0 };
      mouseConsumed = true;
      return { dx: batchDx, dy: batchDy };
    },
    consumeWheel: () => {
      const w = wheel;
      wheel = 0;
      return w;
    },
    clearFrame: () => pressed.clear(),
    get locked() {
      return locked;
    },
    setPaused: (p) => {
      paused = p;
      if (p) {
        down.clear();
        mdx = 0;
        mdy = 0;
      }
    },
    requestLock: () => {
      if (settings.cursorLocked) requestRawPointerLock(canvas);
    },
    exitLock: () => {
      intentionalExit = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerlockchange", onLock);
    },
  };
}
