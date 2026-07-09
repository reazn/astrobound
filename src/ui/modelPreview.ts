import {
  WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight,
  Group, Object3D, Box3, Vector3, AnimationMixer, Clock, Mesh, HemisphereLight,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadGltf } from "../engine/gltfCache";
import { makeReadableToon } from "../visuals/toonMaterial";

// Tiny offscreen Three.js viewport for ESC-menu ship/character previews.
// Loads a GLTF, frames it in a unit box, and spins (optionally playing Idle).

export interface ModelPreview {
  canvas: HTMLCanvasElement;
  setUrl(url: string, opts?: { playIdle?: boolean; yaw?: number }): Promise<void>;
  resize(w: number, h: number): void;
  dispose(): void;
}

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();

export function createModelPreview(width = 220, height = 160): ModelPreview {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText =
    "width:100%;height:100%;display:block;border-radius:10px;background:#0c1018;";

  const renderer = new WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x0c1018, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, width / height, 0.05, 80);
  camera.position.set(2.2, 1.4, 2.8);

  scene.add(new AmbientLight(0xffffff, 0.7));
  scene.add(new HemisphereLight(0xddeeff, 0x334455, 0.55));
  const key = new DirectionalLight(0xfff2dd, 1.25);
  key.position.set(3, 5, 2);
  scene.add(key);
  const fill = new DirectionalLight(0x88aaff, 0.55);
  fill.position.set(-3, 1, -2);
  scene.add(fill);

  const root = new Group();
  scene.add(root);
  let turntable = new Group();
  root.add(turntable);

  let mixer: AnimationMixer | null = null;
  let loadToken = 0;
  let currentUrl = "";
  const clock = new Clock();
  let disposed = false;
  let raf = 0;

  const frameCamera = (obj: Object3D) => {
    _box.setFromObject(obj);
    _box.getSize(_size);
    _box.getCenter(_center);
    obj.position.sub(_center);

    _box.setFromObject(obj);
    _box.getSize(_size);
    const radius = Math.max(_size.x, _size.y, _size.z, 0.001) * 0.55;
    const fov = camera.fov * (Math.PI / 180);
    const dist = (radius / Math.sin(fov * 0.5)) * 1.15;
    camera.position.set(dist * 0.72, dist * 0.38, dist * 0.95);
    camera.near = Math.max(0.01, dist * 0.02);
    camera.far = dist * 20;
    camera.lookAt(0, _size.y * 0.05, 0);
    camera.updateProjectionMatrix();
  };

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    turntable.rotation.y += dt * 0.7;
    mixer?.update(dt);
    renderer.render(scene, camera);
  };
  tick();

  return {
    canvas,
    async setUrl(url, opts = {}) {
      const token = ++loadToken;
      try {
        const gltf = await loadGltf(url);
        if (token !== loadToken || disposed) return;

        // Skip rebuild if the same URL is already showing (ESC spam / reopen).
        if (currentUrl === url && turntable.children.length > 0) {
          if (opts.yaw) turntable.children[0].rotation.y = opts.yaw;
          return;
        }
        currentUrl = url;

        root.remove(turntable);
        turntable = new Group();
        root.add(turntable);
        mixer?.stopAllAction();
        mixer = null;

        const model = cloneSkeleton(gltf.scene) as Group;
        model.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) {
            m.frustumCulled = false;
            if (Array.isArray(m.material)) {
              m.material = m.material.map((x) => makeReadableToon(x));
            } else if (m.material) {
              m.material = makeReadableToon(m.material);
            }
          }
        });
        if (opts.yaw) model.rotation.y = opts.yaw;
        turntable.add(model);
        frameCamera(turntable);

        if (opts.playIdle !== false && gltf.animations.length) {
          mixer = new AnimationMixer(model);
          const idle = gltf.animations.find((a) => /idle/i.test(a.name))
            ?? gltf.animations[0];
          mixer.clipAction(idle).play();
        }
      } catch (err) {
        console.warn("Model preview failed:", url, err);
      }
    },
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      mixer?.stopAllAction();
      renderer.dispose();
      root.clear();
    },
  };
}
