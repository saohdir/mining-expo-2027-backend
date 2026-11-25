import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ExcelJS from "exceljs";
import {render, validateExport} from "../src/lib/export-build";

const read = (path: string) => readFileSync(path, "utf8");

test("conference interest report is a registered export dataset (sync, background, CMS)", () => {
  assert.doesNotThrow(() => validateExport({dataset: "conferences", basis: "created", format: "xlsx"}));
  assert.throws(() => validateExport({dataset: "conferences", basis: "paid", format: "xlsx"}), /Date basis/);
  assert.match(read("src/app/api/admin/exports/route.ts"), /"conferences"/);
  assert.match(read("src/app/admin/reports/page.tsx"), /value="conferences"/);
  assert.match(read("src/app/admin/programmes/page.tsx"), /dataset=conferences&basis=created&format=xlsx/);
  assert.match(read("src/app/api/admin/reports/export/route.ts"), /"conference-interest"/);
  const ds = read("src/lib/report-datasets.ts");
  for (const col of ["Active registrations", "Fill rate % (active / capacity)", "Checked in (unique)", "Attendance % (checked in / confirmed)"]) assert.ok(ds.includes(col), col);
  // seats follow the same rule as registration capacity; check-ins ignore exhibition-entry passes
  assert.match(ds, /ACTIVE_CONFERENCE_STATUSES/);
  assert.match(ds, /entitlement: \{not: "EXPO_ENTRY"\}/);
});

test("XLSX export writes the summary and the delegate list as separate worksheets", async () => {
  const data = {sheet: "Conference interest", columns: ["Conference", "Capacity", "Fill rate %"], rows: [["Green Mining", 200, 2.5], ["=HYPERLINK(\"x\")", 300, ""]],
    sheets: [{sheet: "Delegates", columns: ["Customer", "Conference"], rows: [["Michael Wijaya", "Green Mining"]]}]};
  const out = await render(data, {dataset: "conferences", basis: "created", format: "xlsx"});
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out.bytes as unknown as ArrayBuffer); // exceljs types predate Buffer<ArrayBuffer>
  assert.deepEqual(wb.worksheets.map(w => w.name), ["Conference interest", "Delegates"]);
  const summary = wb.getWorksheet("Conference interest")!;
  assert.deepEqual(summary.getRow(2).values, [, "Conference", "Capacity", "Fill rate %"]);
  assert.equal(summary.getRow(3).getCell(2).value, 200);                 // numbers stay numeric for Excel formulas/charts
  assert.notEqual(String(summary.getRow(4).getCell(1).value).charAt(0), "="); // formula injection is neutralised
  assert.equal(wb.getWorksheet("Delegates")!.getRow(3).getCell(1).value, "Michael Wijaya");
});
