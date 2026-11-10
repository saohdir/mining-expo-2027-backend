// Auth modal polish: logo, compact popup that fits its content, accessible show/hide password toggle, single error message.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;

test("auth popup: compact height, logo, eye toggle, one error per problem", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(SITE + "/"); await page.locator('[data-cms-f="site-header.22"]').click(); await page.locator(".auth-popup.is-ready").waitFor();
    const f = page.frameLocator(".auth-popup iframe");
    await f.getByRole("heading", {name: "Sign in."}).waitFor();
    assert.ok(await f.locator(".imdx-auth-brand img").count(), "IMDX logo");
    await page.waitForTimeout(300);
    const h = await page.locator(".auth-popup iframe").evaluate(el => el.getBoundingClientRect().height);
    const content = await page.locator(".auth-popup iframe").evaluate(el => el.contentDocument.querySelector(".auth-embed").getBoundingClientRect().height);
    assert.ok(Math.abs(h - content) <= 12, `popup height follows its content (iframe ${h}, content ${content})`);
    const pw = f.getByLabel("Password", {exact: true});
    assert.equal(await pw.getAttribute("type"), "password");
    await f.getByRole("button", {name: "Show password"}).click();
    assert.equal(await pw.getAttribute("type"), "text");
    assert.equal(await f.getByRole("button", {name: "Hide password"}).getAttribute("aria-pressed"), "true");
    await f.getByRole("button", {name: /Forgot password/}).click(); await f.getByRole("heading", {name: "Forgot password."}).waitFor();
    await f.getByRole("button", {name: "Send reset link"}).click();
    await f.locator(".field-error").first().waitFor();
    assert.equal(await f.locator(".imdx-auth-msg.is-error").count(), 0, "field error is not repeated in a second box");
    await f.getByRole("button", {name: "Back to sign in"}).click(); await f.getByRole("button", {name: "Create an account"}).click();
    await f.getByRole("checkbox", {name: /Terms/}).waitFor(); await f.getByRole("link", {name: "Privacy Policy"}).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
