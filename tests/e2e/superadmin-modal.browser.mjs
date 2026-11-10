// Warning modals replace browser prompts: staff create / reset password / deactivate show what changes and the impact,
// ask the audit reason, and can be cancelled (Esc) without any change.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const skip = chromium ? false : "playwright not installed";
const run = Date.now().toString(36);

test("Staff page: create, reset password and deactivate through warning modals", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}); const errors = []; page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => { errors.push("native dialog: " + d.message()); void d.dismiss(); });
    await page.goto(BASE + "/admin");
    await page.getByLabel(/email/i).first().fill("super_admin@test.local"); await page.getByLabel(/password/i).first().fill("local-test-password-SUPER_ADMIN");
    await page.getByRole("button", {name: /sign in/i}).first().click(); await page.getByRole("heading", {name: "Overview", level: 1}).waitFor();
    await page.goto(BASE + "/admin/staff"); await page.getByRole("heading", {name: "Staff & roles"}).waitFor();
    const email = `modal-${run}@test.local`;
    const add = page.getByRole("region", {name: "Add staff"});
    await add.getByLabel("Email").fill(email); await add.getByRole("combobox", {name: /^Role/}).selectOption("SALES");
    await add.getByLabel("Temporary password (min. 14 characters)").fill("Temporary-Pass-" + run);
    await add.getByRole("button", {name: "Create staff account"}).click();
    const modal = page.getByRole("alertdialog"); await modal.waitFor();
    assert.match(await modal.textContent(), /What will change/); assert.match(await modal.textContent(), /Impact/);
    await modal.getByRole("button", {name: "Yes, create account"}).click();
    await page.getByText("Staff account created for " + email + ".").waitFor();
    const row = page.getByRole("row", {name: new RegExp(email)});
    // Reset password: Esc cancels, then a too-short password keeps the confirm button disabled.
    await row.getByRole("button", {name: "Reset password"}).click(); await modal.waitFor();
    await page.keyboard.press("Escape"); await modal.waitFor({state: "detached"});
    await row.getByRole("button", {name: "Reset password"}).click();
    await modal.getByLabel(/New temporary password/).fill("short");
    await modal.getByLabel(/Reason/).fill("User forgot password");
    assert.equal(await modal.getByRole("button", {name: "Yes, reset password"}).isDisabled(), true);
    await modal.getByLabel(/New temporary password/).fill("Another-Temp-" + run);
    await modal.getByRole("button", {name: "Yes, reset password"}).click(); await page.getByText("Password reset; sessions revoked.").waitFor();
    // Deactivate.
    await row.getByRole("button", {name: "Deactivate"}).click(); await modal.getByLabel(/Reason/).fill("Left the sales team");
    await modal.getByRole("button", {name: "Yes, deactivate"}).click(); await page.getByText("Account deactivated; sessions revoked.").waitFor();
    await row.getByRole("button", {name: "Reactivate"}).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
