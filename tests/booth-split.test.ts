import {test} from "node:test";
import assert from "node:assert/strict";
import {splitBox, mergeBoxes, nextSplitCode} from "../src/lib/booth-split";

test("split keeps the chosen area and leaves the rest as a neighbouring booth", () => {
  const u = {x: 100, y: 50, w: 100, h: 40, areaSqm: 10, lengthM: 5, widthM: 2};
  const {keep, rest} = splitBox(u, 5);
  assert.deepEqual([keep.x, keep.w, keep.areaSqm, keep.lengthM, keep.widthM], [100, 50, 5, 2.5, 2]);
  assert.deepEqual([rest.x, rest.w, rest.areaSqm, rest.lengthM, rest.widthM], [150, 50, 5, 2.5, 2]);
  const m = mergeBoxes(keep, rest);
  assert.deepEqual([m.x, m.w, m.h, m.areaSqm, m.lengthM, m.widthM], [100, 100, 40, 10, 5, 2]);
});
test("tall booths split across their height", () => {
  const {keep, rest} = splitBox({x: 0, y: 0, w: 30, h: 90, areaSqm: 18, lengthM: null, widthM: null}, 12);
  assert.deepEqual([keep.h, rest.y, rest.h, rest.areaSqm], [60, 60, 30, 6]);
});
test("split refuses impossible areas", () => {
  const u = {x: 0, y: 0, w: 10, h: 10, areaSqm: 9, lengthM: 3, widthM: 3};
  assert.throws(() => splitBox(u, 9)); assert.throws(() => splitBox(u, 0)); assert.throws(() => splitBox(u, 8.5));
});
test("remainder codes", () => {
  assert.equal(nextSplitCode("A01", new Set()), "A01-B");
  assert.equal(nextSplitCode("A01", new Set(["A01-B"])), "A01-C");
  assert.equal(nextSplitCode("A01-B", new Set(["A01-B"])), "A01-C");
});
