import {
  Globe, Satellite, Star, Rocket, Crosshair, Zap, Gauge, Fuel,
  Sparkles, Orbit, ZoomIn, ZoomOut, Sun, Target, Activity, Navigation,
  type IconNode,
} from "lucide";

const ATTRS = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function nodeToSvg(icon: IconNode, color?: string): string {
  const parts = icon.map(([tag, attrs]) => {
    const a = Object.entries(attrs)
      .map(([k, v]) => `${k}="${String(v)}"`)
      .join(" ");
    return `<${tag} ${a}/>`;
  }).join("");
  const style = color ? ` style="color:${color}"` : "";
  return `<svg ${ATTRS}${style}>${parts}</svg>`;
}

export const icons = {
  planet: (c?: string) => nodeToSvg(Globe, c),
  station: (c?: string) => nodeToSvg(Satellite, c),
  star: (c?: string) => nodeToSvg(Star, c),
  ship: (c?: string) => nodeToSvg(Rocket, c),
  you: (c?: string) => nodeToSvg(Navigation, c),
  crosshair: (c?: string) => nodeToSvg(Crosshair, c),
  zap: (c?: string) => nodeToSvg(Zap, c),
  gauge: (c?: string) => nodeToSvg(Gauge, c),
  fuel: (c?: string) => nodeToSvg(Fuel, c),
  sparkles: (c?: string) => nodeToSvg(Sparkles, c),
  orbit: (c?: string) => nodeToSvg(Orbit, c),
  zoomIn: (c?: string) => nodeToSvg(ZoomIn, c),
  zoomOut: (c?: string) => nodeToSvg(ZoomOut, c),
  sun: (c?: string) => nodeToSvg(Sun, c),
  target: (c?: string) => nodeToSvg(Target, c),
  activity: (c?: string) => nodeToSvg(Activity, c),
};

export function kindIconSvg(kind: "planet" | "station" | "player" | "star", color?: string): string {
  if (kind === "station") return icons.station(color);
  if (kind === "player") return icons.you(color);
  if (kind === "star") return icons.sun(color);
  return icons.planet(color);
}
