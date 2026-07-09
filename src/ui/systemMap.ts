import {
  Scene, PerspectiveCamera, WebGLRenderer, AmbientLight, DirectionalLight,
  SphereGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Group,
  Color, Vector3, BufferGeometry, Line, LineBasicMaterial, RingGeometry,
  DoubleSide, AdditiveBlending,   ConeGeometry, Raycaster, Vector2,
  ACESFilmicToneMapping,
} from "three";
import type { OrbitElements } from "../content/planets/types";
import { orbitPositionAt } from "../worldgen/orbits";
import { icons, kindIconSvg } from "./icons";
import "./hud.css";

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
}

export interface SystemMap {
  readonly open: boolean;
  update(data: MapData): void;
  dispose(): void;
}

const STAR_COLOR = "#ffd76a";
const PLAYER_COLOR = "#7fffd0";

export function createSystemMap(
  root: HTMLElement,
  onToggle: (open: boolean) => void,
): SystemMap {
  const overlay = document.createElement("div");
  overlay.className = "sb-map";
  overlay.innerHTML =
    `<canvas class="sb-map-canvas"></canvas>` +
    `<div class="sb-map-chrome">` +
    `<div class="sb-map-title"><h1>System Map</h1><p>Galactic chart · live orbits</p></div>` +
    `<div class="sb-map-hint">` +
    `<div><kbd>Scroll</kbd> Zoom</div>` +
    `<div><kbd>Drag</kbd> Orbit view</div>` +
    `<div><kbd>M</kbd> Close</div>` +
    `</div>` +
    `<div class="sb-map-legend sb-panel">` +
    `<h2>Key</h2>` +
    `<div class="sb-map-legend-row">${icons.sun(STAR_COLOR)} Star</div>` +
    `<div class="sb-map-legend-row">${icons.planet("#8fbcff")} Planet</div>` +
    `<div class="sb-map-legend-row">${icons.station("#7ab0ff")} Station</div>` +
    `<div class="sb-map-legend-row">${icons.you(PLAYER_COLOR)} You</div>` +
    `</div>` +
    `<div class="sb-map-zoom">` +
    `<button type="button" id="sb-map-zi" title="Zoom in">${icons.zoomIn()}</button>` +
    `<button type="button" id="sb-map-zo" title="Zoom out">${icons.zoomOut()}</button>` +
    `</div>` +
    `<div class="sb-map-selected sb-panel" id="sb-map-sel">` +
    `<div class="sb-label" id="sb-map-sel-kind"></div>` +
    `<h3 id="sb-map-sel-name"></h3>` +
    `<div class="meta" id="sb-map-sel-meta"></div>` +
    `</div>` +
    `</div>`;
  root.appendChild(overlay);

  const canvas = overlay.querySelector("canvas") as HTMLCanvasElement;
  const selPanel = overlay.querySelector("#sb-map-sel") as HTMLElement;
  const selKind = overlay.querySelector("#sb-map-sel-kind") as HTMLElement;
  const selName = overlay.querySelector("#sb-map-sel-name") as HTMLElement;
  const selMeta = overlay.querySelector("#sb-map-sel-meta") as HTMLElement;

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

  const starMesh = new Mesh(
    new SphereGeometry(1, 32, 24),
    new MeshBasicMaterial({ color: STAR_COLOR }),
  );
  const starGlow = new Mesh(
    new SphereGeometry(2.4, 24, 16),
    new MeshBasicMaterial({
      color: STAR_COLOR, transparent: true, opacity: 0.28,
      blending: AdditiveBlending, depthWrite: false,
    }),
  );
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
  overlay.querySelector(".sb-map-chrome")!.appendChild(labelLayer);

  type BodyVis = {
    body: MapBody;
    mesh: Mesh;
    labelEl: HTMLElement;
    hitR: number;
  };
  const bodyVis: BodyVis[] = [];
  let orbitsBuilt = false;
  let open = false;
  let lastData: MapData | null = null;

  // Camera orbit controls (manual — no OrbitControls dep).
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
    maxR = Math.max(maxR, data.playerPosition.length() * 1.05);
    return maxR;
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
    if (bodyVis.length === data.bodies.length) return;
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
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  const showSelected = (b: MapBody | null, data: MapData) => {
    if (!b) {
      selPanel.classList.remove("is-on");
      return;
    }
    selPanel.classList.add("is-on");
    selKind.innerHTML = `${kindIconSvg(b.kind, b.color)} ${b.kind}`;
    selName.textContent = b.name;
    selName.style.color = b.color;
    const distStar = b.position.length();
    const distYou = b.position.distanceTo(data.playerPosition);
    selMeta.innerHTML =
      `${b.detail ? b.detail + "<br>" : ""}` +
      `${(distStar / 1000).toFixed(1)}k u from star<br>` +
      `${(distYou / 1000).toFixed(1)}k u from you<br>` +
      `Period ${(b.orbit.periodSeconds / 60).toFixed(1)} min`;
  };

  function draw(data: MapData) {
    const scale = fitScale(data);
    if (!orbitsBuilt) buildOrbits(data, scale);
    ensureBodies(data, scale);

    starMesh.scale.setScalar(0.045);

    for (const v of bodyVis) {
      v.mesh.position.copy(v.body.position).multiplyScalar(1 / scale);
    }

    playerRoot.position.copy(data.playerPosition).multiplyScalar(1 / scale);
    playerRoot.scale.setScalar(0.028);
    if (data.playerForward && data.playerForward.lengthSq() > 1e-6) {
      _p.copy(playerRoot.position).addScaledVector(data.playerForward, 0.08);
      playerRoot.lookAt(_p);
    }
    if (playerLabelEl) playerLabelEl.textContent = data.playerLabel;

    dist += (targetDist - dist) * 0.14;
    updateCamera();
    for (const v of bodyVis) projectLabel(v.mesh.position, v.labelEl);
    if (playerLabelEl) projectLabel(playerRoot.position, playerLabelEl);
    renderer.render(scene, camera);
  }

  const setOpen = (v: boolean) => {
    if (v === open) return;
    open = v;
    overlay.classList.toggle("is-on", v);
    if (v) {
      size();
      orbitsBuilt = false;
      targetDist = 2.1;
      dist = 2.4;
      yaw = 0.85;
      pitch = 0.95;
      if (lastData) draw(lastData);
    } else {
      selPanel.classList.remove("is-on");
    }
    onToggle(v);
  };

  const onKey = (e: KeyboardEvent) => {
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

  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", () => { if (open) size(); });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("click", onClick);

  return {
    get open() { return open; },
    update(data) {
      lastData = data;
      if (open) draw(data);
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      root.removeChild(overlay);
    },
  };
}
