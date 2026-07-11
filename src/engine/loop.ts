// Fixed-timestep game loop. Simulation advances in fixed dt steps; rendering
// happens once per frame with an interpolation alpha. When uncapped (debug),
// frames are scheduled via MessageChannel so FPS isn't stuck on display VSync.

export interface Loop {
  start(): void;
  stop(): void;
  setUncapped(uncapped: boolean): void;
  readonly uncapped: boolean;
}

export interface LoopOptions {
  fixedDt: number;
  update(dt: number): void;
  render(alpha: number): void;
  beginFrame?: () => void;
}

export function createLoop(opts: LoopOptions): Loop {
  const maxAccum = opts.fixedDt * 5;
  let accumulator = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let uncapped = false;
  let timeoutId = 0;
  const channel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
  // Soft cap so uncapped mode doesn't melt the machine (~500 fps).
  const MIN_UNCAP_MS = 2;

  const schedule = () => {
    if (!running) return;
    if (uncapped && channel) {
      const elapsed = performance.now() - last;
      const wait = Math.max(0, MIN_UNCAP_MS - elapsed);
      if (wait > 0) {
        timeoutId = window.setTimeout(() => channel.port2.postMessage(null), wait);
      } else {
        channel.port2.postMessage(null);
      }
    } else {
      raf = requestAnimationFrame(frame);
    }
  };

  const frame = (now: number) => {
    if (!running) return;
    let delta = (now - last) / 1000;
    last = now;
    if (delta > 0.25) delta = 0.25;
    accumulator = Math.min(accumulator + delta, maxAccum);

    opts.beginFrame?.();

    while (accumulator >= opts.fixedDt) {
      opts.update(opts.fixedDt);
      accumulator -= opts.fixedDt;
    }

    opts.render(accumulator / opts.fixedDt);
    schedule();
  };

  if (channel) {
    channel.port1.onmessage = () => frame(performance.now());
  }

  return {
    get uncapped() {
      return uncapped;
    },
    setUncapped(v) {
      if (uncapped === v) return;
      uncapped = v;
      if (!running) return;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
      last = performance.now();
      schedule();
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      schedule();
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    },
  };
}
