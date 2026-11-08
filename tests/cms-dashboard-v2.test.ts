import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");

test("every protected admin page shares one responsive shell",()=>{
  const layout=read("src/app/admin/layout.tsx");
  const shell=read("src/app/admin/components/CmsShell.tsx");
  const css=read("src/app/admin/cms-design.css");
  assert.match(layout,/<CmsShell>/);
  for(const name of ["Main","Finance","Operations","Insights","Content","System"]) assert.ok(shell.includes('title:"'+name+'"'));
  assert.match(shell,/item\.roles\.includes\(actor\.role\)/);
  assert.match(css,/width:260px/);
  assert.match(css,/max-width:1279px/);
  assert.match(css,/max-width:767px/);
  assert.match(css,/imdx-cms-record-mobile/);
  assert.match(css,/--color-brand-600:#FF4A04/);
  assert.match(css,/--color-bg-page:#F9F0E2/);
});
test("Overview uses verified server aggregates, never first-page client-side counts",()=>{
  const page=read("src/app/admin/page.tsx");
  const api=read("src/app/api/admin/dashboard/route.ts");
  assert.match(page,/api\/admin\/dashboard/);
  assert.match(api,/db\.enrollment\.count/);
  assert.match(api,/COUNT\(DISTINCT p\."accountId"\)/);
  assert.match(api,/db\.admission\.count/);
  assert.match(api,/db\.passScan\.count/);
  assert.match(api,/needsCount/);
  assert.doesNotMatch(page,/registrations\.length/);
  assert.match(page,/Timezone: WIB/);
});
test("CMS server search is role-scoped; viewer and gate cannot search PII",()=>{
  const source=read("src/app/api/admin/search/route.ts");
  assert.match(source,/\["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"\]/);
  assert.match(source,/\["SUPER_ADMIN","SALES","FINANCE"\]/);
  assert.match(source,/q\.length<2/);
  assert.match(source,/take:4/);
});
test("Notification access no longer exposes Super Admin inbox to every role",()=>{
  const source=read("src/app/api/admin/notifications/route.ts");
  assert.match(source,/role==="SUPER_ADMIN"\?\{\}:\{audienceRole:role/);
  assert.doesNotMatch(source,/audienceRole:\{in:\[actor\.role,"SUPER_ADMIN"\]\}/);
  const diag=read("src/app/api/admin/notification-deliveries/route.ts");
  assert.match(diag,/admin\(\["SUPER_ADMIN","OPERATIONS"\]\)/);
  assert.doesNotMatch(diag,/payload:true/);
});
test("Registry and exports share server filters including search and status",()=>{
  const registry=read("src/app/admin/registrations/page.tsx");
  const exporter=read("src/app/api/admin/reports/export/route.ts");
  for(const field of ["type","status","q","from","to"]) {
    assert.ok(registry.includes('p.set("'+field+'"')||registry.includes('p.set("'+field+'"'));
    assert.ok(exporter.includes(field));
  }
  assert.match(registry,/imdx-cms-record-mobile/);
  assert.match(exporter,/safeCell/);
});
test("Scan screen distinguishes accepted, failure and offline without leaking identity",()=>{
  const source=read("src/app/admin/check-in/page.tsx");
  assert.match(source,/result\.result==="VALID_ACCEPTED"&&result\.person/);
  assert.match(source,/Connection lost — no entry decision/);
  assert.match(source,/!gate\.trim\(\)\|\|!zone/);
  assert.match(source,/Validate with server/);
});
test("Old admin operations remain available separately from new Overview",()=>{
  assert.ok(read("src/app/admin/workspace/page.tsx").includes('tab==="finance"'));
  assert.match(read("src/app/admin/page.tsx"),/role/);
  assert.match(read("src/app/admin/components/CmsShell.tsx"),/admin\/workspace\?section=finance/);
});
