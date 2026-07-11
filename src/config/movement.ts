// All movement tunables live here. Systems must not hardcode these numbers.
// Units are meters and seconds. The feel target is Risk of Rain 2: fast base
// speed with momentum, snappy jumps, and a satisfying slide.

export const MOVEMENT = {
  // Horizontal locomotion
  moveSpeed: 9.0, // target ground speed (sprint-default feel: base is already fast)
  groundAccel: 90.0, // how quickly we reach target speed on the ground
  groundFriction: 12.0, // decel when no input on ground
  airControl: 0.55, // fraction of ground accel usable in the air

  // Vertical
  gravity: -26.0, // strong-ish for a snappy arc
  jumpSpeed: 11.0, // initial upward velocity on jump
  maxFallSpeed: -55.0,

  // Jump assists
  coyoteTime: 0.1, // grace period to still jump after leaving ground
  jumpBuffer: 0.1, // press-early window before landing
  baseExtraJumps: 1, // M1: double jump on by default for playtest feel.
  // In M3, items add to this via derivedStats.extraJumps.

  // Slide (Shift while moving)
  slideSpeed: 15.0, // burst speed at slide start
  slideDuration: 0.55,
  slideCooldown: 0.7,
  slideCapsuleScale: 0.55, // capsule shrinks to this fraction of height while sliding

  // Capsule dimensions
  capsuleRadius: 0.4,
  capsuleHalfHeight: 0.6, // half of the cylindrical section (total height ~2.0 with caps)

  // Character controller
  controllerOffset: 0.08, // skin width
  autostepHeight: 0.5,
  autostepMinWidth: 0.2,
  snapToGroundDist: 0.5,
  // Steepness: full speed below softMax, slows toward hardMax, blocked above.
  maxSlopeClimbDeg: 42,
  hardSlopeClimbDeg: 52,
  maxStepHeight: 0.55,

  // Debug / explore fly mode (toggle with V on foot).
  flySpeedMult: 5,
  flyBoostMult: 2, // Shift while flying
  flyVerticalSpeed: 18,

  // Hoverboard (toggle with H on foot). Fortnite-ish: boost, slope carve, air flips.
  hoverboardSpeed: 26,
  hoverboardBoostMult: 1.55,
  hoverboardAccel: 42,
  hoverboardFriction: 1.4,
  hoverboardAirControl: 0.85,
  hoverboardHeight: 0.48,
  hoverboardWaterClearance: 1.05,
  hoverboardJumpMult: 1.35,
  hoverboardSlopeEase: 0.7,
  hoverboardSlopeAccel: 38,
  flipSpeed: 3.2,
  flipLandDamp: 12,
  hoverboardTrailMinSpeed: 4,
} as const;
