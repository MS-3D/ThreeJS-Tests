import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://127.0.0.1:47331/";
const outDir = process.env.ZELLE_SHOTS ?? "/tmp/zelle-shots";
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
  ],
});

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => {
  errors.push(String(error));
});
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => window.__zelle?.ready === true, { timeout: 30000 });

  const clip = await page.evaluate(() => window.__zelle.getClip());
  check(clip.name === "PickPlaceLoop", `clip name ${clip.name}`);
  check(Math.abs(clip.duration - 9) < 0.02, `duration ${clip.duration}`);
  check(clip.tracks.length === 8, `tracks ${clip.tracks.length}`);

  const chain = await page.evaluate(() => window.__zelle.parentChain("Gripper_Finger_+1"));
  for (const name of ["J6_Axis_Flange", "J5_Axis_Wrist", "J3_Axis_Elbow", "J2_Axis_Shoulder", "J1_Axis_Base"]) {
    check(chain.includes(name), `gripper chain missing ${name}: ${chain.join(" > ")}`);
  }
  const workpieceChain = await page.evaluate(() => window.__zelle.parentChain("Workpiece_Target"));
  check(
    !workpieceChain.some((name) => name.startsWith("J") || name.startsWith("Gripper")),
    `workpiece was parented into the arm: ${workpieceChain.join(" > ")}`,
  );

  const sample = async (time) =>
    page.evaluate((t) => {
      window.__zelle.setTime(t);
      const center = window.__zelle.getWorkpieceCenter();
      const wrist = window.__zelle.getWorldPosition("J5_Axis_Wrist");
      const dx = center.x - wrist.x;
      const dy = center.y - wrist.y;
      const dz = center.z - wrist.z;
      return {
        time: window.__zelle.getTime(),
        opacity: window.__zelle.getOpacity(),
        visible: window.__zelle.isWorkpieceVisible(),
        center,
        wrist,
        gap: Math.hypot(dx, dy, dz),
        joint: window.__zelle.getLocalQuaternion("J1_Axis_Base"),
        finger: window.__zelle.getLocalPosition("Gripper_Finger_+1"),
      };
    }, time);

  const times = [0.05, 1.2, 3.2, 4.6, 6.9, 7.5, 7.56, 8.2, 8.95];
  const samples = {};
  for (const time of times) samples[String(time)] = await sample(time);

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const quatAngle = (a, b) => {
    const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
    return (2 * Math.acos(dot) * 180) / Math.PI;
  };

  check(samples["1.2"].opacity === 1 && samples["1.2"].visible, "block hidden on the belt");
  check(samples["4.6"].opacity === 1 && samples["4.6"].visible, "block hidden while carried");
  check(samples["6.9"].opacity === 1 && samples["6.9"].visible, "block hidden on the pallet");
  check(samples["7.5"].opacity === 0 && samples["7.5"].visible === false, "block still visible at the end of the fade");
  check(samples["7.56"].opacity === 0 && samples["7.56"].visible === false, "block visible during the snap");
  check(samples["8.2"].opacity === 0, "block visible on the return");
  check(distance(samples["7.5"].center, samples["7.56"].center) > 1, "pallet and belt poses are not apart");
  check(distance(samples["7.56"].center, samples["1.2"].center) < 0.05, "reset pose is not the belt pose");
  check(distance(samples["6.9"].center, samples["7.5"].center) < 0.02, "block moved before the snap");
  const carry = await sample(5.2);
  check(carry.gap > 0.2 && carry.gap < 0.5, `carry gap ${carry.gap}`);
  check(samples["4.6"].gap > 0.2 && samples["4.6"].gap < 0.5, `swing gap ${samples["4.6"].gap}`);
  check(Math.abs(samples["4.6"].gap - carry.gap) < 0.08, "block left the wrist during the carry");
  check(samples["1.2"].gap > 0.8, "block already in the gripper at the approach");
  check(quatAngle(samples["0.05"].joint, samples["8.95"].joint) < 0.5, "robot pose jumps at the loop wrap");
  check(quatAngle(samples["0.05"].joint, samples["3.2"].joint) > 15, "base joint did not move");
  check(
    Math.abs(samples["1.2"].finger.x - samples["3.2"].finger.x) > 0.02,
    "gripper finger did not close",
  );
  for (const pose of Object.values(samples)) {
    check(Number.isFinite(pose.center.x + pose.center.y + pose.center.z), `non-finite pose at ${pose.time}`);
  }

  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  await sample(4.6);
  await shot("desktop-carry");
  await sample(1.2);
  await shot("desktop-approach");
  await sample(6.9);
  await shot("desktop-pallet");
  await sample(7.56);
  await shot("desktop-snap-hidden");
  await sample(8.3);
  await shot("desktop-return");

  const variance = await page.evaluate(() => {
    const source = document.querySelector("canvas");
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 40;
    const context = probe.getContext("2d", { willReadFrequently: true });
    context.drawImage(source, 0, 0, probe.width, probe.height);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    let spread = 0;
    for (let i = 4; i < data.length; i += 4) {
      spread += Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]);
    }
    return spread;
  });
  check(variance > 2000, `WebGL frame looks empty (${variance})`);

  await sample(1.5);
  await page.evaluate(() => window.__zelle.setPlaying(false));
  const beforeDrag = await page.evaluate(() => window.__zelle.getCamera());
  await page.mouse.move(760, 560);
  await page.mouse.down();
  await page.mouse.move(980, 470, { steps: 14 });
  await page.mouse.up();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterDrag = await page.evaluate(() => window.__zelle.getCamera());
  const dragged = Math.hypot(
    afterDrag.position.x - beforeDrag.position.x,
    afterDrag.position.y - beforeDrag.position.y,
    afterDrag.position.z - beforeDrag.position.z,
  );
  check(dragged > 0.2, `pointer orbit moved only ${dragged.toFixed(3)} m`);
  await page.evaluate(() => window.__zelle.resetView());
  const reset = await page.evaluate(() => window.__zelle.getCamera());
  const resetError = Math.hypot(reset.position.x - 4.1, reset.position.y - 2.35, reset.position.z - 3.25);
  check(resetError < 0.08, `reset view off by ${resetError.toFixed(3)}`);
  await shot("desktop-home");

  const playback = await page.evaluate(async () => {
    window.__zelle.setTime(2);
    window.__zelle.setPlaying(true);
    const start = window.__zelle.getTime();
    await new Promise((resolve) => {
      let frames = 0;
      const step = () => {
        frames += 1;
        if (frames < 25) requestAnimationFrame(step);
        else resolve(null);
      };
      requestAnimationFrame(step);
    });
    const running = window.__zelle.getTime();
    window.__zelle.setPlaying(false);
    const pausedAt = window.__zelle.getTime();
    await new Promise((resolve) => {
      let frames = 0;
      const step = () => {
        frames += 1;
        if (frames < 15) requestAnimationFrame(step);
        else resolve(null);
      };
      requestAnimationFrame(step);
    });
    return { start, running, pausedAt, pausedAfter: window.__zelle.getTime(), playing: window.__zelle.isPlaying() };
  });
  check(playback.running > playback.start + 0.15, `playback stalled (${playback.start} -> ${playback.running})`);
  check(
    Math.abs(playback.pausedAfter - playback.pausedAt) < 0.05,
    `pause did not hold (${playback.pausedAt} -> ${playback.pausedAfter})`,
  );
  check(playback.playing === false, "pause flag stayed on");
  const phase = await page.$eval("#phase", (node) => node.textContent ?? "");
  check(phase.includes("Pausiert"), `status text "${phase}"`);
  await page.click("#play");
  const resumed = await page.evaluate(() => window.__zelle.isPlaying());
  check(resumed === true, "Weiter did not resume playback");
  await page.click('[data-speed="2"]');
  const speed = await page.evaluate(() => window.__zelle.getSpeed());
  check(speed === 2, `tempo is ${speed}`);

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => window.__zelle?.ready === true, { timeout: 30000 });
  await page.evaluate(() => window.__zelle.resetView());
  const touchBefore = await page.evaluate(() => window.__zelle.getCamera());
  await page.touchscreen.touchStart(190, 520);
  await page.touchscreen.touchMove(270, 430);
  await page.touchscreen.touchEnd();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const touchAfter = await page.evaluate(() => window.__zelle.getCamera());
  const touchMoved = Math.hypot(
    touchAfter.position.x - touchBefore.position.x,
    touchAfter.position.y - touchBefore.position.y,
    touchAfter.position.z - touchBefore.position.z,
  );
  check(touchMoved > 0.05, `touch orbit moved only ${touchMoved.toFixed(3)} m`);
  await page.evaluate(() => window.__zelle.setTime(4.4));
  await shot("mobile-carry");

  const filtered = errors.filter((entry) => !/favicon/i.test(entry));
  check(filtered.length === 0, `console errors:\n${filtered.join("\n")}`);

  const report = { url, variance, dragged, touchMoved, resetError, samples, errors: filtered, failures };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error(failures.map((item) => `- ${item}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`browser check ok · variance ${variance} · orbit ${dragged.toFixed(2)} m · touch ${touchMoved.toFixed(2)} m`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
