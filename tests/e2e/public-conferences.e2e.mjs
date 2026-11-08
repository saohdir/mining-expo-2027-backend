// FR-006: public conference listing/detail — published only, no invented fields, register via account.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, BASE} from "./lib.mjs";
const db = new PrismaClient();
const run = Date.now().toString(36);
test.after(() => db.$disconnect());
const html = async p => { const r = await fetch(BASE + p); return {status: r.status, text: await r.text()}; };

test("listing shows published programmes only; detail shows TBA/free/fee honestly and links to the account", async () => {
  const sa = await adminLogin("SUPER_ADMIN");
  assert.equal((await sa.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E conference pages"})).status, 200);
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const tba = await db.conference.create({data: {eventId: ev.id, title: "TBA Forum " + run, slug: "tba-" + run, published: true}});
  const paid = await db.conference.create({data: {eventId: ev.id, title: "Paid Summit " + run, slug: "paid-" + run, published: true, feeMinor: 2500000n, capacity: 5, startsAt: new Date("2027-05-27T02:00:00Z")}});
  await db.conference.create({data: {eventId: ev.id, title: "Hidden Draft " + run, slug: "draft-" + run, published: false}});
  await db.contentItem.create({data: {kind: "PAGE_BLOCK", locale: "en", slug: "conference-paid-" + run, title: "x", summary: "Downstream strategy for 2030.", body: "Panel one.\n\nPanel two.", status: "PUBLISHED", updatedBy: "e2e", publishedAt: new Date()}});
  const list = await html("/conferences");
  assert.equal(list.status, 200); assert.ok(list.text.includes("TBA Forum " + run) && list.text.includes("Paid Summit " + run)); assert.ok(!list.text.includes("Hidden Draft " + run), "draft hidden");
  const t = await html("/conferences/tba-" + run);
  assert.equal(t.status, 200); assert.match(t.text, /To be announced/); assert.match(t.text, /Programme details will be announced/); assert.match(t.text, /Registration is not open yet/);
  const p = await html("/conferences/paid-" + run);
  assert.match(p.text, /IDR 2\.500\.000/); assert.match(p.text, /27 May 2027/); assert.match(p.text, /09:00 WIB/); assert.match(p.text, /Downstream strategy for 2030/);
  assert.ok(p.text.includes("/account?tab=conference&amp;conference=" + paid.id), "register link preselects programme");
  assert.match(p.text, /application\/ld\+json/); assert.match(p.text, /<link rel="canonical" href="[^"]*\/conferences\/paid-/);
  assert.equal((await html("/conferences/draft-" + run)).status, 404, "unpublished detail 404");
  assert.equal((await html("/conferences/nope-" + run)).status, 404);
  void tba;
});
