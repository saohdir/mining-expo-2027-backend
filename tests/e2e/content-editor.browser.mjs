// CMS → Website Content: block editor for News (slash menu, markdown shortcuts, preview), image upload without alt/rights
// first, publish guidance instead of silent failures, and PDF upload for Downloads.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const skip = chromium ? false : "playwright not installed";
const SITE = process.env.E2E_SITE_URL, SHOTS = process.env.E2E_SHOTS_DIR;
const db = new PrismaClient();
const run = Date.now().toString(36);
test.after(async () => { await db.contentItem.deleteMany({where: {slug: {startsWith: "ed-" + run}}}); await db.$disconnect(); });

test("News block editor → publish guidance → public article; Downloads PDF upload", {skip}, async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({create: {width: 1200, height: 600, channels: 3, background: "#c2410c"}}).png().toBuffer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 1000}}); const errors = []; page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => { errors.push("native dialog: " + d.message()); void d.dismiss(); });
    const shot = async name => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: true}); };
    await page.goto(BASE + "/admin");
    await page.getByLabel(/email/i).first().fill("content_editor@test.local"); await page.getByLabel(/password/i).first().fill("local-test-password-CONTENT_EDITOR");
    await page.getByRole("button", {name: /sign in/i}).first().click(); await page.getByRole("heading", {name: "Overview", level: 1}).waitFor();
    await page.goto(BASE + "/admin/content"); await page.getByRole("button", {name: "News & updates"}).click();
    const form = page.locator(".content-editor");
    await form.getByLabel("Title").fill("Editor test " + run); await form.getByLabel(/^Slug/).fill("ed-" + run + "-news");
    await form.getByLabel(/^Summary/).fill("Short summary for the card.");
    // Paragraph with bold, Enter = new block, "## " shortcut → heading, "- " → list, "/" menu → quote.
    const p = form.getByRole("textbox", {name: "Paragraph", exact: true}).first(); await p.click();
    await p.pressSequentially("Indonesia's downstream push continues. ");
    await page.keyboard.press("Control+b"); await page.keyboard.type("Key facts"); await page.keyboard.press("Control+b");
    await page.keyboard.press("Enter"); await page.keyboard.type("## Highlights"); await page.keyboard.press("Enter");
    await page.keyboard.type("- Nickel smelters"); await page.keyboard.press("Enter"); await page.keyboard.type("Battery supply chain");
    await page.keyboard.press("Enter"); await page.keyboard.press("Enter"); // empty last item → back to a paragraph
    await page.keyboard.type("/"); await page.getByRole("menu", {name: "Choose a block"}).getByRole("menuitem", {name: /Quote/}).click();
    await form.getByLabel("Quote", {exact: true}).fill("Mining moves forward."); await form.getByLabel("Quote source").fill("Organizer");
    assert.equal(await form.getByLabel("Heading 2").inputValue(), "Highlights");
    assert.deepEqual([await form.getByLabel("List item 1").inputValue(), await form.getByLabel("List item 2").inputValue()], ["Nickel smelters", "Battery supply chain"]);
    // Cover image uploads before alt/rights are filled (this used to clear the file silently).
    await form.locator('input[type=file][accept^="image"]').last().setInputFiles({name: "cover.png", mimeType: "image/png", buffer: png});
    await form.locator("img.content-cover-preview").waitFor();
    await shot("content-editor");
    await form.getByRole("tab", {name: "Preview"}).click();
    const prev = form.locator(".be-preview"); await prev.locator("h2").waitFor();
    assert.equal(await prev.locator("strong").first().textContent(), "Key facts");
    assert.equal(await prev.locator("blockquote cite").textContent(), "Organizer");
    await shot("content-preview");
    await form.getByRole("button", {name: "Save draft"}).click();
    await page.locator("#content-msg").getByText(/Draft saved/).waitFor();
    // Publish without alt/rights: the editor opens and explains what is missing (no silent failure).
    const row = page.getByRole("row", {name: new RegExp("Editor test " + run)});
    await row.getByRole("button", {name: "Publish"}).click();
    await page.locator("#content-msg").getByText(/needs .*alt text/i).waitFor();
    await form.getByLabel("Alt text (describe the image)").fill("Orange cover image");
    await form.getByLabel("Rights status").selectOption("OWNED");
    await form.getByRole("button", {name: "Save changes"}).click(); await page.locator("#content-msg").getByText("Saved.").waitFor();
    await row.getByRole("button", {name: "Publish"}).click(); await page.locator("#content-msg").getByText(/Published/).waitFor();
    const saved = await db.contentItem.findFirst({where: {slug: "ed-" + run + "-news"}});
    assert.equal(saved.status, "PUBLISHED"); assert.ok(saved.body.startsWith('{"format":"blocks"'));
    // Downloads: upload a PDF; url, type and size fill in.
    await page.getByRole("button", {name: "Downloads"}).click();
    await form.getByLabel("Title").fill("Brochure " + run); await form.getByLabel(/^Slug/).fill("ed-" + run + "-pdf");
    await form.locator('input[type=file][accept^="application/pdf"]').setInputFiles({name: "brochure.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n")});
    await form.locator(".content-file a").waitFor();
    assert.match(await form.getByLabel(/^File URL/).inputValue(), /\/api\/public\/media\/.+\.pdf$/);
    assert.equal(await form.getByLabel("File type").inputValue(), "PDF");
    await form.getByRole("button", {name: "Save draft"}).click(); await page.locator("#content-msg").getByText(/Draft saved/).waitFor();
    await page.getByRole("row", {name: new RegExp("Brochure " + run)}).getByRole("button", {name: "Publish"}).click();
    await page.locator("#content-msg").getByText(/Published/).waitFor();
    await shot("content-downloads");
    // Delete (replaces archive): a warning modal, Esc keeps the item, "Yes, delete" removes it.
    const dlRow = page.getByRole("row", {name: new RegExp("Brochure " + run)});
    assert.equal(await page.getByRole("button", {name: "Archive"}).count(), 0, "no archive button");
    await dlRow.getByRole("button", {name: "Delete"}).click();
    const modal = page.getByRole("alertdialog"); await modal.waitFor();
    assert.match(await modal.textContent(), /deleted permanently/); assert.match(await modal.textContent(), /disappears from the exhibitor page downloads/);
    await page.keyboard.press("Escape"); await modal.waitFor({state: "detached"}); assert.equal(await dlRow.count(), 1);
    await dlRow.getByRole("button", {name: "Delete"}).click(); await shot("content-delete-modal");
    await modal.getByRole("button", {name: "Yes, delete"}).click();
    await page.locator("#content-msg").getByText(/Deleted “Brochure/).waitFor(); assert.equal(await dlRow.count(), 0);
    assert.equal(await db.contentItem.count({where: {slug: "ed-" + run + "-pdf"}}), 0);
    if (SITE) {
      await page.goto(SITE + `/news/article/?slug=ed-${run}-news`); await page.locator(".news-article-body blockquote").waitFor();
      assert.equal(await page.locator(".news-article-body h2").textContent(), "Highlights");
      await shot("public-article");
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
