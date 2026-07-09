import { Points, BufferGeometry, BufferAttribute, PointsMaterial } from "three";
import type { RngStream } from "../engine/rng";

// Deep-space starfield backdrop: a fixed shell of points, seeded so stars are
// reproducible. Centered on the camera/render-origin every frame (see main.ts)
// so it always reads as "infinitely far away" regardless of where the ship is.
// The star itself is a real, positioned body — see visuals/star.ts.

export function createStarfield(rngWorld: RngStream): Points {
  const R = 8000;
  const count = 2800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rngWorld() * 2 - 1;
    const theta = rngWorld() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(theta) * s * R;
    positions[i * 3 + 1] = u * R;
    positions[i * 3 + 2] = Math.sin(theta) * s * R;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: 0xffffff, size: 2.0, sizeAttenuation: false, fog: false, transparent: true, opacity: 1,
  });
  const stars = new Points(geo, mat);
  stars.frustumCulled = false;
  return stars;
}

export function setStarfieldOpacity(stars: Points, opacity: number) {
  const mat = stars.material as PointsMaterial;
  mat.opacity = Math.max(0, Math.min(1, opacity));
  stars.visible = mat.opacity > 0.02;
}
