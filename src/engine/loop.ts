// Fixed-timestep game loop. Simulation advances in fixed dt steps (so physics &
// game logic are deterministic and multiplayer-ready); rendering happens once
// per animation frame with an interpolation alpha between the last two sim
// states. Guards against the "spiral of death" by clamping the accumulator.

export interface Loop {
  start(): void;
  stop(): void;
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
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
