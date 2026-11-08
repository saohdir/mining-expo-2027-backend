// CR-AUTH-01: email OTP only for registration; email + password sign-in; forgot/reset; legacy account setup.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, customerLogin, Client, lastOtp, lastLink, qp, TEST_PASSWORD, MAIL, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const wait = ms => new Promise(r => setTimeout(r, ms));
const start = (c, email, extra = {}) => c.post("/api/auth/register/start", {fullName: "Auth Tester", email, acceptTerms: true, acceptPrivacy: true, ...extra});
const mailsTo = email => (fs.existsSync(MAIL) ? fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)) : []).filter(m => m.to.includes(email)).map(m => ({...m, body: qp(m.body)}));
test.after(() => db.$disconnect());

test("setup: event open", async () => {
  const sa = await adminLogin("SUPER_ADMIN");
  ok(await sa.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E password auth"}), 200, "event");
});

test("Registration: details + consent required; OTP emailed, hashed, wrong/expired codes rejected; OTP never signs in", async () => {
  const c = new Client("reg"), email = `pw-${run}@test.local`;
  const bad = await c.post("/api/auth/register/start", {fullName: "A", email: "nope", acceptTerms: false, acceptPrivacy: false});
  ok(bad, 400, "validation"); for (const f of ["fullName", "email", "acceptTerms", "acceptPrivacy"]) assert.ok(bad.body.issues.some(i => i.field === f), f);
  const r = await start(c, email); ok(r, 200, "start");
  assert.equal(r.body.expiresInSeconds, 300); assert.equal(r.body.resendAfterSeconds, 60);
  await wait(300);
  const code = lastOtp(email);
  const row = await db.otpChallenge.findUnique({where: {id: r.body.challengeId}});
  assert.equal(row.purpose, "REGISTER"); assert.notEqual(row.codeHash, code);
  ok(await c.post("/api/auth/register/verify", {challengeId: r.body.challengeId, code: code === "000000" ? "111111" : "000000"}), 400, "wrong code");
  ok(await new Client("x").post("/api/auth/login", {email, password: "anything123"}), 401, "pending account cannot sign in");
  ok(await c.post("/api/auth/register/resend", {challengeId: r.body.challengeId}), 429, "resend cooldown");
  await db.otpChallenge.update({where: {id: r.body.challengeId}, data: {createdAt: new Date(Date.now() - 61000)}});
  const rs = await c.post("/api/auth/register/resend", {challengeId: r.body.challengeId}); ok(rs, 200, "resend");
  await wait(300);
  ok(await c.post("/api/auth/register/verify", {challengeId: r.body.challengeId, code}), 400, "old code invalid after resend");
  await db.otpChallenge.update({where: {id: rs.body.challengeId}, data: {expiresAt: new Date(Date.now() - 1000)}});
  const exp = await c.post("/api/auth/register/verify", {challengeId: rs.body.challengeId, code: lastOtp(email)}); ok(exp, 400, "expired"); assert.equal(exp.body.error, "OTP_EXPIRED");
  await db.otpChallenge.update({where: {id: rs.body.challengeId}, data: {createdAt: new Date(Date.now() - 61000)}});
  const rs2 = await c.post("/api/auth/register/resend", {challengeId: rs.body.challengeId}); ok(rs2, 200, "resend 2");
  await wait(300);
  const v = await c.post("/api/auth/register/verify", {challengeId: rs2.body.challengeId, code: lastOtp(email)});
  ok(v, 200, "verified"); assert.ok(v.body.setupToken);
  assert.ok(!(v.headers.get("set-cookie") || "").includes("imdx_customer_session"), "OTP verification never creates a session");
  ok(await c.get("/api/customer/me"), 401, "not signed in yet");
  ok(await c.post("/api/auth/register/verify", {challengeId: rs2.body.challengeId, code: lastOtp(email)}), 400, "OTP single use");
  S.reg = {c, email, token: v.body.setupToken};
});

test("Create password: mismatch and weak rejected; success activates, hashes and signs in; token single use", async () => {
  const {c, email, token} = S.reg;
  ok(await c.post("/api/auth/password/set", {token, password: "Tambang2027x", confirmPassword: "Tambang2027y"}), 400, "mismatch");
  ok(await c.post("/api/auth/password/set", {token, password: "short1", confirmPassword: "short1"}), 400, "weak");
  ok(await c.post("/api/auth/password/set", {token: "x".repeat(43), password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD}), 400, "forged token");
  const p = await c.post("/api/auth/password/set", {token, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD}); ok(p, 200, "set"); assert.equal(p.body.signedIn, true);
  ok(await c.get("/api/customer/me"), 200, "signed in after registration");
  const acc = await db.customerAccount.findFirst({where: {email}});
  assert.equal(acc.status, "ACTIVE"); assert.ok(acc.passwordHash.startsWith("scrypt$")); assert.ok(!acc.passwordHash.includes(TEST_PASSWORD));
  assert.ok(!fs.readFileSync(MAIL, "utf8").includes(TEST_PASSWORD), "password never emailed");
  ok(await new Client("z").post("/api/auth/password/set", {token, password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD}), 400, "token reused");
});

test("Duplicate registration is generic: no OTP, an 'already registered' email instead", async () => {
  const before = mailsTo(S.reg.email).length;
  const r = await start(new Client("dup"), S.reg.email); ok(r, 200, "generic");
  await wait(300);
  const mails = mailsTo(S.reg.email).slice(before);
  assert.ok(mails.some(m => /already have an account/i.test(m.body)) && !mails.some(m => /code is \d{6}/.test(m.body)), "notice, no code");
  ok(await new Client("dup").post("/api/auth/register/verify", {challengeId: r.body.challengeId, code: "123456"}), 400, "decoy challenge");
});

test("Login: email + password, generic errors, no OTP, session persistence/expiry/logout, throttling, CSRF", async () => {
  const before = mailsTo(S.reg.email).length;
  const c = await customerLogin(S.reg.email);
  ok(await c.get("/api/customer/me"), 200, "session"); ok(await c.get("/api/customer/invoices"), 200, "session persists across requests");
  assert.equal(mailsTo(S.reg.email).length, before, "no OTP email on sign-in");
  const wrong = await new Client("w").post("/api/auth/login", {email: S.reg.email, password: "Wrong2027xx"});
  const unknown = await new Client("w").post("/api/auth/login", {email: `ghost-${run}@test.local`, password: "Wrong2027xx"});
  ok(wrong, 401, "wrong password"); ok(unknown, 401, "unknown email"); assert.equal(wrong.body.message, unknown.body.message, "no enumeration");
  const cross = await fetch(BASE + "/api/auth/login", {method: "POST", headers: {"content-type": "application/json", origin: "https://evil.example"}, body: JSON.stringify({email: S.reg.email, password: TEST_PASSWORD})});
  assert.equal(cross.status, 403, "cross-site login blocked");
  ok(await c.post("/api/auth/logout", {}), 200, "logout"); ok(await c.get("/api/customer/me"), 401, "logged out");
  const c2 = await customerLogin(S.reg.email);
  await db.customerSession.updateMany({where: {account: {email: S.reg.email}, revokedAt: null}, data: {expiresAt: new Date(Date.now() - 1000)}});
  ok(await c2.get("/api/customer/me"), 401, "expired session rejected");
  const target = `throttle-${run}@test.local`;
  await customerSignup(target, "Throttle Target");
  for (let i = 0; i < 5; i++) ok(await new Client("t").post("/api/auth/login", {email: target, password: "Wrong2027x" + i}), 401, "fail " + i);
  ok(await new Client("t").post("/api/auth/login", {email: target, password: TEST_PASSWORD}), 429, "locked out after 5 failures (even with correct password)");
  assert.ok(await db.auditLog.count({where: {action: "CUSTOMER_LOGIN_FAILED", account: undefined}}) >= 1);
  const audits = JSON.stringify(await db.auditLog.findMany({where: {action: {in: ["CUSTOMER_LOGIN_FAILED", "CUSTOMER_SIGNED_IN"]}}, take: 50}));
  assert.ok(!audits.includes(TEST_PASSWORD) && !audits.includes("Wrong2027x"), "no passwords in audit");
});

test("Retired OTP login endpoints fail closed (no bypass)", async () => {
  ok(await new Client("o").post("/api/auth/request-otp", {mode: "login", channel: "EMAIL", email: S.reg.email}), 410, "request-otp gone");
  ok(await new Client("o").post("/api/auth/verify-otp", {challengeId: "00000000-0000-0000-0000-000000000000", code: "123456"}), 410, "verify-otp gone");
});

test("Forgot password: generic, emailed single-use link; invalid/expired/reused rejected; old password stops working; sessions revoked", async () => {
  const email = S.reg.email, live = await customerLogin(email);
  const f = await new Client("f").post("/api/auth/password/forgot", {email}); ok(f, 200, "forgot");
  const g = await new Client("f").post("/api/auth/password/forgot", {email: `nobody-${run}@test.local`}); assert.equal(f.body.message, g.body.message, "generic");
  await wait(300);
  const token = lastLink(email);
  assert.equal((await new Client("f").get("/api/auth/password/token?token=" + token)).body.purpose, "RESET");
  ok(await new Client("f").post("/api/auth/password/set", {token: "bogus".repeat(9), password: "NewTambang2028", confirmPassword: "NewTambang2028"}), 400, "invalid token");
  ok(await new Client("f").post("/api/auth/password/set", {token, password: "NewTambang2028", confirmPassword: "NewTambang2028"}), 200, "reset");
  ok(await new Client("f").post("/api/auth/password/set", {token, password: "Other2028pass", confirmPassword: "Other2028pass"}), 400, "token reused");
  ok(await live.get("/api/customer/me"), 401, "existing sessions revoked");
  ok(await new Client("f").post("/api/auth/login", {email, password: TEST_PASSWORD}), 401, "old password rejected");
  await customerLogin(email, "NewTambang2028");
  ok(await new Client("f").post("/api/auth/password/forgot", {email}), 200, "second request");
  await wait(300);
  const t2 = lastLink(email);
  await db.authToken.updateMany({where: {usedAt: null, account: undefined, purpose: "RESET"}, data: {expiresAt: new Date(Date.now() - 1000)}});
  ok(await new Client("f").post("/api/auth/password/set", {token: t2, password: "Expired2028x", confirmPassword: "Expired2028x"}), 400, "expired token");
});

test("Legacy OTP-only account: cannot sign in, sets a password via emailed link, keeps all bookings", async () => {
  const email = `legacy-${run}@test.local`;
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const acc = await db.customerAccount.create({data: {email, status: "ACTIVE", verifiedEmailAt: new Date("2026-11-01"), profile: {create: {fullName: "Legacy Person", consentAt: new Date(), consentVersion: "v1.3"}},
    enrollments: {create: {eventId: ev.id, type: "VISITOR", status: "CONFIRMED", profileSnapshot: {fullName: "Legacy Person"}, consentAt: new Date()}}}});
  ok(await new Client("l").post("/api/auth/login", {email, password: "Guess2027xx"}), 401, "no password → no sign-in");
  ok(await start(new Client("l"), email), 200, "registering again is generic");
  await wait(300);
  assert.ok(mailsTo(email).some(m => /set up your password/i.test(m.body)), "setup link sent instead of a code");
  const token = lastLink(email);
  assert.equal((await new Client("l").get("/api/auth/password/token?token=" + token)).body.purpose, "SETUP");
  ok(await new Client("l").post("/api/auth/password/set", {token, password: "Legacy2027pw", confirmPassword: "Legacy2027pw"}), 200, "setup");
  const c = await customerLogin(email, "Legacy2027pw");
  const me = (await c.get("/api/customer/me")).body;
  assert.equal(me.id, acc.id); assert.equal(me.enrollments.length, 1, "bookings preserved");
  assert.equal((await db.customerAccount.findUnique({where: {id: acc.id}})).verifiedEmailAt.toISOString(), "2026-11-01T00:00:00.000Z", "verification history unchanged");
});

test("Admin authentication unaffected; customer APIs still protected", async () => {
  ok(await (await adminLogin("FINANCE")).get("/api/admin/me"), 200, "admin login");
  ok(await new Client("anon").get("/api/customer/me"), 401, "customer API protected");
});

test("Login works while new registration is disabled (separate flags)", {skip: process.env.E2E_CLOSED_BASE_URL ? false : "closed-registration server not started"}, async () => {
  const base = process.env.E2E_CLOSED_BASE_URL;
  const r = await fetch(base + "/api/auth/register/start", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({fullName: "X Y", email: `closed-${run}@test.local`, acceptTerms: true, acceptPrivacy: true})});
  assert.equal(r.status, 503, "registration closed");
  const l = await fetch(base + "/api/auth/login", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: `legacy-${run}@test.local`, password: "Legacy2027pw"})});
  assert.equal(l.status, 200, "existing customer can still sign in");
});
