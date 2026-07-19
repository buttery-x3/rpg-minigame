import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const port = process.env.VERIFY_PORT ?? "5177";
const url = process.env.VERIFY_URL ?? `http://127.0.0.1:${port}/`;
const outputDir = path.resolve(process.env.VERIFY_OUTPUT_DIR ?? "verify");
const browserPath = await resolveBrowserPath();
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
];

let devServer = null;

try {
  await fs.mkdir(outputDir, { recursive: true });

  if (!(await isReachable(url))) {
    devServer = await startDevServer();
  }

  const results = await verifyInBrowser();
  for (const result of results) {
    console.log(
      `${result.viewport.name}: ${result.metrics.canvasWidth}x${result.metrics.canvasHeight}, nonDark=${result.metrics.nonDark}, bright=${result.metrics.bright}, buckets=${result.metrics.colorBuckets}, moved=${result.movementDistance.toFixed(2)}`,
    );
    console.log(`  screenshot: ${result.screenshotPath}`);
  }
} finally {
  if (devServer) {
    stopDevServer(devServer);
  }
}

async function verifyInBrowser() {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      const errors = [];

      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas");
      await page.waitForSelector(".ui-layer");
      await page.waitForSelector(".party-panel");
      await page.waitForSelector(".camera-panel", { state: "attached" });
      await page.waitForFunction(() => window.__RPG_GAME__?.getDiagnostics().frameCount > 3);

      const before = await readDiagnostics(page);
      await page.locator('[data-party-group="main"] .party-panel__header').click();
      const panelClickStartedGesture = (await readDiagnostics(page)).input.gesture.active;
      const cameraPanelHiddenOnLoad = await page.locator(".camera-panel").evaluate((panel) => panel.hidden);
      const stanceButtonCount = await page.locator('[data-party-group="main"] button[data-stance]').count();
      await page.locator('[data-party-group="main"] button[data-stance="aggressive"]').click();
      const aggressiveStance = (await readDiagnostics(page)).party.groups.find((group) => group.id === "main")?.stance;
      await page.locator('[data-party-group="main"] .party-panel__recall').click();
      const defensiveAfterRecall = (await readDiagnostics(page)).party.groups.find((group) => group.id === "main")?.stance;
      await page.locator("[data-camera-toggle]").click();
      const cameraPanelVisibleAfterToggle = await page.locator(".camera-panel:not([hidden])").count();
      await page.locator("[data-camera-angle]").evaluate((input) => {
        input.value = "30";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.waitForTimeout(80);
      const afterCameraControl = await readDiagnostics(page);
      await page.locator("[data-camera-toggle]").click();
      await page.locator('[data-party-group="main"] button[data-formation="horizontal-line"]').click();
      const formationAfter = await readDiagnostics(page);

      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.4);
      await page.waitForTimeout(80);
      const intentMenuVisible = await page.locator('[data-gesture-menu]:not([hidden])').count();
      const anchoredMenuPosition = await page.locator('[data-gesture-menu]').evaluate((element) => ({
        left: getComputedStyle(element).left,
        top: getComputedStyle(element).top,
      }));
      const intentLabelsVisible = await page.locator('[data-gesture-menu]:not([hidden]) .gesture-menu__intents:visible').count();
      await page.mouse.move(viewport.width * 0.5 + 80, viewport.height * 0.4 - 80);
      await page.waitForTimeout(80);
      const roleMenuVisible = await page.locator('[data-gesture-menu]:not([hidden]) .gesture-menu__roles:visible').count();
      const nestedMenuPosition = await page.locator('[data-gesture-menu]').evaluate((element) => ({
        left: getComputedStyle(element).left,
        top: getComputedStyle(element).top,
      }));
      const diagonalGesture = await readDiagnostics(page);
      await page.mouse.up();

      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.4);
      await page.mouse.move(viewport.width * 0.5, viewport.height * 0.3);
      await page.mouse.up();
      await page.waitForTimeout(100);
      await page.waitForSelector('[data-party-group="group-1"]');
      const splitPanelCount = await page.locator("[data-party-group]").count();
      await page.locator('[data-party-group="group-1"] button[data-formation="vertical-line"]').click();
      const detachedFormationSelected = await page.locator('[data-party-group="group-1"] button[data-formation="vertical-line"]').evaluate((button) => button.classList.contains("is-selected"));
      const beforeCommandWasd = await readDiagnostics(page);
      await page.keyboard.down("w");
      await page.waitForTimeout(120);
      await page.keyboard.up("w");
      const afterCommandWasd = await readDiagnostics(page);
      const detachedMovementDistance = groundDistance(
        beforeCommandWasd.party.members.find((member) => member.id === "tank-1")?.position,
        afterCommandWasd.party.members.find((member) => member.id === "tank-1")?.position,
      );
      await page.locator('[data-party-group="group-1"] .party-panel__return').click();
      await page.waitForTimeout(80);
      const returnedPanelCount = await page.locator("[data-party-group]").count();
      const maxMemberDeltaDuringCommandWasd = Math.max(
        ...beforeCommandWasd.party.members.map((member) => {
          const afterMember = afterCommandWasd.party.members.find((candidate) => candidate.id === member.id);
          return afterMember ? groundDistance(member.position, afterMember.position) : Number.POSITIVE_INFINITY;
        }),
      );

      await page.keyboard.down("w");
      await page.waitForTimeout(700);
      await page.keyboard.up("w");
      await page.waitForTimeout(250);
      const after = await readDiagnostics(page);
      const movementDistance = groundDistance(before.party.position, after.party.position);

      const screenshotPath = path.join(outputDir, `${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const metrics = await collectCanvasMetrics(page);
      const hud = await collectHudMetrics(page);
      const result = {
        viewport,
        screenshotPath,
        metrics,
        hud,
        errors,
        movementDistance,
        panelClickStartedGesture,
        cameraPanelHiddenOnLoad,
        stanceButtonCount,
        aggressiveStance,
        defensiveAfterRecall,
        cameraPanelVisibleAfterToggle,
        cameraControlDelta: Math.abs(afterCameraControl.camera.position[2] - before.camera.position[2]),
        formationAfter,
        splitPanelCount,
        detachedFormationSelected,
        returnedPanelCount,
        detachedMovementDistance,
        intentMenuVisible,
        roleMenuVisible,
        intentLabelsVisible,
        anchoredMenuPosition,
        nestedMenuPosition,
        diagonalGesture,
        maxMemberDeltaDuringCommandWasd,
      };
      assertResult(result);
      results.push(result);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function readDiagnostics(page) {
  return page.evaluate(() => {
    const game = window.__RPG_GAME__;
    if (!game) {
      throw new Error("Missing RPG game diagnostics hook");
    }

    return game.getDiagnostics();
  });
}

async function collectCanvasMetrics(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      throw new Error("Missing canvas");
    }

    const sample = document.createElement("canvas");
    sample.width = 180;
    sample.height = 120;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Missing sampler context");
    }

    context.drawImage(canvas, 0, 0, sample.width, sample.height);
    const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
    let nonDark = 0;
    let bright = 0;
    const buckets = new Set();

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (a > 0 && luminance > 22) {
        nonDark += 1;
      }
      if (a > 0 && luminance > 95) {
        bright += 1;
      }
      buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
    }

    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      nonDark,
      bright,
      colorBuckets: buckets.size,
    };
  });
}

async function collectHudMetrics(page) {
  return page.evaluate(() => {
    const hud = document.querySelector(".party-panel");
    const mainPanel = document.querySelector('[data-party-group="main"]');
    const text = document.body.innerText;
    const normalizedText = text.toLowerCase();
    return {
      hasHud: hud instanceof HTMLElement && getComputedStyle(hud).display !== "none",
      hasMainPanel: mainPanel instanceof HTMLElement && getComputedStyle(mainPanel).display !== "none",
      formationButtonCount: mainPanel?.querySelectorAll("button[data-formation]").length ?? 0,
      hasParty: normalizedText.includes("party") && normalizedText.includes("tank") && normalizedText.includes("healer"),
      hasEnergyMeter: mainPanel?.querySelectorAll("[data-member-energy-bar]").length === 10,
      hasAbilityStatus: normalizedText.includes("backstab") && normalizedText.includes("healing circle"),
      hasQuest: normalizedText.includes("old gate"),
    };
  });
}

function assertResult(result) {
  const { viewport, metrics, hud, errors, movementDistance } = result;
  const usablePixels = metrics.nonDark > 1400 && metrics.bright > 8 && metrics.colorBuckets > 18;
  const hudOk = hud.hasHud && hud.hasMainPanel && hud.formationButtonCount === 5 && hud.hasParty && hud.hasEnergyMeter && hud.hasAbilityStatus && hud.hasQuest;

  if (!usablePixels) {
    throw new Error(`${viewport.name} canvas looked blank or too flat: ${JSON.stringify(metrics)}`);
  }
  if (!hudOk) {
    throw new Error(`${viewport.name} HUD check failed: ${JSON.stringify(hud)}`);
  }
  if (movementDistance < 1.4) {
    throw new Error(`${viewport.name} WASD movement did not move far enough: ${movementDistance}`);
  }
  if (result.cameraControlDelta < 5) {
    throw new Error(`${viewport.name} camera vertical-angle control did not move the camera: ${result.cameraControlDelta}`);
  }
  if (result.panelClickStartedGesture) {
    throw new Error(`${viewport.name} party-panel click started a gesture`);
  }
  if (!result.cameraPanelHiddenOnLoad || result.cameraPanelVisibleAfterToggle !== 1) {
    throw new Error(`${viewport.name} camera panel toggle did not work`);
  }
  if (result.stanceButtonCount !== 3 || result.aggressiveStance !== "aggressive" || result.defensiveAfterRecall !== "defensive") {
    throw new Error(`${viewport.name} stance or recall controls did not update combat state`);
  }
  if (result.formationAfter.party.formation !== "horizontal-line") {
    throw new Error(`${viewport.name} formation button did not select horizontal-line`);
  }
  if (result.splitPanelCount !== 2 || !result.detachedFormationSelected || result.returnedPanelCount !== 1) {
    throw new Error(`${viewport.name} party split/formation/return flow failed`);
  }
  if (result.detachedMovementDistance < 0.5) {
    throw new Error(`${viewport.name} detached party did not receive WASD movement`);
  }
  if (result.formationAfter.party.memberCount !== 10) {
    throw new Error(`${viewport.name} party did not contain ten members: ${result.formationAfter.party.memberCount}`);
  }
  const roleCounts = result.formationAfter.party.members.reduce((counts, member) => {
    counts[member.role] = (counts[member.role] ?? 0) + 1;
    return counts;
  }, {});
  if (roleCounts.tank !== 2 || roleCounts.melee !== 3 || roleCounts.ranged !== 3 || roleCounts.healer !== 2) {
    throw new Error(`${viewport.name} role counts were incorrect: ${JSON.stringify(roleCounts)}`);
  }
  if (result.intentMenuVisible === 0 || result.roleMenuVisible === 0) {
    throw new Error(`${viewport.name} gesture menus did not open: intent=${result.intentMenuVisible}, role=${result.roleMenuVisible}`);
  }
  if (result.intentLabelsVisible !== 0) {
    throw new Error(`${viewport.name} intent labels remained visible in the role ring`);
  }
  if (
    result.anchoredMenuPosition.left !== result.nestedMenuPosition.left ||
    result.anchoredMenuPosition.top !== result.nestedMenuPosition.top
  ) {
    throw new Error(`${viewport.name} gesture menu moved during selection`);
  }
  if (result.diagonalGesture.input.gesture.role !== null) {
    throw new Error(`${viewport.name} diagonal second-ring gesture selected ${result.diagonalGesture.input.gesture.role}`);
  }
  if (result.maxMemberDeltaDuringCommandWasd > 6) {
    throw new Error(`${viewport.name} a member warped during WASD movement: ${result.maxMemberDeltaDuringCommandWasd}`);
  }
  if (errors.length > 0) {
    throw new Error(`${viewport.name} browser errors: ${errors.join(" | ")}`);
  }
}

async function startDevServer() {
  if (!/^\d+$/.test(port)) {
    throw new Error(`VERIFY_PORT must be numeric, received ${port}`);
  }

  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm.cmd run dev -- --port ${port} --strictPort --force`]
      : ["run", "dev", "--", "--port", port, "--strictPort", "--force"];
  const server = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  server.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before becoming reachable:\n${logs.join("")}`);
    }
    if (await isReachable(url)) {
      return server;
    }
    await delay(250);
  }

  server.kill();
  throw new Error(`Timed out waiting for ${url}:\n${logs.join("")}`);
}

function stopDevServer(server) {
  if (process.platform === "win32" && server.pid) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  server.kill();
}

async function isReachable(targetUrl) {
  try {
    const response = await fetch(targetUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveBrowserPath() {
  const explicit = process.env.PLAYWRIGHT_BROWSER_PATH;
  if (explicit && (await exists(explicit))) {
    return explicit;
  }

  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error("No Chrome/Edge executable found. Set PLAYWRIGHT_BROWSER_PATH to a Chromium-based browser.");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function groundDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
