import {
  WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight,
  Group, Color, SRGBColorSpace, ACESFilmicToneMapping,
} from "three";
import { getItemModelBuilder } from "../content/items";

export function hasItemPreview(itemId: string): boolean {
  return !!getItemModelBuilder(itemId);
}

interface SlotPreview {
  itemId: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  root: Group;
  dispose: () => void;
  spin: number;
}

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let raf = 0;
const slots = new Map<HTMLElement, SlotPreview>();
let tipHost: HTMLElement | null = null;
let tipPreview: SlotPreview | null = null;

function ensure() {
  if (renderer) return;
  renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.setClearColor(new Color(0x000000), 0);

  scene = new Scene();
  camera = new PerspectiveCamera(28, 1, 0.05, 20);
  camera.position.set(0.95, 0.72, 1.35);
  camera.lookAt(0, 0.05, 0);

  scene.add(new AmbientLight(0xfff4e8, 1.35));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(2.4, 4.2, 2.8);
  scene.add(key);
  const fill = new DirectionalLight(0xb8d0ff, 0.95);
  fill.position.set(-2.6, 1.8, -1.2);
  scene.add(fill);
  const rim = new DirectionalLight(0xffe0b0, 0.7);
  rim.position.set(-1.2, 2.4, -3.2);
  scene.add(rim);
}

function buildPreview(itemId: string): SlotPreview | null {
  const make = getItemModelBuilder(itemId);
  if (!make) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "size-full block";
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const made = make();
  return {
    itemId,
    canvas,
    ctx,
    root: made.root,
    dispose: made.dispose,
    spin: Math.PI / 4,
  };
}

function sizeCanvas(p: SlotPreview, host: HTMLElement, fallback = 48) {
  const w = Math.max(1, Math.floor(host.clientWidth || fallback));
  const h = Math.max(1, Math.floor(host.clientHeight || fallback));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  p.canvas.width = Math.floor(w * dpr);
  p.canvas.height = Math.floor(h * dpr);
  p.canvas.style.width = "100%";
  p.canvas.style.height = "100%";
}

function drawPreview(p: SlotPreview, spinning: boolean) {
  if (!renderer || !scene || !camera) return;
  const baseYaw = Math.PI / 4;
  p.root.rotation.y = spinning ? (p.spin += 0.01) : baseYaw;
  p.root.rotation.x = 0.28;

  const w = p.canvas.width;
  const h = p.canvas.height;
  if (w < 2 || h < 2) return;

  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  scene.add(p.root);
  renderer.render(scene, camera);
  scene.remove(p.root);

  p.ctx.clearRect(0, 0, w, h);
  p.ctx.drawImage(renderer.domElement, 0, 0, w, h);
}

function tick() {
  raf = 0;
  ensure();
  for (const p of slots.values()) drawPreview(p, false);
  if (tipPreview) drawPreview(tipPreview, true);
  if (slots.size > 0 || tipPreview) raf = requestAnimationFrame(tick);
}

function ensureLoop() {
  if (!raf && (slots.size > 0 || tipPreview)) raf = requestAnimationFrame(tick);
}

function disposePreview(p: SlotPreview) {
  p.dispose();
  p.canvas.remove();
}

export function setSlotPreview(host: HTMLElement, itemId: string | null) {
  ensure();
  const existing = slots.get(host);
  if (!itemId) {
    if (existing) {
      disposePreview(existing);
      slots.delete(host);
    }
    host.innerHTML = "";
    return;
  }
  if (existing && existing.itemId === itemId) {
    sizeCanvas(existing, host);
    return;
  }
  if (existing) {
    disposePreview(existing);
    slots.delete(host);
  }
  const next = buildPreview(itemId);
  if (!next) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = "";
  host.appendChild(next.canvas);
  sizeCanvas(next, host);
  slots.set(host, next);
  ensureLoop();
  requestAnimationFrame(() => {
    if (slots.get(host) === next) sizeCanvas(next, host);
  });
}

export function clearAllSlotPreviews() {
  for (const [host, p] of slots) {
    disposePreview(p);
    host.innerHTML = "";
    slots.delete(host);
  }
}

export function mountItemPreview(itemId: string, host: HTMLElement): boolean {
  ensure();
  stopItemPreview();
  const next = buildPreview(itemId);
  if (!next) return false;
  tipHost = host;
  tipPreview = next;
  host.innerHTML = "";
  host.appendChild(next.canvas);
  sizeCanvas(next, host, 72);
  ensureLoop();
  requestAnimationFrame(() => {
    if (tipPreview === next) sizeCanvas(next, host, 72);
  });
  return true;
}

export function stopItemPreview() {
  if (tipPreview) {
    disposePreview(tipPreview);
    tipPreview = null;
  }
  if (tipHost) {
    tipHost.innerHTML = "";
    tipHost = null;
  }
  if (slots.size === 0 && !tipPreview && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

export function paintItemToCanvas(itemId: string, canvas: HTMLCanvasElement): boolean {
  ensure();
  const next = buildPreview(itemId);
  if (!next || !renderer) return false;
  const w = canvas.width || 64;
  const h = canvas.height || 64;
  next.canvas.width = w;
  next.canvas.height = h;
  drawPreview(next, false);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    disposePreview(next);
    return false;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(next.canvas, 0, 0, w, h);
  disposePreview(next);
  return true;
}
