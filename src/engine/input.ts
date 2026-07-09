import { settings } from "../config/settings";

// Keyboard + mouse + wheel input. No "click to play" gate: movement works
// immediately. When settings.cursorLocked is on, we grab pointer lock on the
// first gesture so the mouse drives the camera instead of the OS cursor. ESC
// releases the lock; the settings menu (which pauses input) can re-grab it.

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
  let skipNextMove = false;
  let skipUntil = 0;
  let emaMag = 8;

  // Chromium pointer-lock often emits huge movementX/Y bursts on lock, focus
  // regain, and after tab switches. Hard-cap each event, reject outliers vs a
  // running EMA, and cap the per-frame accumulator so a hitch can't dump a
  // whole second of buffered motion into one steer tick.
  const MAX_EVENT = 28;
  const MAX_FRAME = 48;
  const OUTLIER_MULT = 3.2;
  const SKIP_MS_AFTER_LOCK = 120;

  const tryAutoLock = () => {
    if (settings.cursorLocked && !locked && !paused) canvas.requestPointerLock();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // While playing (pointer locked, or any in-game key), block browser chrome
    // shortcuts that steal focus / close the tab / open bookmarks.
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
      if (mod) {
        // Ctrl/Cmd/Alt + letter/number/symbol — bookmarks, close tab, new tab, etc.
        e.preventDefault();
      }
    }
    if (paused) return;
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    tryAutoLock();
  };
  const onKeyUp = (e: KeyboardEvent) => down.delete(e.code);
  const onMouseMove = (e: MouseEvent) => {
    if (!locked || paused) return;
    if (skipNextMove || performance.now() < skipUntil) {
      skipNextMove = false;
      return;
    }
    let dx = Math.max(-MAX_EVENT, Math.min(MAX_EVENT, e.movementX));
    let dy = Math.max(-MAX_EVENT, Math.min(MAX_EVENT, e.movementY));
    const mag = Math.hypot(dx, dy);
    if (mag > emaMag * OUTLIER_MULT && mag > 18) return;
    emaMag += (Math.max(mag, 1) - emaMag) * 0.12;
    if (Math.abs(mdx + dx) > MAX_FRAME) dx = Math.sign(dx) * Math.max(0, MAX_FRAME - Math.abs(mdx));
    if (Math.abs(mdy + dy) > MAX_FRAME) dy = Math.sign(dy) * Math.max(0, MAX_FRAME - Math.abs(mdy));
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
    if (document.hidden) skipUntil = performance.now() + 120;
  };
  const onLock = () => {
    const nowLocked = document.pointerLockElement === canvas;
    const wasLocked = locked;
    locked = nowLocked;
    if (nowLocked) {
      skipNextMove = true;
      skipUntil = performance.now() + SKIP_MS_AFTER_LOCK;
      mdx = 0;
      mdy = 0;
      emaMag = 8;
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
  window.addEventListener("mousemove", onMouseMove);
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
      if (settings.cursorLocked) canvas.requestPointerLock();
    },
    exitLock: () => {
      intentionalExit = true;
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerlockchange", onLock);
    },
  };
}
