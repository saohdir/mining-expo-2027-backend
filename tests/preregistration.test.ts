import {test} from "node:test";
import assert from "node:assert/strict";
import {parseCsv, validatePrereg, PREREG_MAX_ROWS} from "../src/lib/preregistration";

test("CSV parser handles quotes, embedded commas/newlines, CRLF and BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\n'), [["a", "b"], ["x, y", 'he said "hi"'], ["multi\nline", "z"]]);
  assert.deepEqual(parseCsv("a,b\n\n,\n"), [["a", "b"]], "blank rows dropped");
});

test("pre-registration validation: header, email, name, duplicates, row cap, control chars", () => {
  const ok = validatePrereg("Email,Full_Name,Organization\nA@X.co,Budi Santoso,PT A\nbad,Someone,\na@x.co,Dup,\nc@x.co,,\nd@x.co,\"Dewi\tLestari\",\"=cmd()\"");
  assert.deepEqual(ok.rows.map(r => r.email), ["a@x.co", "d@x.co"]);
  assert.equal(ok.rows[1].fullName, "Dewi Lestari");
  assert.deepEqual(ok.errors.map(e => e.line), [3, 4, 5]);
  assert.equal(validatePrereg("name,org\nx,y").errors[0].line, 1, "missing required header");
  const many = "email,full_name\n" + Array.from({length: PREREG_MAX_ROWS + 1}, (_, i) => `u${i}@x.co,User ${i}`).join("\n");
  assert.match(validatePrereg(many).errors[0].message, /At most/);
});

test("badge PDF: one A6 page per badge; non-WinAnsi names never break printing", async () => {
  const {badgesPdf} = await import("../src/lib/badges");
  const {PDFDocument} = await import("pdf-lib");
  const bytes = await badgesPdf("IMDX 2027", [
    {name: "Siti Nurhaliza Binti Abdullah Very Long Name For Testing", organization: "PT Tambang Nusantara", jobTitle: "Director", category: "DELEGATE"},
    {name: "王小明 Đặng Thị", organization: "", jobTitle: "", category: "VISITOR"}]);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.ok(Math.abs(doc.getPage(0).getWidth() - 297.64) < 0.1, "A6 width");
});
