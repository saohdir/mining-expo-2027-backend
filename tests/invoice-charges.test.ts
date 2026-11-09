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
  assert.throws(() => chargesConfigSchema.parse({approvedBy: "Finance", approvedAt: "2026-11-01", charges: [{code: "X1", label: "Both", kind: "FEE", rateBps: 1, fixedMinor: "1", appliesTo: ["BOOTH"]}]}));
});

test("FR-059 group discount tiers: highest reached tier, half-up, none below minimum", async () => {
  const {chargesConfigSchema, groupDiscount, computeCharges} = await import("../src/lib/invoice-charges");
  const cfg = chargesConfigSchema.parse({approvedBy: "Finance", approvedAt: "2026-11-01", charges: [{code: "VAT", label: "VAT", kind: "TAX", rateBps: 1100, appliesTo: ["CONFERENCE"]}],
    groupDiscounts: [{minDelegates: 5, rateBps: 1000}, {minDelegates: 10, rateBps: 1500}]});
  assert.equal(groupDiscount(cfg, 1_000_000n, 4), null);
  assert.equal(groupDiscount(cfg, 1_000_000n, 5)!.amountMinor, -100_000n);
  const d = groupDiscount(cfg, 1_000_000n, 12)!; assert.equal(d.amountMinor, -150_000n); assert.match(d.description, /12 delegates, 15%/);
  assert.equal(computeCharges(cfg, 1_000_000n + d.amountMinor, "CONFERENCE")[0].amountMinor, 93_500n, "VAT on discounted base");
  assert.equal(chargesConfigSchema.parse({approvedBy: "Finance", approvedAt: "2026-11-01", charges: []}).groupDiscounts.length, 0, "default none");
});
