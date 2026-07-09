import { Vector3 } from "three";
import { MOVEMENT } from "../config/movement";
import type { GameWorld } from "../ecs/world";
import type { Planet } from "../worldgen/planet";
import type { Input } from "../engine/input";

// Player locomotion on a sphere. "Up" is the local surface normal; gravity is
// radial (toward the planet center) and jumps push outward. WASD moves in the
// tangent plane relative to the camera's forward. Collision with the ground is
// analytic against the planet height field (robust across the whole sphere, no
// character-controller "up" to fight). Fixed timestep; temps are reused.

const SKIN = 0.05;
const SNAP = 0.7; // ground-stick band when walking down slopes/terraces
const MAX_STEP = 0.85; // auto-step: ledges up to this are climbable in one move
const CLIMB_SLOPE = 1.8; // ~tan(61°): gentler hills stay walkable

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
const tmpX = new Vector3(1, 0, 0);
const tmpZ = new Vector3(0, 0, 1);

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
) {
  for (const e of world.with("player", "movement", "position", "stats")) {
    const m = e.movement;
    const stats = e.stats;
    const pos = e.position;
    m.didJump = false;
    m.didSlide = false;
    m.inLiquid = false;

    if (input.justPressed("KeyV")) {
      m.flying = !m.flying;
      if (m.flying) {
        m.sliding = false;
        m.grounded = false;
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
    wish.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
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
      up.copy(pos).normalize();
      m.up.copy(up);
      m.grounded = false;
      const hs = velTan.length();
      m.speed01 = Math.min(1.5, hs / (MOVEMENT.moveSpeed * MOVEMENT.flySpeedMult));
      if (hs > 1.0) m.faceDir.copy(velTan).multiplyScalar(1 / hs);
      continue;
    }

    const speed = MOVEMENT.moveSpeed * stats.moveSpeedMult;

    // Slide.
    m.slideCooldown = Math.max(0, m.slideCooldown - dt);
    const wantsSlide =
      input.justPressed("ShiftLeft") || input.justPressed("ShiftRight") ||
      input.justPressed("ControlLeft") || input.justPressed("ControlRight");
    if (
      !m.sliding && wantsSlide && m.grounded &&
      velTan.length() > 1.0 && m.slideCooldown === 0
    ) {
      m.sliding = true;
      m.slideTime = MOVEMENT.slideDuration;
      velTan.setLength(MOVEMENT.slideSpeed);
      m.didSlide = true;
    }

    if (m.sliding) {
      m.slideTime -= dt;
      target.copy(wish).multiplyScalar(speed);
      moveTowards(velTan, target, 18 * dt);
      if (m.slideTime <= 0) {
        m.sliding = false;
        m.slideCooldown = MOVEMENT.slideCooldown;
      }
    } else if (wishLen > 0) {
      const accel = m.grounded
        ? MOVEMENT.groundAccel
        : MOVEMENT.groundAccel * MOVEMENT.airControl;
      target.copy(wish).multiplyScalar(speed);
      moveTowards(velTan, target, accel * dt);
    } else if (m.grounded) {
      velTan.multiplyScalar(Math.max(0, 1 - MOVEMENT.groundFriction * dt));
    }

    // Gravity (radial). MOVEMENT.gravity is negative => pulls inward.
    // In liquid: buoyancy + drag so you float toward the surface.
    const groundProbe = planet.surfaceRadius(up.x, up.y, up.z);
    const inLiquid = !!(planet.def.liquid
      && pos.length() < planet.seaLevel + 1.2
      && groundProbe < planet.seaLevel - 0.5);
    m.inLiquid = inLiquid;
    if (inLiquid) {
      const submerged = Math.max(0, planet.seaLevel - pos.length());
      const buoyancy = planet.def.liquid!.kind === "lava" ? 22 : 28;
      radial += buoyancy * Math.min(1.4, 0.35 + submerged * 0.45) * dt;
      radial *= Math.max(0, 1 - 2.8 * dt);
      velTan.multiplyScalar(Math.max(0, 1 - 3.5 * dt));
      if (radial > 8) radial = 8;
    } else {
      radial = Math.max(MOVEMENT.maxFallSpeed, radial + MOVEMENT.gravity * dt);
    }
    if (m.grounded && radial < 0 && !inLiquid) radial = -2;

    // Jump timers + jump.
    m.coyote = m.grounded ? MOVEMENT.coyoteTime : m.coyote - dt;
    m.buffer = input.justPressed("Space") ? MOVEMENT.jumpBuffer : m.buffer - dt;
    if (m.grounded) m.jumpsLeft = stats.extraJumps;
    const jumpV = MOVEMENT.jumpSpeed * Math.sqrt(stats.jumpHeightMult);
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
    const curGroundR = planet.surfaceRadius(up.x, up.y, up.z);

    const horiz = velTan.length() * dt;
    if (horiz > 1e-5) {
      tentative.copy(pos).addScaledVector(velTan, dt);
      tUp.copy(tentative).normalize();
      const climb = planet.surfaceRadius(tUp.x, tUp.y, tUp.z) - curGroundR;
      const maxClimb = MAX_STEP + CLIMB_SLOPE * horiz;
      if (!m.grounded || climb <= maxClimb) {
        pos.copy(tentative); // walkable slope (or airborne): advance
      } else {
        // Wall: slide along it by removing the uphill component of velocity
        // (estimate the terrain gradient with a few cheap height samples).
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
          velTan.addScaledVector(gradV, -velTan.dot(gradV)); // keep along-wall part
          const horiz2 = velTan.length() * dt;
          if (horiz2 > 1e-5) {
            tentative.copy(pos).addScaledVector(velTan, dt);
            tUp.copy(tentative).normalize();
            const climb2 = planet.surfaceRadius(tUp.x, tUp.y, tUp.z) - curGroundR;
            if (climb2 <= MAX_STEP + CLIMB_SLOPE * horiz2) pos.copy(tentative);
            else velTan.set(0, 0, 0);
          }
        } else {
          velTan.set(0, 0, 0);
        }
      }
    }
    // Radial (gravity / jump) move along the surface normal.
    pos.addScaledVector(up, radial * dt);
    m.velocity.copy(velTan).addScaledVector(up, radial);

    // Analytic ground resolution against the height field. Moving tangentially
    // on a sphere follows a chord, so you drift slightly *outward* each tick;
    // that must not read as leaving the ground. Gate on an intentional-jump
    // threshold and, when snapping, remove the WHOLE radial component so no
    // chord drift accumulates (which would micro-bounce and bleed speed).
    up.copy(pos).normalize();
    const groundR = planet.surfaceRadius(up.x, up.y, up.z);
    const r = pos.length();
    const radialNow = m.velocity.dot(up);
    const band = m.grounded ? SNAP : SKIN;
    const jumping = radialNow > 3.0;
    // Don't snap through liquid — float at the surface instead of burying.
    if (inLiquid && r < planet.seaLevel) {
      if (r > planet.seaLevel - 0.35 && radialNow < 2) {
        pos.copy(up).multiplyScalar(planet.seaLevel);
        m.velocity.addScaledVector(up, -Math.min(0, radialNow));
      }
      m.grounded = false;
    } else if (r <= groundR + band && !jumping) {
      pos.copy(up).multiplyScalar(groundR);
      m.velocity.addScaledVector(up, -radialNow);
      m.grounded = true;
    } else {
      m.grounded = false;
    }

    // Frame outputs for render/animation.
    m.up.copy(up);
    velTan.copy(m.velocity).addScaledVector(up, -m.velocity.dot(up));
    const hs = velTan.length();
    m.speed01 = Math.min(1.5, hs / MOVEMENT.moveSpeed);
    if (hs > 1.0) m.faceDir.copy(velTan).multiplyScalar(1 / hs);
  }
}
