import { Vector3 } from "three";
import { MOVEMENT } from "../config/movement";
import type { GameWorld } from "../ecs/world";
import type { Planet } from "../worldgen/planet";
import type { Input } from "../engine/input";
import { hasEquippedMount, type PlayerInventory } from "../inventory/playerInventory";

// Player locomotion on a sphere. "Up" is the local surface normal; gravity is
// radial (toward the planet center) and jumps push outward. WASD moves in the
// tangent plane relative to the camera's forward. Collision with the ground is
// analytic against the planet height field (robust across the whole sphere, no
// character-controller "up" to fight). Fixed timestep; temps are reused.

const SKIN = 0.05;
const SNAP = 0.7; // ground-stick band when walking down slopes/terraces
const MAX_STEP = MOVEMENT.maxStepHeight;
const SOFT_SLOPE = Math.tan((MOVEMENT.maxSlopeClimbDeg * Math.PI) / 180);
const HARD_SLOPE = Math.tan((MOVEMENT.hardSlopeClimbDeg * Math.PI) / 180);

const up = new Vector3();
const fwd = new Vector3();
const right = new Vector3();
const wish = new Vector3();
const velTan = new Vector3();
const target = new Vector3();
const delta = new Vector3(); // private temp for moveTowards (must NOT be `target`)
const tentative = new Vector3();
const tUp = new Vector3();
const gDirA = new Vector3();
const gDirB = new Vector3();
const gradV = new Vector3();
const sample = new Vector3();
const rockPush = new Vector3();
const tmpX = new Vector3(1, 0, 0);
const tmpZ = new Vector3(0, 0, 1);

export interface RockColliders {
  centers: readonly Vector3[];
  radii: readonly number[];
}

function resolveRockCollisions(
  pos: Vector3,
  vel: Vector3,
  rocks: RockColliders | undefined,
  playerRadius: number,
) {
  if (!rocks || rocks.centers.length === 0) return;
  // Chest-height sample so we don't collide with the buried base of rocks.
  up.copy(pos).normalize();
  sample.copy(pos).addScaledVector(up, 0.85);
  const maxReach = 14;
  const maxReachSq = maxReach * maxReach;
  for (let i = 0; i < rocks.centers.length; i++) {
    const c = rocks.centers[i];
    const dx = sample.x - c.x;
    const dy = sample.y - c.y;
    const dz = sample.z - c.z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxReachSq) continue;
    const r = rocks.radii[i] + playerRadius;
    if (dSq >= r * r || dSq < 1e-8) continue;
    const d = Math.sqrt(dSq);
    rockPush.set(dx / d, dy / d, dz / d);
    const pen = r - d;
    pos.addScaledVector(rockPush, pen);
    sample.addScaledVector(rockPush, pen);
    const vn = vel.dot(rockPush);
    if (vn < 0) vel.addScaledVector(rockPush, -vn);
  }
}

function slopeFactor(climb: number, horiz: number): number {
  if (horiz < 1e-5) return 1;
  const grade = climb / horiz;
  if (grade <= SOFT_SLOPE) return 1;
  if (grade >= HARD_SLOPE) return 0;
  return 1 - (grade - SOFT_SLOPE) / (HARD_SLOPE - SOFT_SLOPE);
}

function moveTowards(vec: Vector3, tgt: Vector3, maxDelta: number) {
  delta.copy(tgt).sub(vec);
  const d = delta.length();
  if (d <= maxDelta || d === 0) vec.copy(tgt);
  else vec.addScaledVector(delta, maxDelta / d);
}

// Ground radius at a small tangential offset from `base` (for slope gradients).
function groundRAt(
  planet: Planet, base: Vector3, dirTan: Vector3, eps: number,
): number {
  sample.copy(base).addScaledVector(dirTan, eps).normalize();
  return planet.surfaceRadius(sample.x, sample.y, sample.z);
}

export function updatePlayerMovement(
  world: GameWorld,
  planet: Planet,
  input: Input,
  rigForward: Vector3,
  dt: number,
  rocks?: RockColliders,
  ore?: RockColliders,
  inventory?: PlayerInventory,
  canDebugFly = true,
) {
  for (const e of world.with("player", "movement", "position", "stats")) {
    const m = e.movement;
    const stats = e.stats;
    const pos = e.position;
    m.didJump = false;
    m.didSlide = false;
    m.inLiquid = false;

    if (canDebugFly && input.justPressed("KeyV")) {
      m.flying = !m.flying;
      if (m.flying) {
        m.sliding = false;
        m.hoverboarding = false;
        m.grounded = false;
      }
    }

    const canHover = !inventory || hasEquippedMount(inventory, "hoverboard");
    if (m.hoverboarding && !canHover) m.hoverboarding = false;

    if (input.justPressed("KeyH") && !m.flying && canHover) {
      m.hoverboarding = !m.hoverboarding;
      if (m.hoverboarding) {
        m.sliding = false;
        m.slideTime = 0;
      }
    }

    up.copy(pos).normalize();

    // Camera-relative tangent basis (project the camera forward onto the plane).
    fwd.copy(rigForward).addScaledVector(up, -rigForward.dot(up));
    if (fwd.lengthSq() < 1e-6) {
      // Camera looking straight up/down: pick any stable tangent.
      fwd.copy(tmpX).addScaledVector(up, -tmpX.dot(up));
      if (fwd.lengthSq() < 1e-6) fwd.copy(tmpZ).addScaledVector(up, -tmpZ.dot(up));
    }
    fwd.normalize();
    right.crossVectors(fwd, up).normalize();

    const f = (input.held("KeyW") ? 1 : 0) - (input.held("KeyS") ? 1 : 0);
    const s = (input.held("KeyD") ? 1 : 0) - (input.held("KeyA") ? 1 : 0);
    // Airborne hoverboard: W/S move only; A/D reserved for rolls.
    const moveS = (m.hoverboarding && !m.grounded) ? 0 : s;
    wish.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, moveS);
    const wishLen = wish.length();
    if (wishLen > 0) wish.multiplyScalar(1 / wishLen);

    // Split velocity into radial (vertical) + tangential (horizontal).
    let radial = m.velocity.dot(up);
    velTan.copy(m.velocity).addScaledVector(up, -radial);

    if (m.flying) {
      const boosting = input.held("ShiftLeft") || input.held("ShiftRight");
      const flyMult = MOVEMENT.flySpeedMult * (boosting ? MOVEMENT.flyBoostMult : 1);
      const flySpeed = MOVEMENT.moveSpeed * stats.moveSpeedMult * flyMult;
      const vert =
        (input.held("Space") ? 1 : 0) -
        (input.held("ControlLeft") || input.held("ControlRight") ? 1 : 0);
      target.copy(wish).multiplyScalar(flySpeed);
      moveTowards(velTan, target, MOVEMENT.groundAccel * 1.4 * dt);
      const wantRadial = vert * MOVEMENT.flyVerticalSpeed * flyMult * 0.35;
      radial += (wantRadial - radial) * Math.min(1, 8 * dt);
      e.prevPosition!.copy(pos);
      pos.addScaledVector(velTan, dt).addScaledVector(up, radial * dt);
      m.velocity.copy(velTan).addScaledVector(up, radial);
      resolveRockCollisions(pos, m.velocity, rocks, MOVEMENT.capsuleRadius);
      resolveRockCollisions(pos, m.velocity, ore, MOVEMENT.capsuleRadius * 0.9);
      up.copy(pos).normalize();
      m.up.copy(up);
      m.grounded = false;
      const hs = velTan.length();
      m.speed01 = Math.min(1.5, hs / (MOVEMENT.moveSpeed * MOVEMENT.flySpeedMult));
      if (hs > 1.0) m.faceDir.copy(velTan).multiplyScalar(1 / hs);
      else m.faceDir.copy(fwd);
      continue;
    }

    const groundProbe = planet.surfaceRadius(up.x, up.y, up.z);
    const overLiquid = !!(planet.def.liquid
      && pos.length() < planet.seaLevel + 2.5
      && groundProbe < planet.seaLevel - 0.25);
    const hover = m.hoverboarding;
    const inLiquid = overLiquid && !hover;
    m.inLiquid = inLiquid;

    const boosting = hover && (input.held("ShiftLeft") || input.held("ShiftRight"));
    const speed = hover
      ? MOVEMENT.hoverboardSpeed * stats.moveSpeedMult
        * (boosting ? MOVEMENT.hoverboardBoostMult : 1)
      : MOVEMENT.moveSpeed * stats.moveSpeedMult;
    const curGroundR = overLiquid && hover
      ? Math.max(groundProbe, planet.seaLevel)
      : planet.surfaceRadius(up.x, up.y, up.z);

    // Probe climb grade along wish so steep hills slow / block before integrate.
    let climbMul = 1;
    if (m.grounded && wishLen > 0) {
      const probe = Math.max(0.45, Math.min(1.4, speed * dt * 4));
      tentative.copy(pos).addScaledVector(wish, probe);
      tUp.copy(tentative).normalize();
      const probeSurf = overLiquid && hover
        ? Math.max(planet.surfaceRadius(tUp.x, tUp.y, tUp.z), planet.seaLevel)
        : planet.surfaceRadius(tUp.x, tUp.y, tUp.z);
      const probeClimb = probeSurf - curGroundR;
      climbMul = slopeFactor(probeClimb, probe);
      if (hover) {
        climbMul = Math.max(climbMul, MOVEMENT.hoverboardSlopeEase);
      }
    }

    // Slide (disabled while hoverboarding — board is always "sliding").
    m.slideCooldown = Math.max(0, m.slideCooldown - dt);
    const wantsSlide =
      !hover && (
        input.justPressed("ShiftLeft") || input.justPressed("ShiftRight") ||
        input.justPressed("ControlLeft") || input.justPressed("ControlRight")
      );
    if (
      !m.sliding && wantsSlide && m.grounded &&
      velTan.length() > 1.0 && m.slideCooldown === 0
    ) {
      m.sliding = true;
      m.slideTime = MOVEMENT.slideDuration;
      velTan.setLength(MOVEMENT.slideSpeed);
      m.didSlide = true;
    }

    if (hover) {
      const accel = m.grounded
        ? MOVEMENT.hoverboardAccel * (0.4 + 0.6 * climbMul) * (boosting ? 1.25 : 1)
        : MOVEMENT.hoverboardAccel * MOVEMENT.hoverboardAirControl;
      if (wishLen > 0) {
        target.copy(wish).multiplyScalar(speed * climbMul);
        // High-speed turn bleed — Fortnite carve feel.
        const hs0 = velTan.length();
        const turnBlend = hs0 > 8 ? Math.min(1, 10 / hs0) : 1;
        moveTowards(velTan, target, accel * (0.55 + 0.45 * turnBlend) * dt);
      } else if (m.grounded) {
        velTan.multiplyScalar(Math.max(0, 1 - MOVEMENT.hoverboardFriction * dt));
      } else {
        velTan.multiplyScalar(Math.max(0, 1 - MOVEMENT.hoverboardFriction * 0.25 * dt));
      }

      // Slope gravity: downhill carves add speed.
      if (m.grounded && velTan.lengthSq() > 0.25) {
        const eps = 0.85;
        gDirA.copy(velTan).normalize();
        const rA = overLiquid && hover
          ? Math.max(groundRAt(planet, pos, gDirA, eps), planet.seaLevel)
          : groundRAt(planet, pos, gDirA, eps);
        const rB = overLiquid && hover
          ? Math.max(groundRAt(planet, pos, gDirA, -eps), planet.seaLevel)
          : groundRAt(planet, pos, gDirA, -eps);
        const grade = (rA - rB) / (2 * eps);
        velTan.addScaledVector(gDirA, -grade * MOVEMENT.hoverboardSlopeAccel * dt);
        const maxSp = speed * 1.45;
        if (velTan.length() > maxSp) velTan.setLength(maxSp);
      }

      // Air rolls: A/D only. W/S stay movement.
      if (!m.grounded) {
        m.hoverPitchVel = 0;
        m.hoverPitch *= Math.max(0, 1 - MOVEMENT.flipLandDamp * dt);
        if (Math.abs(m.hoverPitch) < 0.02) m.hoverPitch = 0;
        m.hoverRollVel = s * MOVEMENT.flipSpeed;
        m.hoverRoll += m.hoverRollVel * dt;
      } else {
        m.hoverPitchVel = 0;
        m.hoverRollVel = 0;
        m.hoverPitch *= Math.max(0, 1 - MOVEMENT.flipLandDamp * dt);
        m.hoverRoll *= Math.max(0, 1 - MOVEMENT.flipLandDamp * dt);
        if (Math.abs(m.hoverPitch) < 0.02) m.hoverPitch = 0;
        if (Math.abs(m.hoverRoll) < 0.02) m.hoverRoll = 0;
      }
    } else {
      m.hoverPitch = 0;
      m.hoverRoll = 0;
      m.hoverPitchVel = 0;
      m.hoverRollVel = 0;
      if (m.sliding) {
        m.slideTime -= dt;
        target.copy(wish).multiplyScalar(speed * Math.max(0.35, climbMul));
        moveTowards(velTan, target, 18 * dt);
        if (m.slideTime <= 0) {
          m.sliding = false;
          m.slideCooldown = MOVEMENT.slideCooldown;
        }
      } else if (wishLen > 0) {
        const accel = m.grounded
          ? MOVEMENT.groundAccel * (0.35 + 0.65 * climbMul)
          : MOVEMENT.groundAccel * MOVEMENT.airControl;
        target.copy(wish).multiplyScalar(speed * climbMul);
        moveTowards(velTan, target, accel * dt);
      } else if (m.grounded) {
        velTan.multiplyScalar(Math.max(0, 1 - MOVEMENT.groundFriction * dt));
      }
    }

    // Gravity (radial). MOVEMENT.gravity is negative => pulls inward.
    // In liquid: buoyancy + drag so you float toward the surface.
    // Hoverboard skates on the surface — skip swim drag.
    if (inLiquid) {
      const submerged = Math.max(0, planet.seaLevel - pos.length());
      const buoyancy = planet.def.liquid!.kind === "lava" ? 22 : 28;
      radial += buoyancy * Math.min(1.4, 0.35 + submerged * 0.45) * dt;
      radial *= Math.max(0, 1 - 2.8 * dt);
      velTan.multiplyScalar(Math.max(0, 1 - 3.5 * dt));
      if (radial > 8) radial = 8;
    } else {
      const g = hover && !m.grounded ? MOVEMENT.gravity * 0.92 : MOVEMENT.gravity;
      radial = Math.max(MOVEMENT.maxFallSpeed, radial + g * dt);
    }
    if (m.grounded && radial < 0 && !inLiquid) radial = hover ? -0.6 : -2;

    // Jump timers + jump.
    m.coyote = m.grounded ? MOVEMENT.coyoteTime : m.coyote - dt;
    m.buffer = input.justPressed("Space") ? MOVEMENT.jumpBuffer : m.buffer - dt;
    if (m.grounded) m.jumpsLeft = stats.extraJumps;
    const jumpV = MOVEMENT.jumpSpeed * Math.sqrt(stats.jumpHeightMult)
      * (hover ? MOVEMENT.hoverboardJumpMult : 1);
    if (m.buffer > 0) {
      if (m.coyote > 0) {
        radial = jumpV;
        m.coyote = 0;
        m.buffer = 0;
        m.grounded = false;
        m.didJump = true;
      } else if (m.jumpsLeft > 0) {
        radial = jumpV;
        m.jumpsLeft -= 1;
        m.buffer = 0;
        m.didJump = true;
      }
    }

    // Integrate tangential and radial moves separately so we can slope-limit
    // horizontal motion (no teleporting up cliffs).
    e.prevPosition!.copy(pos);

    const horiz = velTan.length() * dt;
    if (horiz > 1e-5) {
      tentative.copy(pos).addScaledVector(velTan, dt);
      tUp.copy(tentative).normalize();
      const nextSurf = overLiquid && hover
        ? Math.max(planet.surfaceRadius(tUp.x, tUp.y, tUp.z), planet.seaLevel)
        : planet.surfaceRadius(tUp.x, tUp.y, tUp.z);
      const climb = nextSurf - curGroundR;
      const maxClimb = MAX_STEP + HARD_SLOPE * horiz;
      const canStep = !m.grounded || climb <= maxClimb || hover;
      const gradeOk = !m.grounded || hover || slopeFactor(climb, horiz) > 0.02;
      if (canStep && gradeOk) {
        pos.copy(tentative);
      } else {
        const eps = 0.7;
        gDirA.copy(velTan).normalize();
        gDirB.crossVectors(up, gDirA).normalize();
        const rA = groundRAt(planet, pos, gDirA, eps);
        const rBp = groundRAt(planet, pos, gDirB, eps);
        const rBn = groundRAt(planet, pos, gDirB, -eps);
        gradV.set(0, 0, 0)
          .addScaledVector(gDirA, rA - curGroundR)
          .addScaledVector(gDirB, (rBp - rBn) * 0.5);
        if (gradV.lengthSq() > 1e-8) {
          gradV.normalize();
          velTan.addScaledVector(gradV, -velTan.dot(gradV));
          const horiz2 = velTan.length() * dt;
          if (horiz2 > 1e-5) {
            tentative.copy(pos).addScaledVector(velTan, dt);
            tUp.copy(tentative).normalize();
            const climb2 = planet.surfaceRadius(tUp.x, tUp.y, tUp.z) - curGroundR;
            if (
              climb2 <= MAX_STEP + HARD_SLOPE * horiz2
              && slopeFactor(climb2, horiz2) > 0.02
            ) {
              pos.copy(tentative);
            } else {
              velTan.set(0, 0, 0);
            }
          }
        } else {
          velTan.set(0, 0, 0);
        }
      }
    }
    // Radial (gravity / jump) move along the surface normal.
    pos.addScaledVector(up, radial * dt);
    m.velocity.copy(velTan).addScaledVector(up, radial);
    resolveRockCollisions(pos, m.velocity, rocks, MOVEMENT.capsuleRadius);
    resolveRockCollisions(pos, m.velocity, ore, MOVEMENT.capsuleRadius * 0.9);

    // Analytic ground resolution against the height field. Moving tangentially
    // on a sphere follows a chord, so you drift slightly *outward* each tick;
    // that must not read as leaving the ground. Gate on an intentional-jump
    // threshold and, when snapping, remove the WHOLE radial component so no
    // chord drift accumulates (which would micro-bounce and bleed speed).
    up.copy(pos).normalize();
    const terrainR = planet.surfaceRadius(up.x, up.y, up.z);
    const onWater = !!(hover && planet.def.liquid && terrainR < planet.seaLevel - 0.2);
    const surfaceR = onWater ? planet.seaLevel : terrainR;
    const hoverLift = hover
      ? (onWater ? MOVEMENT.hoverboardWaterClearance : MOVEMENT.hoverboardHeight)
      : 0;
    const r = pos.length();
    const radialNow = m.velocity.dot(up);
    const band = (m.grounded ? SNAP : SKIN) + hoverLift;
    const jumping = radialNow > 3.0;
    // Don't snap through liquid — float at the surface instead of burying.
    // Hoverboard rides clearly on top of water (never swimming depth).
    if (inLiquid && r < planet.seaLevel) {
      if (r > planet.seaLevel - 0.35 && radialNow < 2) {
        pos.copy(up).multiplyScalar(planet.seaLevel);
        m.velocity.addScaledVector(up, -Math.min(0, radialNow));
      }
      m.grounded = false;
    } else if (onWater && r < surfaceR + hoverLift && radialNow <= 3.0) {
      pos.copy(up).multiplyScalar(surfaceR + hoverLift);
      if (radialNow < 0) m.velocity.addScaledVector(up, -radialNow);
      m.grounded = true;
    } else if (r <= surfaceR + band && !jumping) {
      pos.copy(up).multiplyScalar(surfaceR + hoverLift);
      m.velocity.addScaledVector(up, -radialNow);
      m.grounded = true;
    } else {
      m.grounded = false;
    }

    // Re-resolve after ground snap so rocks still block when standing.
    resolveRockCollisions(pos, m.velocity, rocks, MOVEMENT.capsuleRadius);
    resolveRockCollisions(pos, m.velocity, ore, MOVEMENT.capsuleRadius * 0.9);
    up.copy(pos).normalize();
    m.up.copy(up);
    velTan.copy(m.velocity).addScaledVector(up, -m.velocity.dot(up));
    const hs = velTan.length();
    const speedRef = hover ? MOVEMENT.hoverboardSpeed : MOVEMENT.moveSpeed;
    m.speed01 = Math.min(1.5, hs / speedRef);
    if (hs > 1.0) m.faceDir.copy(velTan).multiplyScalar(1 / hs);
    else m.faceDir.copy(fwd);
  }
}
