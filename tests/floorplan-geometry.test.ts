import {test} from "node:test";
import assert from "node:assert/strict";
import {areaFrom, areaMismatch, dimensionLabelOf, floorplanStats, outOfCanvas, overlapWarnings, parseUnitsCsv, remapReport, unitsToCsv} from "../src/lib/floorplan-geometry";

test("bounds respect rotation; unplaced units are exempt", () => {
  assert.equal(outOfCanvas({code: "A", x: 950, y: 0, w: 40, h: 100}, 1000, 800), false);
  assert.equal(outOfCanvas({code: "A", x: 950, y: 0, w: 40, h: 100, rotation: 90}, 1000, 800), true);
  assert.equal(outOfCanvas({code: "A", x: 0, y: 0, w: 5000, h: 5000, placed: false}, 1000, 800), false);
});
test("overlap is a warning listing both codes", () => {
  assert.deepEqual(overlapWarnings([{code: "A", x: 0, y: 0, w: 50, h: 50}, {code: "B", x: 40, y: 40, w: 50, h: 50}, {code: "C", x: 200, y: 0, w: 10, h: 10}]), ["A overlaps B"]);
  assert.deepEqual(overlapWarnings([{code: "A", x: 0, y: 0, w: 50, h: 50}, {code: "B", x: 50, y: 0, w: 50, h: 50}]), [], "touching edges do not overlap");
});
test("area and label from length × width", () => {
  assert.equal(areaFrom(15, 24), 360); assert.equal(areaFrom(3, 2.5), 7.5); assert.equal(dimensionLabelOf(15, 24), "15×24");
  assert.equal(areaMismatch(18, 18.0), false); assert.equal(areaMismatch(18, 18.1), true);
});
test("CSV import validates and export escapes formulas", () => {
  const ok = parseUnitsCsv("code,category,lengthM,widthM,hall\nA1,Standard,3,3,A\n\"B,2\",Premium,3,3,B\n");
  assert.equal(ok.units.length, 1); assert.match(ok.errors[0], /Row 3: invalid code/);
  assert.match(parseUnitsCsv("a,b\n").errors[0], /Header/);
  assert.match(parseUnitsCsv("code,category,lengthM,widthM,hall\nA1,S,0,3,\n").errors[0], /0–200/);
  assert.match(parseUnitsCsv("code,category,lengthM,widthM,hall\nA1,S,3,3,\na1,S,3,3,\n").errors[0], /duplicate/);
  const csv = unitsToCsv([{code: "A1", category: "=HYPERLINK(1)", lengthM: 3, widthM: 3, hall: "+x"}]);
  assert.match(csv, /'=HYPERLINK\(1\)/); assert.match(csv, /'\+x/);
  assert.equal(parseUnitsCsv(csv).units[0].category, "=HYPERLINK(1)", "round-trip strips escape");
});
test("remap report matches by code, blocks unmatched commitments, hashes for preview consistency", () => {
  const r = remapReport([{code: "A1", areaSqm: 9}, {code: "A2", areaSqm: 9}, {code: "A3", areaSqm: 9}], [{code: "a1", areaSqm: 12}, {code: "A3", areaSqm: 9}, {code: "Z9", areaSqm: 9}],
    [{unitCode: "A1", kind: "ASSIGNMENT", requestId: "r1"}, {unitCode: "A2", kind: "HOLD", requestId: "r2"}, {unitCode: "A3", kind: "PREFERENCE", requestId: "r3"}]);
  assert.deepEqual(r.summary, {matched: 2, unmatched: 1, added: 1, committedUnits: 3});
  assert.deepEqual(r.blocking, ["A2"]); assert.deepEqual(r.areaWarnings, ["A1"]);
  assert.equal(r.hash, remapReport([{code: "A1", areaSqm: 9}, {code: "A2", areaSqm: 9}, {code: "A3", areaSqm: 9}], [{code: "a1", areaSqm: 12}, {code: "A3", areaSqm: 9}, {code: "Z9", areaSqm: 9}],
    [{unitCode: "A1", kind: "ASSIGNMENT", requestId: "r1"}, {unitCode: "A2", kind: "HOLD", requestId: "r2"}, {unitCode: "A3", kind: "PREFERENCE", requestId: "r3"}]).hash);
});
test("stats per status/category with occupied m² and %", () => {
  const s = floorplanStats([{status: "OCCUPIED", category: "Standard", areaSqm: 9}, {status: "AVAILABLE", category: "Standard", areaSqm: 9}, {status: "AVAILABLE", category: "Premium", areaSqm: 18}]);
  assert.equal(s.totalAreaSqm, 36); assert.equal(s.occupiedAreaSqm, 9); assert.equal(s.occupiedPercent, 25);
  assert.equal(s.byCategory.Standard.units, 2); assert.equal(s.byStatus.AVAILABLE.areaSqm, 27);
});
