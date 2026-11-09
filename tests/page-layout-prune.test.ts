import {test} from "node:test";
import assert from "node:assert/strict";
import {layoutProblems, pruneLayout, type Layout} from "../src/lib/page-layout";

test("stored layouts drop sections and field overrides that the static site no longer has", () => {
  const stored: Layout = {seo: {title: "", description: ""}, blocks: [
    {id: "s-a", type: "static", ref: "a-world-of-opportunity", hidden: false},
    {id: "s-old", type: "static", ref: "exhibitor-directory", hidden: false}],
    fields: {"a-world-of-opportunity.3": {mode: "own", text: "A world of"}, "a-world-of-opportunity.7": {mode: "own", text: "stale"}, "exhibitor-directory.0": {mode: "plain", text: "x"}}};
  assert.ok(layoutProblems("exhibitors", stored).length >= 2, "stale refs are invalid as stored");
  const clean = pruneLayout("exhibitors", stored);
  assert.deepEqual(clean.blocks.map(b => b.id), ["s-a"]);
  assert.deepEqual(Object.keys(clean.fields), ["a-world-of-opportunity.3"]);
  assert.deepEqual(layoutProblems("exhibitors", clean), []);
});
test("new exhibitor fields exist: why exhibit and the 8-card grid", () => {
  const l: Layout = {seo: {title: "", description: ""}, blocks: [], fields: {"make-your-next-connection.12": {mode: "plain", text: "x"}, "a-world-of-opportunity.77": {mode: "own", text: "y"}}};
  assert.deepEqual(layoutProblems("exhibitors", l), []);
});
