import {test} from "node:test";
import assert from "node:assert/strict";
import {parseSvgUnits} from "../src/lib/floorplan-svg-import";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <rect id="booth-A1" x="10" y="20" width="30" height="30" data-category="Premium" data-hall="A"/>
  <rect id='unit_b2' x="100" y="20" width="60" height="30"/>
  <rect id="booth-A1" x="200" y="20" width="30" height="30"/>
  <rect id="booth-C3" x="0" y="0" width="30" height="30" transform="rotate(45)"/>
  <circle id="booth-D4" cx="5" cy="5" r="3"/>
  <rect id="booth-E5" x="1" y="1" height="20"/>
  <rect id="wall" x="0" y="0" width="600" height="5"/></svg>`;

test("SVG element-ID import: scaling, metres, attributes, problems reported", () => {
  const {units, warnings} = parseSvgUnits(svg, {canvasWidth: 1200, canvasHeight: 800, unitsPerMetre: 10});
  assert.deepEqual(units.map(u => u.code), ["A1", "B2"]);
  assert.deepEqual(units[0], {code: "A1", x: 20, y: 40, w: 60, h: 60, lengthM: 3, widthM: 3, category: "Premium", hall: "A"});
  assert.equal(units[1].lengthM, 6);
  assert.equal(warnings.length, 4, warnings.join("|"));
  assert.ok(warnings.some(w => /duplicate/.test(w)) && warnings.some(w => /transformed/.test(w)) && warnings.some(w => /only <rect>/.test(w)) && warnings.some(w => /geometry/.test(w)));
});
test("SVG import refuses documents without dimensions or booths", () => {
  assert.match(parseSvgUnits("<svg></svg>", {canvasWidth: 1, canvasHeight: 1, unitsPerMetre: 10}).warnings[0], /viewBox/);
  assert.match(parseSvgUnits('<svg viewBox="0 0 10 10"><rect id="x" width="1" height="1"/></svg>', {canvasWidth: 1, canvasHeight: 1, unitsPerMetre: 10}).warnings[0], /No booth/);
});
