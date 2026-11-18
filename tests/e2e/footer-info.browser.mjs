// Footer (owner prompt 03): company address, TikTok/Instagram/Facebook/LinkedIn icons (inactive until the CMS has the
// official URL — no invented links), and the three existing official WeChat QR images in the reference order.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;

test("footer: address, social icons without invented links, three WeChat QR codes", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    for (const path of ["/", "/exhibitors/", "/news/article/?slug=x"]) for (const width of [320, 375, 430, 768, 1024, 1440]) {
      const page = await browser.newPage({viewport: {width, height: 900}});
      await page.goto(SITE + path);
      const f = page.locator("footer .footer-info");
      assert.equal(await f.locator(".footer-address p").textContent(), "Citra Tower Kemayoran 11C, Jl. Benyamin Suaeb Kav. A6");
      const social = f.locator(".footer-social-link");
      assert.deepEqual(await social.allTextContents(), ["TikTok", "Instagram", "Facebook", "LinkedIn"]);
      assert.deepEqual(await social.evaluateAll(a => a.map(x => x.getAttribute("href"))), [null, null, null, null], "no fabricated or # links");
      assert.deepEqual(await f.locator(".footer-qr figcaption").allTextContents(), ["Exhibition Official WeChat QR Code", "WeChat", "Group Official WeChat QR Code"]);
      const srcs = await f.locator(".footer-qr img").evaluateAll(i => i.map(x => x.getAttribute("src")));
      assert.deepEqual(srcs, ["/assets/exhibition-wechat-qr.png", "/assets/wechat-qr.png", "/assets/group-wechat-qr.png"]);
      await f.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.querySelectorAll(".footer-qr img")].every(i => i.complete && i.naturalWidth > 0));
      const sizes = await f.locator(".footer-qr-image").evaluateAll(e => e.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      for (const [w, h] of sizes) { assert.ok(Math.abs(w - h) <= 1, "square QR card"); assert.ok(w >= 120, `QR big enough to scan at ${width}: ${w}px`); }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll ${path}@${width}`);
      assert.equal(await page.locator("footer .footer-line a").last().textContent(), "BACK TO TOP ↑", "existing footer content kept");
      await page.close();
    }
    // Once the organizer saves an official URL in the CMS, the icon becomes a safe external link.
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    await page.goto(SITE + "/");
    await page.evaluate(() => window.IMDX_applyCmsFields({"site-footer.15": {text: "Instagram", mode: "plain", href: "https://www.instagram.com/example-official"}}));
    const ig = page.locator('.footer-social-link[data-social="instagram"]');
    assert.equal(await ig.getAttribute("href"), "https://www.instagram.com/example-official");
    assert.equal(await ig.getAttribute("target"), "_blank"); assert.equal(await ig.getAttribute("rel"), "noopener noreferrer");
    await page.evaluate(() => window.IMDX_applyCmsFields({"site-footer.14": {text: "TikTok", mode: "plain", href: "javascript:alert(1)"}}));
    assert.equal(await page.locator('.footer-social-link[data-social="tiktok"]').getAttribute("href"), null, "unsafe URL ignored");
    await page.close();
  } finally { await browser.close(); }
});
