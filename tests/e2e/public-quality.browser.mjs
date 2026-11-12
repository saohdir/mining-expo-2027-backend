// NFR-01 (no horizontal scroll at 360 px) and NFR-02 basics (lang, one h1, alt text, named controls, labelled inputs)
// on every public page of the static site, plus /account.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const PAGES = ["/", "/about/", "/about-organizer/", "/contact/", "/exhibition/", "/exhibitors/", "/highlights/", "/news/", "/partners/", "/privacy/", "/programme/", "/terms/", "/the-venue/", "/visitors/"];

test("public pages: 360 px without horizontal scroll and basic accessibility", {skip}, async () => {
  const browser = await chromium.launch();
  const problems = [];
  try {
    const ctx = await browser.newContext({viewport: {width: 360, height: 780}});
    for (const path of [...PAGES.map(p => SITE + p), BASE + "/account"]) {
      const page = await ctx.newPage();
      await page.goto(path, {waitUntil: "load"}); await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const name = el => (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim() || (el.querySelector("img[alt]")?.getAttribute("alt") || "").trim();
        const visible = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0; };
        const labelled = el => el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.type === "hidden" || el.type === "submit";
        return {overflow: document.documentElement.scrollWidth - window.innerWidth, lang: document.documentElement.lang,
          h1: [...document.querySelectorAll("h1")].filter(visible).length,
          noAlt: [...document.querySelectorAll("img:not([alt])")].map(i => i.getAttribute("src")).slice(0, 3),
          unnamed: [...document.querySelectorAll("a[href],button")].filter(visible).filter(e => !name(e)).map(e => e.outerHTML.slice(0, 80)).slice(0, 3),
          unlabelled: [...document.querySelectorAll("input,select,textarea")].filter(visible).filter(e => !labelled(e)).map(e => e.outerHTML.slice(0, 80)).slice(0, 3)};
      });
      if (r.overflow > 1) problems.push(`${path}: horizontal overflow ${r.overflow}px`);
      if (!r.lang) problems.push(`${path}: missing html lang`);
      if (r.h1 !== 1) problems.push(`${path}: ${r.h1} visible h1`);
      if (r.noAlt.length) problems.push(`${path}: images without alt ${r.noAlt.join(", ")}`);
      if (r.unnamed.length) problems.push(`${path}: controls without accessible name ${r.unnamed.join(" | ")}`);
      if (r.unlabelled.length) problems.push(`${path}: inputs without label ${r.unlabelled.join(" | ")}`);
      await page.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(problems, []);
});
