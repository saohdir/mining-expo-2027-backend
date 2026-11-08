"use client";
import {useCallback, useEffect, useState} from "react";
type Item = {id: string; kind: string; locale: string; title: string; slug: string; summary: string | null; url: string | null; fileType: string | null; imageUrl: string | null; altText: string | null; rightsStatus: string | null; role: string | null; status: string; sortOrder: number; updatedAt: string};
const KINDS = ["PARTNER", "ORGANIZER", "DOWNLOAD", "NEWS", "SCOPE", "CONTACT", "PAGE_BLOCK"];
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || (j.issues ? j.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Request failed")); return j; };
/** FR-005/009/034/035/038 content: drafts visible only in CMS; publish requires rights + alt text for media. */
export default function ContentPage() {
  const [items, setItems] = useState<Item[]>([]), [kind, setKind] = useState("PARTNER"), [msg, setMsg] = useState("");
  const [f, setF] = useState({title: "", slug: "", locale: "en", summary: "", url: "", fileType: "", imageUrl: "", altText: "", rightsStatus: "", role: ""});
  const load = useCallback(async () => { try { setItems((await call("/api/admin/content?kind=" + kind)).items); } catch (e) { setMsg((e as Error).message); } }, [kind]);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } };
  const opt = (v: string) => v.trim() ? v.trim() : null;
  return <main className="cms-page"><header><p className="eyebrow">CONTENT</p><h1>Website content</h1><p>Partners, organizers, downloads, news and contact details shown on the public website. Only PUBLISHED items are public.</p></header>
    <div className="tabline">{KINDS.map(k => <button key={k} type="button" className={k === kind ? "chosen" : ""} onClick={() => setKind(k)}>{k}</button>)}</div>
    {msg && <p role="status" className="micro">{msg}</p>}
    <table className="cms-table"><thead><tr><th>Title</th><th>Locale</th><th>Status</th><th>Rights</th><th /></tr></thead><tbody>
      {items.map(i => <tr key={i.id}><td>{i.title}<br /><span className="micro">{i.slug}{i.role ? " · " + i.role : ""}</span></td><td>{i.locale}</td><td>{i.status}</td><td>{i.rightsStatus || "—"}</td>
        <td>{i.status !== "PUBLISHED" && <button className="cms-small" onClick={() => void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "PUBLISHED", reason: "Publish approved content"}), "Published.")}>Publish</button>}
          {i.status === "PUBLISHED" && <button className="ghost cms-small" onClick={() => void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "DRAFT", reason: "Unpublish for review"}), "Moved to draft.")}>Unpublish</button>}
          <button className="ghost cms-small" onClick={() => void act(() => call("/api/admin/content/" + i.id, "PATCH", {status: "ARCHIVED", reason: "Archive outdated content"}), "Archived.")}>Archive</button></td></tr>)}
    </tbody></table>
    <h2>New {kind.toLowerCase()} draft</h2>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/content", "POST", {kind, locale: f.locale, title: f.title, slug: f.slug, summary: opt(f.summary), url: opt(f.url), fileType: opt(f.fileType),
      imageUrl: opt(f.imageUrl), altText: opt(f.altText), rightsStatus: opt(f.rightsStatus), role: opt(f.role)}), "Draft saved."); }}>
      <label>Title<input required value={f.title} onChange={e => setF({...f, title: e.target.value})} /></label>
      <label>Slug (a-z, 0-9, -)<input required pattern="[a-z0-9-]{2,80}" value={f.slug} onChange={e => setF({...f, slug: e.target.value})} /></label>
      <label>Locale<select value={f.locale} onChange={e => setF({...f, locale: e.target.value})}><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></label>
      <label>Summary<textarea value={f.summary} maxLength={500} onChange={e => setF({...f, summary: e.target.value})} /></label>
      <label>Link / file URL<input value={f.url} onChange={e => setF({...f, url: e.target.value})} placeholder="/downloads/brochure.pdf or https://…" /></label>
      {kind === "DOWNLOAD" && <label>File type<input value={f.fileType} onChange={e => setF({...f, fileType: e.target.value})} placeholder="PDF" /></label>}
      {["PARTNER", "ORGANIZER"].includes(kind) && <label>Role (e.g. Organizer, Supporting association)<input value={f.role} onChange={e => setF({...f, role: e.target.value})} /></label>}
      <label>Image / logo URL<input value={f.imageUrl} onChange={e => setF({...f, imageUrl: e.target.value})} /></label>
      <label>Alt text<input value={f.altText} onChange={e => setF({...f, altText: e.target.value})} /></label>
      <label>Rights status<select value={f.rightsStatus} onChange={e => setF({...f, rightsStatus: e.target.value})}><option value="">—</option><option>OWNED</option><option>LICENSED</option><option>ORGANIZER_PROVIDED</option><option>PENDING_APPROVAL</option></select></label>
      <button>Save draft</button></form></main>;
}
