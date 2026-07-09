import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

// Shared GLTF fetch cache. Dedupes in-flight requests and keeps parsed results
// so ESC previews / ship swaps / rock protos don't re-hit the network.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function loadGltf(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url);
    cache.set(url, pending);
    pending.catch(() => {
      if (cache.get(url) === pending) cache.delete(url);
    });
  }
  return pending;
}

export function hasGltfCached(url: string): boolean {
  return cache.has(url);
}

export function clearGltfCache(): void {
  cache.clear();
}
