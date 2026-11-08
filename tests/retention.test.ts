import {test} from "node:test";
import assert from "node:assert/strict";
import {CATEGORIES, policySchema} from "../src/lib/retention";

test("retention policy: per-category minimums, unknown categories rejected, approval required", () => {
  for (const [k, c] of Object.entries(CATEGORIES)) {
    assert.throws(() => policySchema.parse({rules: {[k]: c.min - 1}, approvedBy: "Legal", approvedAt: "2026-11-01"}), k);
    assert.ok(policySchema.parse({rules: {[k]: c.min}, approvedBy: "Legal", approvedAt: "2026-11-01"}));
  }
  assert.throws(() => policySchema.parse({rules: {AUDIT_LOG: 400}, approvedBy: "Legal", approvedAt: "2026-11-01"}), "audit log not purgeable");
  assert.throws(() => policySchema.parse({rules: {}, approvedBy: "", approvedAt: "2026-11-01"}));
});
