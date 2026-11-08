// Shared helpers for API-level E2E tests against a running IMDX app.
// Run only against a LOCAL or disposable test environment — never UAT/production data.
import fs from "node:fs";
export const BASE = process.env.E2E_BASE_URL || "http://localhost:3100";
export const MAIL = process.env.E2E_MAIL_FILE || "/var/tmp/imdx-s1/mail.jsonl";
export class Client {
  constructor(name){this.name=name;this.jar=new Map();}
  async req(method,path,body){
    const headers={"content-type":"application/json",origin:BASE};
    if(this.jar.size)headers.cookie=[...this.jar].map(([k,v])=>k+"="+v).join("; ");
    const res=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:"manual"});
    for(const c of res.headers.getSetCookie?.()||[]){const [kv]=c.split(";");const i=kv.indexOf("=");const k=kv.slice(0,i),v=kv.slice(i+1);if(!v||/Max-Age=0/i.test(c))this.jar.delete(k);else this.jar.set(k,v);}
    const text=await res.text();let json;try{json=JSON.parse(text)}catch{json=text}
    return {status:res.status,body:json,headers:res.headers};
  }
  get(p){return this.req("GET",p)} post(p,b){return this.req("POST",p,b??{})} patch(p,b){return this.req("PATCH",p,b)} put(p,b){return this.req("PUT",p,b)} del(p,b){return this.req("DELETE",p,b)}
}
export async function adminLogin(role,name){
  const c=new Client(name||role);
  const r=await c.post("/api/admin/auth/login",{email:(name||role.toLowerCase())+"@test.local",password:process.env.E2E_ADMIN_PASSWORD_PREFIX?process.env.E2E_ADMIN_PASSWORD_PREFIX+role:"local-test-password-"+role});
  if(r.status!==200)throw new Error("login failed "+role+" "+r.status);
  return c;
}
export function lastOtp(email){
  const lines=fs.existsSync(MAIL)?fs.readFileSync(MAIL,"utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l)):[];
  for(let i=lines.length-1;i>=0;i--){if(lines[i].to.includes(email)){const m=lines[i].body.match(/code is (\d{6})/);if(m)return m[1];}}
  throw new Error("no OTP for "+email);
}
export const TEST_PASSWORD = "Tambang2027x";
/** Decode quoted-printable bodies captured by the SMTP sink (soft breaks, =3D etc.). */
export const qp = body => body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
export function lastLink(email){
  const lines=fs.existsSync(MAIL)?fs.readFileSync(MAIL,"utf8").trim().split("\n").filter(Boolean).map(l=>JSON.parse(l)):[];
  for(let i=lines.length-1;i>=0;i--){if(lines[i].to.includes(email)){const m=qp(lines[i].body).match(/reset-password\?token=([A-Za-z0-9_%-]+)/);if(m)return decodeURIComponent(m[1]);}}
  throw new Error("no reset link for "+email);
}
/** CR-AUTH-01 registration: details → email OTP → create password (signs in). */
export async function customerSignup(email,name,password=TEST_PASSWORD){
  const c=new Client(email);
  const r=await c.post("/api/auth/register/start",{fullName:name,email,acceptTerms:true,acceptPrivacy:true});
  if(r.status!==200)throw new Error("register "+r.status+" "+JSON.stringify(r.body));
  await new Promise(s=>setTimeout(s,300));
  const v=await c.post("/api/auth/register/verify",{challengeId:r.body.challengeId,code:lastOtp(email)});
  if(v.status!==200)throw new Error("verify "+v.status+" "+JSON.stringify(v.body));
  const p=await c.post("/api/auth/password/set",{token:v.body.setupToken,password,confirmPassword:password});
  if(p.status!==200)throw new Error("password "+p.status+" "+JSON.stringify(p.body));
  return c;
}
export async function customerLogin(email,password=TEST_PASSWORD){
  const c=new Client(email);
  const r=await c.post("/api/auth/login",{email,password});
  if(r.status!==200)throw new Error("login "+r.status+" "+JSON.stringify(r.body));
  return c;
}
