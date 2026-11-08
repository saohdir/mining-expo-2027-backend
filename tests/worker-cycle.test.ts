import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runWorkerCycle} from "../src/lib/worker-cycle";

test("outbox delivery still runs when booth-hold expiry fails (e.g. BoothHold table missing)",async()=>{
  const ran:string[]=[];const logs:string[]=[];
  const results=await runWorkerCycle([
    {name:"booth-hold-expiry",run:async()=>{ran.push("expiry");throw new Error('relation "public.BoothHold" does not exist');}},
    {name:"outbox-drain",run:async()=>{ran.push("drain");}}
  ],m=>logs.push(m));
  assert.deepEqual(ran,["expiry","drain"]);
  assert.deepEqual(results.map(r=>[r.name,r.ok]),[["booth-hold-expiry",false],["outbox-drain",true]]);
  assert.equal(logs.length,1);
  assert.match(logs[0],/booth-hold-expiry/);
});
test("a failing outbox drain does not prevent hold expiry on the next step order",async()=>{
  const ran:string[]=[];
  const results=await runWorkerCycle([
    {name:"outbox-drain",run:async()=>{ran.push("drain");throw new Error("smtp down");}},
    {name:"booth-hold-expiry",run:async()=>{ran.push("expiry");}}
  ],()=>{});
  assert.deepEqual(ran,["drain","expiry"]);
  assert.equal(results[1].ok,true);
});
test("worker entrypoint runs expiry and outbox drain as isolated steps",()=>{
  const src=readFileSync("scripts/outbox-worker.ts","utf8");
  assert.match(src,/runWorkerCycle\(\[/);
  assert.match(src,/name:"booth-hold-expiry"/);
  assert.match(src,/name:"outbox-drain"/);
  assert.doesNotMatch(src,/try\{await expireBoothHolds\(db\);await drain\(\)\}/);
});
