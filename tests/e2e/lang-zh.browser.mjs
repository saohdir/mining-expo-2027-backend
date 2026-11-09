// CR-LANG-01 / FR-011: Simplified Chinese under /zh/ (prepared translations applied by scripts/apply-site-content.ts),
// language switch, hreflang/canonical, English untouched; legal drafts EN + ZH (FR-012).
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {adminLogin} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const PAGES = ["home", "about", "contact", "exhibition", "exhibitors", "highlights", "news", "partners", "privacy", "programme", "terms", "the-venue", "visitors", "site"];

test("Chinese site under /zh/, switch, SEO tags, legal drafts", {skip}, async () => {
  execFileSync("npx", ["tsx", "scripts/apply-site-content.ts", "--confirm", "--publish"], {stdio: "pipe", env: process.env});
  const SA = await adminLogin("SUPER_ADMIN");
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
    await page.goto(SITE + "/zh/");
    await page.waitForFunction(() => document.documentElement.dataset.cmsLayout === "published", null, {timeout: 10000});
    assert.equal(await page.evaluate(() => document.documentElement.lang), "zh-Hans");
    await page.getByText("印度尼西亚矿山开采、矿物加工、先进技术与下游工业解决方案的重要商务盛会。").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-cms-site="header"] a')].some(a => a.textContent === "联系我们"), null, {timeout: 10000});
    assert.match(await page.locator('link[rel="canonical"]').getAttribute("href"), /\/zh\/$/);
    assert.equal(await page.locator('link[hreflang="zh-Hans"]').count(), 1);
    assert.match(await page.title(), /展览会/);
    const about = await page.locator('[data-cms-site="header"] a', {hasText: "展会概览"}).first().getAttribute("href");
    assert.ok(/^(\/zh\/|about\/)/.test(about), "relative or /zh links keep the visitor in Chinese: " + about);
    await page.locator(".lang-switch button[lang=\"en\"]").click();
    await page.waitForURL(u => !u.pathname.startsWith("/zh"));
    await page.getByText("A major business gathering for mining extraction", {exact: false}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    const en = await (await browser.newContext()).newPage();
    await en.goto(SITE + "/privacy/");
    await en.getByRole("heading", {name: "5. How long we keep data"}).waitFor({timeout: 10000});
    const zp = await (await browser.newContext()).newPage();
    await zp.goto(SITE + "/zh/terms/");
    await zp.getByRole("heading", {name: "3. 取消与退款"}).waitFor({timeout: 10000});
    await zp.getByRole("heading", {name: "7. 责任与适用法律"}).waitFor();
  } finally {
    await browser.close();
    for (const k of PAGES) for (const loc of ["zh", "en"]) await SA.post(`/api/admin/pages/${k}/rollback?locale=${loc}`, {version: 0, reason: "Restore design after zh test"});
  }
});
