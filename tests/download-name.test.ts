import {test} from "node:test";
import assert from "node:assert/strict";
import {attachmentHeader, downloadFileName} from "../src/lib/download-name";

const long = "Indonesia Clean Coal and Green Mining Conference 2027 Indonesia Coal and Energy Expo (ICEE) 2027 Invitation letter in English";
test("download filename follows the CMS title and keeps the real extension once", () => {
  assert.equal(downloadFileName(long, "pdf"), long + ".pdf");
  assert.equal(downloadFileName("Brochure.PDF", "pdf"), "Brochure.pdf", "no double extension");
  assert.equal(downloadFileName("Floor plan (Hall A) — 2027", ".pdf"), "Floor plan (Hall A) — 2027.pdf");
  assert.equal(downloadFileName("参展邀请函 2027", "pdf"), "参展邀请函 2027.pdf", "Unicode kept");
  assert.equal(downloadFileName('Plan: A/B <draft>?*|"', "pdf"), "Plan A B draft.pdf", "invalid characters and separators removed");
  assert.equal(downloadFileName("../../etc/passwd", "pdf"), "etc passwd.pdf", "never a path");
  assert.equal(downloadFileName("  ...hidden. ", "pdf"), "hidden.pdf");
  assert.equal(downloadFileName("CON", "pdf"), "_CON.pdf");
  assert.equal(downloadFileName("", "pdf"), "IMDX 2027 document.pdf");
  assert.equal(downloadFileName(null, "pdf"), "IMDX 2027 document.pdf");
  assert.equal(downloadFileName("a\u0000b\nc", "pdf"), "a b c.pdf");
  const huge = downloadFileName("文".repeat(300), "pdf");
  assert.ok(new TextEncoder().encode(huge).length <= 204 && huge.endsWith(".pdf"));
});
test("Content-Disposition carries an ASCII fallback and the exact UTF-8 name", () => {
  assert.equal(attachmentHeader("ICEE (2027) letter.pdf"), `attachment; filename="ICEE (2027) letter.pdf"; filename*=UTF-8''ICEE%20%282027%29%20letter.pdf`);
  const h = attachmentHeader("参展邀请函 2027.pdf");
  assert.match(h, /^attachment; filename="2027\.pdf"; filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(h.split("''")[1]), "参展邀请函 2027.pdf");
});
