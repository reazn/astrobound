import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

mkdirSync("tmp-shots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto("http://localhost:4000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => !document.querySelector(".sb-loading"), { timeout: 240000 });
await page.waitForFunction(() => !!window.__dbg?.lodDebug, { timeout: 60000 });
await page.waitForTimeout(3500);

const sample = async (label) => page.evaluate((label) => {
  const lod = window.__dbg.home.terrainLod;
  const d = lod.debug();
  const up = window.__dbg.player.movement.up.clone();
  const right = window.__dbg.player.movement.faceDir.clone()
    .cross(up).normalize();
  const rings = [0, 0.08, 0.16, 0.28, 0.45, 0.7].map((ang) => {
    const dir = up.clone().addScaledVector(right, Math.tan(ang)).normalize();
    return { ang, depth: lod.depthAlong(dir) };
  });
  return { label, leaves: d.leaves, under: d.depthUnderCam, rings };
}, label);

console.log("start", await sample("start"));

// Walk in steps, sampling the concentric gradient each time
for (let step = 0; step < 6; step++) {
  await page.evaluate(() => {
    const p = window.__dbg.player;
    const m = p.movement;
    const home = window.__dbg.home;
    const stepLen = home.planet.radius * 0.12; // ~0.12 rad each
    let walked = 0;
    while (walked < stepLen) {
      p.prevPosition.copy(p.position);
      p.position.addScaledVector(m.faceDir, 80);
      const up = p.position.clone().normalize();
      m.up.copy(up);
      const tang = m.faceDir.clone().addScaledVector(up, -m.faceDir.dot(up));
      if (tang.lengthSq() > 1e-8) m.faceDir.copy(tang.normalize());
      const r = home.planet.surfaceRadius(up.x, up.y, up.z) + 2;
      p.position.copy(up).multiplyScalar(r);
      walked += 80;
    }
  });
  await page.waitForTimeout(3000);
  console.log(await sample(`walk${step}`));
}

await page.screenshot({ path: "tmp-shots/lod-concentric.png", type: "png" });

const final = await sample("final");
const depths = final.rings.map((r) => r.depth);
let mono = true;
for (let i = 1; i < depths.length; i++) {
  if (depths[i] > depths[i - 1] + 1) mono = false; // allow +1 jitter from balance
}
const ok = final.under >= 7 && depths[0] >= 7 && depths[depths.length - 1] <= 4 && mono;

writeFileSync("tmp-shots/lod-concentric.json", JSON.stringify({ final, ok }, null, 2));
console.log(ok ? "PASS" : "FAIL", depths.join(" > "));
await browser.close();
process.exit(ok ? 0 : 1);
