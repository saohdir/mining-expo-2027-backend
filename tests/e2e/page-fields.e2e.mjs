// CMS editing of text/links/images inside designed sections and the shared header/footer ("site" page).
import {test} from "node:test";
import assert from "node:assert/strict";
import {adminLogin, Client} from "./lib.mjs";

const R = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(async () => { if (R.SUPER_ADMIN) { await R.SUPER_ADMIN.post("/api/admin/pages/home/rollback", {version: 0, reason: "Restore design after field test"}); await R.SUPER_ADMIN.post("/api/admin/pages/site/rollback", {version: 0, reason: "Restore design after field test"}); } });

test("field manifest, validation, publish, public delivery, site header/footer", async () => {
  for (const r of ["SUPER_ADMIN", "CONTENT_EDITOR", "SALES"]) R[r] = await adminLogin(r);
  const list = (await R.CONTENT_EDITOR.get("/api/admin/pages")).body.pages;
  assert.ok(list.some(p => p.key === "site"), "site header/footer listed");
  const home = (await R.CONTENT_EDITOR.get("/api/admin/pages/home")).body;
  const hero = home.fields["indonesia-mining-downstream"]; assert.ok(hero?.length > 3, "hero fields present");
  const p = hero.find(f => f.tag === "p" && f.mode === "plain"), h1 = hero.find(f => f.tag === "h1"), img = Object.values(home.fields).flat().find(f => f.kind === "image");
  const base = {seo: home.draft.seo, blocks: home.draft.blocks};
  const put = (fields, who = R.CONTENT_EDITOR) => who.req("PUT", "/api/admin/pages/home", {...base, fields});
  ok(await put({[p.key]: {text: "x"}}, R.SALES), 403, "sales cannot edit");
  ok(await put({"nope.1": {text: "x"}}), 400, "unknown field");
  ok(await put({[p.key]: {src: "/assets/a.webp"}}), 400, "text field cannot take an image");
  ok(await put({[p.key]: {text: "   "}}), 400, "empty text");
  ok(await put({[p.key]: {text: "Hi", href: "/x"}}), 400, "href only on links");
  if (img) ok(await put({[img.key]: {src: "javascript:alert(1)"}}), 400, "unsafe image URL");
  ok(await put({[p.key]: {text: "<script>bad()</script>Edited intro", mode: "plain"}, [h1.key]: {text: "New title\n*Edited line*", mode: "rich"}}), 200, "save draft");
  assert.equal((await new Client("anon").get("/api/public/pages/home")).body.layout, null, "draft not public");
  ok(await R.CONTENT_EDITOR.post("/api/admin/pages/home/publish", {reason: "Edit hero copy"}), 200, "publish");
  const pub = (await new Client("anon").get("/api/public/pages/home")).body.layout;
  assert.equal(pub.fields[p.key].text, "<script>bad()</script>Edited intro", "stored as text; frontend renders via textContent");
  const site = (await R.CONTENT_EDITOR.get("/api/admin/pages/site")).body;
  const nav = site.fields["site-header"].find(f => f.tag === "a"), foot = site.fields["site-footer"].find(f => f.kind === "text");
  assert.ok(nav && foot, "header/footer fields");
  ok(await R.CONTENT_EDITOR.req("PUT", "/api/admin/pages/site", {seo: {title: "", description: ""}, blocks: [], fields: {[nav.key]: {text: "Beranda IMDX", href: "/about/"}, [foot.key]: {text: "Footer edited"}}}), 200, "site draft");
  ok(await R.SUPER_ADMIN.post("/api/admin/pages/site/publish", {reason: "Header and footer copy"}), 200, "site publish");
  assert.equal((await new Client("anon").get("/api/public/pages/site")).body.layout.fields[nav.key].href, "/about/");
});
