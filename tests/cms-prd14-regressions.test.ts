import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=(path:string)=>readFileSync(path,"utf8");

test("Floorplan editor opens latest draft and does not depend on publication preflight",()=>{
  const code=source("src/app/admin/floorplans/page.tsx");
  assert.match(code,/list\.find\(p=>p\.status==="DRAFT"\)\|\|list\[0\]/);
  assert.match(code,/const data=await api\("\/api\/admin\/floorplans\/"\+id\)/);
  assert.match(code,/const preview=await api\("\/api\/admin\/floorplans\/"\+id\+"\/publish"\)/);
  assert.match(code,/catch\(error\)\{[\s\S]*setPreflightError\(/);
  assert.doesNotMatch(code,/Promise\.all\(\[api\("\/api\/admin\/floorplans\/"\+id\),api/);
});
test("Floorplan supports standalone booth creation, pointer draw, editing and save",()=>{
  const code=source("src/app/admin/floorplans/page.tsx");
  for(const symbol of ["+ Add booth unit","Draw booths on canvas","addUnit(v.x,v.y)","Save {units.length} booth units","setHasUnsaved(true)","rowVersion:plan.rowVersion","Delete available unit"])
    assert.ok(code.includes(symbol),symbol);
  assert.match(code,/const codes=new Set\(units\.map\(u=>u\.code\.toUpperCase\(\)\)\)/);
  assert.match(code,/while\(codes\.has/);
  assert.match(code,/canEdit=actor\?\.role==="SUPER_ADMIN"\|\|actor\?\.role==="OPERATIONS"/);
  assert.match(code,/Discard unsaved booth layout changes/);
});
test("Floorplan save remains server-authorized and immutable for published layouts",()=>{
  const api=source("src/app/api/admin/floorplans/[id]/units/route.ts");
  assert.match(api,/admin\(\["SUPER_ADMIN","OPERATIONS"\]\)/);
  assert.match(api,/if\(plan\.status!=="DRAFT"\)/);
  assert.match(api,/rowVersion!==x\.rowVersion/);
  assert.match(api,/UNIT_IN_USE/);
  assert.match(api,/FLOORPLAN_UNITS_SAVED/);
});
test("Workspace finance and events tabs stay navigable after CSS hides legacy sidebar",()=>{
  const page=source("src/app/admin/workspace/page.tsx");
  const shell=source("src/app/admin/components/CmsShell.tsx");
  assert.match(page,/cms-workspace-tabs/);
  assert.match(page,/useSearchParams/);
  assert.match(page,/setTab\(requestedSection\)/);
  assert.match(page,/setInvoiceAccount\(requestedAccount\)/);
  assert.match(page,/cms-payment-requests/);
  assert.match(page,/cms-invoices/);
  assert.match(shell,/section=finance#cms-payment-requests/);
  assert.match(shell,/section=finance#cms-invoices/);
});
test("Registry review calls protected server endpoint and supports booth-specific policy",()=>{
  const page=source("src/app/admin/registrations/page.tsx");
  const api=source("src/app/api/admin/registrations/route.ts");
  assert.match(page,/\/api\/admin\/registrations\/"/);
  assert.match(page,/reviewReason\.trim\(\)/);
  assert.match(page,/role==="OPERATIONS"/);
  assert.match(page,/reviewing\.type!=="CONFERENCE"/);
  assert.match(api,/id:\{startsWith:search,mode:"insensitive"\}/);
  const protectedRoute=source("src/app/api/admin/registrations/[id]/review/route.ts");
  assert.match(protectedRoute,/PAYMENT_REQUIRED/);
  assert.match(protectedRoute,/EXHIBITOR_POLICY/);
});
test("CMS navigation roles agree with financial and programme API roles",()=>{
  const shell=source("src/app/admin/components/CmsShell.tsx");
  assert.match(shell,/Payments & Reconciliation"[\s\S]{0,120}roles:\["SUPER_ADMIN","FINANCE","SALES"\]/);
  assert.doesNotMatch(shell,/Staff Settings",href/);
  const p=source("src/app/api/admin/payments/route.ts");
  assert.match(p,/admin\(\["SUPER_ADMIN","FINANCE","SALES"\]\)/);
});
test("Direct booth request lookup is supported beyond paginated latest-record shortlist",()=>{
  const listing=source("src/app/api/admin/booth-requests/route.ts");
  const page=source("src/app/admin/booths/page.tsx");
  assert.match(listing,/targetId \? \{id: targetId\} : \{\}/);
  assert.match(page,/new URLSearchParams\(window\.location\.search\)\.get\("request"\)/);
  assert.match(page,/\?id="\+encodeURIComponent\(target\)/);
});
