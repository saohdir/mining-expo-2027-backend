import {test} from "node:test";
import assert from "node:assert/strict";
import {chargesConfigSchema, computeCharges} from "../src/lib/invoice-charges";

test("FR-125 charges: none unless configured; % half-up on subtotal; fixed fee; per booking kind", () => {
  assert.deepEqual(computeCharges(null, 1000n, "BOOTH"), []);
  const cfg = chargesConfigSchema.parse({approvedBy: "Finance", approvedAt: "2026-11-01", charges: [
    {code: "VAT", label: "VAT", kind: "TAX", rateBps: 1100, appliesTo: ["BOOTH", "CONFERENCE"]},
    {code: "ADMIN", label: "Admin fee", kind: "FEE", fixedMinor: "25000", appliesTo: ["BOOTH"]}]});
  const b = computeCharges(cfg, 12_345n, "BOOTH");
  assert.deepEqual(b.map(l => [l.kind, l.description, l.amountMinor]), [["TAX", "VAT (11%)", 1358n], ["FEE", "Admin fee", 25000n]]);
  assert.deepEqual(computeCharges(cfg, 100n, "CONFERENCE").map(l => l.amountMinor), [11n]);
  assert.deepEqual(computeCharges(cfg, 100n, "VISITOR"), []);
  assert.throws(() => chargesConfigSchema.parse({approvedBy: "F", approvedAt: "2026-11-01", charges: [{code: "X1", label: "Both", kind: "FEE", rateBps: 1, fixedMinor: "1", appliesTo: ["BOOTH"]}]}));
});
