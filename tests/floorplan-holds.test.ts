import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  canPublishWithBlockers, cloneBoothStatus, holdExpiryFromHours, holdsMatchBooking
} from "../src/lib/floorplan-safety";

const read=(path:string)=>readFileSync(path,"utf8");
const now=new Date("2026-11-08T02:00:00.000Z");
const ids=["a","b"];
test("historical occupied, reserved and blocked geometry is never copied as free",()=>{
  assert.equal(cloneBoothStatus("AVAILABLE"),"AVAILABLE");
  for(const state of ["RESERVED","OCCUPIED","BLOCKED","UNKNOWN"]) {
    assert.equal(cloneBoothStatus(state),"BLOCKED");
  }
});
test("any unresolved booking, hold or assignment blocks floorplan publication",()=>{
  assert.equal(canPublishWithBlockers({openRequests:0,activeHolds:0,activeAssignments:0}),true);
  for(const name of ["openRequests","activeHolds","activeAssignments"] as const) {
    const counts={openRequests:0,activeHolds:0,activeAssignments:0};
    counts[name]=1;
    assert.equal(canPublishWithBlockers(counts),false,name);
  }
  assert.throws(()=>canPublishWithBlockers({openRequests:-1,activeHolds:0,activeAssignments:0}));
});
test("Operations holds are bounded between 1h and 168h and have UTC expiry",()=>{
  assert.equal(holdExpiryFromHours(now,1).toISOString(),"2026-11-08T03:00:00.000Z");
  assert.equal(holdExpiryFromHours(now,168).toISOString(),"2026-11-15T02:00:00.000Z");
  for(const invalid of [0,-1,169,1.5,Number.NaN])assert.throws(()=>holdExpiryFromHours(now,invalid));
});
test("assignment of held inventory requires all and only accepted request units, unexpired",()=>{
  const holds=[
    {boothUnitId:"a",boothRequestId:"customer-1",expiresAt:new Date("2026-11-08T03:00:00Z")},
    {boothUnitId:"b",boothRequestId:"customer-1",expiresAt:new Date("2026-11-08T04:00:00Z")}
  ];
  assert.equal(holdsMatchBooking([],ids,"customer-1",now),false);
  assert.equal(holdsMatchBooking(holds,ids,"customer-1",now),true);
  assert.equal(holdsMatchBooking(holds,["a"],"customer-1",now),false);
  assert.equal(holdsMatchBooking(holds,ids,"different-customer",now),false);
  assert.equal(holdsMatchBooking(holds,ids,"customer-1",new Date("2026-11-08T03:00:00Z")),false);
  assert.equal(holdsMatchBooking([holds[0],holds[0]],ids,"customer-1",now),false);
});
test("version clone never re-publishes historical plan or transfers old IDs",()=>{
  const code=read("src/app/api/admin/floorplans/[id]/clone/route.ts");
  assert.match(code,/status: "DRAFT"/);
  assert.match(code,/cloneBoothStatus\(unit\.status\)/);
  assert.match(code,/FLOORPLAN_DRAFT_CLONED/);
  assert.doesNotMatch(code,/boothAssignment\.create/);
  assert.doesNotMatch(code,/boothHold\.create/);
});
test("publish checks blockers, remaps bookings automatically, keeps row version and is serialized",()=>{
  const code=read("src/app/api/admin/floorplans/[id]/publish/route.ts");
  assert.match(code,/floorplanBlockers\(tx, replaced\?\.id \?\? null\)/);
  assert.match(code,/applyRemap\(tx, preview, actor\.id\)/);
  assert.match(code,/restoredUnits\.push/);
  assert.match(code,/rowVersion: input\.rowVersion/);
  assert.match(code,/Prisma\.TransactionIsolationLevel\.Serializable/);
  const sql=read("prisma/migrations/20261108090000_floorplan_holds/migration.sql");
  assert.match(sql,/Floorplan_one_published_per_event/);
  // Several live floors per event: the single-published index is dropped; a draft replaces only its own floor.
  assert.match(read("prisma/migrations/20261117010000_floor_activation/migration.sql"),/DROP INDEX IF EXISTS "Floorplan_one_published_per_event"/);
  assert.match(sql,/BoothHold_one_active_per_unit/);
});
test("hold creation and release are staff-only and atomic, customer preference does not hold",()=>{
  const route=read("src/app/api/admin/booth-requests/[id]/holds/route.ts");
  assert.match(route,/admin\(\["SUPER_ADMIN", "OPERATIONS"\]\)/);
  assert.match(route,/OFFER_NOT_ACCEPTED/);
  assert.match(route,/Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route,/tx\.boothUnit\.updateMany/);
  assert.match(route,/tx\.boothHold\.create/);
  assert.match(route,/BOOTH_HOLD_RELEASED/);
  const customer=read("src/app/api/customer/booth-requests/route.ts");
  assert.doesNotMatch(customer,/boothHold\.create/);
});
test("worker expiry is audited and never releases an assigned booth",()=>{
  const code=read("src/lib/booth-hold-expiry.ts");
  assert.match(code,/tx\.boothAssignment\.count/);
  assert.match(code,/!live && !assigned/);
  assert.match(code,/BOOTH_HOLD_EXPIRED/);
  const worker=read("scripts/outbox-worker.ts");
  assert.match(worker,/expireBoothHolds\(db\)/);
});
