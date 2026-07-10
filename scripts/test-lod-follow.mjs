import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

mkdirSync("tmp-shots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto("http://localhost:4000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => !document.querySelector(".sb-loading"), { timeout: 240000 });
await page.waitForFunction(() => !!window.__dbg?.lodDebug, { timeout: 60000 });
await page.waitForTimeout(3500);

const spawn = await page.evaluate(() => {
  const p = window.__dbg.player.position;
  const d = window.__dbg.home.terrainLod.debug();
  return { x: p.x, y: p.y, z: p.z, depth: d.depthUnderCam, leaves: d.leaves };
});
console.log("spawn", spawn);

await page.evaluate(() => {
  const p = window.__dbg.player;
  const m = p.movement;
  const home = window.__dbg.home;
  const R = home.planet.radius;
  const targetArc = R * 0.75;
  let walked = 0;
  const step = 90;
  while (walked < targetArc) {
    p.prevPosition.copy(p.position);
    p.position.addScaledVector(m.faceDir, step);
    const up = p.position.clone().normalize();
    m.up.copy(up);
    const tang = m.faceDir.clone().addScaledVector(up, -m.faceDir.dot(up));
    if (tang.lengthSq() > 1e-8) m.faceDir.copy(tang.normalize());
    const r = home.planet.surfaceRadius(up.x, up.y, up.z) + 2;
    p.position.copy(up).multiplyScalar(r);
    walked += step;
  }
});

// Allow collapse + refine over many frames
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(500);
}

const result = await page.evaluate((spawnPos) => {
  const lod = window.__dbg.home.terrainLod;
  const d = lod.debug();
  const sl = Math.hypot(spawnPos.x, spawnPos.y, spawnPos.z) || 1;
  const spawnDir = window.__dbg.player.position.clone().set(
    spawnPos.x / sl,
    spawnPos.y / sl,
    spawnPos.z / sl,
  );
  return {
    leaves: d.leaves,
    depthHere: d.depthUnderCam,
    depthSpawn: lod.depthAlong(spawnDir),
    impostor: d.impostor,
  };
}, spawn);

console.log("after walk", result);
await page.screenshot({ path: "tmp-shots/lod-walkfar.png", type: "png" });

const ok =
  result.depthHere >= 7 &&
  result.depthSpawn <= 5 &&
  !result.impostor;

writeFileSync("tmp-shots/lod-walkfar.json", JSON.stringify({ spawn, result, ok }, null, 2));
console.log(ok ? "PASS" : "FAIL", `(here=${result.depthHere} spawn=${result.depthSpawn})`);
await browser.close();
process.exit(ok ? 0 : 1);
