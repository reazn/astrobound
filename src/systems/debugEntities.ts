import {
  Group, Mesh, SphereGeometry, MeshBasicMaterial, Box3, Box3Helper,
  Vector3, Color, Object3D, type Scene,
} from "three";
import type { PlanetInstance } from "../worldgen/planetInstance";

export interface DebugEntityCounts {
  ships: number;
  characters: number;
  ores: number;
  stations: number;
}

export interface DebugEntities {
  setEnabled(on: boolean): void;
  update(opts: {
    enabled: boolean;
    ship: Object3D | null;
    character: Object3D | null;
    characterVisible: boolean;
    station: Object3D | null;
    stationEnabled: boolean;
    focusPlanet: PlanetInstance | null;
    camPos: Vector3;
  }): void;
  readonly counts: DebugEntityCounts;
  dispose(): void;
}

const ORE_COLORS: Record<string, string> = {
  iron: "#c0c8d0",
  copper: "#d9894a",
  crystal: "#7fd6ff",
  carbon: "#4a4a52",
};

const ORE_RANGE = 120;
const MAX_ORE_MARKERS = 48;

export function createDebugEntities(scene: Scene): DebugEntities {
  const root = new Group();
  root.name = "debug-entities";
  root.visible = false;
  scene.add(root);

  const shipBox = new Box3();
  const charBox = new Box3();
  const stationBox = new Box3();
  const shipHelper = new Box3Helper(shipBox, new Color("#7fffd0"));
  const charHelper = new Box3Helper(charBox, new Color("#ffe14a"));
  const stationHelper = new Box3Helper(stationBox, new Color("#7ab0ff"));
  root.add(shipHelper, charHelper, stationHelper);

  const oreGroup = new Group();
  root.add(oreGroup);
  const oreGeo = new SphereGeometry(0.55, 8, 6);
  const oreMats = new Map<string, MeshBasicMaterial>();
  for (const [kind, hex] of Object.entries(ORE_COLORS)) {
    oreMats.set(kind, new MeshBasicMaterial({
      color: hex,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    }));
  }
  const orePool: Mesh[] = [];
  for (let i = 0; i < MAX_ORE_MARKERS; i++) {
    const m = new Mesh(oreGeo, oreMats.get("iron")!);
    m.visible = false;
    m.frustumCulled = false;
    oreGroup.add(m);
    orePool.push(m);
  }

  const counts: DebugEntityCounts = { ships: 0, characters: 0, ores: 0, stations: 0 };
  const camLocal = new Vector3();
  let enabled = false;
  let oreParent: Object3D | null = null;

  const syncBox = (
    helper: Box3Helper,
    box: Box3,
    obj: Object3D | null,
    show: boolean,
  ) => {
    helper.visible = !!(enabled && show && obj);
    if (!helper.visible || !obj) return;
    box.setFromObject(obj);
    if (box.isEmpty()) {
      helper.visible = false;
      return;
    }
    helper.updateMatrixWorld(true);
  };

  return {
    get counts() {
      return counts;
    },
    setEnabled(on) {
      enabled = on;
      root.visible = on;
    },
    update(opts) {
      enabled = opts.enabled;
      root.visible = enabled;
      if (!enabled) {
        counts.ships = 0;
        counts.characters = 0;
        counts.ores = 0;
        counts.stations = 0;
        for (const m of orePool) m.visible = false;
        return;
      }

      syncBox(shipHelper, shipBox, opts.ship, !!opts.ship);
      counts.ships = opts.ship ? 1 : 0;

      syncBox(charHelper, charBox, opts.character, opts.characterVisible);
      counts.characters = opts.characterVisible ? 1 : 0;

      syncBox(stationHelper, stationBox, opts.station, opts.stationEnabled);
      counts.stations = opts.stationEnabled && opts.station ? 1 : 0;

      for (const m of orePool) m.visible = false;
      counts.ores = 0;
      if (opts.focusPlanet?.ore) {
        const ore = opts.focusPlanet.ore;
        if (oreParent !== opts.focusPlanet.lod) {
          opts.focusPlanet.lod.add(oreGroup);
          oreParent = opts.focusPlanet.lod;
        }
        camLocal.copy(opts.camPos).sub(opts.focusPlanet.lod.position);
        const scored: { i: number; d: number }[] = [];
        for (let i = 0; i < ore.centers.length; i++) {
          const d = ore.centers[i].distanceTo(camLocal);
          if (d <= ORE_RANGE) scored.push({ i, d });
        }
        scored.sort((a, b) => a.d - b.d);
        counts.ores = scored.length;
        const n = Math.min(MAX_ORE_MARKERS, scored.length);
        for (let k = 0; k < n; k++) {
          const { i } = scored[k];
          const mesh = orePool[k];
          mesh.visible = true;
          mesh.position.copy(ore.centers[i]);
          mesh.scale.setScalar(Math.max(0.45, ore.radii[i] * 1.4));
          mesh.material = oreMats.get(ore.kinds[i] ?? "iron") ?? oreMats.get("iron")!;
        }
      } else if (oreParent) {
        root.add(oreGroup);
        oreParent = root;
      }
    },
    dispose() {
      root.removeFromParent();
      oreGroup.removeFromParent();
      oreGeo.dispose();
      for (const m of oreMats.values()) m.dispose();
    },
  };
}
