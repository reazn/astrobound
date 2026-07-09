import type { ClipMap } from "../visuals/animatedCharacter";

// Player-selectable astronauts. Ultimate Space Kit models ship with their own
// Idle/Walk/Run/Jump clips on the CharacterArmature (Hips/Torso/…).

export interface CharacterDef {
  id: string;
  name: string;
  url: string;
  clips: ClipMap;
  modelYaw: number;
}

export const CLIPS_KIT: ClipMap = {
  idle: "Idle",
  walk: "Walk",
  run: "Run",
  jump: "Jump",
  jumpIdle: "Jump_Idle",
  jumpLand: "Jump_Land",
  slide: "Duck",
  attack: "Punch",
  hit: "HitReact",
  death: "Death",
};

export const CLIPS_STATIC: ClipMap = {
  idle: "Idle",
  walk: "Walking_A",
  run: "Running_A",
  jump: "Jump_Full_Long",
  slide: "Dodge_Forward",
  attack: "Spellcast_Shoot",
  hit: "Hit_A",
  death: "Death_A",
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: "barbara",
    name: "Barbara",
    url: "/models/characters/Astronaut_BarbaraTheBee.gltf",
    clips: CLIPS_KIT,
    modelYaw: 0,
  },
  {
    id: "fernando",
    name: "Fernando",
    url: "/models/characters/Astronaut_FernandoTheFlamingo.gltf",
    clips: CLIPS_KIT,
    modelYaw: 0,
  },
  {
    id: "finn",
    name: "Finn",
    url: "/models/characters/Astronaut_FinnTheFrog.gltf",
    clips: CLIPS_KIT,
    modelYaw: 0,
  },
  {
    id: "rae",
    name: "Rae",
    url: "/models/characters/Astronaut_RaeTheRedPanda.gltf",
    clips: CLIPS_KIT,
    modelYaw: 0,
  },
  {
    id: "classic",
    name: "Classic",
    url: "/models/astronaut.glb",
    clips: CLIPS_STATIC,
    modelYaw: 0,
  },
];

export const DEFAULT_CHARACTER_ID = "finn";

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export const MODELS = {
  astronaut: "/models/astronaut.glb",
  mage: "/models/mage.glb",
  minion: "/models/skeleton_minion.glb",
  warrior: "/models/skeleton_warrior.glb",
} as const;

export const CLIPS_PLAYER = CLIPS_KIT;

export const CLIPS_ENEMY: ClipMap = {
  idle: "Idle",
  walk: "Walking_A",
  run: "Running_A",
  attack: "1H_Melee_Attack_Chop",
  hit: "Hit_A",
  death: "Death_A",
};
