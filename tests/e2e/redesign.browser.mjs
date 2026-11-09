// CMS/portal redesign (Nov 2026): one navigation without duplicates, breadcrumb, Ctrl+K search, list toolkit (sort in URL,
// filter chips, record drawer with Esc, bulk bar), invoice customer picker; customer portal navigation, preparation
// checklist, documents and the phone bottom bar with the QR pass shortcut. No horizontal scroll at 390 px.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE, customerSignup, TEST_PASSWORD} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const skip = chromium ? false : "playwright not installed";
const run = Date.now().toString(36);
const adminPage = async (browser, role, viewport = {width: 1440, height: 900}) => {
  const page = await browser.newPage({viewport});
  await page.goto(BASE + "/admin");
  await page.getByLabel(/email/i).first().fill(role.toLowerCase() + "@test.local");
  await page.getByLabel(/password/i).first().fill("local-test-password-" + role);
  await page.getByRole("button", {name: /sign in|log in|masuk/i}).first().click();
  await page.getByRole("heading", {name: "Overview", level: 1}).waitFor();
  return page;
};

test("CMS: navigation, breadcrumb, quick search, lists, drawer, picker", {skip}, async () => {
  const name = `Drawer Tester ${run}`;
  await customerSignup(`dr-${run}@test.local`, name);
  const browser = await chromium.launch();
  try {
    const page = await adminPage(browser, "SUPER_ADMIN"); const errors = []; page.on("pageerror", e => errors.push(e.message));
    const nav = page.getByRole("navigation", {name: "CMS sections"});
    const hrefs = await nav.locator("a").evaluateAll(as => as.map(a => a.getAttribute("href")));
    assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate menu entries: " + hrefs.join(" "));
    assert.equal(await nav.getByRole("link", {name: "Audit log"}).count(), 0, "settings collapsed by default");
    await nav.getByRole("button", {name: /Settings/}).click(); await nav.getByRole("link", {name: "Audit log"}).waitFor();
    // Ctrl+K focuses the CMS search.
    await page.locator("body").click(); await page.keyboard.press("Control+k");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Search CMS");
    // Customers: one breadcrumb, sort and search in the URL, chip, drawer with Esc.
    await page.goto(BASE + "/admin/customers"); await page.getByRole("table").locator("tbody tr").first().waitFor();
    assert.equal(await page.getByRole("navigation", {name: "Breadcrumb"}).count(), 1);
    assert.equal((await page.getByRole("navigation", {name: "Breadcrumb"}).textContent()).replace(/\s+/g, " "), "IMDX CMSPeopleCustomers");
    await page.getByRole("button", {name: /^Customer/}).click(); await page.waitForURL(/sort=name%3Adesc|sort=name:desc/);
    await page.getByLabel("Search name, email, company or id").fill(run); await page.keyboard.press("Enter");
    await page.getByText("Search: " + run).waitFor();
    await page.getByRole("button", {name: "Open " + name}).click();
    const drawer = page.getByRole("dialog", {name}); await drawer.waitFor(); assert.match(page.url(), /[?&]id=/);
    await page.keyboard.press("Escape"); await drawer.waitFor({state: "detached"}); assert.doesNotMatch(page.url(), /[?&]id=/);
    await page.getByRole("button", {name: "Remove filter Search: " + run}).click(); await page.waitForURL(u => !u.search.includes("q="));
    // Registrations: selecting a row shows the bulk bar.
    await page.goto(BASE + "/admin/registrations?status=SUBMITTED"); await page.getByRole("table").waitFor();
    const box = page.locator("tbody input[type=checkbox]").first();
    if (await box.count()) { await box.check(); await page.getByRole("region", {name: "Bulk actions"}).getByRole("button", {name: "Export selected (CSV)"}).waitFor(); }
    // Invoice form: customer picker instead of raw IDs.
    await page.goto(BASE + "/admin/workspace?section=finance"); await page.getByRole("heading", {name: "Invoices & payment requests"}).waitFor();
    await page.getByRole("combobox", {name: "Customer"}).fill(run);
    await page.getByRole("option", {name: new RegExp(name)}).click();
    await page.getByText("Change customer").waitFor(); await page.getByLabel("Booking to invoice").waitFor();
    assert.equal(await page.getByRole("button", {name: "Save draft"}).isDisabled(), true, "needs a booking first");
    // Tablet (1024): full sidebar labels stay visible.
    const tab = await adminPage(browser, "FINANCE", {width: 1024, height: 800});
    assert.ok(await tab.getByRole("navigation", {name: "CMS sections"}).getByRole("link", {name: "Payments"}).isVisible());
    assert.equal(await tab.getByRole("navigation", {name: "CMS sections"}).getByRole("link", {name: "Pages & layout"}).count() > 0, true);
    assert.equal(await tab.getByRole("navigation", {name: "CMS sections"}).getByRole("link", {name: "Staff & roles"}).count(), 0, "role filter unchanged");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("Portal: navigation, checklist, documents, phone bottom bar", {skip}, async () => {
  const email = `portal-${run}@test.local`; const c = await customerSignup(email, "Portal Tester");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}}); await ctx.addCookies([...c.jar].map(([n, v]) => ({name: n, value: v, url: BASE})));
    const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(BASE + "/account");
    const tabs = page.getByRole("tablist", {name: "Account sections"});
    assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["Home", "My pass", "Conferences", "Booth", "Invoices", "Documents", "Profile"]);
    await page.getByRole("heading", {name: "Event experience"}).waitFor();
    await page.getByRole("progressbar", {name: "Event preparation progress"}).waitFor();
    await page.getByRole("heading", {name: "Recent updates"}).waitFor();
    await page.getByRole("button", {name: /Get my QR pass|Show my QR pass/}).click(); await page.getByRole("heading", {name: "My pass"}).waitFor();
    await tabs.getByRole("tab", {name: "Documents"}).click(); await page.getByRole("heading", {name: "Documents", level: 2}).waitFor();
    await page.getByText(/No documents yet|Invoice /).first().waitFor();
    await page.goto(BASE + "/account?tab=payments"); await page.getByRole("heading", {name: "Invoices"}).waitFor();
    assert.equal(await page.getByText("Midtrans").count(), 0, "no internal wording for customers");
    // Phone: sidebar hidden, bottom bar with the pass shortcut, no sideways scroll.
    const phone = await browser.newContext({viewport: {width: 390, height: 844}}); await phone.addCookies([...c.jar].map(([n, v]) => ({name: n, value: v, url: BASE})));
    const m = await phone.newPage(); await m.goto(BASE + "/account");
    const bar = m.getByRole("navigation", {name: "Quick navigation"}); await bar.waitFor();
    assert.equal(await m.getByRole("tablist", {name: "Account sections"}).isVisible(), false);
    await bar.getByRole("button", {name: "My pass"}).click(); await m.getByRole("heading", {name: "My pass"}).waitFor();
    assert.ok(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, "no horizontal scroll");
    await m.getByRole("button", {name: "Sign out"}).click(); await m.getByLabel("Email address").waitFor();
    void TEST_PASSWORD; assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
