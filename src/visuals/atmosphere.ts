import {
  Group,
  Mesh,
  SphereGeometry,
  IcosahedronGeometry,
  ShaderMaterial,
  BackSide,
  AdditiveBlending,
  NormalBlending,
  Color,
  Vector3,
  BufferAttribute,
} from "three";
import { createNoise3D } from "simplex-noise";
import type { RngStream } from "../engine/rng";
import type { Planet } from "../worldgen/planet";
import { STAR } from "../config/star";

export interface Atmosphere {
  group: Group;
  skyDome: Mesh;
  update(
    dt: number,
    camRenderPos: Vector3,
    planetRenderPos: Vector3,
    up: Vector3,
    sunDir: Vector3,
  ): void;
  readonly insideFactor: number;
  readonly dayFactor: number;
}

const CLOUDS = { layers: 2, gap: 14, color: "#ffffff", opacity: 0.22, driftSpeed: 0.006, scale: 2.2 };
const LOCAL_SKY_R = 900;

export function createAtmosphere(planet: Planet, rngWorld: RngStream): Atmosphere {
  const group = new Group();
  const def = planet.def;
  const skyColor = new Color(def.palette.atmosphere);
  const groundTint = new Color(def.palette.lowland);
  const atmoDepth = Math.max(def.atmosphereThickness * 2.8, 180);

  const skyMat = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHorizon: { value: skyColor.clone().multiplyScalar(1.5) },
      uZenith: { value: skyColor.clone().lerp(new Color("#a8c8ef"), 0.5).multiplyScalar(1.15) },
      uNightZenith: { value: new Color("#050814") },
      uNightHorizon: { value: new Color("#0a1220") },
      uGround: { value: groundTint.clone().multiplyScalar(0.5) },
      uSunColor: { value: new Color(STAR.color) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uUp: { value: new Vector3(0, 1, 0) },
      uStrength: { value: 1 },
      uDay: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal;
      uniform vec3 uHorizon, uZenith, uNightZenith, uNightHorizon, uGround, uSunColor, uSunDir, uUp;
      uniform float uStrength, uDay;
      void main() {
        vec3 vd = normalize(vLocal);
        float elev = dot(vd, uUp);
        float skyMask = smoothstep(0.02, 0.5, elev);
        if (skyMask < 0.008) discard;

        float t = clamp(elev, 0.0, 1.0);
        vec3 daySky = mix(uHorizon * 0.85, uZenith, pow(t, 0.55));
        vec3 nightSky = mix(uNightHorizon, uNightZenith, pow(t, 0.7));
        vec3 sky = mix(nightSky, daySky, uDay);

        float sun = max(dot(vd, uSunDir), 0.0);
        sky += uSunColor * pow(sun, 6.0) * 0.75 * uDay;
        sky += uSunColor * pow(sun, 2.0) * 0.14 * uDay;

        float alpha = skyMask * uStrength * mix(0.22, 0.45, uDay);
        gl_FragColor = vec4(sky, alpha);
      }
    `,
  });
  const skyDome = new Mesh(new SphereGeometry(LOCAL_SKY_R, 48, 32), skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -10;
  skyDome.visible = false;

  // Soft atmosphere shell from space — Fresnel limb with sun-lit scattering,
  // not a hard opaque sphere.
  const glowMat = new ShaderMaterial({
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uColor: { value: skyColor.clone() },
      uIntensity: { value: 1.2 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uDayBias: { value: 1 },
      uPlanetR: { value: planet.maxR },
      uAtmoH: { value: def.atmosphereThickness * 2.35 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vCenter;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec3 vCenter;
      uniform vec3 uColor, uSunDir;
      uniform float uIntensity, uDayBias, uPlanetR, uAtmoH;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 toSurf = normalize(vWorldPos - vCenter);
        float fresnel = pow(1.0 - max(0.0, abs(dot(toSurf, viewDir))), 1.85);

        float dist = length(vWorldPos - vCenter);
        float h = (dist - uPlanetR) / max(1.0, uAtmoH);
        float density = exp(-h * h * 1.8) * (1.0 - smoothstep(0.55, 1.05, h));

        float sunLit = clamp(dot(toSurf, uSunDir) * 0.65 + 0.35, 0.12, 1.0);
        float scatter = (fresnel * 0.85 + 0.35) * density * (0.7 + sunLit * 0.9);
        float i = scatter * uIntensity * uDayBias;
        if (i < 0.006) discard;
        vec3 col = uColor * (0.75 + sunLit * 0.6);
        gl_FragColor = vec4(col * i, clamp(i * 1.25, 0.0, 0.92));
      }
    `,
  });
  const glow = new Mesh(
    new SphereGeometry(planet.maxR + def.atmosphereThickness * 2.35, 72, 48),
    glowMat,
  );
  glow.frustumCulled = false;
  glow.renderOrder = -1;
  group.add(glow);

  const noise = createNoise3D(rngWorld);
  const cloudMeshes: Mesh[] = [];
  const axes: Vector3[] = [];
  if (def.cloudCoverage > 0) {
    for (let l = 0; l < CLOUDS.layers; l++) {
      const radius = planet.radius + def.atmosphereThickness * 0.45 + l * CLOUDS.gap;
      const geo = new IcosahedronGeometry(radius, 5);
      const posAttr = geo.getAttribute("position");
      const nV = posAttr.count;
      const coverage = new Float32Array(nV);
      for (let i = 0; i < nV; i++) {
        const inv = 1 / radius;
        const x = posAttr.getX(i) * inv, y = posAttr.getY(i) * inv, z = posAttr.getZ(i) * inv;
        let amp = 1, freq = CLOUDS.scale, sum = 0, norm = 0;
        for (let o = 0; o < 3; o++) {
          sum += amp * noise(x * freq, y * freq, z * freq);
          norm += amp; amp *= 0.5; freq *= 2;
        }
        coverage[i] = sum / norm * 0.5 + 0.5;
      }
      geo.setAttribute("coverage", new BufferAttribute(coverage, 1));

      const mesh = new Mesh(geo, new ShaderMaterial({
        transparent: true, depthWrite: false, blending: NormalBlending, fog: false,
        uniforms: {
          uColor: { value: new Color(CLOUDS.color) },
          uOpacity: { value: CLOUDS.opacity },
          uThreshold: { value: 1 - def.cloudCoverage },
          uDay: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute float coverage; varying float vC;
          void main() { vC = coverage; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying float vC; uniform vec3 uColor; uniform float uOpacity, uThreshold, uDay;
          void main() {
            float alpha = smoothstep(uThreshold, uThreshold+0.16, vC) * uOpacity * mix(0.25, 1.0, uDay);
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(uColor * mix(0.35, 1.0, uDay), alpha);
          }
        `,
      }));
      mesh.frustumCulled = false;
      group.add(mesh);
      cloudMeshes.push(mesh);
      axes.push(new Vector3(0.15 * (l + 1), 1, 0.1 * (l + 1)).normalize());
    }
  }

  let insideFactor = 0;
  let dayFactor = 1;

  return {
    group,
    skyDome,
    get insideFactor() {
      return insideFactor;
    },
    get dayFactor() {
      return dayFactor;
    },
    update(dt, camRenderPos, planetRenderPos, up, sunDir) {
      const camAlt = camRenderPos.distanceTo(planetRenderPos) - planet.maxR;
      insideFactor = 1 - Math.max(0, Math.min(1, camAlt / atmoDepth));
      const insideAtmo = insideFactor > 0.02;

      // Day factor from how much the local up faces the star (night on far side).
      const sunDot = up.dot(sunDir);
      dayFactor = Math.max(0, Math.min(1, sunDot * 0.55 + 0.45));
      // Soften twilight: fully dark only well past terminator.
      const night = Math.max(0, Math.min(1, (-sunDot - 0.05) / 0.55));
      dayFactor = 1 - night;

      skyDome.visible = insideAtmo;
      if (insideAtmo) {
        skyDome.position.copy(camRenderPos);
        skyMat.uniforms.uUp.value.copy(up);
        skyMat.uniforms.uSunDir.value.copy(sunDir);
        skyMat.uniforms.uDay.value = dayFactor;
        skyMat.uniforms.uStrength.value = Math.min(0.95, 0.3 + insideFactor * 0.5);
      }

      glowMat.uniforms.uSunDir.value.copy(sunDir);
      glowMat.uniforms.uDayBias.value = 0.4 + dayFactor * 0.85;
      glowMat.uniforms.uIntensity.value = insideAtmo
        ? 0.03 + insideFactor * 0.04
        : 2.6 + dayFactor * 0.65;
      glow.visible = !insideAtmo || camAlt > atmoDepth * 0.3;

      for (let i = 0; i < cloudMeshes.length; i++) {
        const cloudFloor = def.atmosphereThickness * 0.5 + i * CLOUDS.gap;
        const underClouds = camAlt < cloudFloor + 60;
        const farAbove = camAlt > atmoDepth * 1.6;
        cloudMeshes[i].visible = !underClouds && !farAbove && insideFactor > 0.02;
        const cm = cloudMeshes[i].material as ShaderMaterial;
        cm.uniforms.uDay.value = dayFactor;
        if (cloudMeshes[i].visible) {
          cloudMeshes[i].rotateOnAxis(axes[i], CLOUDS.driftSpeed * dt * (i % 2 ? -1 : 1));
        }
      }
    },
  };
}
