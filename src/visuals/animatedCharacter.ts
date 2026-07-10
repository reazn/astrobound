import {
  Group, AnimationMixer, AnimationAction, AnimationClip, LoopOnce, LoopRepeat,
  Box3, Vector3, Mesh, Material, Object3D, SkinnedMesh,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGltf } from "../engine/gltfCache";
import { makeReadableToon } from "./toonMaterial";

// Animated character: locomotion (idle/walk/run) blended by speed, a jump
// sequence (start → air loop → land), optional swim clips, plus one-shot
// actions. Models without clips fall back to procedural bob/lean/paddle.

export interface ClipMap {
  idle: string;
  walk: string;
  run: string;
  jump?: string;
  jumpIdle?: string;
  jumpLand?: string;
  swimIdle?: string;
  swim?: string;
  slide?: string;
  attack?: string;
  hit?: string;
  death?: string;
}

export type ActionName = "jump" | "slide" | "attack" | "hit" | "death";

export interface CharacterSource {
  scene: Group;
  animations: AnimationClip[];
}

export interface LocomotionState {
  speed01: number;
  grounded: boolean;
  swimming?: boolean;
}

export interface AnimatedCharacter {
  object: Group;
  height: number;
  setLocomotion(speed01: number, grounded: boolean, swimming?: boolean): void;
  play(action: ActionName, timeScale?: number): void;
  isBusy(): boolean;
  attachToBone(obj: Object3D, boneName: string): boolean;
  setOpacity(o: number): void;
  update(dt: number): void;
}

const characterSourceCache = new Map<string, Promise<CharacterSource>>();

export async function loadCharacterSource(url: string): Promise<CharacterSource> {
  let pending = characterSourceCache.get(url);
  if (!pending) {
    pending = loadGltf(url).then((gltf) => ({
      scene: gltf.scene as Group,
      animations: gltf.animations.slice(),
    }));
    characterSourceCache.set(url, pending);
    pending.catch(() => {
      if (characterSourceCache.get(url) === pending) characterSourceCache.delete(url);
    });
  }
  return pending;
}

type JumpPhase = "none" | "start" | "air" | "land";

export function createAnimatedCharacter(
  source: CharacterSource, clips: ClipMap, modelYaw = 0,
): AnimatedCharacter {
  const model = cloneSkeleton(source.scene) as Group;
  if (modelYaw) model.rotation.y = modelYaw;
  const rotator = new Group();
  rotator.add(model);
  const box = new Box3().setFromObject(rotator);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  rotator.position.set(-center.x, -box.min.y, -center.z);
  const anim = new Group();
  anim.add(rotator);
  const root = new Group();
  root.add(anim);

  const materials: Material[] = [];
  root.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      if (Array.isArray(m.material)) {
        m.material = m.material.map((x) => makeReadableToon(x));
      } else {
        m.material = makeReadableToon(m.material);
      }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) materials.push(mat);
    }
  });
  root.castShadow = true;
  root.receiveShadow = true;
  const height = size.y || 1.8;

  // Bind mixer to root so clip tracks resolve through the full hierarchy.
  const mixer = new AnimationMixer(root);
  const byName = (n?: string) =>
    n ? source.animations.find((a) => a.name === n) : undefined;
  const act = (n?: string): AnimationAction | null => {
    const c = byName(n);
    return c ? mixer.clipAction(c) : null;
  };

  const idle = act(clips.idle);
  const walk = act(clips.walk);
  const run = act(clips.run);
  const jumpStart = act(clips.jump);
  const jumpAir = act(clips.jumpIdle) ?? jumpStart;
  const jumpLand = act(clips.jumpLand);
  const swimIdle = act(clips.swimIdle);
  const swimMove = act(clips.swim) ?? swimIdle;
  const hasSwimClips = !!(swimIdle || swimMove);

  const proceduralOnly = !idle && !walk && !run;
  let locoSpeed01 = 0;
  let locoGrounded = true;
  let locoSwimming = false;
  let animPhase = 0;
  let animClock = 0;
  let jumpT = 0;
  let jumping = false;
  let jumpPhase: JumpPhase = "none";
  let jumpWatchdog = 0;

  const oneShots: Record<string, AnimationAction | null> = {
    slide: act(clips.slide),
    attack: act(clips.attack),
    hit: act(clips.hit),
    death: act(clips.death),
  };

  const locoActions = [idle, walk, run, swimIdle, swimMove]
    .filter(Boolean) as AnimationAction[];
  for (const a of locoActions) {
    a.setLoop(LoopRepeat, Infinity);
    a.play().setEffectiveWeight(0);
  }
  let current: AnimationAction | null = idle ?? walk ?? run ?? null;
  current?.setEffectiveWeight(1);

  let busy: AnimationAction | null = null;
  let busyIsDeath = false;
  let busyPri = 0;
  const PRI: Record<ActionName, number> = { attack: 1, hit: 2, slide: 3, jump: 4, death: 5 };

  // Sticky loco band so speed01 noise around thresholds doesn't thrash idle↔walk.
  let locoBand: "idle" | "walk" | "run" | "swimIdle" | "swim" | "air" = "idle";

  const jumpActions = [jumpStart, jumpAir, jumpLand].filter(Boolean) as AnimationAction[];

  const stopJumpActions = (except: AnimationAction | null = null) => {
    for (const a of jumpActions) {
      if (a === except) continue;
      a.stop();
      a.setEffectiveWeight(0);
    }
  };

  const fadeTo = (next: AnimationAction | null, fade = 0.18) => {
    if (!next) return;
    if (next === current) return;
    stopJumpActions();
    jumpPhase = "none";
    jumpWatchdog = 0;
    next.enabled = true;
    if (!next.isRunning()) {
      next.reset().setEffectiveWeight(0).play();
    }
    next.setEffectiveWeight(1);
    next.fadeIn(fade);
    if (current && current !== next) current.fadeOut(fade);
    for (const a of locoActions) {
      if (a !== next && a !== current) a.setEffectiveWeight(0);
    }
    current = next;
  };

  const stopBusy = () => {
    if (busy) {
      busy.fadeOut(0.12);
      busy = null;
    }
    busyIsDeath = false;
    busyPri = 0;
  };

  const resumeLoco = () => {
    stopBusy();
    stopJumpActions();
    jumpPhase = "none";
    jumpWatchdog = 0;
    const target = pickLoco();
    if (target) {
      target.reset().setEffectiveWeight(1).fadeIn(0.15);
      if (!target.isRunning()) target.play();
      if (current && current !== target && !jumpActions.includes(current)) {
        current.fadeOut(0.15);
      }
      current = target;
    }
  };

  const pickLoco = (): AnimationAction | null => {
    if (locoSwimming && hasSwimClips) {
      if (locoBand === "swim") {
        if (locoSpeed01 < 0.08) locoBand = "swimIdle";
      } else if (locoSpeed01 > 0.16) {
        locoBand = "swim";
      } else {
        locoBand = "swimIdle";
      }
      return locoBand === "swim"
        ? (swimMove ?? swimIdle)
        : (swimIdle ?? swimMove);
    }
    // Air without an active jump sequence: keep run/walk pose, never Jump_Idle
    // (that clip's translations fight loco and stretch the head).
    if (!locoGrounded && !locoSwimming) {
      locoBand = "air";
      return run ?? walk ?? idle ?? current;
    }
    if (locoBand === "run") {
      if (locoSpeed01 < 0.55) locoBand = locoSpeed01 < 0.08 ? "idle" : "walk";
    } else if (locoBand === "walk") {
      if (locoSpeed01 < 0.08) locoBand = "idle";
      else if (locoSpeed01 > 0.72) locoBand = "run";
    } else if (locoBand === "air") {
      if (locoSpeed01 > 0.72) locoBand = "run";
      else if (locoSpeed01 > 0.18) locoBand = "walk";
      else locoBand = "idle";
    } else {
      if (locoSpeed01 > 0.72) locoBand = "run";
      else if (locoSpeed01 > 0.18) locoBand = "walk";
      else locoBand = "idle";
    }
    if (locoBand === "idle") return idle ?? walk ?? run;
    if (locoBand === "walk") return walk ?? run ?? idle;
    return run ?? walk ?? idle;
  };

  const beginJump = (timeScale = 1) => {
    if (proceduralOnly) {
      jumping = true;
      jumpT = 0;
      return;
    }
    const start = jumpStart ?? jumpAir;
    if (!start) return;
    stopBusy();
    stopJumpActions(start);
    for (const a of locoActions) a.fadeOut(0.1);
    start.reset();
    start.setLoop(LoopOnce, 1);
    start.clampWhenFinished = true;
    start.timeScale = timeScale;
    start.setEffectiveWeight(1).fadeIn(0.06).play();
    current = start;
    jumpPhase = "start";
    jumpWatchdog = Math.max(0.35, (start.getClip()?.duration ?? 0.4) / Math.max(0.1, timeScale) + 0.2);
  };

  const enterJumpAir = () => {
    if (!jumpAir) {
      jumpPhase = "air";
      return;
    }
    if (jumpPhase === "air" && jumpAir.getEffectiveWeight() > 0.9) return;
    stopJumpActions(jumpAir);
    jumpAir.setLoop(LoopRepeat, Infinity);
    jumpAir.reset();
    jumpAir.setEffectiveWeight(1).fadeIn(0.1).play();
    if (current && current !== jumpAir) current.fadeOut(0.1);
    current = jumpAir;
    jumpPhase = "air";
    jumpWatchdog = 0;
  };

  const beginJumpLand = () => {
    if (!jumpLand) {
      resumeLoco();
      return;
    }
    stopJumpActions(jumpLand);
    jumpLand.reset();
    jumpLand.setLoop(LoopOnce, 1);
    jumpLand.clampWhenFinished = true;
    jumpLand.setEffectiveWeight(1).fadeIn(0.06).play();
    if (current && current !== jumpLand) current.fadeOut(0.08);
    current = jumpLand;
    jumpPhase = "land";
    jumpWatchdog = Math.max(0.25, (jumpLand.getClip()?.duration ?? 0.3) + 0.15);
  };

  mixer.addEventListener("finished", (e) => {
    const finished = e.action as AnimationAction;
    if (jumpPhase === "start" && finished === jumpStart) {
      if (locoGrounded) beginJumpLand();
      else enterJumpAir();
      return;
    }
    if (jumpPhase === "land" && finished === jumpLand) {
      resumeLoco();
      return;
    }
    if (finished === busy && !busyIsDeath) {
      busy.fadeOut(0.15);
      busy = null;
      const target = pickLoco();
      if (target) {
        target.reset().setEffectiveWeight(1).fadeIn(0.15);
        if (!target.isRunning()) target.play();
        current = target;
      }
    }
  });

  return {
    object: root,
    height,
    setLocomotion(speed01, grounded, swimming = false) {
      const wasGrounded = locoGrounded;
      locoSpeed01 = speed01;
      locoGrounded = grounded;
      locoSwimming = swimming;

      if (busy) return;

      if (jumpPhase === "start" || jumpPhase === "air") {
        if (grounded && !wasGrounded) beginJumpLand();
        else if (!grounded && jumpPhase === "start" && jumpWatchdog <= 0) enterJumpAir();
        return;
      }
      if (jumpPhase === "land") return;

      if (swimming && !hasSwimClips) return;

      const target = pickLoco();
      fadeTo(target);
      if (run && !swimming) run.timeScale = 0.9 + speed01 * 0.5;
      if (swimMove && swimming) swimMove.timeScale = 0.85 + speed01 * 0.55;
    },
    play(name, timeScale = 1) {
      if (name === "jump") {
        beginJump(timeScale);
        return;
      }
      const a = oneShots[name];
      if (!a) return;
      if (busyIsDeath) return;
      if (busy && PRI[name] < busyPri) return;
      if (jumpPhase !== "none") {
        jumpPhase = "none";
        jumpWatchdog = 0;
      }
      a.reset();
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = timeScale;
      a.setEffectiveWeight(1).fadeIn(0.08).play();
      if (busy && busy !== a) busy.fadeOut(0.1);
      else if (current && current !== a) current.fadeOut(0.12);
      busy = a;
      busyPri = PRI[name];
      busyIsDeath = name === "death";
      current = a;
    },
    isBusy: () => busy !== null || jumpPhase !== "none" || (proceduralOnly && jumping),
    attachToBone(obj, boneName) {
      let bone: Object3D | null = null;
      root.traverse((o) => { if (o.name === boneName) bone = o; });
      if (!bone) return false;
      (bone as Object3D).add(obj);
      return true;
    },
    setOpacity(o) {
      for (const mat of materials) {
        mat.transparent = o < 0.999;
        mat.opacity = o;
        mat.depthWrite = o >= 0.999;
      }
    },
    update(dt) {
      mixer.update(dt);

      if (jumpWatchdog > 0) {
        jumpWatchdog -= dt;
        if (jumpWatchdog <= 0) {
          if (jumpPhase === "start") {
            if (locoGrounded) beginJumpLand();
            else enterJumpAir();
          } else if (jumpPhase === "land") {
            resumeLoco();
          }
        }
      }

      const useProcedural = proceduralOnly
        || (locoSwimming && !hasSwimClips)
        || (jumpPhase === "none" && !busy && !idle && !walk && !run);

      if (useProcedural) {
        animClock += dt;
        const moving = locoSpeed01 > 0.12;
        animPhase += dt * (7.5 + locoSpeed01 * 9);
        let ty = 0, tx = 0, tz = 0, sy = 1, sx = 1, k = dt * 5;

        if (locoSwimming && !hasSwimClips) {
          const stroke = Math.sin(animClock * (2.2 + locoSpeed01 * 2.5));
          ty = 0.02 + Math.sin(animClock * 1.8) * 0.03;
          tx = -0.35 + stroke * 0.08;
          tz = stroke * 0.12;
          sy = 1 + Math.sin(animClock * 1.8) * 0.02;
          sx = 1 - Math.abs(stroke) * 0.03;
          k = dt * 8;
        } else if (jumping || (!locoGrounded && proceduralOnly)) {
          if (jumping) {
            jumpT += dt;
            if (jumpT > 0.55 && locoGrounded) jumping = false;
          }
          const air = Math.min(1, jumpT / 0.18);
          tx = -0.18 - air * 0.12;
          sy = 1.08 + air * 0.06;
          sx = 0.92 - air * 0.04;
          ty = Math.min(0.12, jumpT * 0.35);
          k = dt * 8;
        } else if (moving && locoGrounded) {
          const stride = Math.sin(animPhase);
          const bob = Math.abs(stride);
          ty = bob * (0.055 + locoSpeed01 * 0.07);
          tx = -0.08 - 0.14 * Math.min(1, locoSpeed01);
          tz = stride * 0.1 * Math.min(1, locoSpeed01);
          sy = 1 + bob * 0.04;
          sx = 1 - bob * 0.03;
          k = dt * 12;
        } else {
          ty = Math.sin(animClock * 1.5) * 0.014;
          sy = 1 + Math.sin(animClock * 1.5) * 0.008;
        }
        const kk = Math.min(1, k);
        anim.position.y += (ty - anim.position.y) * kk;
        anim.rotation.x += (tx - anim.rotation.x) * kk;
        anim.rotation.z += (tz - anim.rotation.z) * kk;
        anim.scale.y += (sy - anim.scale.y) * kk;
        anim.scale.x += (sx - anim.scale.x) * kk;
        anim.scale.z += (sx - anim.scale.z) * kk;
      } else if (anim.position.y !== 0 || anim.rotation.x !== 0) {
        const kk = Math.min(1, dt * 8);
        anim.position.y += (0 - anim.position.y) * kk;
        anim.rotation.x += (0 - anim.rotation.x) * kk;
        anim.rotation.z += (0 - anim.rotation.z) * kk;
        anim.scale.y += (1 - anim.scale.y) * kk;
        anim.scale.x += (1 - anim.scale.x) * kk;
        anim.scale.z += (1 - anim.scale.z) * kk;
      }

      root.traverse((o) => {
        const sm = o as SkinnedMesh;
        if (sm.isSkinnedMesh) sm.frustumCulled = false;
      });
    },
  };
}

export async function loadAnimatedCharacter(
  url: string, clips: ClipMap,
): Promise<AnimatedCharacter> {
  return createAnimatedCharacter(await loadCharacterSource(url), clips);
}
