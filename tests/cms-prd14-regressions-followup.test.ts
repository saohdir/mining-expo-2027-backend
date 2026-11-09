import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");

test("Sales attendance report matches visible CMS Reports permission and remains aggregate-only",()=>{
  const route=read("src/app/api/admin/reports/attendance/route.ts");
  const nav=read("src/app/admin/components/CmsShell.tsx");
  assert.match(route,/admin\(\["SUPER_ADMIN",\s*"OPERATIONS",\s*"FINANCE",\s*"SALES",\s*"VIEWER"\]\)/);
  assert.match(nav,/Reports & exports/);
  assert.match(route,/registeredUnique:/);
  assert.match(route,/arrivedUnique:/);
  assert.doesNotMatch(route,/profile:\s*\{select/);
});

test("Legacy workspace fetches only role-permitted modules, not every endpoint for every role",()=>{
  const code=read("src/app/admin/workspace/page.tsx");
  assert.match(code,/const permitted=modules\.filter\(module=>module\.roles\.includes\(user\.role\)\)/);
  assert.match(code,/Promise\.allSettled\(permitted\.map\(module=>api\(module\.url\)\)\)/);
  assert.match(code,/setModuleErrors\(failures\)/);
  assert.doesNotMatch(code,/Promise\.allSettled\(endpoints\.map/);
  assert.match(code,/\["SUPER_ADMIN","FINANCE"\]\.includes\(actor\.role\)&&x\.status==="DRAFT"/);
  assert.match(code,/\["SUPER_ADMIN","OPERATIONS"\]\.includes\(actor\.role\)&&r\.status/);
  assert.match(code,/\?request="\+encodeURIComponent\(b\.id\)/);
});

test("QR camera processes at most one pending validation and always stops before next scan",()=>{
  const code=read("src/app/admin/check-in/page.tsx");
  assert.match(code,/const scanLock=useRef\(false\)/);
  assert.match(code,/if\(!token\.trim\(\)\|\|scanLock\.current\)return/);
  const locked=code.indexOf("scanLock.current=true");
  const posted=code.indexOf('fetch("/api/admin/check-in/scan"');
  assert.ok(locked>=0&&posted>locked);
  assert.match(code,/setScanning\(false\);setWorking\(false\);if\(!scanning\)scanLock\.current=false/);
  assert.match(code,/client\.stop\(\)\.catch\(\(\)=>\{\}\)\.finally\(\(\)=>\{client\?\.clear\(\);scanLock\.current=false\}\)/);
  assert.match(code,/response\.status===401\|\|response\.status===403/);
  assert.match(code,/ALREADY_CHECKED_IN/);
  assert.match(code,/INVALID/);
  assert.match(code,/No admission was granted/);
});

test("Notification bulk read applies role scope to all updated records in one query",()=>{
  const api=read("src/app/api/admin/notifications/route.ts");
  const page=read("src/app/admin/notifications/page.tsx");
  assert.match(api,/ids:z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)\.max\(100\)/);
  assert.match(api,/where:\{id:\{in:ids\},\.\.\.scope\(actor\.role\),readAt:null\}/);
  assert.match(page,/body:JSON\.stringify\(ids\.length===1\?\{id:ids\[0\]\}:\{ids\}\)/);
  assert.doesNotMatch(page,/for\(const id of ids\)/);
  assert.match(page,/imdx:notifications-updated/);
  assert.match(read("src/app/admin/components/CmsShell.tsx"),/addEventListener\("imdx:notifications-updated",reloadNotes\)/);
});

test("New programme draft is selected immediately after create instead of first alphabetical record",()=>{
  const code=read("src/app/admin/programmes/page.tsx");
  assert.match(code,/return created\.id as string/);
  assert.match(code,/const target=await fn\(\)/);
  assert.match(code,/await load\(typeof target==="string"\?target:undefined\)/);
  assert.match(code,/records\.find\(x=>x\.id===\(preferredId\|\|id\)\)/);
});

test("Booth request list stays populated after saving a selected request outside latest 100",()=>{
  const code=read("src/app/admin/booths/page.tsx");
  assert.match(code,/async function fetchBoothList\(target:string\|undefined,query:ListQuery\)/);
  assert.match(code,/const data=await api\("\/api\/admin\/booth-requests\?"\+p\)/);
  assert.match(code,/if\(target&&!records\.some\(record=>record\.id===target\)\)/);
  assert.match(code,/return \{records:\[selected,\.\.\.records\]/);
  assert.match(code,/await fetchBoothList\(target,query\)/);
});
