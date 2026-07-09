// Player-selectable ship hulls. The default Quaternius "Spaceship" plus the
// four themed hulls from Ultimate Space Kit (CC0).

export interface ShipDef {
  id: string;
  name: string;
  url: string;
  // Yaw applied after centering so the nose faces sim forward (-Z).
  noseYaw: number;
}

export const SHIPS: ShipDef[] = [
  {
    id: "classic",
    name: "Courier",
    url: "/models/ship.glb",
    noseYaw: Math.PI,
  },
  {
    id: "barbara",
    name: "Hornet",
    url: "/models/ships/Spaceship_BarbaraTheBee.gltf",
    noseYaw: Math.PI,
  },
  {
    id: "fernando",
    name: "Flarewing",
    url: "/models/ships/Spaceship_FernandoTheFlamingo.gltf",
    noseYaw: Math.PI,
  },
  {
    id: "finn",
    name: "Pondskipper",
    url: "/models/ships/Spaceship_FinnTheFrog.gltf",
    noseYaw: Math.PI,
  },
  {
    id: "rae",
    name: "Embertrail",
    url: "/models/ships/Spaceship_RaeTheRedPanda.gltf",
    noseYaw: Math.PI,
  },
];

export const DEFAULT_SHIP_ID = "classic";

export function shipById(id: string): ShipDef {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}
