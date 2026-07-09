import { Color } from "three";

export interface RampColors {
  lowland: string;
  mid: string;
  highland: string;
  rock: string;
  peak: string;
}

export interface TerrainRamp {
  colorAt(heightNorm: number, slope01: number, mottle: number): Color;
}

const c = (hex: string) => new Color(hex);

function sampleGradient(
  stops: readonly (readonly [number, Color])[],
  t: number,
  out: Color,
): Color {
  if (t <= stops[0][0]) return out.copy(stops[0][1]);
  const last = stops[stops.length - 1];
  if (t >= last[0]) return out.copy(last[1]);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [s0, c0] = stops[i - 1];
      const [s1, c1] = stops[i];
      const k = (t - s0) / (s1 - s0);
      return out.copy(c0).lerp(c1, k);
    }
  }
  return out.copy(last[1]);
}

export function createTerrainRamp(p: RampColors, seaNorm?: number): TerrainRamp {
  const heightStops: readonly (readonly [number, Color])[] = [
    [0.0, c(p.lowland).multiplyScalar(0.55)],
    [0.22, c(p.lowland).lerp(c(p.mid), 0.35)],
    [0.4, c(p.mid)],
    [0.62, c(p.highland)],
    [0.82, c(p.highland).lerp(c(p.rock), 0.4)],
    [1.0, c(p.peak)],
  ];
  const rock = c(p.rock);
  const peak = c(p.peak);
  const wet = c(p.lowland).multiplyScalar(0.45);
  const tmp = new Color();
  const sea = seaNorm ?? -1;

  return {
    colorAt(heightNorm, slope01, mottle) {
      sampleGradient(heightStops, heightNorm, tmp);
      if (sea >= 0 && heightNorm < sea) {
        tmp.lerp(wet, 0.65);
      }
      const rockBlend = Math.min(1, Math.max(0, (slope01 - 0.28) / 0.45));
      tmp.lerp(rock, rockBlend * 0.9);
      if (heightNorm > 0.72) {
        tmp.lerp(peak, (heightNorm - 0.72) / 0.28 * 0.55);
        tmp.lerp(rock, rockBlend * 0.35);
      }
      const m = 1 + mottle * 0.16;
      tmp.multiplyScalar(m);
      return tmp;
    },
  };
}
