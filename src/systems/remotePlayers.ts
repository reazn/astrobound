import {
  Group, Mesh, MeshStandardMaterial, CapsuleGeometry, Vector3, Quaternion,
} from "three";
import type { GameWorld } from "../ecs/world";
import type { Entity } from "../ecs/components";
import type { CoordFrame, PlayerSnapshot, Vec3 } from "../net/protocol";
import {
  MOVEMENT_FLAG_GROUNDED,
  MOVEMENT_FLAG_HOVERBOARD,
} from "../net/protocol";
import type { PlanetInstance } from "../worldgen/planetInstance";
import { RemoteTransformBuffer } from "../net/interpolation";
import { classifyPeer, DEFAULT_INTEREST, type InterestContext } from "../net/interest";
import { describeEntity } from "../ecs/gameEntity";
import { registerCameraOccluder, unregisterCameraOccluder } from "./cameraOccluders";
import { orientOnSurface } from "../engine/surfaceOrient";
import { characterById } from "../content/characters";
import {
  createAnimatedCharacter,
  loadCharacterSource,
  type AnimatedCharacter,
} from "../visuals/animatedCharacter";

export interface RemotePlayerVisual {
  networkId: string;
  playerId: string;
  entity: Entity;
  buffer: RemoteTransformBuffer;
  nametag: HTMLDivElement;
  impostor: boolean;
  characterId: string;
  anim: AnimatedCharacter | null;
  loading: boolean;
  root: Group;
  capsule: Group;
}

export interface RemotePlayersSystem {
  sync(peers: PlayerSnapshot[], ctx: InterestContext, planets: PlanetInstance[]): void;
  update(
    dt: number,
    planets: PlanetInstance[],
    stationSystemPos: Vector3,
    renderOrigin: Vector3,
  ): void;
  dispose(): void;
  readonly remotes: Map<string, RemotePlayerVisual>;
}

const MAX_GLTF_REMOTES = 8;
const tmpPos = new Vector3();
const tmpLocal = new Vector3();
const tmpUp = new Vector3();
const tmpFace = new Vector3();
const tmpQ = new Quaternion();

function makeCapsule(color: string): Group {
  const g = new Group();
  const body = new Mesh(
    new CapsuleGeometry(0.35, 1.0, 4, 8),
    new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 }),
  );
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  return g;
}

function makeNametag(name: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    "pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-full rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm";
  el.textContent = name;
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

function frameToSystem(
  frame: CoordFrame,
  local: Vec3,
  planets: PlanetInstance[],
  stationSystemPos: Vector3,
  out: Vector3,
): void {
  tmpLocal.set(local[0], local[1], local[2]);
  if (frame.kind === "system") {
    out.copy(tmpLocal);
    return;
  }
  if (frame.kind === "planet") {
    const planet = planets.find((p) => p.def.id === frame.planetId);
    if (planet) {
      out.copy(planet.systemPosition).add(tmpLocal);
      return;
    }
  }
  if (frame.kind === "station") {
    out.copy(stationSystemPos).add(tmpLocal);
    return;
  }
  out.copy(tmpLocal);
}

function gltfRemoteCount(remotes: Map<string, RemotePlayerVisual>): number {
  let n = 0;
  for (const vis of remotes.values()) {
    if (vis.anim) n += 1;
  }
  return n;
}

export function createRemotePlayersSystem(
  world: GameWorld,
  scene: import("three").Object3D,
): RemotePlayersSystem {
  const remotes = new Map<string, RemotePlayerVisual>();
  const colors = ["#7fd6ff", "#6fbf73", "#e8623a", "#b56bff", "#ffb85a", "#ff6b9d"];

  const attachAnim = (vis: RemotePlayerVisual, anim: AnimatedCharacter) => {
    if (vis.anim) {
      vis.anim.object.removeFromParent();
    }
    vis.anim = anim;
    const scale = 1.9 / Math.max(0.01, anim.height);
    anim.object.scale.setScalar(scale);
    vis.root.add(anim.object);
    vis.capsule.visible = false;
  };

  const ensureAppearance = (vis: RemotePlayerVisual, characterId: string, wantGltf: boolean) => {
    if (vis.characterId === characterId && (vis.anim || vis.loading || !wantGltf)) {
      if (!wantGltf && vis.anim) {
        vis.anim.object.removeFromParent();
        vis.anim = null;
        vis.capsule.visible = true;
      }
      vis.characterId = characterId;
      return;
    }
    vis.characterId = characterId;
    if (!wantGltf || vis.loading) return;
    if (gltfRemoteCount(remotes) >= MAX_GLTF_REMOTES && !vis.anim) return;

    vis.loading = true;
    const def = characterById(characterId);
    void loadCharacterSource(def.url)
      .then((source) => {
        const current = remotes.get(vis.networkId);
        if (!current || current !== vis) return;
        if (vis.characterId !== characterId) return;
        const anim = createAnimatedCharacter(source, def.clips, def.modelYaw);
        attachAnim(vis, anim);
      })
      .catch(() => {
        vis.capsule.visible = true;
      })
      .finally(() => {
        vis.loading = false;
      });
  };

  const sync = (peers: PlayerSnapshot[], ctx: InterestContext, _planets: PlanetInstance[]) => {
    const seen = new Set<string>();
    for (const peer of peers) {
      if (peer.playerId === ctx.selfId) continue;
      seen.add(peer.networkId);
      let vis = remotes.get(peer.networkId);
      if (!vis) {
        const color = colors[remotes.size % colors.length];
        const root = new Group();
        const capsule = makeCapsule(color);
        root.add(capsule);
        scene.add(root);
        const entity = world.add({
          remote: true as const,
          networkId: peer.networkId,
          playerId: peer.playerId,
          isLocal: false,
          displayName: peer.displayName,
          position: new Vector3(),
          prevPosition: new Vector3(),
          up: new Vector3(0, 1, 0),
          faceDir: new Vector3(0, 0, 1),
          mesh: root,
        });
        registerCameraOccluder({
          desc: describeEntity(peer.networkId, "player", {
            kind: "player",
            label: peer.displayName,
            cameraRadius: 0.5,
            blocksCamera: false,
          }),
          getCenter: (out) => out.copy(entity.position!),
          enabled: true,
        });
        vis = {
          networkId: peer.networkId,
          playerId: peer.playerId,
          entity,
          buffer: new RemoteTransformBuffer(),
          nametag: makeNametag(peer.displayName),
          impostor: false,
          characterId: "",
          anim: null,
          loading: false,
          root,
          capsule,
        };
        remotes.set(peer.networkId, vis);
      }
      vis.entity.displayName = peer.displayName;
      vis.buffer.push(peer);
      const tier = classifyPeer(ctx, peer, DEFAULT_INTEREST);
      vis.impostor = tier === "far" || tier === "blip";
      vis.nametag.textContent = peer.displayName;
      ensureAppearance(vis, peer.appearance.characterId, !vis.impostor);
    }

    for (const [id, vis] of remotes) {
      if (!seen.has(id)) {
        unregisterCameraOccluder(id);
        vis.root.removeFromParent();
        vis.nametag.remove();
        world.remove(vis.entity);
        remotes.delete(id);
      }
    }
  };

  const update = (
    dt: number,
    planets: PlanetInstance[],
    stationSystemPos: Vector3,
    renderOrigin: Vector3,
  ) => {
    for (const vis of remotes.values()) {
      const sample = vis.buffer.sample();
      if (!sample) continue;

      frameToSystem(sample.frame, sample.position, planets, stationSystemPos, tmpPos);
      if (sample.up) tmpUp.set(sample.up[0], sample.up[1], sample.up[2]);
      else if (sample.frame.kind === "planet") {
        tmpUp.copy(tmpLocal.set(sample.position[0], sample.position[1], sample.position[2])).normalize();
      } else tmpUp.set(0, 1, 0);
      if (sample.faceDir) tmpFace.set(sample.faceDir[0], sample.faceDir[1], sample.faceDir[2]);
      else tmpFace.set(0, 0, 1);

      vis.entity.position!.copy(tmpPos);
      vis.entity.up!.copy(tmpUp);
      vis.entity.faceDir!.copy(tmpFace);

      vis.root.position.copy(tmpPos).sub(renderOrigin);
      if (sample.possession === "onFoot" || sample.frame.kind === "planet") {
        orientOnSurface(vis.root, tmpUp, tmpFace);
      } else if (sample.orientation) {
        tmpQ.set(sample.orientation[0], sample.orientation[1], sample.orientation[2], sample.orientation[3]);
        vis.root.quaternion.copy(tmpQ);
      }
      vis.root.visible = true;
      const scale = vis.impostor ? 0.6 : 1;
      vis.root.scale.setScalar(scale);

      if (vis.anim) {
        const grounded = (sample.movementFlags & MOVEMENT_FLAG_GROUNDED) !== 0;
        const hover = (sample.movementFlags & MOVEMENT_FLAG_HOVERBOARD) !== 0;
        const speed = Math.min(1, Math.hypot(sample.velocity[0], sample.velocity[1], sample.velocity[2]) / 8);
        vis.anim.setLocomotion(hover ? 0 : speed, grounded || hover, false);
        vis.anim.update(dt);
        vis.capsule.visible = false;
      } else {
        vis.capsule.visible = true;
      }
    }
  };

  const dispose = () => {
    for (const vis of remotes.values()) {
      unregisterCameraOccluder(vis.networkId);
      vis.root.removeFromParent();
      vis.nametag.remove();
      world.remove(vis.entity);
    }
    remotes.clear();
  };

  return { sync, update, dispose, remotes };
}
