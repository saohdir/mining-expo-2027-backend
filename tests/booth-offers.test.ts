import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {quoteMinor, sameBoothUnits, uniqueOfferedIds} from "../src/lib/booth-offers";

const ids=[
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222"
];
const read=(path:string)=>readFileSync(path,"utf8");

test("quote amount must be a positive bounded IDR value",()=>{
  assert.equal(quoteMinor("1000000"),1000000n);
  for(const x of ["", "0", "-1", "1.5", "abc", "10000000000001"]) {
    assert.throws(()=>quoteMinor(x));
  }
});
test("offered unit identifiers must be nonempty, unique, and bounded",()=>{
  assert.deepEqual(uniqueOfferedIds(ids),ids);
  for(const list of [[], [ids[0],ids[0]],["invalid"],Array(7).fill(ids[0])]) {
    assert.throws(()=>uniqueOfferedIds(list));
  }
});
test("unit sets compare without order-based ambiguity",()=>{
  assert.equal(sameBoothUnits(ids,[...ids].reverse()),true);
  assert.equal(sameBoothUnits(ids,[ids[0]]),false);
});
test("offers are versioned and snapshots contain units, price and physical area",()=>{
  const schema=read("prisma/schema.prisma");
  const api=read("src/app/api/admin/booth-requests/[id]/offer/route.ts");
  assert.match(schema,/model BoothOffer/);
  assert.match(schema,/@@unique\(\[boothRequestId,revision\]\)/);
  for(const key of ["offeredUnitIds","offeredUnits","offeredAreaSqm","quotedPriceMinor","expiresAt","offeredBy","acceptedAt"])assert.match(schema,new RegExp(key));
  assert.match(api,/tx\.boothOffer\.create/);
  assert.match(api,/PUBLISHED/);
  assert.match(api,/unit\.status !== "AVAILABLE"/);
  assert.match(api,/BOOTH_OFFER_PROPOSED/);
});
test("customer can accept only latest explicit offer id; cannot automatically hold booth",()=>{
  const api=read("src/app/api/customer/booth-requests/[id]/accept/route.ts");
  assert.match(api,/offer\.id !== offerId/);
  assert.match(api,/offer\.expiresAt/);
  assert.match(api,/accountId: account\.id/);
  assert.match(api,/tx\.boothOffer\.updateMany/);
  assert.doesNotMatch(api,/boothAssignment\.create/);
  assert.doesNotMatch(api,/boothUnit\.updateMany/);
});
test("assignment requires matching accepted quote and verified finance, all units atomically",()=>{
  const route=read("src/app/api/admin/booth-requests/[id]/assign/route.ts");
  assert.match(route,/offer\.acceptedAt/);
  assert.match(route,/invoice\.totalMinor !== offer\.quotedPriceMinor/);
  assert.match(route,/financeTotals/);
  assert.match(route,/Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route,/tx\.boothUnit\.updateMany/);
  assert.match(route,/tx\.boothAssignment\.create/);
  assert.match(route,/ALLOCATION_CONFLICT/);
  const migration=read("prisma/migrations/20261108072000_booth_offers/migration.sql");
  assert.match(migration,/CREATE UNIQUE INDEX "BoothAssignment_one_active_per_unit"/);
  assert.match(migration,/WHERE "active" = TRUE/);
});
test("customer invoice can only follow approved offer with matching price",()=>{
  const invoice=read("src/app/api/admin/invoices/route.ts");
  const request=read("src/app/api/customer/manual-payment-request/route.ts");
  const oldStatus=read("src/app/api/admin/booth-requests/[id]/status/route.ts");
  assert.match(invoice,/QUOTE_PRICE_MISMATCH/);
  assert.match(request,/OFFER_NOT_ACCEPTED/);
  assert.doesNotMatch(oldStatus,/status:z\.enum\(\["UNDER_REVIEW","OFFERED"/);
  assert.match(oldStatus,/OFFERED may only be set/);
});
