import {test} from "node:test";
import assert from "node:assert/strict";
import {svgProblems} from "../src/lib/svg-safety";
test("safe SVG passes; active/external content is rejected", () => {
  assert.deepEqual(svgProblems('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#eee"/></svg>'), []);
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg><foreignObject><div/></foreignObject></svg>', '<svg onload="x()"></svg>', '<svg><a href="javascript:alert(1)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>', '<svg><image href="https://evil.example/x.png"/></svg>', '<svg><style>@import url(//x)</style></svg>', '<html></html>'])
    assert.ok(svgProblems(bad).length > 0, bad);
});
