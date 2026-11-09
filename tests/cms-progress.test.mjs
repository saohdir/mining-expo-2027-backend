import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const paymentApi=readFileSync("src/app/api/admin/payments/route.ts","utf8");
const paymentUi=readFileSync("src/app/admin/payments/page.tsx","utf8");
const programmeUi=readFileSync("src/app/admin/programmes/page.tsx","utf8");
const verification=readFileSync("src/app/api/admin/invoices/[id]/verify-transfer/route.ts","utf8");
const marketingTokens=readFileSync("src/app/globals.css","utf8");
test("manual payment page never implements payment gateway or customer card checkout",()=>{
 for(const src of [paymentUi,paymentApi])assert.doesNotMatch(src,/midtrans|snap\.js|stripe|payment-gateway/i);
 assert.match(paymentUi,/confirm.*bank credit|checked the incoming funds/i);
 assert.match(verification,/requireEnabled\("invoices"\)/);
 assert.match(verification,/BANK_TRANSFER_VERIFIED/);
});
test("manual payment choices are derived from invoice and verified receipts",()=>{
 assert.match(paymentUi,/DP_RECEIVED/);assert.match(paymentUi,/PAID_IN_FULL/);assert.match(paymentUi,/CANCELLED/);
 assert.match(paymentApi,/financeTotals/);assert.match(paymentApi,/verifiedReceiptCount/);
 assert.match(paymentUi,/verify-transfer/);
});
test("programme editor keeps organizer approval explicit",()=>{
 assert.match(programmeUi,/Schedule TBA/);
 assert.match(programmeUi,/approved the programme information/);
 assert.match(programmeUi,/published/);
});
test("portal design system matches approved public IMDX tokens",()=>{
 // #C2410C = WCAG AA brand orange (NFR-02), replacing #FF5912 which was ~3:1 on white.
 for(const token of ["#C2410C","#520F00","#88584B","#ECD5C2","#FFFDFB","Space Grotesk"])
   assert.ok(marketingTokens.includes(token),token);
});

test("CMS reports separate unique people from scan attempts",()=>{
 const page=readFileSync("src/app/admin/reports/page.tsx","utf8");
 assert.match(page,/registeredUnique/);assert.match(page,/arrivedUnique/);assert.match(page,/scanAttempts/);
 assert.match(page,/registration creation date/i);
});
