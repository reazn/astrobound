import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

mkdirSync("tmp-shots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (msg) => {
  if (msg.type() === "error") logs.push(msg.text().slice(0, 200));
});

const waitLod = async (label) => {
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => window.__dbg?.lodDebug?.());
  console.log(label, JSON.stringify(d));
  return d;
};

console.log("navigating...");
await page.goto("http://localhost:4000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => !document.querySelector(".sb-loading"), { timeout: 240000 });
console.log("loaded");

await page.waitForFunction(() => !!window.__dbg?.lodDebug, { timeout: 60000 });

const t0 = await waitLod("t=0.5s");
await page.waitForTimeout(2500);
const t1 = await waitLod("t=3s");
await page.screenshot({ path: "tmp-shots/lod-settle.png", type: "png" });

// Walk forward in sim by nudging player along faceDir for several seconds
await page.evaluate(() => {
  const p = window.__dbg.player;
  const m = p.movement;
  const step = 40;
  for (let i = 0; i < 80; i++) {
    p.prevPosition.copy(p.position);
    p.position.addScaledVector(m.faceDir, step);
    const up = p.position.clone().normalize();
    m.up.copy(up);
    const r = window.__dbg.home.planet.surfaceRadius(up.x, up.y, up.z) + 2;
    p.position.copy(up).multiplyScalar(r);
  }
});
await page.waitForTimeout(3000);
const t2 = await waitLod("after-move");
await page.screenshot({ path: "tmp-shots/lod-moved.png", type: "png" });

await page.waitForTimeout(4000);
const t3 = await waitLod("t=settle2");
await page.screenshot({ path: "tmp-shots/lod-late.png", type: "png" });

const ok =
  t1?.depthUnderCam >= 7 &&
  t2?.depthUnderCam >= 7 &&
  t3?.depthUnderCam >= 7 &&
  !t1?.impostor &&
  !t3?.impostor &&
  t1?.chunksVisible &&
  t3?.chunksVisible;

const report = { t0, t1, t2, t3, ok, errors: logs.slice(0, 10) };
writeFileSync("tmp-shots/lod-report.json", JSON.stringify(report, null, 2));
console.log("RESULT", ok ? "PASS" : "FAIL", JSON.stringify(report));

await browser.close();
process.exit(ok ? 0 : 1);
