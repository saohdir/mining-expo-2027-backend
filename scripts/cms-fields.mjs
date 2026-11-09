#!/usr/bin/env node
// CMS editable fields for the static public site (frontend repo saohdir/mining-expo-2027-demo).
//
//   node scripts/cms-fields.mjs <frontendDir>            check only: report fields, fail if HTML is not stamped / manifest stale
//   node scripts/cms-fields.mjs <frontendDir> --stamp    add data-cms-f keys (and data-cms-site on header/footer) into the HTML,
//                                                         then write src/lib/page-fields.json
//
// Editable = text leaves (headings, paragraphs, list items, labels…), links (text + href) and images (src + alt) inside each
// designed section [data-cms-block] and inside the shared header (.site-nav-shell) and <footer>. Keys are stamped once into the
// HTML (`data-cms-f="block.N"`) so they stay stable even when other scripts change the DOM; existing keys are never renumbered.
// Stamping inserts only the attribute at the exact source offset (parse5 locations) — the rest of each file is byte-identical.
import fs from "node:fs";
import path from "node:path";
import {parse} from "parse5";

const dir = process.argv[2];
const stamp = process.argv.includes("--stamp");
if (!dir) { console.error("usage: node scripts/cms-fields.mjs <frontendDir> [--stamp]"); process.exit(2); }
const OUT = new URL("../src/lib/page-fields.json", import.meta.url);
const TEXT = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "a", "button", "span", "strong", "em", "small", "dt", "dd", "figcaption", "blockquote", "label", "td", "th", "b", "i", "summary", "time", "cite"]);
const INLINE = new Set(["br", "em", "strong", "b", "i", "small"]);
const SKIP = new Set(["script", "style", "svg", "template", "noscript", "form", "select", "option", "textarea", "input"]);
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
const text = n => (n.childNodes || []).map(c => c.nodeName === "#text" ? c.value : text(c)).join("");
const clean = s => s.replace(/\s+/g, " ").trim();
/** Mini markup used by the CMS for "rich" fields: new line = <br>, *x* = <em>, **x** = <strong>. */
const rich = n => (n.childNodes || []).map(c => c.nodeName === "#text" ? c.value.replace(/\s+/g, " ") : c.tagName === "br" ? "\n" : c.tagName === "em" || c.tagName === "i" ? "*" + clean(text(c)) + "*" : c.tagName === "strong" || c.tagName === "b" ? "**" + clean(text(c)) + "**" : clean(text(c))).join("").split("\n").map(l => l.trim()).join("\n").trim();
const elementKids = n => (n.childNodes || []).filter(c => c.tagName && c.tagName !== "br");

function pageKey(file) { const rel = path.relative(dir, file).replace(/\\/g, "/"); return rel === "index.html" ? "home" : rel.replace(/\/index\.html$/, ""); }

function collect(file) {
  const src = fs.readFileSync(file, "utf8");
  const doc = parse(src, {sourceCodeLocationInfo: true});
  const containers = [];
  const walk = (n, inBlock) => {
    if (!n.tagName && n.nodeName !== "#document" && n.nodeName !== "#document-fragment") return;
    let mine = inBlock;
    if (n.tagName) {
      const block = attr(n, "data-cms-block"), cls = (attr(n, "class") || "").split(/\s+/);
      if (block) mine = {id: block, scope: "page", node: n};
      else if (!inBlock && cls.includes("site-nav-shell")) mine = {id: "site-header", scope: "site", node: n, mark: "header"};
      else if (!inBlock && n.tagName === "footer") mine = {id: "site-footer", scope: "site", node: n, mark: "footer"};
      if (mine !== inBlock) containers.push(mine);
    }
    for (const c of n.childNodes || []) walk(c, mine);
  };
  walk(doc, null);
  const fields = [], inserts = [];
  for (const c of containers) {
    if (c.mark && attr(c.node, "data-cms-site") !== c.mark) inserts.push({at: c.node.sourceCodeLocation.startTag.startOffset + 1 + c.node.tagName.length, s: ` data-cms-site="${c.mark}"`});
    const list = [];
    const visit = n => {
      for (const ch of n.childNodes || []) {
        if (!ch.tagName || SKIP.has(ch.tagName) || attr(ch, "data-cms-kind") !== undefined || attr(ch, "data-cms-skip") !== undefined
          || attr(ch, "data-countdown") !== undefined || attr(ch, "aria-hidden") === "true") continue;
        if (attr(ch, "data-cms-block") && ch !== c.node) continue; // nested sections are their own container
        if (ch.tagName === "img") { list.push({n: ch, kind: "image"}); continue; }
        if (TEXT.has(ch.tagName) && /[\p{L}\p{N}]/u.test(text(ch))) {
          const kids = elementKids(ch), all = (ch.childNodes || []).filter(x => x.tagName);
          // plain: only text; rich: text + <br>/<em>/<strong>/<b>/<i>/<small> without nesting; own: direct text next to icons/spans.
          if (all.length === 0) { list.push({n: ch, kind: "text", mode: "plain"}); continue; }
          if (all.every(x => INLINE.has(x.tagName) && !(x.childNodes || []).some(y => y.tagName))) { list.push({n: ch, kind: "text", mode: "rich"}); continue; }
          if ((ch.childNodes || []).some(x => x.nodeName === "#text" && /[\p{L}\p{N}]/u.test(x.value))) list.push({n: ch, kind: "text", mode: "own"});
          if (kids.length) visit(ch);
          continue;
        }
        visit(ch);
      }
    };
    visit(c.node);
    const used = new Set(list.map(x => attr(x.n, "data-cms-f")).filter(Boolean));
    let next = Math.max(-1, ...[...used].map(k => Number(k.split(".").pop()))) + 1;
    for (const x of list) {
      let key = attr(x.n, "data-cms-f");
      if (!key) { key = `${c.id}.${next++}`; inserts.push({at: x.n.sourceCodeLocation.startTag.startOffset + 1 + x.n.tagName.length, s: ` data-cms-f="${key}"`}); }
      const f = {key, kind: x.kind, tag: x.n.tagName};
      if (x.kind === "image") { f.src = attr(x.n, "src") || ""; f.alt = attr(x.n, "alt") || ""; }
      else { f.mode = x.mode; f.text = (x.mode === "rich" ? rich(x.n) : x.mode === "own" ? clean((x.n.childNodes || []).filter(y => y.nodeName === "#text").map(y => y.value).join(" ")) : clean(text(x.n))).slice(0, 4000); }
      if (x.n.tagName === "a") f.href = attr(x.n, "href") || "";
      fields.push({...f, block: c.id, scope: c.scope});
    }
  }
  return {src, inserts, fields};
}

const files = [];
const find = d => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { if (e.name.startsWith(".") || e.name === "node_modules") continue; const p = path.join(d, e.name); if (e.isDirectory()) find(p); else if (e.name === "index.html") files.push(p); } };
find(dir);
files.sort();
const manifest = {site: {}}; let pending = 0;
const siteSig = new Map();
for (const file of files) {
  const {src, inserts, fields} = collect(file);
  pending += inserts.length;
  if (stamp && inserts.length) {
    let out = src; for (const i of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, i.at) + i.s + out.slice(i.at);
    fs.writeFileSync(file, out);
  }
  const k = pageKey(file);
  const page = {};
  for (const f of fields) {
    const {block, scope, ...rest} = f;
    if (scope === "site") { siteSig.set(file, (siteSig.get(file) || "") + rest.key + rest.kind + "|"); if (k === "home") (manifest.site[block] ||= []).push(rest); }
    else (page[block] ||= []).push(rest);
  }
  manifest[k] = page;
}
const sigs = [...new Set(siteSig.values())];
if (sigs.length > 1) console.warn("WARNING: header/footer structure differs between pages; site-wide edits apply only where the keys match.");
const json = JSON.stringify(manifest, null, 1) + "\n";
const count = Object.values(manifest).reduce((a, p) => a + Object.values(p).reduce((b, l) => b + l.length, 0), 0);
const stale = !fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== json;
if (stamp) { fs.writeFileSync(OUT, json); console.log(`Stamped ${pending} new keys; manifest written: ${count} fields on ${files.length} pages.`); }
else { console.log(`${count} fields, ${pending} unstamped, manifest ${stale ? "STALE" : "up to date"}.`); if (pending || stale) process.exit(1); }
