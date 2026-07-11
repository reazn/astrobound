import {
  Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight,
  SphereGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Group,
  Color, Vector3, BufferGeometry, Line, LineBasicMaterial, RingGeometry,
  DoubleSide, AdditiveBlending, ConeGeometry, Raycaster, Vector2,
  ACESFilmicToneMapping,
} from "three";
import type { OrbitElements } from "../content/planets/types";
import type { StarDef } from "../config/star";
import type { KnownSystem } from "../content/systems/catalog";
import { orbitPositionAt } from "../worldgen/orbits";
import { icons, kindIconSvg } from "./icons";

export interface MapBody {
  name: string;
  color: string;
  kind: "planet" | "station";
  orbit: OrbitElements;
  position: Vector3;
  radius: number;
  detail?: string;
  hasRings?: boolean;
  ringColor?: string;
}

export interface MapData {
  bodies: MapBody[];
  playerPosition: Vector3;
  playerLabel: string;
  time: number;
  playerForward?: Vector3;
  // When previewing a remote known system, hide the "you are here" marker.
  showPlayer?: boolean;
  star?: StarDef;
}

export interface SystemMapCallbacks {
  onToggle: (open: boolean) => void;
  onSelectSystem: (systemId: string) => void;
  onTeleport: (systemId: string) => void | Promise<void>;
  onDiscover?: () => void;
}

export interface SystemMap {
  readonly open: boolean;
  readonly element: HTMLElement;
  update(data: MapData): void;
  setCatalog(systems: KnownSystem[], activeId: string, previewId: string): void;
  setTeleportBusy(busy: boolean): void;
  setOpen(v: boolean): void;
  mount(parent: HTMLElement): void;
  setEmbedded(on: boolean): void;
  setKeybindsEnabled(on: boolean): void;
  dispose(): void;
}

const PLAYER_COLOR = "#7fffd0";
const FULLSCREEN_CLASS = "fixed inset-0 z-40 select-none overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,rgba(12,20,40,0.94),rgba(3,5,12,0.98))] font-['Exo_2',system-ui,sans-serif] text-[#e8f0f8]";
const EMBEDDED_CLASS = "absolute inset-0 z-0 select-none overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,rgba(12,20,40,0.94),rgba(3,5,12,0.98))] font-['Exo_2',system-ui,sans-serif] text-[#e8f0f8]";
const PANEL_CLASS = "rounded-xl border border-white/8 bg-[#141822]/94 p-4 text-[#e8f0f8] shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-md";
const LABEL_CLASS = "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgba(200,220,240,0.55)] [&_svg]:size-3";
const META_CLASS = "mt-2 font-mono text-xs leading-relaxed text-[rgba(200,220,240,0.55)]";
const SYS_BUTTON_CLASS = "flex w-full items-center gap-2.5 rounded-md border border-[#7fd6ff]/15 bg-white/[0.03] px-2.5 py-2 text-left font-['Exo_2',system-ui,sans-serif] text-[#e8f0f8] transition hover:border-[#7fd6ff]/40 hover:bg-[#7fd6ff]/8";
const SYS_BUTTON_PREVIEW_CLASS = "border-[#7fd6ff]/65 bg-[#7fd6ff]/12";
const SYS_BUTTON_HERE_CLASS = "ring-1 ring-[#ffb85a]/45";

export function createSystemMap(
  root: HTMLElement,
  callbacks: SystemMapCallbacks,
): SystemMap {
  let embedded = false;
  let keybindsEnabled = true;
  const overlay = document.createElement("div");
  overlay.className = `${FULLSCREEN_CLASS} hidden`;
  overlay.innerHTML =
    `<canvas class="absolute inset-0 block size-full cursor-grab active:cursor-grabbing"></canvas>` +
    `<div class="pointer-events-none absolute inset-0" data-map-chrome>` +
    `<div class="pointer-events-none absolute left-7 top-6">` +
    `<h1 class="m-0 text-[22px] font-bold uppercase tracking-[0.2em]">System Map</h1>` +
    `<p class="mt-1.5 text-xs uppercase tracking-[0.1em] text-[rgba(200,220,240,0.55)]">Known systems · preview before travel</p>` +
    `</div>` +
    `<div class="absolute right-7 top-7 text-right text-xs leading-7 tracking-[0.08em] text-[rgba(200,220,240,0.55)] [&_kbd]:mx-0.5 [&_kbd]:inline-block [&_kbd]:min-w-[18px] [&_kbd]:rounded-[3px] [&_kbd]:border [&_kbd]:border-[#7fd6ff]/30 [&_kbd]:px-1.5 [&_kbd]:py-px [&_kbd]:font-mono [&_kbd]:text-[11px] [&_kbd]:text-[#7fd6ff]">` +
    `<div><kbd>Scroll</kbd> Zoom</div>` +
    `<div><kbd>Drag</kbd> Orbit view</div>` +
    `<div><kbd>M</kbd> Close</div>` +
    `</div>` +
    `<div class="${PANEL_CLASS} pointer-events-auto absolute left-7 top-[110px] flex max-h-[min(420px,55vh)] w-[250px] flex-col gap-2 px-3.5 py-3">` +
    `<h2 class="m-0 text-[10px] uppercase tracking-[0.16em] text-[rgba(200,220,240,0.55)]">Known systems</h2>` +
    `<div class="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto pr-0.5" id="sb-map-syslist"></div>` +
    `<button type="button" class="w-full rounded border border-dashed border-[#7fd6ff]/35 bg-transparent px-2.5 py-2 font-['Exo_2',system-ui,sans-serif] text-[11px] uppercase tracking-[0.1em] text-[#7fd6ff] transition hover:bg-[#7fd6ff]/8" id="sb-map-discover">Discover system</button>` +
    `</div>` +
    `<div class="${PANEL_CLASS} pointer-events-none absolute bottom-6 left-7 min-w-[180px] px-4 py-3.5">` +
    `<h2 class="mb-2.5 mt-0 text-[11px] uppercase tracking-[0.18em] text-[rgba(200,220,240,0.55)]">Key</h2>` +
    `<div class="my-2 flex items-center gap-2.5 text-[13px] [&_svg]:size-4">${icons.sun("#ffd76a")} Star</div>` +
    `<div class="my-2 flex items-center gap-2.5 text-[13px] [&_svg]:size-4">${icons.planet("#8fbcff")} Planet</div>` +
    `<div class="my-2 flex items-center gap-2.5 text-[13px] [&_svg]:size-4">${icons.station("#7ab0ff")} Station</div>` +
    `<div class="my-2 flex items-center gap-2.5 text-[13px] [&_svg]:size-4">${icons.you(PLAYER_COLOR)} You</div>` +
    `</div>` +
    `<div class="pointer-events-auto absolute bottom-6 right-7 flex flex-col gap-2">` +
    `<button type="button" class="flex size-9 items-center justify-center border border-[#7fd6ff]/30 bg-[rgba(6,12,22,0.72)] font-mono text-lg text-[#7fd6ff] transition hover:bg-[#7fd6ff]/12" id="sb-map-zi" title="Zoom in">${icons.zoomIn()}</button>` +
    `<button type="button" class="flex size-9 items-center justify-center border border-[#7fd6ff]/30 bg-[rgba(6,12,22,0.72)] font-mono text-lg text-[#7fd6ff] transition hover:bg-[#7fd6ff]/12" id="sb-map-zo" title="Zoom out">${icons.zoomOut()}</button>` +
    `</div>` +
    `<div class="${PANEL_CLASS} pointer-events-none absolute bottom-7 right-7 hidden w-60 px-[18px] py-4" id="sb-map-sel">` +
    `<div class="${LABEL_CLASS}" id="sb-map-sel-kind"></div>` +
    `<h3 class="m-0 text-lg uppercase tracking-[0.08em]" id="sb-map-sel-name"></h3>` +
    `<div class="${META_CLASS}" id="sb-map-sel-meta"></div>` +
    `</div>` +
    `<div class="${PANEL_CLASS} pointer-events-auto absolute right-7 top-[110px] hidden w-60 px-4 py-3.5" id="sb-map-travel">` +
    `<div class="${LABEL_CLASS}">Preview</div>` +
    `<h3 class="mb-1.5 mt-1 text-base font-bold" id="sb-map-travel-name">—</h3>` +
    `<div class="mb-3 text-[11px] leading-relaxed text-[rgba(200,220,240,0.55)]" id="sb-map-travel-meta"></div>` +
    `<button type="button" class="w-full rounded-md bg-[#e8623a] px-3 py-2.5 font-['Exo_2',system-ui,sans-serif] text-[13px] font-semibold uppercase tracking-[0.06em] text-white transition hover:brightness-110 disabled:cursor-default disabled:bg-[#445] disabled:opacity-45" id="sb-map-teleport">Teleport</button>` +
    `</div>` +
    `</div>`;
  root.appendChild(overlay);

  const canvas = overlay.querySelector("canvas") as HTMLCanvasElement;
  const selPanel = overlay.querySelector("#sb-map-sel") as HTMLElement;
  const selKind = overlay.querySelector("#sb-map-sel-kind") as HTMLElement;
  const selName = overlay.querySelector("#sb-map-sel-name") as HTMLElement;
  const selMeta = overlay.querySelector("#sb-map-sel-meta") as HTMLElement;
  const sysList = overlay.querySelector("#sb-map-syslist") as HTMLElement;
  const travelPanel = overlay.querySelector("#sb-map-travel") as HTMLElement;
  const travelName = overlay.querySelector("#sb-map-travel-name") as HTMLElement;
  const travelMeta = overlay.querySelector("#sb-map-travel-meta") as HTMLElement;
  const teleportBtn = overlay.querySelector("#sb-map-teleport") as HTMLButtonElement;
  const discoverBtn = overlay.querySelector("#sb-map-discover") as HTMLButtonElement;

  const scene = new Scene();
  scene.background = new Color("#050810");
  const camera = new PerspectiveCamera(42, 1, 0.01, 100);
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(new Color("#050810"), 1);

  scene.add(new AmbientLight(0x6688aa, 0.55));
  const key = new DirectionalLight(0xfff0d0, 1.2);
  key.position.set(2, 4, 3);
  scene.add(key);

  const rootGroup = new Group();
  scene.add(rootGroup);

  const starMat = new MeshBasicMaterial({ color: "#ffd76a" });
  const starMesh = new Mesh(new SphereGeometry(1, 32, 24), starMat);
  const starGlowMat = new MeshBasicMaterial({
    color: "#ffd76a", transparent: true, opacity: 0.28,
    blending: AdditiveBlending, depthWrite: false,
  });
  const starGlow = new Mesh(new SphereGeometry(2.4, 24, 16), starGlowMat);
  starMesh.add(starGlow);
  rootGroup.add(starMesh);

  const bodyGroup = new Group();
  rootGroup.add(bodyGroup);

  const orbitGroup = new Group();
  rootGroup.add(orbitGroup);

  const playerMesh = new Mesh(
    new ConeGeometry(1, 2.4, 5),
    new MeshBasicMaterial({ color: PLAYER_COLOR }),
  );
  playerMesh.rotation.x = Math.PI / 2;
  const playerRing = new Mesh(
    new RingGeometry(1.6, 2.0, 32),
    new MeshBasicMaterial({
      color: PLAYER_COLOR, transparent: true, opacity: 0.45,
      side: DoubleSide, depthWrite: false,
    }),
  );
  playerRing.rotation.x = -Math.PI / 2;
  const playerRoot = new Group();
  playerRoot.add(playerMesh);
  playerRoot.add(playerRing);
  rootGroup.add(playerRoot);

  const grid = new Group();
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    const ring = new Mesh(
      new RingGeometry(t - 0.003, t + 0.003, 96),
      new MeshBasicMaterial({
        color: 0x6a90b8, transparent: true, opacity: 0.22,
        side: DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    grid.add(ring);
  }
  rootGroup.add(grid);

  const labelLayer = document.createElement("div");
  labelLayer.style.cssText =
    "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  overlay.querySelector("[data-map-chrome]")!.appendChild(labelLayer);

  type BodyVis = {
    body: MapBody;
    mesh: Mesh;
    labelEl: HTMLElement;
    hitR: number;
  };
  const bodyVis: BodyVis[] = [];
  let orbitsBuilt = false;
  let bodiesSig = "";
  let open = false;
  let lastData: MapData | null = null;
  let catalog: KnownSystem[] = [];
  let activeSystemId = "";
  let previewSystemId = "";
  let teleportBusy = false;

  let yaw = 0.55;
  let pitch = 0.72;
  let dist = 1;
  let targetDist = 1;
  let dragging = false;
  let lastX = 0, lastY = 0;
  const focus = new Vector3(0, 0, 0);
  const camPos = new Vector3();
  const _p = new Vector3();
  const _proj = new Vector3();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let playerLabelEl: HTMLElement | null = null;

  const fitScale = (data: MapData) => {
    let maxR = 1;
    for (const b of data.bodies) {
      maxR = Math.max(maxR, b.orbit.semiMajorAxis * (1 + b.orbit.eccentricity));
    }
    if (data.showPlayer !== false) {
      maxR = Math.max(maxR, data.playerPosition.length() * 1.05);
    }
    return maxR;
  };

  const applyStarVisual = (star?: StarDef) => {
    const col = star?.color ?? "#ffd76a";
    const corona = star?.coronaColor ?? col;
    starMat.color.set(col);
    starGlowMat.color.set(corona);
  };

  const buildOrbits = (data: MapData, scale: number) => {
    while (orbitGroup.children.length) {
      const c = orbitGroup.children[0];
      orbitGroup.remove(c);
      (c as Line).geometry?.dispose();
    }
    for (const b of data.bodies) {
      const pts: Vector3[] = [];
      const N = 160;
      for (let i = 0; i <= N; i++) {
        orbitPositionAt(b.orbit, (i / N) * b.orbit.periodSeconds, _p);
        pts.push(_p.clone().multiplyScalar(1 / scale));
      }
      const geo = new BufferGeometry().setFromPoints(pts);
      const line = new Line(geo, new LineBasicMaterial({
        color: new Color(b.color).multiplyScalar(0.55),
        transparent: true,
        opacity: 0.45,
      }));
      orbitGroup.add(line);
    }
    orbitsBuilt = true;
  };

  const ensureBodies = (data: MapData, scale: number) => {
    const sig = data.bodies.map((b) => `${b.name}:${b.kind}:${b.hasRings ? 1 : 0}`).join("|");
    if (bodyVis.length === data.bodies.length && bodiesSig === sig) {
      for (let i = 0; i < bodyVis.length; i++) bodyVis[i].body = data.bodies[i];
      return;
    }
    bodiesSig = sig;
    orbitsBuilt = false;
    while (bodyGroup.children.length) bodyGroup.remove(bodyGroup.children[0]);
    labelLayer.innerHTML = "";
    bodyVis.length = 0;
    for (const b of data.bodies) {
      const r = b.kind === "station" ? 0.018 : Math.max(0.016, Math.min(0.04, (b.radius / scale) * 12));
      const mesh = new Mesh(
        new SphereGeometry(r, 20, 16),
        new MeshStandardMaterial({
          color: b.color,
          emissive: new Color(b.color).multiplyScalar(0.35),
          roughness: 0.45,
          metalness: 0.2,
        }),
      );
      mesh.userData.body = b;
      bodyGroup.add(mesh);

      if (b.hasRings) {
        const ringCol = b.ringColor ?? b.color;
        const ring = new Mesh(
          new RingGeometry(r * 1.55, r * 2.35, 48),
          new MeshBasicMaterial({
            color: ringCol, transparent: true, opacity: 0.55,
            side: DoubleSide, depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        mesh.add(ring);
        const gap = new Mesh(
          new RingGeometry(r * 1.85, r * 1.95, 32),
          new MeshBasicMaterial({
            color: "#050810", transparent: true, opacity: 0.85,
            side: DoubleSide, depthWrite: false,
          }),
        );
        gap.rotation.x = -Math.PI / 2;
        mesh.add(gap);
      }

      const labelEl = document.createElement("div");
      labelEl.style.cssText =
        "position:absolute;transform:translate(-50%,8px);font-size:11px;font-weight:600;" +
        "letter-spacing:0.1em;text-transform:uppercase;text-shadow:0 2px 8px rgba(0,0,0,0.9);" +
        `color:${b.color};white-space:nowrap;`;
      labelEl.textContent = b.name;
      labelLayer.appendChild(labelEl);

      bodyVis.push({ body: b, mesh, labelEl, hitR: r * 3 });
    }

    playerLabelEl = document.createElement("div");
    playerLabelEl.style.cssText =
      "position:absolute;transform:translate(-50%,10px);font-size:11px;font-weight:700;" +
      "letter-spacing:0.1em;text-transform:uppercase;color:#7fffd0;" +
      "text-shadow:0 2px 8px rgba(0,0,0,0.9);white-space:nowrap;";
    labelLayer.appendChild(playerLabelEl);
  };

  const projectLabel = (world: Vector3, el: HTMLElement) => {
    _proj.copy(world).project(camera);
    if (_proj.z > 1) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    el.style.left = `${(_proj.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-_proj.y * 0.5 + 0.5) * 100}%`;
  };

  const updateCamera = () => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    camPos.set(
      focus.x + dist * cp * sy,
      focus.y + dist * sp,
      focus.z + dist * cp * cy,
    );
    camera.position.copy(camPos);
    camera.lookAt(focus);
  };

  const size = () => {
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(2, Math.floor(rect.width || window.innerWidth));
    const h = Math.max(2, Math.floor(rect.height || window.innerHeight));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  const applyShellClass = () => {
    const base = embedded ? EMBEDDED_CLASS : FULLSCREEN_CLASS;
    overlay.className = open ? base : `${base} hidden`;
  };

  const showSelected = (b: MapBody | null, data: MapData) => {
    if (!b) {
      selPanel.classList.add("hidden");
      return;
    }
    selPanel.classList.remove("hidden");
    selKind.innerHTML = `${kindIconSvg(b.kind, b.color)} ${b.kind}`;
    selName.textContent = b.name;
    selName.style.color = b.color;
    const distStar = b.position.length();
    const distYou = data.showPlayer === false
      ? null
      : b.position.distanceTo(data.playerPosition);
    selMeta.innerHTML =
      `${b.detail ? b.detail + "<br>" : ""}` +
      `${(distStar / 1000).toFixed(1)}k u from star<br>` +
      (distYou !== null ? `${(distYou / 1000).toFixed(1)}k u from you<br>` : "") +
      `Period ${(b.orbit.periodSeconds / 60).toFixed(1)} min`;
  };

  const refreshTravelPanel = () => {
    const entry = catalog.find((s) => s.def.id === previewSystemId);
    if (!entry) {
      travelPanel.classList.add("hidden");
      return;
    }
    travelPanel.classList.remove("hidden");
    travelName.textContent = entry.def.name;
    travelName.style.color = entry.def.star.color;
    const here = entry.def.id === activeSystemId;
    travelMeta.innerHTML =
      `${entry.def.star.type} star · ${entry.def.planets.length} worlds` +
      (entry.def.handcrafted ? " · home" : "") +
      (here ? "<br>You are here" : "");
    teleportBtn.disabled = here || teleportBusy;
    teleportBtn.textContent = teleportBusy
      ? "Jumping…"
      : here
        ? "Current system"
        : "Teleport here";
  };

  const renderCatalogList = () => {
    sysList.innerHTML = "";
    for (const s of catalog) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = [
        SYS_BUTTON_CLASS,
        s.def.id === previewSystemId ? SYS_BUTTON_PREVIEW_CLASS : "",
        s.def.id === activeSystemId ? SYS_BUTTON_HERE_CLASS : "",
      ].filter(Boolean).join(" ");
      btn.innerHTML =
        `<span class="size-2.5 shrink-0 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.35)]" style="background:${s.def.star.color}"></span>` +
        `<span class="flex min-w-0 flex-col gap-0.5">` +
        `<span class="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold tracking-[0.04em]">${s.def.name}</span>` +
        `<span class="text-[10px] uppercase tracking-[0.06em] text-[rgba(200,220,240,0.55)]">${s.def.star.type} · ${s.def.planets.length} worlds` +
        (s.def.id === activeSystemId ? " · here" : "") +
        `</span></span>`;
      btn.addEventListener("click", () => {
        callbacks.onSelectSystem(s.def.id);
      });
      sysList.appendChild(btn);
    }
    refreshTravelPanel();
  };

  function draw(data: MapData) {
    const scale = fitScale(data);
    if (!orbitsBuilt) buildOrbits(data, scale);
    ensureBodies(data, scale);
    applyStarVisual(data.star);

    starMesh.scale.setScalar(0.045);

    for (const v of bodyVis) {
      v.mesh.position.copy(v.body.position).multiplyScalar(1 / scale);
    }

    const showPlayer = data.showPlayer !== false;
    playerRoot.visible = showPlayer;
    if (playerLabelEl) playerLabelEl.style.display = showPlayer ? "block" : "none";
    if (showPlayer) {
      playerRoot.position.copy(data.playerPosition).multiplyScalar(1 / scale);
      playerRoot.scale.setScalar(0.028);
      if (data.playerForward && data.playerForward.lengthSq() > 1e-6) {
        _p.copy(playerRoot.position).addScaledVector(data.playerForward, 0.08);
        playerRoot.lookAt(_p);
      }
      if (playerLabelEl) playerLabelEl.textContent = data.playerLabel;
    }

    dist += (targetDist - dist) * 0.14;
    updateCamera();
    for (const v of bodyVis) projectLabel(v.mesh.position, v.labelEl);
    if (showPlayer && playerLabelEl) projectLabel(playerRoot.position, playerLabelEl);
    renderer.render(scene, camera);
  }

  const setOpen = (v: boolean) => {
    if (v === open) return;
    open = v;
    applyShellClass();
    if (v) {
      size();
      orbitsBuilt = false;
      targetDist = 2.1;
      dist = 2.4;
      yaw = 0.85;
      pitch = 0.95;
      renderCatalogList();
      if (lastData) draw(lastData);
    } else {
      selPanel.classList.add("hidden");
    }
    callbacks.onToggle(v);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!keybindsEnabled) return;
    if (e.code === "KeyM") { e.preventDefault(); setOpen(!open); }
    if (!open) return;
    if (e.code === "Escape") setOpen(false);
  };

  const onWheel = (e: WheelEvent) => {
    if (!open) return;
    e.preventDefault();
    targetDist = Math.max(0.55, Math.min(6, targetDist * (e.deltaY > 0 ? 1.12 : 0.89)));
  };

  const onDown = (e: PointerEvent) => {
    if (!open) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!open || !dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw -= dx * 0.005;
    pitch = Math.max(0.12, Math.min(1.45, pitch + dy * 0.005));
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* */ }
  };

  const onClick = (e: MouseEvent) => {
    if (!open || !lastData) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(bodyVis.map((b) => b.mesh), false);
    if (hits.length) {
      const b = hits[0].object.userData.body as MapBody;
      showSelected(b, lastData);
    } else {
      showSelected(null, lastData);
    }
  };

  overlay.querySelector("#sb-map-zi")!.addEventListener("click", () => {
    targetDist = Math.max(0.55, targetDist * 0.82);
  });
  overlay.querySelector("#sb-map-zo")!.addEventListener("click", () => {
    targetDist = Math.min(6, targetDist * 1.22);
  });
  teleportBtn.addEventListener("click", () => {
    if (teleportBusy || previewSystemId === activeSystemId) return;
    void callbacks.onTeleport(previewSystemId);
  });
  discoverBtn.addEventListener("click", () => {
    callbacks.onDiscover?.();
  });

  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => { if (open) size(); });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("click", onClick);

  return {
    get open() { return open; },
    get element() { return overlay; },
    update(data) {
      lastData = data;
      if (open) draw(data);
    },
    setCatalog(systems, activeId, previewId) {
      const previewChanged = previewId !== previewSystemId;
      catalog = systems;
      activeSystemId = activeId;
      previewSystemId = previewId;
      if (previewChanged) {
        orbitsBuilt = false;
        bodiesSig = "";
      }
      if (open) {
        renderCatalogList();
        if (!previewChanged && lastData) draw(lastData);
      } else {
        refreshTravelPanel();
      }
    },
    setTeleportBusy(busy) {
      teleportBusy = busy;
      refreshTravelPanel();
    },
    setOpen,
    mount(parent) {
      if (overlay.parentElement === parent) return;
      parent.appendChild(overlay);
      if (open) requestAnimationFrame(() => size());
    },
    setEmbedded(on) {
      embedded = on;
      applyShellClass();
      if (open) requestAnimationFrame(() => size());
    },
    setKeybindsEnabled(on) {
      keybindsEnabled = on;
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      overlay.remove();
    },
  };
}
