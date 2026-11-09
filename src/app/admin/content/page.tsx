"use client";
import {useCallback, useEffect, useState} from "react";
import CmsStatus from "../components/CmsStatus";
type Item = {id: string; kind: string; locale: string; title: string; slug: string; summary: string | null; body: string | null; url: string | null; fileType: string | null; imageUrl: string | null; altText: string | null; rightsStatus: string | null; role: string | null; status: string; sortOrder: number; updatedAt: string; publishedAt: string | null};
const KINDS = ["PARTNER", "ORGANIZER", "DOWNLOAD", "NEWS", "SCOPE", "CONTACT", "PAGE_BLOCK"];
const LABEL: Record<string, string> = {NEWS: "News & updates", ORGANIZER: "Organizers", PARTNER: "Media partners"};
const LOGO_KINDS = ["ORGANIZER", "PARTNER"];
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || (j.issues ? j.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Request failed")); return j; };
const EMPTY = {title: "", slug: "", locale: "en", summary: "", body: "", url: "", fileType: "", imageUrl: "", altText: "", rightsStatus: "", role: "", sortOrder: "0"};
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
/** FR-005/009/034/035/038 content: drafts visible only in CMS; publish requires rights + alt text for media. NEWS = home "Exhibition insights & updates" cards + article pages. */
export default function ContentPage() {
  const [items, setItems] = useState<Item[]>([]), [kind, setKind] = useState("PARTNER"), [msg, setMsg] = useState("");
  const [f, setF] = useState(EMPTY), [editing, setEditing] = useState<Item | null>(null), [arming, setArming] = useState("");
  const load = useCallback(async () => { try { setItems((await call("/api/admin/content?kind=" + kind)).items); } catch (e) { setMsg((e as Error).message); } }, [kind]);
  useEffect(() => { void load(); setEditing(null); setF(EMPTY); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } };
  const opt = (v: string) => v.trim() ? v.trim() : null;
  const news = kind === "NEWS", logos = LOGO_KINDS.includes(kind), ordered = news || logos;
  const edit = (i: Item) => { setEditing(i); setF({title: i.title, slug: i.slug, locale: i.locale, summary: i.summary || "", body: i.body || "", url: i.url || "", fileType: i.fileType || "", imageUrl: i.imageUrl || "", altText: i.altText || "",
    rightsStatus: i.rightsStatus || "", role: i.role || "", sortOrder: String(i.sortOrder)}); setMsg(""); setTimeout(() => document.getElementById("content-form")?.scrollIntoView({behavior: "smooth"}), 0); };
  const payload = () => ({title: f.title, slug: f.slug, summary: opt(f.summary), body: opt(f.body), url: opt(f.url), fileType: opt(f.fileType), imageUrl: opt(f.imageUrl), altText: opt(f.altText),
    rightsStatus: opt(f.rightsStatus), role: opt(f.role), sortOrder: Math.max(0, Math.min(9999, Number(f.sortOrder) || 0))});
  const preview = (i: Item) => (i.locale === "zh" ? "/zh" : "") + "/news/article/?slug=" + encodeURIComponent(i.slug);
  return <main className="cms-page"><header><p className="eyebrow">CONTENT</p><h1>Website content</h1><p>Partners, organizers, downloads, news and contact details shown on the public website. Only PUBLISHED items are public.
    {news && <> News items appear as the cards of <strong>Exhibition insights &amp; updates</strong> on the home page and /news/ (3 per page, with pagination); each card opens its own article page.</>}
    {kind === "ORGANIZER" && <> Organizers appear as logo cards in <strong>Organizer &amp; Partners</strong> on /partners/ and the home page, in the order below.</>}
    {kind === "PARTNER" && <> Media partners appear as logo cards in <strong>Media Partners</strong> on /partners/ (the section is hidden while none is published).</>}</p></header>
    <div className="tabline">{KINDS.map(k => <button key={k} type="button" className={k === kind ? "chosen" : ""} onClick={() => setKind(k)}>{LABEL[k] || k}</button>)}</div>
    {msg && <p role="status" className="micro">{msg}</p>}
    <table className="cms-table"><thead><tr>{logos && <th>Logo</th>}<th>Title</th><th>Locale</th><th>Status</th>{ordered && <th>Order</th>}<th>Rights</th><th /></tr></thead><tbody>
      {items.map(i => <tr key={i.id}>{logos && <td>{i.imageUrl ? <img className="content-logo-thumb" src={i.imageUrl} alt="" /> : <span className="micro">no logo</span>}</td>}<td>{i.title}<br /><span className="micro">{i.slug}{i.role ? " · " + i.role : ""}</span></td><td>{i.locale}</td><td><CmsStatus domain="Content" value={i.status}/></td>{ordered && <td>{i.sortOrder}</td>}<td>{i.rightsStatus || "—"}</td>
        <td><div className="cms-row-actions">
          <button className="ghost cms-small" onClick={() => edit(i)}>Edit</button>
          {i.status !== "PUBLISHED" && <button className="cms-small" onClick={() => void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "PUBLISHED", reason: "Publish approved content"}), "Published.")}>Publish</button>}
          {i.status === "PUBLISHED" && <button className="ghost cms-small" onClick={() => void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "DRAFT", reason: "Unpublish for review"}), "Moved to draft.")}>Unpublish</button>}
          {news && i.status === "PUBLISHED" && <a className="cms-small" href={preview(i)} target="_blank" rel="noreferrer">View page ↗</a>}
          {i.status !== "ARCHIVED" && (arming === i.id ? <><button className="cms-small cms-danger" onClick={() => { setArming(""); void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "ARCHIVED", reason: "Archive outdated content"}), "Archived. It is no longer shown on the website; publish it again to restore."); }}>Confirm archive</button>
            <button className="ghost cms-small" onClick={() => setArming("")}>Keep</button></> : <button className="ghost cms-small" onClick={() => setArming(i.id)}>Archive</button>)}</div></td></tr>)}
    </tbody></table>
    <h2 id="content-form">{editing ? `Edit “${editing.title}” (${editing.locale})` : `New ${(LABEL[kind] || kind).toLowerCase()} draft`}</h2>
    {editing && <p className="micro">Changes to a published item are live immediately after saving. <button type="button" className="link" onClick={() => { setEditing(null); setF(EMPTY); }}>Cancel editing</button></p>}
    {news && !editing && <p className="micro">Add the English version and a 中文 version with the <strong>same slug</strong>; the Chinese site shows the 中文 version (or English when there is none).</p>}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(async () => {
      if (editing) { await call("/api/admin/content/" + editing.id, "PATCH", {...payload(), reason: "Content edited in CMS"}); setEditing(null); setF(EMPTY); }
      else { await call("/api/admin/content", "POST", {kind, locale: f.locale, ...payload()}); setF(EMPTY); }
    }, editing ? "Saved." : "Draft saved."); }}>
      <label>Title<input required minLength={2} maxLength={200} value={f.title} onChange={e => setF({...f, title: e.target.value, slug: !editing && (f.slug === "" || f.slug === slugify(f.title)) ? slugify(e.target.value) : f.slug})} /></label>
      <label>Slug (a-z, 0-9, -){news && " — part of the article address"}<input required pattern="[a-z0-9-]{2,80}" value={f.slug} onChange={e => setF({...f, slug: e.target.value})} /></label>
      <label>Locale<select value={f.locale} disabled={!!editing} onChange={e => setF({...f, locale: e.target.value})}><option value="en">English</option><option value="zh">中文</option></select></label>
      {news && <label>Card label (e.g. INDUSTRY FOCUS)<input value={f.role} maxLength={80} onChange={e => setF({...f, role: e.target.value})} /></label>}
      {ordered && <label>Order (0 = first card)<input type="number" min={0} max={9999} value={f.sortOrder} onChange={e => setF({...f, sortOrder: e.target.value})} /></label>}
      <label>Summary{news && " (shown on the card and as the article intro)"}<textarea value={f.summary} maxLength={500} onChange={e => setF({...f, summary: e.target.value})} /></label>
      {news && <label className="span-2">Article text — blank line = new paragraph, “## ” = subheading, “- ” = bullet point<textarea rows={12} value={f.body} maxLength={20000} onChange={e => setF({...f, body: e.target.value})} /></label>}
      {!news && !logos && <label>Link / file URL<input value={f.url} onChange={e => setF({...f, url: e.target.value})} placeholder="/downloads/brochure.pdf or https://…" /></label>}
      {kind === "DOWNLOAD" && <label>File type<input value={f.fileType} onChange={e => setF({...f, fileType: e.target.value})} placeholder="PDF" /></label>}
      {logos && <label>Role under the name (optional, e.g. {kind === "PARTNER" ? "Official media partner" : "Supporting association"})<input value={f.role} maxLength={80} onChange={e => setF({...f, role: e.target.value})} /></label>}
      <label>Upload image (PNG/JPG/WebP ≤8 MB — uses the alt text and rights below)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return; if (!f.altText || !f.rightsStatus) { setMsg("Enter alt text and rights status first."); e.target.value = ""; return; }
        const fd = new FormData(); fd.append("file", file); fd.append("altText", f.altText); fd.append("rightsStatus", f.rightsStatus);
        const r = await fetch("/api/admin/assets", {method: "POST", body: fd}); const j = await r.json(); if (r.ok) { setF({...f, imageUrl: j.url}); setMsg("Image uploaded."); } else setMsg(j.message); }} /></label>
      {logos && f.imageUrl && <img className="content-logo-preview" src={f.imageUrl} alt={f.altText || "Logo preview"} />}
      <label>{news ? "Cover image URL" : "Image / logo URL"}<input value={f.imageUrl} onChange={e => setF({...f, imageUrl: e.target.value})} /></label>
      <label>Alt text<input value={f.altText} onChange={e => setF({...f, altText: e.target.value})} /></label>
      <label>Rights status<select value={f.rightsStatus} onChange={e => setF({...f, rightsStatus: e.target.value})}><option value="">—</option><option>OWNED</option><option>LICENSED</option><option>ORGANIZER_PROVIDED</option><option>PENDING_APPROVAL</option></select></label>
      <div className="cms-row-actions"><button>{editing ? "Save changes" : "Save draft"}</button>{editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setF(EMPTY); }}>Cancel</button>}</div></form></main>;
}
