import {
  Group, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide, Color,
  BufferAttribute,
} from "three";
import type { PlanetRingBand } from "../content/planets/types";

export interface PlanetRingsMesh {
  group: Group;
}

// Flat multi-band ring disc in the planet's equatorial plane (local XY → rotate).
export function createPlanetRings(
  planetRadius: number,
  bands: readonly PlanetRingBand[],
): PlanetRingsMesh | null {
  if (!bands.length) return null;
  const group = new Group();
  group.rotation.x = Math.PI / 2;

  for (const band of bands) {
    const inner = planetRadius * band.innerScale;
    const outer = planetRadius * band.outerScale;
    if (outer <= inner) continue;
    const geo = new RingGeometry(inner, outer, 96, 3);
    const pos = geo.getAttribute("position") as BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const base = new Color(band.color);
    const tmp = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r = Math.hypot(x, y);
      const t = (r - inner) / Math.max(1e-4, outer - inner);
      const stripe = 0.72 + 0.28 * Math.sin(t * Math.PI * 7 + band.innerScale * 11);
      tmp.copy(base).multiplyScalar(stripe);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute("color", new BufferAttribute(colors, 3));
    const mat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: band.opacity,
      side: DoubleSide,
      depthWrite: false,
    });
    const mesh = new Mesh(geo, mat);
    mesh.renderOrder = -1;
    group.add(mesh);
  }

  return { group };
}
