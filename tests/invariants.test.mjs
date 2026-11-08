import { test } from "node:test";import assert from "node:assert/strict";
// Source-level checks deliberately run without a live database or configured production secrets.
import { readFileSync } from "node:fs";
const schema=readFileSync("prisma/schema.prisma","utf8");
const policy=readFileSync("src/lib/policy.ts","utf8");
const inv=readFileSync("src/lib/invariants.ts","utf8");
const pkg=JSON.parse(readFileSync("package.json","utf8"));
test("models cover three journeys, manual invoices and QR admission",()=>{for(const m of ["CustomerAccount","Enrollment","BoothRequest","Floorplan","BoothUnit","Invoice","ManualTransfer","EventPass","Admission","AuditLog"])assert.match(schema,new RegExp("model "+m+" \\{"));});
test("manual finance only and no payment provider dependencies",()=>{assert.match(inv,/manualFinanceOnly:true/);assert.equal(pkg.dependencies.midtrans,undefined);assert.doesNotMatch(JSON.stringify(pkg),/snap-js|midtrans-client|stripe/i);});
test("production feature gates default disabled",()=>{const env=readFileSync(".env.example","utf8");for(const flag of ["ENABLE_REGISTRATION=false","ENABLE_INVOICES=false","ENABLE_QR_ADMISSION=false"])assert.ok(env.includes(flag));});
test("finance calculation uses verified receipts, not transfer proofs",()=>{assert.match(policy,/status==="VERIFIED"/);});
