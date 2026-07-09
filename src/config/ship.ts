// Ship flight tunables. All in system-space units/seconds.

export const SHIP = {
  // Visual / collision length of the player hull (longest axis after normalize).
  length: 13.5,

  thrustAccel: 55,
  reverseAccel: 30,
  maxSpeed: 550,
  boostMultiplier: 2.6,
  boostAloneAccel: 70, // Shift with no W/S still pushes forward
  // Vacuum drag when maintainMomentum is ON (coasting). Brake mode uses
  // brakeDamping instead so releasing input settles to a relative stop.
  linearDamping: 0.008,
  brakeDamping: 2.8,
  orbitDampReduction: 0.92,

  // Steering. Mouse builds a steer target (steerX/steerY); deltas are low-pass
  // filtered (mouseSmooth) and angular velocity eases toward rates
  // (turnResponse) so turns ramp in and coast out. Lower response = floatier.
  steerInputScale: 0.42,
  mouseSmooth: 14, // higher = snappier mouse filter; lower = more dampened
  steerDecay: 1.6, // how fast steer target recenters when the mouse is still
  pitchRate: 0.55,
  yawRate: 0.62,
  rollRate: 1.1,
  turnResponse: 1.8, // pitch/yaw angular-velocity easing
  rollResponse: 2.0, // roll easing (A/D)

  gravityInfluenceRadii: 12,
  gravityStrengthAtSurface: 45,

  // Landing / takeoff. The ship sits landedHeight above the local surface (so
  // it rests ON the ground, not buried). Take-off and landing are smooth tweens
  // in the planet-local frame — no teleport — over these durations.
  landedHeight: 4.5,
  launchSeconds: 1.6,
  landSeconds: 1.6,
  launchLiftAccel: 6, // gentle upward velocity handed to free-flight at take-off
  launchClearance: 28, // hover height reached at end of take-off

  manualLandAltitude: 900,
  manualLandMaxSpeed: 120,

  atmoDragStrength: 0.12,

  // Atmosphere-entry cushion only: gentle inward bleed when first hitting the
  // atmo shell. No hard speed caps — takeoff / low flight stay free.
  atmoEntryCushion: 0.55,

  // Collision: kill inward velocity fully and just resolve penetration — no
  // springy repulse (which made the ship bounce off the surface).
  collisionBuffer: 30,
  collisionDamp: 1.0,
  groundFriction: 3.0, // tangential drag while touching the surface

  // Hyperdrive: charge, then cruise. With a lock-on target the ship auto-aims
  // and freezes pilot input; exit velocity matches the target body's orbit.
  warpChargeSeconds: 2.2,
  warpCruiseSpeed: 9000,
  warpExitPlanetRadii: 6, // drop out within this × a planet's max radius
  warpExitStarRadii: 3,
  warpExitStationDist: 900,
  warpExitSpeed: 120, // approach speed added on top of matched body velocity
  warpTurnRate: 2.4, // how fast orientation slews toward a lock-on target
  warpLockFovDeg: 11, // reticle cone used to pick a lock-on body (matches HUD ring)
  // Refuse to charge hyperdrive inside this × body radius (planets) / station dist.
  warpMinPlanetRadii: 3.2,
  warpMinStationDist: 1400,

  enterRange: 10,
  dockRange: 110,
  dockMaxSpeed: 90,
  undockImpulse: 35,

  cameraDistance: 36,
  cameraHeight: 9,
  cameraCollisionPad: 3.2,
  cameraMinDist: 5.5,
  cameraCollisionSmooth: 14,
  cameraFollow: 8, // chase-cam position lerp rate
  // Only spring-arm against terrain when this close to the planet (planet-local
  // length). Beyond this, float32 raycasts from huge coords cause camera shake.
  cameraCollisionMaxRange: 8,
  cameraFadeStart: 13, // fade the ship out below this camera distance…
  cameraFadeEnd: 5, // …fully hidden at this distance (camera forced close)
  boostFovAdd: 14,
  warpFovAdd: 22,

  lookTargetFovDeg: 11,
} as const;
