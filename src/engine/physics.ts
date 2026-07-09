import RAPIER from "@dimforge/rapier3d-compat";

// Rapier world. Global gravity is ZERO — gravity on a planet points toward its
// center, applied analytically by the on-foot/ship systems, not by Rapier.
// Only ONE planet trimesh is ever registered at a time (only one planet can be
// walked on / landed on at once); swapping is cheap and keeps physics simple
// even with multiple planets in the solar system.

export interface Physics {
  rapier: typeof RAPIER;
  world: RAPIER.World;
  activeCollider: RAPIER.Collider | null;
  setActivePlanet(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider;
  step(): void;
}

export async function initPhysics(): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  let activeBody: RAPIER.RigidBody | null = null;

  const physics: Physics = {
    rapier: RAPIER,
    world,
    activeCollider: null,
    setActivePlanet(vertices, indices) {
      if (activeBody) world.removeRigidBody(activeBody);
      activeBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const desc = RAPIER.ColliderDesc.trimesh(vertices, indices);
      physics.activeCollider = world.createCollider(desc, activeBody);
      return physics.activeCollider;
    },
    step() {
      world.step();
    },
  };
  return physics;
}
