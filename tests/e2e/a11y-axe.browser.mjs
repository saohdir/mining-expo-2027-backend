// NFR-02: automated WCAG 2.x A/AA audit (axe-core) of every public page in English and Chinese, plus /account.
// Fails on "serious" or "critical" violations; moderate/minor ones are printed for follow-up.
import {test} from "node:test";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import fs from "node:fs";
import {BASE} from "./lib.mjs";
const require = createRequire(import.meta.url);
let chromium = null;
try { ({chromium} = require("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const PAGES = ["/", "/about/", "/contact/", "/exhibition/", "/exhibitors/", "/highlights/", "/news/", "/partners/", "/privacy/", "/programme/", "/programme/mining-downstream-industry-green-mining/", "/terms/", "/the-venue/", "/visitors/"];

test("axe-core WCAG 2.x A/AA: no serious or critical violations", {skip, timeout: 240000}, async () => {
  const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  execFileSync("npx", ["tsx", "scripts/seed-programmes.ts", "--confirm"], {stdio: "pipe", env: process.env}); // programme detail page exists
  const browser = await chromium.launch();
  const serious = [], other = new Map();
  try {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: "reduce"});
    for (const url of [...PAGES.map(p => SITE + p), ...PAGES.map(p => SITE + "/zh" + p), BASE + "/account"]) {
      const page = await ctx.newPage();
      await page.goto(url, {waitUntil: "load"}); await page.waitForTimeout(900);
      await page.addScriptTag({content: axe});
      const res = await page.evaluate(async () => (await window.axe.run(document, {runOnly: {type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]}})).violations
        .map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ")})));
      for (const v of res) {
        if (v.impact === "serious" || v.impact === "critical") serious.push(`${url.replace(SITE, "").replace(BASE, "")} ${v.id} (${v.impact}, ${v.n}×) e.g. ${v.sample}`);
        else other.set(v.id, (other.get(v.id) || 0) + v.n);
      }
      await page.close();
    }
  } finally { await browser.close(); }
  if (other.size) console.log("axe moderate/minor:", JSON.stringify(Object.fromEntries(other)));
  assert.deepEqual(serious, []);
});
