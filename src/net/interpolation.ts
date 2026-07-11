import type { PlayerSnapshot, Vec3, CoordFrame } from "./protocol";
import { framesEqual, vec3Dist } from "./protocol";

export interface SnapshotSample {
  receivedAt: number;
  snapshot: PlayerSnapshot;
}

export interface InterpolatedTransform {
  position: Vec3;
  velocity: Vec3;
  frame: CoordFrame;
  up?: Vec3;
  faceDir?: Vec3;
  orientation?: [number, number, number, number];
  possession: PlayerSnapshot["possession"];
  movementFlags: number;
}

const BUFFER_MS = 120;
const EXTRAPOLATE_MAX_MS = 400;

export class RemoteTransformBuffer {
  private samples: SnapshotSample[] = [];
  private correctedPos: Vec3 | null = null;
  private smoothT = 0;
  private lastFrame: CoordFrame | null = null;

  push(snapshot: PlayerSnapshot) {
    if (this.lastFrame && !framesEqual(this.lastFrame, snapshot.transform.frame)) {
      this.samples = [];
      this.correctedPos = null;
      this.smoothT = 0;
    }
    this.lastFrame = snapshot.transform.frame;
    this.samples.push({ receivedAt: performance.now(), snapshot });
    while (this.samples.length > 4) this.samples.shift();
  }

  sample(now = performance.now()): InterpolatedTransform | null {
    if (this.samples.length === 0) return null;

    const latest = this.samples[this.samples.length - 1];
    const t = latest.snapshot.transform;

    if (this.samples.length === 1) {
      const age = now - latest.receivedAt;
      const dt = Math.min(age / 1000, EXTRAPOLATE_MAX_MS / 1000);
      const pos = extrapolate(t.position, t.velocity, dt);
      return this.finish(pos, latest.snapshot);
    }

    const renderTime = now - BUFFER_MS;
    let a = this.samples[0];
    let b = this.samples[this.samples.length - 1];

    for (let i = 0; i < this.samples.length - 1; i++) {
      if (this.samples[i].receivedAt <= renderTime && this.samples[i + 1].receivedAt >= renderTime) {
        a = this.samples[i];
        b = this.samples[i + 1];
        break;
      }
    }

    if (!framesEqual(a.snapshot.transform.frame, b.snapshot.transform.frame)) {
      return this.finish(b.snapshot.transform.position, b.snapshot);
    }

    if (renderTime > b.receivedAt) {
      const age = renderTime - b.receivedAt;
      const dt = Math.min(age / 1000, EXTRAPOLATE_MAX_MS / 1000);
      const pos = extrapolate(b.snapshot.transform.position, b.snapshot.transform.velocity, dt);
      return this.finish(pos, b.snapshot);
    }

    const span = Math.max(1, b.receivedAt - a.receivedAt);
    const alpha = Math.max(0, Math.min(1, (renderTime - a.receivedAt) / span));
    const pos: Vec3 = [
      lerp(a.snapshot.transform.position[0], b.snapshot.transform.position[0], alpha),
      lerp(a.snapshot.transform.position[1], b.snapshot.transform.position[1], alpha),
      lerp(a.snapshot.transform.position[2], b.snapshot.transform.position[2], alpha),
    ];
    return this.finish(pos, b.snapshot);
  }

  private finish(pos: Vec3, snapshot: PlayerSnapshot): InterpolatedTransform {
    const transform = snapshot.transform;
    const snapThreshold = transform.frame.kind === "system" ? 80 : 8;
    const out = this.smoothCorrect(pos, 1 / 60, snapThreshold);
    return {
      position: out,
      velocity: transform.velocity,
      frame: transform.frame,
      up: transform.up,
      faceDir: transform.faceDir,
      orientation: transform.orientation,
      possession: snapshot.possession,
      movementFlags: snapshot.movementFlags,
    };
  }

  smoothCorrect(pos: Vec3, dt: number, snapThreshold: number): Vec3 {
    if (!this.correctedPos) {
      this.correctedPos = [...pos];
      return this.correctedPos;
    }
    const snapDist = vec3Dist(this.correctedPos, pos);
    if (snapDist > snapThreshold) {
      this.correctedPos = [...pos];
      this.smoothT = 0;
      return this.correctedPos;
    }
    this.smoothT = Math.min(1, this.smoothT + dt * 8);
    const t = this.smoothT;
    this.correctedPos[0] = lerp(this.correctedPos[0], pos[0], t);
    this.correctedPos[1] = lerp(this.correctedPos[1], pos[1], t);
    this.correctedPos[2] = lerp(this.correctedPos[2], pos[2], t);
    return this.correctedPos;
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function extrapolate(pos: Vec3, vel: Vec3, dt: number): Vec3 {
  return [pos[0] + vel[0] * dt, pos[1] + vel[1] * dt, pos[2] + vel[2] * dt];
}
