// CMS pages & layout: drafts private, validation, publish/revisions/rollback, RBAC, locale fallback.
import {test} from "node:test";
import assert from "node:assert/strict";
import {adminLogin, Client} from "./lib.mjs";

const R = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const pub = (k, q = "") => new Client("anon").get(`/api/public/pages/${k}${q}`);

test("setup", async () => { for (const r of ["SUPER_ADMIN", "CONTENT_EDITOR", "SALES", "VIEWER"]) R[r] = await adminLogin(r); });

test("page list + default layout = designed sections in original order", async () => {
  const l = await R.VIEWER.get("/api/admin/pages"); ok(l, 200, "list");
  assert.ok(l.body.pages.some(p => p.key === "home" && p.path === "/") && l.body.pages.some(p => p.key === "contact"));
  const d = await R.CONTENT_EDITOR.get("/api/admin/pages/about"); ok(d, 200, "detail");
  assert.deepEqual(d.body.draft.blocks.map(b => b.ref), d.body.sections.map(s => s.id));
  assert.equal((await pub("about")).body.layout, null, "nothing published → original design");
  ok(await R.CONTENT_EDITOR.get("/api/admin/pages/secret-page"), 404, "unknown page");
});

test("validation: unknown sections, unsafe links, raw HTML-free text, images need alt; RBAC", async () => {
  const d = (await R.CONTENT_EDITOR.get("/api/admin/pages/about")).body;
  const blocks = d.draft.blocks;
  ok(await R.SALES.req("PUT", "/api/admin/pages/about", {seo: {title: "", description: ""}, blocks}), 403, "sales cannot edit");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", {blocks: [...blocks, {id: "x", type: "static", ref: "not-a-section", hidden: false}]}), 400, "unknown section");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", {blocks: [...blocks, {id: "c1", type: "cta", hidden: false, data: {heading: "Go", text: "", buttonLabel: "Click", buttonHref: "javascript:alert(1)"}}]}), 400, "unsafe link");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", {blocks: [...blocks, {id: "i1", type: "image", hidden: false, data: {imageUrl: "/assets/x.webp", imageAlt: "", caption: ""}}]}), 400, "alt required");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", {blocks: [...blocks, {id: "h1", type: "text", hidden: false, data: {heading: "x", body: "y", onclick: "z"}}]}), 400, "unknown fields rejected");
});

test("draft → publish → public; revisions; rollback; restore original design; locale fallback", async () => {
  const d = (await R.CONTENT_EDITOR.get("/api/admin/pages/about")).body;
  const [first, ...rest] = d.draft.blocks;
  const layout = {seo: {title: "About IMDX 2027 | CMS", description: "Managed by CMS"}, blocks: [
    {id: "t1", type: "text", hidden: false, data: {eyebrow: "UPDATE", heading: "Organizer message", body: "First paragraph.\n\n- point one\n- point two"}},
    ...rest, {...first, hidden: true}]};
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", layout), 200, "save draft");
  assert.equal((await pub("about")).body.layout, null, "draft not public");
  ok(await R.CONTENT_EDITOR.post("/api/admin/pages/about/publish", {reason: "short"}), 400, "reason required");
  const p1 = await R.CONTENT_EDITOR.post("/api/admin/pages/about/publish", {reason: "Add organizer message"}); ok(p1, 200, "publish"); assert.equal(p1.body.version, 1);
  const live = (await pub("about")).body; assert.equal(live.version, 1); assert.equal(live.layout.blocks[0].data.heading, "Organizer message"); assert.equal(live.layout.blocks.at(-1).hidden, true);
  assert.equal((await pub("about", "?locale=id")).body.layout.seo.title, "About IMDX 2027 | CMS", "ID falls back to EN");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/about", {...layout, blocks: layout.blocks.filter(b => b.id !== "t1")}), 200, "draft v2");
  ok(await R.SUPER_ADMIN.post("/api/admin/pages/about/publish", {reason: "Remove message"}), 200, "publish v2");
  ok(await R.SALES.post("/api/admin/pages/about/rollback", {version: 1, reason: "sales attempt"}), 403, "sales rollback");
  const rb = await R.CONTENT_EDITOR.post("/api/admin/pages/about/rollback", {version: 1, reason: "Message was correct after all"}); ok(rb, 200, "rollback"); assert.equal(rb.body.version, 3);
  assert.equal((await pub("about")).body.layout.blocks[0].id, "t1", "v1 content live again as v3");
  const revs = (await R.CONTENT_EDITOR.get("/api/admin/pages/about")).body.revisions; assert.deepEqual(revs.map(r => r.version), [3, 2, 1], "history kept");
  ok(await R.CONTENT_EDITOR.post("/api/admin/pages/about/rollback", {version: 0, reason: "Back to the designed page"}), 200, "restore original");
  assert.equal((await pub("about")).body.layout, null, "original design");
});
