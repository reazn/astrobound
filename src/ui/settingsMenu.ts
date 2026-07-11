import type { PerspectiveCamera } from "three";
import type { Input } from "../engine/input";
import { settings, persistSettings } from "../config/settings";
import { SHIPS } from "../content/ships";
import { CHARACTERS } from "../content/characters";
import { createModelPreview, type ModelPreview } from "./modelPreview";
import type { SystemMap } from "./systemMap";

export type MenuTab = "map" | "character" | "skills" | "settings";

export interface AppearanceCallbacks {
  onShipChange: (shipId: string) => void | Promise<void>;
  onCharacterChange: (characterId: string) => void | Promise<void>;
}

export interface GameMenuOptions {
  appearance?: AppearanceCallbacks;
  systemMap?: SystemMap;
}

export interface SettingsMenu {
  open(tab?: MenuTab): void;
  close(): void;
  setTab(tab: MenuTab): void;
  bindSystemMap(map: SystemMap): void;
  readonly isOpen: boolean;
  readonly tab: MenuTab;
  dispose(): void;
}

const TABS: { id: MenuTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "character", label: "Character" },
  { id: "skills", label: "Skills" },
  { id: "settings", label: "Settings" },
];

const FRIENDS = [
  { id: "f1", name: "Nova", color: "#7fd6ff" },
  { id: "f2", name: "Kai", color: "#6fbf73" },
  { id: "f3", name: "Rex", color: "#e8623a" },
  { id: "f4", name: "Mira", color: "#b56bff" },
];

const SKILLS = [
  { id: "pilot", name: "Piloting", level: 4, max: 10, hue: "#7fd6ff" },
  { id: "eva", name: "EVA Ops", level: 3, max: 10, hue: "#6fbf73" },
  { id: "mining", name: "Prospecting", level: 2, max: 10, hue: "#e8a23a" },
  { id: "craft", name: "Fabrication", level: 1, max: 10, hue: "#b56bff" },
  { id: "combat", name: "Gunnery", level: 1, max: 10, hue: "#e8623a" },
  { id: "scan", name: "Sensors", level: 5, max: 10, hue: "#ffb85a" },
];

const PLAYER_LEVEL = 12;
const PLAYER_XP = 640;
const PLAYER_XP_NEXT = 1000;

const TAB_IDLE =
  "flex h-full items-center px-6 text-[15px] font-semibold uppercase tracking-[0.14em] text-[#f4f1e8]/45 transition hover:bg-white/[0.04] hover:text-[#f4f1e8]";
const TAB_ACTIVE =
  "flex h-full items-center border-b-2 border-[#e8623a] bg-white/[0.06] px-6 text-[15px] font-bold uppercase tracking-[0.14em] text-[#f4f1e8]";

export function createSettingsMenu(
  input: Input,
  camera: PerspectiveCamera,
  options: GameMenuOptions = {},
): SettingsMenu {
  let isOpen = false;
  let activeTab: MenuTab = "settings";
  const previews: ModelPreview[] = [];
  const warmers: Array<() => void> = [];
  let previewsWarmed = false;

  const xpPct = Math.max(0, Math.min(100, Math.round((PLAYER_XP / PLAYER_XP_NEXT) * 100)));

  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 z-50 hidden font-sans text-[#f4f1e8] select-none";
  overlay.innerHTML =
    `<div class="flex h-full w-full flex-col bg-[rgba(8,10,18,0.78)]">` +
    `<header class="relative z-30 flex h-16 shrink-0 items-stretch border-b border-white/10 bg-[#0e131c]">` +
    `<div class="flex w-16 shrink-0 items-center justify-center border-r border-white/10 bg-[#0b0f18]"></div>` +
    `<div class="flex min-w-0 flex-1 items-stretch">` +
    `<div class="flex shrink-0 items-center px-5 text-lg font-bold uppercase tracking-[0.18em]">Astrobound</div>` +
    `<nav data-tabs class="flex min-w-0 flex-1 items-stretch justify-center"></nav>` +
    `<div class="flex shrink-0 items-center px-4">` +
    `<button type="button" data-resume class="rounded-lg bg-[#e8623a] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-[#f07450]">Resume</button>` +
    `</div>` +
    `</div>` +
    `</header>` +
    `<div class="relative flex min-h-0 flex-1 overflow-hidden">` +
    `<aside data-social class="group/social relative z-20 flex w-16 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#0b0f18] transition-[width] duration-200 ease-out hover:w-56">` +
    `<div data-friends class="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto px-0 py-4 group-hover/social:items-stretch group-hover/social:px-3"></div>` +
    `</aside>` +
    `<div data-map-host class="relative z-0 hidden min-h-0 min-w-0 flex-1 overflow-hidden bg-[#050810]"></div>` +
    `<main data-main class="relative z-10 flex min-w-0 flex-1 justify-center overflow-y-auto px-6 py-8">` +
    `<div data-stage class="flex min-h-full max-w-6xl basis-full flex-col justify-center">` +
    `<section data-pane="character" class="hidden w-full py-2"></section>` +
    `<section data-pane="skills" class="hidden w-full py-2"></section>` +
    `<section data-pane="settings" class="hidden w-full py-2"></section>` +
    `</div>` +
    `</main>` +
    `</div>` +
    `<div data-xp class="relative z-30 h-12 shrink-0 overflow-visible">` +
    `<div class="absolute inset-x-0 bottom-0 h-1.5 bg-white/[0.08]"></div>` +
    `<div class="absolute bottom-0 left-0 h-1.5 bg-gradient-to-r from-[#e8623a] via-[#f07850] to-[#ffb08a]" style="width:${xpPct}%"></div>` +
    `<div class="absolute bottom-1.5 left-3 z-10 flex items-end gap-2.5">` +
    `<div class="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[#e8623a] bg-[#0b0f18] text-sm font-bold text-[#f4f1e8] shadow-[0_0_0_3px_rgba(11,15,24,0.95),0_4px_14px_rgba(0,0,0,0.55)]">${PLAYER_LEVEL}</div>` +
    `<span class="mb-1.5 font-mono text-[11px] font-semibold tracking-wide text-[#f4f1e8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">${PLAYER_XP} / ${PLAYER_XP_NEXT}</span>` +
    `</div>` +
    `</div>` +
    `</div>`;
  document.body.appendChild(overlay);

  const tabsEl = overlay.querySelector("[data-tabs]") as HTMLElement;
  const friendsEl = overlay.querySelector("[data-friends]") as HTMLElement;
  const mapHost = overlay.querySelector("[data-map-host]") as HTMLElement;
  const characterPane = overlay.querySelector('[data-pane="character"]') as HTMLElement;
  const skillsPane = overlay.querySelector('[data-pane="skills"]') as HTMLElement;
  const settingsPane = overlay.querySelector('[data-pane="settings"]') as HTMLElement;
  const stage = overlay.querySelector("[data-stage]") as HTMLElement;
  const mainEl = overlay.querySelector("[data-main]") as HTMLElement;
  const resumeBtn = overlay.querySelector("[data-resume]") as HTMLButtonElement;
  const tabButtons = new Map<MenuTab, HTMLButtonElement>();
  const hintEl = document.getElementById("hint");

  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.className = TAB_IDLE;
    btn.addEventListener("click", () => setTab(tab.id));
    tabsEl.appendChild(btn);
    tabButtons.set(tab.id, btn);
  }

  for (const friend of FRIENDS) {
    const row = document.createElement("div");
    row.className =
      "flex w-16 shrink-0 items-center justify-center overflow-hidden group-hover/social:w-auto group-hover/social:justify-start group-hover/social:gap-3 group-hover/social:rounded-xl group-hover/social:px-2 group-hover/social:py-1.5";
    row.innerHTML =
      `<span class="relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#0c1018]" style="background:${friend.color}">` +
      `${friend.name.slice(0, 1)}` +
      `<span class="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#0b0f18] bg-[#6fbf73]"></span>` +
      `</span>` +
      `<span class="hidden min-w-0 group-hover/social:block">` +
      `<span class="block truncate text-sm font-medium">${friend.name}</span>` +
      `<span class="block truncate text-[11px] text-[#f4f1e8]/45">Online</span>` +
      `</span>`;
    friendsEl.appendChild(row);
  }

  const addFriend = document.createElement("button");
  addFriend.type = "button";
  addFriend.className =
    "flex w-16 shrink-0 items-center justify-center overflow-hidden text-[#f4f1e8]/70 transition hover:text-[#f4f1e8] group-hover/social:w-auto group-hover/social:justify-start group-hover/social:gap-3 group-hover/social:rounded-xl group-hover/social:border group-hover/social:border-dashed group-hover/social:border-white/15 group-hover/social:px-2 group-hover/social:py-1.5 group-hover/social:hover:border-[#e8623a]/45 group-hover/social:hover:bg-[#e8623a]/10";
  addFriend.innerHTML =
    `<span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 bg-white/[0.03] text-lg leading-none">+</span>` +
    `<span class="hidden min-w-0 text-sm group-hover/social:block">Add friend</span>`;
  friendsEl.appendChild(addFriend);

  const buildCharacterPane = () => {
    characterPane.innerHTML =
      `<div class="flex w-full justify-center">` +
      `<div class="max-w-4xl basis-full">` +
      `<div class="mb-6 text-center">` +
      `<h2 class="m-0 text-2xl font-semibold tracking-tight">Astronaut</h2>` +
      `<p class="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#f4f1e8]/55">Switch your on-foot character. Ship appearance lives under Settings.</p>` +
      `</div>` +
      `<div class="grid items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]" data-char-wrap></div>` +
      `</div>` +
      `</div>`;
    const wrap = characterPane.querySelector("[data-char-wrap]") as HTMLElement;
    const list = document.createElement("div");
    list.className = "flex flex-col gap-2";
    wrap.appendChild(list);
    const previewBox = document.createElement("div");
    previewBox.className =
      "aspect-[11/8] min-h-[260px] overflow-hidden rounded-2xl border border-white/10 bg-[#0c1018]";
    wrap.appendChild(previewBox);

    const preview = createModelPreview(360, 260);
    previewBox.appendChild(preview.canvas);
    previews.push(preview);

    const buttons: HTMLButtonElement[] = [];
    const styleBtn = (btn: HTMLButtonElement, active: boolean) => {
      btn.className = active
        ? "rounded-xl border border-[#e8623a]/70 bg-[#e8623a]/20 px-4 py-3 text-left text-sm font-semibold text-[#f4f1e8]"
        : "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-[#f4f1e8] transition hover:bg-white/[0.06]";
    };
    const refresh = () => {
      const id = settings.selectedCharacterId;
      const item = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
      for (const b of buttons) styleBtn(b, b.dataset.id === id);
      void preview.setUrl(item.url, { playIdle: true, yaw: item.modelYaw });
    };
    for (const item of CHARACTERS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.name;
      btn.dataset.id = item.id;
      btn.addEventListener("click", async () => {
        settings.selectedCharacterId = item.id;
        await options.appearance?.onCharacterChange(item.id);
        persistSettings();
        refresh();
      });
      list.appendChild(btn);
      buttons.push(btn);
    }
    warmers.push(refresh);
  };

  const buildSkillsPane = () => {
    skillsPane.innerHTML =
      `<div class="flex w-full justify-center">` +
      `<div class="max-w-5xl basis-full">` +
      `<div class="mb-8 text-center">` +
      `<h2 class="m-0 text-2xl font-semibold tracking-tight">Skills</h2>` +
      `<p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[#f4f1e8]/55">Placeholder progression — visuals only for now.</p>` +
      `</div>` +
      `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-skills></div>` +
      `</div>` +
      `</div>`;
    const grid = skillsPane.querySelector("[data-skills]") as HTMLElement;
    for (const skill of SKILLS) {
      const card = document.createElement("div");
      card.className =
        "rounded-2xl border border-white/10 bg-[#141822]/92 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.28)]";
      const pct = Math.round((skill.level / skill.max) * 100);
      card.innerHTML =
        `<div class="mb-4 flex items-center gap-3.5">` +
        `<div class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 text-lg font-bold" style="background:${skill.hue}22;color:${skill.hue}">` +
        `${skill.name.slice(0, 1)}` +
        `</div>` +
        `<div class="min-w-0">` +
        `<div class="truncate text-base font-semibold">${skill.name}</div>` +
        `<div class="mt-0.5 text-xs text-[#f4f1e8]/50">Rank ${skill.level} / ${skill.max}</div>` +
        `</div>` +
        `</div>` +
        `<div class="h-2.5 overflow-hidden rounded-full bg-white/5">` +
        `<div class="h-full rounded-full" style="width:${pct}%;background:${skill.hue}"></div>` +
        `</div>` +
        `<div class="mt-4 grid grid-cols-5 gap-2">` +
        Array.from({ length: 5 }, (_, i) => {
          const on = i < Math.ceil((skill.level / skill.max) * 5);
          return `<span class="aspect-square rounded-lg border ${on ? "border-white/20" : "border-white/10 bg-white/[0.03]"}" style="${on ? `background:${skill.hue}33` : ""}"></span>`;
        }).join("") +
        `</div>`;
      grid.appendChild(card);
    }
  };

  const buildSettingsPane = () => {
    settingsPane.innerHTML =
      `<div class="flex w-full justify-center">` +
      `<div class="max-w-3xl basis-full">` +
      `<div class="mb-6 text-center">` +
      `<h2 class="m-0 text-2xl font-semibold tracking-tight">Settings</h2>` +
      `<p class="mt-2 text-sm text-[#f4f1e8]/55">Tune look, camera, and ship appearance.</p>` +
      `</div>` +
      `<div class="rounded-2xl border border-white/10 bg-[#141822]/92 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.28)] sm:p-8" data-settings-card></div>` +
      `</div>` +
      `</div>`;
    const card = settingsPane.querySelector("[data-settings-card]") as HTMLElement;

    const row = () => {
      const r = document.createElement("label");
      r.className = "mb-4 flex items-center justify-between gap-5 text-sm last:mb-0";
      card.appendChild(r);
      return r;
    };

    const addSlider = (
      label: string, min: number, max: number, step: number,
      get: () => number, set: (v: number) => void,
    ) => {
      const r = row();
      const span = document.createElement("span");
      span.className = "w-40 shrink-0";
      span.textContent = label;
      const val = document.createElement("span");
      val.className = "w-12 shrink-0 text-right font-mono text-[#f4f1e8]/60 tabular-nums";
      const inputEl = document.createElement("input");
      inputEl.type = "range";
      inputEl.min = String(min);
      inputEl.max = String(max);
      inputEl.step = String(step);
      inputEl.value = String(get());
      inputEl.className = "min-w-0 flex-1 accent-[#e8623a]";
      const refresh = () => {
        val.textContent = String(Number(get()).toFixed(step < 0.01 ? 4 : 0));
      };
      inputEl.oninput = () => {
        set(Number(inputEl.value));
        refresh();
        persistSettings();
      };
      refresh();
      r.append(span, inputEl, val);
    };

    const addToggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const r = row();
      const span = document.createElement("span");
      span.textContent = label;
      const inputEl = document.createElement("input");
      inputEl.type = "checkbox";
      inputEl.checked = get();
      inputEl.className = "size-5 accent-[#e8623a]";
      inputEl.onchange = () => {
        set(inputEl.checked);
        persistSettings();
      };
      r.append(span, inputEl);
    };

    addSlider("Mouse sensitivity", 0.0004, 0.004, 0.0001,
      () => settings.mouseSensitivity, (v) => (settings.mouseSensitivity = v));
    addToggle("Invert look (Y)", () => settings.invertY, (v) => (settings.invertY = v));
    addToggle("Lock mouse to camera", () => settings.cursorLocked, (v) => {
      settings.cursorLocked = v;
      if (!v) input.exitLock();
    });
    addSlider("Field of view", 45, 95, 1, () => settings.fov, (v) => {
      settings.fov = v;
      camera.fov = v;
      camera.updateProjectionMatrix();
    });
    addSlider("Zoom distance", settings.minZoom, settings.maxZoom, 1,
      () => settings.cameraDistance, (v) => (settings.cameraDistance = v));

    if (options.appearance) {
      const section = document.createElement("div");
      section.className =
        "mb-3 mt-8 border-t border-white/10 pt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#f4f1e8]/55";
      section.textContent = "Spaceship";
      card.appendChild(section);

      const wrap = document.createElement("div");
      wrap.className = "grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]";
      card.appendChild(wrap);
      const list = document.createElement("div");
      list.className = "flex flex-col gap-2";
      wrap.appendChild(list);
      const previewBox = document.createElement("div");
      previewBox.className =
        "aspect-[11/8] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c1018]";
      wrap.appendChild(previewBox);
      const preview = createModelPreview(280, 200);
      previewBox.appendChild(preview.canvas);
      previews.push(preview);
      const buttons: HTMLButtonElement[] = [];
      const styleBtn = (btn: HTMLButtonElement, active: boolean) => {
        btn.className = active
          ? "rounded-xl border border-[#e8623a]/70 bg-[#e8623a]/20 px-3.5 py-2.5 text-left text-sm font-semibold text-[#f4f1e8]"
          : "rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left text-sm font-medium text-[#f4f1e8] transition hover:bg-white/[0.06]";
      };
      const refresh = () => {
        const id = settings.selectedShipId;
        const item = SHIPS.find((s) => s.id === id) ?? SHIPS[0];
        for (const b of buttons) styleBtn(b, b.dataset.id === id);
        void preview.setUrl(item.url, { playIdle: false, yaw: item.noseYaw });
      };
      for (const ship of SHIPS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = ship.name;
        btn.dataset.id = ship.id;
        btn.addEventListener("click", async () => {
          settings.selectedShipId = ship.id;
          await options.appearance!.onShipChange(ship.id);
          persistSettings();
          refresh();
        });
        list.appendChild(btn);
        buttons.push(btn);
      }
      warmers.push(refresh);
    }

    const hint = document.createElement("div");
    hint.className = "mt-6 text-center text-xs leading-relaxed text-[#f4f1e8]/4 sm:text-left";
    hint.textContent = "Esc resume · M opens Map · Shift boost · N momentum while flying";
    card.appendChild(hint);
  };

  buildCharacterPane();
  buildSkillsPane();
  buildSettingsPane();

  let systemMapRef: SystemMap | null = options.systemMap ?? null;

  const syncMapEmbed = () => {
    const map = systemMapRef;
    if (!map) return;
    const show = isOpen && activeTab === "map";
    map.setEmbedded(true);
    map.mount(mapHost);
    map.setKeybindsEnabled(false);
    if (show) map.setOpen(true);
    else if (map.open) map.setOpen(false);
  };

  const setTab = (tab: MenuTab) => {
    activeTab = tab;
    for (const [id, btn] of tabButtons) {
      btn.className = id === tab ? TAB_ACTIVE : TAB_IDLE;
    }

    const showMap = tab === "map";
    mapHost.classList.toggle("hidden", !showMap);
    mainEl.classList.toggle("hidden", showMap);
    mainEl.classList.toggle("pointer-events-none", showMap);

    for (const pane of [characterPane, skillsPane, settingsPane]) {
      const on = pane.dataset.pane === tab;
      pane.classList.toggle("hidden", !on);
    }
    stage.classList.toggle("justify-center", !showMap);

    syncMapEmbed();
    if (tab === "character" || tab === "settings") {
      if (!previewsWarmed) {
        previewsWarmed = true;
        for (const r of warmers) r();
      } else {
        for (const r of warmers) r();
      }
    }
  };

  const setChromeVisible = (visible: boolean) => {
    if (hintEl) hintEl.classList.toggle("hidden", visible);
  };

  const open = (tab: MenuTab = activeTab) => {
    if (!isOpen) {
      isOpen = true;
      overlay.classList.remove("hidden");
      setChromeVisible(true);
      input.setPaused(true);
      input.exitLock();
    }
    setTab(tab);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.add("hidden");
    setChromeVisible(false);
    systemMapRef?.setOpen(false);
    systemMapRef?.setEmbedded(false);
    systemMapRef?.mount(document.body);
    systemMapRef?.setKeybindsEnabled(false);
    input.setPaused(false);
    input.requestLock();
  };

  resumeBtn.addEventListener("click", () => close());

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "KeyM") {
      e.preventDefault();
      if (!isOpen) open("map");
      else if (activeTab === "map") close();
      else setTab("map");
      return;
    }
    if (e.code === "Escape") {
      e.preventDefault();
      isOpen ? close() : open("settings");
    }
  };
  window.addEventListener("keydown", onKey);

  setTab("settings");
  overlay.classList.add("hidden");

  return {
    open,
    close,
    setTab,
    bindSystemMap(map) {
      systemMapRef = map;
      if (isOpen && activeTab === "map") syncMapEmbed();
    },
    get isOpen() { return isOpen; },
    get tab() { return activeTab; },
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      for (const p of previews) p.dispose();
      setChromeVisible(false);
      overlay.remove();
    },
  };
}
