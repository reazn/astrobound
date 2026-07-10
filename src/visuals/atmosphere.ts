import {
  Group,
  Mesh,
  SphereGeometry,
  IcosahedronGeometry,
  ShaderMaterial,
  BackSide,
  FrontSide,
  DoubleSide,
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

export function createAtmosphere(planet: Planet, rngWorld: RngStream): Atmosphere {
  const group = new Group();
  const def = planet.def;
  const skyColor = new Color(def.palette.atmosphere);
  const groundTint = new Color(def.palette.lowland);
  const atmoH = Math.max(def.atmosphereThickness, planet.radius * 0.08);
  const atmoDepth = atmoH * 2.6;
  const cloudGap = Math.max(80, atmoH * 0.045);
  const localSkyR = Math.max(2400, planet.radius * 0.12);

  const skyMat = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uHorizon: { value: skyColor.clone().multiplyScalar(1.55) },
      uZenith: { value: skyColor.clone().lerp(new Color("#a8c8ef"), 0.45).multiplyScalar(1.2) },
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
        float skyMask = smoothstep(-0.02, 0.35, elev);
        if (skyMask < 0.008) discard;

        float t = clamp(elev, 0.0, 1.0);
        vec3 daySky = mix(uHorizon * 0.9, uZenith, pow(t, 0.5));
        vec3 nightSky = mix(uNightHorizon, uNightZenith, pow(t, 0.7));
        vec3 sky = mix(nightSky, daySky, uDay);

        float sun = max(dot(vd, uSunDir), 0.0);
        sky += uSunColor * pow(sun, 5.5) * 0.85 * uDay;
        sky += uSunColor * pow(sun, 1.8) * 0.18 * uDay;
        // Soft Mie-ish bloom near sun without a hard disc.
        sky += uSunColor * pow(sun, 32.0) * 0.55 * uDay;

        float alpha = skyMask * uStrength * mix(0.35, 0.72, uDay);
        gl_FragColor = vec4(sky, alpha);
      }
    `,
  });
  const skyDome = new Mesh(new SphereGeometry(localSkyR, 40, 28), skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -10;
  skyDome.visible = false;

  // Outer limb glow — cheap volumetric stand-in (density falloff + Fresnel).
  const glowMat = new ShaderMaterial({
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uColor: { value: skyColor.clone() },
      uIntensity: { value: 1.35 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uDayBias: { value: 1 },
      uPlanetR: { value: planet.maxR },
      uAtmoH: { value: atmoH * 2.1 },
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
        float fresnel = pow(1.0 - max(0.0, abs(dot(toSurf, viewDir))), 2.1);

        float dist = length(vWorldPos - vCenter);
        float h = (dist - uPlanetR) / max(1.0, uAtmoH);
        float density = exp(-h * h * 2.2) * (1.0 - smoothstep(0.5, 1.05, h));

        float sunLit = clamp(dot(toSurf, uSunDir) * 0.7 + 0.32, 0.1, 1.0);
        // Terminator brightening — thin crescent limb.
        float limb = pow(1.0 - abs(dot(toSurf, uSunDir)), 2.4) * 0.55;
        float scatter = (fresnel * 0.9 + 0.28 + limb) * density * (0.65 + sunLit * 1.05);
        float i = scatter * uIntensity * uDayBias;
        if (i < 0.005) discard;
        vec3 col = uColor * (0.7 + sunLit * 0.7);
        col = mix(col, vec3(1.0, 0.85, 0.65), limb * 0.35 * sunLit);
        gl_FragColor = vec4(col * i, clamp(i * 1.15, 0.0, 0.9));
      }
    `,
  });
  const glow = new Mesh(
    new SphereGeometry(planet.maxR + atmoH * 2.1, 48, 32),
    glowMat,
  );
  glow.frustumCulled = false;
  glow.renderOrder = -1;
  group.add(glow);

  // Soft in-scattering shell (front faces) — reads as volume when skimming atmo.
  const volumeMat = new ShaderMaterial({
    side: FrontSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uColor: { value: skyColor.clone().multiplyScalar(0.85) },
      uPlanetR: { value: planet.maxR },
      uAtmoH: { value: atmoH * 1.6 },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uIntensity: { value: 0.55 },
      uCamAlt: { value: 1 },
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
      uniform float uPlanetR, uAtmoH, uIntensity, uCamAlt;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 toSurf = normalize(vWorldPos - vCenter);
        float dist = length(vWorldPos - vCenter);
        float h = (dist - uPlanetR) / max(1.0, uAtmoH);
        float dens = exp(-h * 1.8) * smoothstep(1.05, 0.15, h);
        float along = pow(max(0.0, dot(viewDir, uSunDir)), 3.0);
        float rim = pow(1.0 - max(0.0, abs(dot(toSurf, viewDir))), 1.6);
        float i = dens * (0.25 + along * 0.9 + rim * 0.45) * uIntensity;
        i *= smoothstep(uAtmoH * 2.8, uAtmoH * 0.2, uCamAlt);
        if (i < 0.008) discard;
        gl_FragColor = vec4(uColor * i, clamp(i * 0.85, 0.0, 0.55));
      }
    `,
  });
  const volumeShell = new Mesh(
    new SphereGeometry(planet.maxR + atmoH * 1.55, 40, 28),
    volumeMat,
  );
  volumeShell.frustumCulled = false;
  volumeShell.renderOrder = -2;
  group.add(volumeShell);

  const noise = createNoise3D(rngWorld);
  const cloudMeshes: Mesh[] = [];
  const axes: Vector3[] = [];
  const layers = def.cloudCoverage > 0.55 ? 3 : def.cloudCoverage > 0 ? 2 : 0;
  if (layers > 0) {
    for (let l = 0; l < layers; l++) {
      const radius = planet.radius + atmoH * (0.35 + l * 0.12) + l * cloudGap;
      const geo = new IcosahedronGeometry(radius, 4);
      const posAttr = geo.getAttribute("position");
      const nV = posAttr.count;
      const coverage = new Float32Array(nV);
      const scale = 2.0 + l * 0.35;
      for (let i = 0; i < nV; i++) {
        const inv = 1 / radius;
        const x = posAttr.getX(i) * inv, y = posAttr.getY(i) * inv, z = posAttr.getZ(i) * inv;
        let amp = 1, freq = scale, sum = 0, norm = 0;
        for (let o = 0; o < 4; o++) {
          sum += amp * noise(x * freq, y * freq, z * freq);
          norm += amp; amp *= 0.5; freq *= 2.05;
        }
        coverage[i] = sum / norm * 0.5 + 0.5;
      }
      geo.setAttribute("coverage", new BufferAttribute(coverage, 1));

      const opacity = 0.18 + l * 0.04;
      const mesh = new Mesh(geo, new ShaderMaterial({
        side: DoubleSide,
        transparent: true, depthWrite: false, blending: NormalBlending, fog: false,
        uniforms: {
          uColor: { value: new Color(l === 0 ? "#f4f7ff" : "#e8eef8") },
          uOpacity: { value: opacity },
          uThreshold: { value: 1 - def.cloudCoverage * (1 - l * 0.12) },
          uDay: { value: 1 },
          uSunDir: { value: new Vector3(0, 1, 0) },
        },
        vertexShader: /* glsl */ `
          attribute float coverage;
          varying float vC;
          varying vec3 vN;
          void main() {
            vC = coverage;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vC;
          varying vec3 vN;
          uniform vec3 uColor, uSunDir;
          uniform float uOpacity, uThreshold, uDay;
          void main() {
            float alpha = smoothstep(uThreshold, uThreshold + 0.2, vC) * uOpacity * mix(0.22, 1.0, uDay);
            if (alpha < 0.012) discard;
            float lit = clamp(dot(normalize(vN), uSunDir) * 0.5 + 0.55, 0.25, 1.15);
            vec3 col = uColor * lit * mix(0.35, 1.0, uDay);
            gl_FragColor = vec4(col, alpha);
          }
        `,
      }));
      mesh.frustumCulled = false;
      group.add(mesh);
      cloudMeshes.push(mesh);
      axes.push(new Vector3(0.12 * (l + 1), 1, 0.08 * (l + 1)).normalize());
    }
  }

  let insideFactor = 0;
  let dayFactor = 1;
  const driftSpeed = 0.0035;

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

      const sunDot = up.dot(sunDir);
      const night = Math.max(0, Math.min(1, (-sunDot - 0.05) / 0.55));
      dayFactor = 1 - night;

      skyDome.visible = insideAtmo;
      if (insideAtmo) {
        skyDome.position.copy(camRenderPos);
        skyMat.uniforms.uUp.value.copy(up);
        skyMat.uniforms.uSunDir.value.copy(sunDir);
        skyMat.uniforms.uDay.value = dayFactor;
        skyMat.uniforms.uStrength.value = Math.min(1.0, 0.55 + insideFactor * 0.5);
      }

      glowMat.uniforms.uSunDir.value.copy(sunDir);
      glowMat.uniforms.uDayBias.value = 0.4 + dayFactor * 0.85;
      glowMat.uniforms.uIntensity.value = insideAtmo
        ? 0.04 + insideFactor * 0.05
        : 2.8 + dayFactor * 0.7;
      glow.visible = !insideAtmo || camAlt > atmoDepth * 0.25;

      volumeMat.uniforms.uSunDir.value.copy(sunDir);
      volumeMat.uniforms.uCamAlt.value = camAlt;
      volumeMat.uniforms.uIntensity.value = insideAtmo
        ? 0.15 + insideFactor * 0.55
        : 0.35 + dayFactor * 0.25;
      volumeShell.visible = camAlt < atmoDepth * 2.2;

      for (let i = 0; i < cloudMeshes.length; i++) {
        const farAbove = camAlt > atmoDepth * 1.7;
        // Keep clouds visible from the surface (DoubleSide shell).
        cloudMeshes[i].visible = !farAbove && insideFactor > 0.01;
        const cm = cloudMeshes[i].material as ShaderMaterial;
        cm.uniforms.uDay.value = dayFactor;
        cm.uniforms.uSunDir.value.copy(sunDir);
        if (cloudMeshes[i].visible) {
          cloudMeshes[i].rotateOnAxis(axes[i], driftSpeed * dt * (i % 2 ? -1 : 1));
        }
      }
    },
  };
}
