// Browser smoke for the P1/P2 screens: invitation accept page (sign-in inline → accept), CMS groups & bulk pages render.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, BASE, MAIL, qp, TEST_PASSWORD} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const db = new PrismaClient();
const run = Date.now().toString(36);
test.after(() => db.$disconnect());
const cookiesFor = c => [...c.jar].map(([name, value]) => ({name, value, url: BASE}));

test("invitation page: preview, inline sign-in, accept → pass; CMS pages render", {skip: !chromium && "playwright not installed"}, async () => {
  const ops = await adminLogin("OPERATIONS");
  await db.event.update({where: {code: "IMDX-2027"}, data: {published: true}});
  const csv = `email,full_name\nbr-${run}@test.local,Browser Invitee\n`;
  const imp = await ops.post("/api/admin/preregistrations", {csv, dryRun: false, reason: "Browser smoke import"});
  assert.equal(imp.status, 200); assert.equal(imp.body.sent, 1, JSON.stringify(imp.body));
  await customerSignup(`br-${run}@test.local`, "Browser Invitee");
  await new Promise(s => setTimeout(s, 300));
  const lines = fs.readFileSync(MAIL, "utf8").trim().split("\n").map(l => JSON.parse(l)).filter(l => l.to.includes(`br-${run}@test.local`));
  const token = lines.map(l => qp(l.body).match(/invitation\?token=([A-Za-z0-9_%-]+)/)?.[1]).filter(Boolean).pop();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    await page.goto(BASE + "/account/invitation?token=" + token);
    await page.getByRole("heading", {name: "You are pre-registered"}).waitFor({timeout: 10000}).catch(async e => { console.log("TOKEN", token, "BODY", (await page.locator("main").innerText().catch(() => "")).slice(0, 400)); throw e; });
    assert.equal(new URL(page.url()).search, "", "token removed from the address bar");
    await page.getByRole("button", {name: "Accept invitation"}).click();
    await page.getByLabel("Email").first().waitFor();
    await page.getByLabel("Email").first().fill(`br-${run}@test.local`);
    await page.getByLabel("Password", {exact: true}).fill(TEST_PASSWORD);
    await page.getByRole("button", {name: /^Sign in/}).click();
    await page.getByRole("heading", {name: "Invitation accepted."}).waitFor({timeout: 15000}).catch(async e => { console.log("BODY2", (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600)); throw e; });
    assert.equal(await db.eventPass.count({where: {account: {email: `br-${run}@test.local`}, status: "ACTIVE"}}), 1);
    const admin = await browser.newContext({viewport: {width: 1280, height: 900}}); await admin.addCookies(cookiesFor(ops));
    const a = await admin.newPage();
    await a.goto(BASE + "/admin/groups"); await a.getByRole("heading", {name: "Groups & representatives"}).waitFor();
    await a.goto(BASE + "/admin/bulk"); await a.getByRole("heading", {name: "Pre-registration & badges"}).waitFor();
    await a.getByText(`br-${run}@test.local`).waitFor();
  } finally { await browser.close(); }
});
