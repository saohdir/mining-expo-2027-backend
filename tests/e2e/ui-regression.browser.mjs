// Browser checks: editor resize handle (FR-093), customer hub + action banners (FR-117/119/029),
// scanner result & offline fail-closed states (FR-084/088, AT-088).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE, lastOtp, lastLink} from "./lib.mjs";
import {PrismaClient} from "@prisma/client";
const db = new PrismaClient();
let ev = null;
test.after(async () => { if (ev) await db.event.update({where: {id: ev.id}, data: {published: ev.published, visitorOpen: ev.visitorOpen}}); await db.$disconnect(); });
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const skip = chromium ? false : "playwright not installed";
const run = Date.now().toString(36);
const adminPage = async (browser, role, viewport = {width: 1280, height: 900}) => {
  const page = await browser.newPage({viewport});
  await page.goto(BASE + "/admin");
  await page.getByLabel(/email/i).first().fill(role.toLowerCase() + "@test.local");
  await page.getByLabel(/password/i).first().fill("local-test-password-" + role);
  await page.getByRole("button", {name: /sign in|log in|masuk/i}).first().click();
  await page.waitForResponse(r => r.url().includes("/api/admin/auth/login"));
  return page;
};

test("FR-093 resize handle changes unit size and marks the draft unsaved", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await adminPage(browser, "OPERATIONS");
    await page.goto(BASE + "/admin/floorplans");
    await page.getByLabel("New draft title").first().fill("Resize " + run);
    await page.getByRole("button", {name: "Create draft version"}).click();
    await page.getByLabel("Editable booth floorplan").waitFor();
    await page.getByRole("button", {name: "+ Add booth unit"}).click();
    const handle = page.getByTestId("resize-handle");
    await handle.waitFor();
    await handle.scrollIntoViewIfNeeded();
    const before = await page.getByLabel("w", {exact: true}).inputValue();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + 6, box.y + 6); await page.mouse.down(); await page.mouse.move(box.x + 60, box.y + 40, {steps: 5}); await page.mouse.up();
    const after = await page.getByLabel("w", {exact: true}).inputValue();
    assert.ok(Number(after) > Number(before), `width grew ${before} → ${after}`);
    await page.getByText("Unsaved layout edits").waitFor();
    await handle.focus(); await page.keyboard.press("ArrowRight");
    assert.equal(Number(await page.getByLabel("w", {exact: true}).inputValue()), Number(after) + 10, "keyboard resize");
  } finally { await browser.close(); }
});

test("FR-117/119/029 customer hub: OTP sign-in, three journeys, action banners, registration reference", {skip}, async () => {
  // Self-contained: the hub needs a published event with visitor registration open.
  ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true}});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const email = `hub-${run}@test.local`;
    // CR-AUTH-01 registration: details → email OTP → create password → dashboard (no OTP for sign-in).
    await page.goto(BASE + "/account?signup=1");
    await page.getByLabel("Full name").fill("Hub Tester");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("checkbox", {name: /Terms/}).check();
    await page.getByRole("checkbox", {name: /Privacy/}).check();
    await page.getByRole("button", {name: /Create account & send code/}).click();
    await page.getByLabel("Verification code").waitFor();
    assert.match(await page.getByRole("timer").textContent(), /Code expires in [45]:\d\d/);
    await new Promise(r => setTimeout(r, 400));
    await page.getByLabel("Verification code").fill(lastOtp(email));
    await page.getByRole("button", {name: "Verify code"}).click();
    await page.getByLabel("Password", {exact: true}).fill("Tambang2027x");
    await page.getByLabel("Confirm password").fill("Tambang2027y");
    assert.equal(await page.getByRole("button", {name: "Create password"}).isDisabled(), true, "mismatch blocks submit");
    await page.getByLabel("Confirm password").fill("Tambang2027x");
    await page.getByRole("button", {name: "Create password"}).click();
    await page.getByRole("button", {name: "Go to my dashboard"}).click();
    await page.getByRole("heading", {name: "Event experience"}).waitFor();
    for (const t of ["Visit exhibition", "Join conference", "Reserve booth"]) await page.getByRole("heading", {name: t}).waitFor();
    await page.getByRole("region", {name: "Action needed"}).getByText("Add your company to your profile.").waitFor();
    await page.getByRole("tab", {name: "Exhibition visitor", exact: true}).click();
    // Participant details: salutation, job, company (email from sign-up), WhatsApp verified by OTP.
    const register = page.getByRole("button", {name: "Register as exhibition visitor"});
    assert.equal(await register.isDisabled(), true, "registration waits for participant details");
    await page.getByLabel("Salutation").selectOption("IBU");
    await page.getByLabel("Job title / occupation").fill("Procurement Lead");
    await page.getByLabel("Company").fill("PT Hub Tester");
    assert.equal(await page.getByLabel("Email (from your sign-up)").inputValue(), email);
    await page.getByRole("button", {name: "Save details"}).click();
    await page.getByRole("button", {name: "Saved ✓"}).waitFor();
    const phone = "0812" + String(Date.now()).slice(-8);
    await page.getByLabel("Number").fill(phone);
    await page.getByRole("radio", {name: "WhatsApp"}).check();
    await page.getByRole("button", {name: "Send code"}).click();
    await page.getByLabel("6-digit code").waitFor();
    await new Promise(r => setTimeout(r, 300));
    await page.getByLabel("6-digit code").fill(lastOtp("62" + phone.slice(1) + "@whatsapp.uat.invalid"));
    await page.getByRole("button", {name: "Verify"}).click();
    await page.getByText("verified ✓").first().waitFor();
    const reg = page.waitForResponse(r => r.url().endsWith("/api/customer/registrations") && r.request().method() === "POST");
    await register.click();
    const body = await (await reg).json();
    assert.ok(body.id, "registration reference returned");
    await page.getByAltText(/Personal entry QR pass/).waitFor({timeout: 10000});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "no horizontal scroll at 390px");
  } finally { await browser.close(); }
});

test("FR-084/088 AT-088 scanner shows server decision text and fails closed when offline", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    // Super Admin: the Operations account was rate-limited by the FR-086 guessing test.
    const ops = await adminPage(browser, "SUPER_ADMIN");
    const g = await ops.request.post(BASE + "/api/admin/gates", {data: {code: "UI" + run, name: "UI gate", zones: ["EXPO_ENTRY"]}});
    assert.equal(g.status(), 201);
    await ops.goto(BASE + "/admin/check-in");
    await ops.getByLabel("Assigned admission gate").selectOption("UI" + run);
    await ops.getByLabel("Access zone").selectOption("EXPO_ENTRY");
    await ops.getByLabel(/Manual pass code/).fill("ZZZZZ-ZZZZZ");
    await ops.getByRole("button", {name: "Validate with server"}).click();
    await ops.getByText(/INVALID|Invalid QR/).first().waitFor();
    await ops.route("**/api/admin/check-in/scan", r => r.abort("internetdisconnected"));
    await ops.getByLabel(/Manual pass code/).fill("YYYYY-YYYYY");
    await ops.getByRole("button", {name: "Validate with server"}).click();
    const alert = ops.locator(".cms-scan-offline"); // (Next.js route announcer is also role=alert)
    await alert.waitFor();
    assert.match(await alert.textContent(), /no entry decision|Connection|offline/i);
    assert.ok(!(await ops.getByText("Admission confirmed").count()), "no fabricated acceptance");
  } finally { await browser.close(); }
});

test("CR-AUTH-01 browser: sign in with password, forgot password → reset page → sign in with new password", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const email = `hub-${run}@test.local`;
    await page.goto(BASE + "/account");
    await page.getByRole("button", {name: "Sign out"}).click().catch(() => {});
    await page.goto(BASE + "/account");
    await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", {exact: true}).fill("WrongPass2027");
    await page.getByRole("button", {name: "Sign in"}).click();
    await page.getByText("Email or password is incorrect.").waitFor();
    await page.getByRole("button", {name: "Forgot password?"}).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", {name: "Send reset link"}).click();
    await page.getByRole("heading", {name: "Check your email."}).waitFor();
    await new Promise(r => setTimeout(r, 400));
    await page.goto(BASE + "/account/reset-password?token=" + encodeURIComponent(lastLink(email)));
    await page.getByRole("heading", {name: "Choose a new password."}).waitFor();
    assert.equal(new URL(page.url()).search, "", "token removed from the address bar");
    await page.getByLabel("Password", {exact: true}).fill("Renewed2027pw"); await page.getByLabel("Confirm password").fill("Renewed2027pw");
    await page.getByRole("button", {name: "Save password"}).click();
    await page.getByRole("heading", {name: "Password updated."}).waitFor();
    await page.goto(BASE + "/account");
    await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", {exact: true}).fill("Renewed2027pw");
    await page.getByRole("button", {name: "Sign in"}).click();
    await page.getByRole("heading", {name: "Event experience"}).waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "no horizontal scroll");
  } finally { await browser.close(); }
});
