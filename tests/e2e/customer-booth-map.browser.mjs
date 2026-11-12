// Customer booth picker draws booths the same way as the public floorplan: CMS category colour for available booths,
// status colours for booked ones, the same legend, and a selected state for chosen preferences.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const skip = !chromium ? "playwright not installed" : false;
const db = new PrismaClient();
const run = Date.now().toString(36);
let planId = null, OPS = null;
test.after(async () => {
  if (planId && OPS) {
    await OPS.post(`/api/admin/floorplans/${planId}/activation`, {active: false, reason: "E2E cleanup customer map"}).catch(() => {});
    const del = await OPS.del(`/api/admin/floorplans/${planId}`, {reason: "E2E cleanup customer map"}).catch(() => null);
    if (!del || del.status !== 200) await db.floorplan.delete({where: {id: planId}}).catch(() => {});
  }
  await db.$disconnect();
});

test("customer booth picker matches the public map style", {skip}, async () => {
  const SA = await adminLogin("SUPER_ADMIN"); OPS = await adminLogin("OPERATIONS");
  assert.equal((await SA.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E customer map"})).status, 200);
  const d = await OPS.post("/api/admin/floorplans", {title: "Customer map " + run, newFloor: true}); assert.equal(d.status, 201); planId = d.body.plan.id;
  let plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  const unit = (code, x) => ({code, category: "Standard", x, y: 20, w: 60, h: 60, areaSqm: 9});
  assert.equal((await OPS.put(`/api/admin/floorplans/${planId}/units`, {rowVersion: plan.rowVersion, units: [unit("CM1", 20), unit("CM2", 100), unit("CM3", 180)]})).status, 200);
  plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  assert.equal((await OPS.post(`/api/admin/floorplans/${planId}/publish`, {rowVersion: plan.rowVersion})).status, 200);
  plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  const occ = plan.units.find(u => u.code === "CM2").id;
  assert.equal((await OPS.put(`/api/admin/floorplans/${planId}/units/${occ}/occupant`, {company: "PT Map Test", status: "OCCUPIED", reason: "E2E occupant entry"})).status, 200);

  const C = await customerSignup(`cmap-${run}@example.test`, "Map Tester");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    await ctx.addCookies([...C.jar].map(([name, value]) => ({name, value, url: BASE})));
    const fillOf = (page, scope, code) => page.locator(`${scope} g[role="button"][aria-label^="${code},"] rect`).getAttribute("fill");
    const pubPlan = await (await fetch(`${BASE}/api/public/floorplan?floor=${planId}`)).json();
    const cm1 = pubPlan.units.find(u => u.code === "CM1");
    const page = await ctx.newPage(); await page.goto(BASE + "/account?tab=booth#booth");
    if ((await page.locator('.seg.floor-switch button', {hasText: "Customer map " + run}).count())) await page.locator('.seg.floor-switch button', {hasText: "Customer map " + run}).click();
    const map = 'svg[aria-label="Available booth preferences"]';
    await page.locator(`${map} g[role="button"][aria-label^="CM1,"]`).waitFor();
    assert.equal((await fillOf(page, map, "CM1")).toLowerCase(), (cm1.categoryColor ? "#" + cm1.categoryColor.replace("#", "") : "#A9D4F5").toLowerCase(), "available booth uses its CMS category colour");
    assert.equal(await fillOf(page, map, "CM2"), "#5B6472", "occupied booth uses the public status colour");
    assert.equal(await page.locator(`${map} rect[fill="#fff3e9"]`).count(), 0, "no flat background block");
    assert.ok(await page.locator(".fp-legend .fp-chip", {hasText: "Standard"}).count() >= 1, "category legend");
    assert.ok(await page.locator(".fp-legend .fp-chip", {hasText: "Your selection"}).count() === 1, "selection legend");
    await page.locator(`${map} g[aria-label^="CM1,"]`).click();
    assert.equal(await page.locator(`${map} g[aria-label^="CM1,"]`).getAttribute("aria-pressed"), "true");
    await page.locator(`${map} g[aria-label^="CM2,"]`).click();
    assert.equal(await page.locator(`${map} g[aria-label^="CM2,"]`).getAttribute("aria-pressed"), "false", "booked booth cannot be chosen");
    assert.match(await page.locator("text=preferred booth(s) selected").innerText(), /^1 preferred/);
    // One view at a time: the map hides the list, the list hides the map; the selection carries over.
    assert.equal(await page.locator(".booth-choice-list").count(), 0, "map view has no list");
    await page.getByRole("button", {name: "Booth list"}).click();
    assert.equal(await page.locator(map).count(), 0, "list view has no map");
    assert.equal(await page.locator(".booth-choice", {hasText: "CM1"}).getAttribute("aria-pressed"), "true", "selection kept");
    const sel = page.locator(".booth-choice.is-selected").first();
    const [bg, fg] = await sel.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
    assert.notEqual(bg, fg, "selected card text is readable"); assert.notEqual(bg, "rgb(255, 255, 255)", "selected card is highlighted");
    await page.getByRole("button", {name: "Floor map"}).click();
    assert.equal(await page.locator(`${map} g[aria-label^="CM1,"]`).getAttribute("aria-pressed"), "true");
  } finally { await browser.close(); }
});
