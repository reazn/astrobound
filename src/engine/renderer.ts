import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  DirectionalLight,
  HemisphereLight,
  Color,
  Fog,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
} from "three";
import { STAR } from "../config/star";
import { settings } from "../config/settings";

// three.js scene/camera/renderer for the solar system. Deep-space background,
// one warm directional "sun" (repositioned toward the star every frame, see
// main.ts) and a cool hemisphere fill whose tint is updated per-planet.
//
// Far plane must cover interplanetary deltas after floating-origin (home
// system SMAs are millions of units). Logarithmic depth keeps z usable.

const SPACE_BG = "#05060b";
const FAR_PLANE = 25_000_000;

export interface RenderContext {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  setFog(color: string, near: number, far: number): void;
  disableFog(): void;
  setBackground(color: string | null, blend: number): void;
  render(): void;
  dispose(): void;
}

export function createRenderer(container: HTMLElement): RenderContext {
  const scene = new Scene();
  scene.background = new Color(SPACE_BG);
  const fog = new Fog(new Color(SPACE_BG), FAR_PLANE * 0.6, FAR_PLANE);
  scene.fog = fog;

  const camera = new PerspectiveCamera(
    settings.fov,
    window.innerWidth / window.innerHeight,
    0.3,
    FAR_PLANE,
  );
  camera.position.set(0, 20, 30);

  const renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // Sun: directional key light. Shadow map is a small ortho volume around the
  // player (updated in main) — full-planet shadows are not viable at this scale.
  const sun = new DirectionalLight(new Color(STAR.color), STAR.lightIntensity * 0.7);
  sun.castShadow = false;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  const sc = sun.shadow.camera;
  sc.near = 0.5;
  sc.far = 360;
  sc.left = -140;
  sc.right = 140;
  sc.top = 140;
  sc.bottom = -140;
  sc.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new HemisphereLight(new Color("#88a0c0"), new Color("#333333"), 0.7);
  scene.add(hemi);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth || 1280;
    const h = container.clientHeight || window.innerHeight || 720;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);
  const ro = new ResizeObserver(onResize);
  ro.observe(container);
  onResize();

  const spaceBg = new Color(SPACE_BG);
  const atmoBg = new Color(SPACE_BG);
  const mixedBg = new Color(SPACE_BG);

  return {
    scene,
    camera,
    renderer,
    sun,
    hemi,
    setFog(color, near, far) {
      scene.fog = fog;
      fog.color.set(color);
      fog.near = near;
      fog.far = far;
    },
    disableFog() {
      scene.fog = null;
      fog.near = FAR_PLANE * 0.6;
      fog.far = FAR_PLANE;
      fog.color.set(SPACE_BG);
    },
    setBackground(color, blend) {
      if (!color || blend <= 0.01) {
        scene.background = spaceBg;
        return;
      }
      atmoBg.set(color).multiplyScalar(0.72);
      mixedBg.copy(spaceBg).lerp(atmoBg, Math.min(1, blend));
      scene.background = mixedBg;
    },
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
