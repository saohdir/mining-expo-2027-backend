// Browser regression for the CMS Floorplan editor (the PR #5 redesign regression):
// login → create draft → canvas auto-opens → add 3 units → drag → edit props →
// Save units → reload → geometry persisted. Run via scripts/e2e-local.sh.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
// Playwright is provided by the test machine (not a project dependency).
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped below */ }
import {BASE} from "./lib.mjs";

const SHOTS = process.env.E2E_SHOTS || "/tmp/imdx-e2e";
const run = Date.now().toString(36);

test("floorplan editor: create, draw, drag, save and reload (desktop + mobile)", {skip: chromium ? false : "playwright not installed"}, async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of [{name: "desktop", width: 1440, height: 900}, {name: "mobile", width: 390, height: 844}]) {
      const page = await browser.newPage({viewport: {width: vp.width, height: vp.height}});
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(BASE + "/admin");
      await page.getByLabel(/email/i).first().fill("operations@test.local");
      await page.getByLabel(/password/i).first().fill("local-test-password-OPERATIONS");
      await page.getByRole("button", {name: /sign in|log in|masuk/i}).first().click();
      await page.waitForResponse(r => r.url().includes("/api/admin/auth/login"));
      await page.goto(BASE + "/admin/floorplans");
      const title = "Browser " + vp.name + " " + run;
      await page.getByLabel("New draft title").first().fill(title);
      await page.getByRole("button", {name: "Create draft version"}).click();
      const canvas = page.getByLabel("Editable booth floorplan");
      await canvas.waitFor({timeout: 15000});
      const add = page.getByRole("button", {name: "+ Add booth unit"});
      for (let i = 0; i < 3; i++) await add.click();
      const booths = canvas.locator("rect, [data-unit], .booth");
      assert.ok(await booths.count() >= 3, vp.name + ": 3 booths rendered, got " + await booths.count());
      // Drag the first unit by 60px.
      const box = await booths.first().boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, {steps: 6});
      await page.mouse.up();
      await page.getByText("Unsaved layout edits").waitFor();
      await page.screenshot({path: `${SHOTS}/floorplan-${vp.name}-edited.png`, fullPage: true});
      const save = page.getByRole("button", {name: /^Save \d+ booth units$/});
      assert.equal(await save.textContent(), "Save 3 booth units");
      const saved = page.waitForResponse(r => r.url().includes("/units") && r.request().method() === "PUT");
      await save.click();
      assert.equal((await saved).status(), 200, vp.name + ": PUT units");
      await page.getByText("Unsaved layout edits").waitFor({state: "detached", timeout: 10000});
      // Reload and reopen: geometry must persist from the server.
      await page.reload();
      await page.getByRole("button", {name: new RegExp(title)}).first().click().catch(() => {});
      await canvas.waitFor({timeout: 15000});
      await page.waitForTimeout(500);
      assert.ok(await booths.count() >= 3, vp.name + ": booths persisted after reload, got " + await booths.count());
      // Save again after reload (owner report: loaded booths carry read-only fields and every second save failed with 400).
      await canvas.locator('g[role="button"]').first().click();
      const xField = page.getByLabel("x", {exact: true}); await xField.fill(String(Number(await xField.inputValue()) + 5));
      const again = page.waitForResponse(r => r.url().includes("/units") && r.request().method() === "PUT");
      await page.getByRole("button", {name: /^Save \d+ booth units$/}).click();
      assert.equal((await again).status(), 200, vp.name + ": second save of loaded booths");
      await page.screenshot({path: `${SHOTS}/floorplan-${vp.name}-reloaded.png`, fullPage: true});
      assert.deepEqual(errors, [], vp.name + " page errors");
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("AT-091/092 public floorplan viewer: 360px without horizontal scroll, accessible units, zoom, list fallback", {skip: chromium ? false : "playwright not installed"}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 360, height: 780}});
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(BASE + "/floorplan");
    const coming = page.getByText("Floorplan coming soon");
    const map = page.getByRole("group", {name: /Booth map/});
    await Promise.race([coming.waitFor(), map.waitFor()]);
    if (await coming.isVisible()) return; // honest empty state (AT-092)
    const units = map.getByRole("button");
    assert.ok(await units.count() > 0, "units rendered as focusable buttons");
    assert.match(await units.first().getAttribute("aria-label"), /square metres, (Available|Reserved|Unavailable|occupied by|Occupied)/);
    await page.getByRole("button", {name: "Zoom in"}).click();
    assert.match(await page.getByText(/Zoom \d+%/).textContent(), /150%/);
    await page.getByRole("button", {name: "Show list view"}).click();
    await page.getByRole("table").waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({path: `${SHOTS}/public-floorplan-360.png`, fullPage: true});
    assert.ok(overflow <= 1, "no horizontal page scroll, overflow=" + overflow);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
