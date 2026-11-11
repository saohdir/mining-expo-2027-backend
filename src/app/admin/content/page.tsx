"use client";
import {useCallback, useEffect, useState} from "react";
import CmsStatus from "../components/CmsStatus";
import {useCmsSession} from "../components/CmsShell";
import {useConfirm} from "../components/Confirm";
import {BlockEditor, stripIds, withIds} from "./BlockEditor";
import {legacyToBlocks, parseBlocks, serializeBlocks} from "@/lib/content-blocks";

type Item = {id: string; kind: string; locale: string; title: string; slug: string; summary: string | null; body: string | null; url: string | null; fileType: string | null; fileSizeBytes: number | null; imageUrl: string | null; altText: string | null; rightsStatus: string | null; role: string | null; status: string; sortOrder: number; updatedAt: string; publishedAt: string | null};
/** A new article starts with one empty paragraph to type into (empty paragraphs are dropped on save). */
const starter = () => withIds([{t: "p", text: ""}]);
const KINDS = ["PARTNER", "ORGANIZER", "DOWNLOAD", "NEWS", "SCOPE", "CONTACT", "PAGE_BLOCK"];
const LABEL: Record<string, string> = {NEWS: "News & updates", ORGANIZER: "Organizers", PARTNER: "Media partners", DOWNLOAD: "Downloads", SCOPE: "Scope", CONTACT: "Contact", PAGE_BLOCK: "Page blocks"};
const LOGO_KINDS = ["ORGANIZER", "PARTNER"];
const IMAGE_MAX = 12 * 1024 * 1024, PDF_MAX = 25 * 1024 * 1024;
/** Readable error for any failed request: API message, validation issues, expired session, proxy limits, network errors. */
async function readError(r: Response) {
  const j = await r.json().catch(() => null) as {message?: string; error?: string; issues?: {field: string; message: string}[]} | null;
  if (r.status === 401) return "Your CMS session has expired. Sign in again (your form input stays here).";
  if (r.status === 403) return "Your role cannot change website content. Ask a Super Admin or Content Editor.";
  if (r.status === 413) return j?.message || "The file is too large for the server. Images up to 12 MB, PDFs up to 25 MB.";
  if (j?.message) return j.message;
  if (j?.issues?.length) return j.issues.map(i => (i.field ? i.field + ": " : "") + i.message).join("; ");
  return `Request failed (${r.status}). Try again; if it keeps failing, reload the page.`;
}
const call = async (u: string, m = "GET", b?: unknown) => {
  let r: Response;
  try { r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); }
  catch { throw new Error("No connection to the server. Check your internet connection and try again."); }
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
};
async function sendFile(url: string, fd: FormData) {
  let r: Response;
  try { r = await fetch(url, {method: "POST", body: fd}); } catch { throw new Error("The upload was interrupted. Check your connection and try again."); }
  if (!r.ok) throw new Error(await readError(r));
  return r.json();
}
const EMPTY = {title: "", slug: "", locale: "en", summary: "", url: "", fileType: "", fileSizeBytes: null as number | null, imageUrl: "", altText: "", rightsStatus: "", role: "", sortOrder: "0"};
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const mb = (n: number | null) => !n ? "" : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1048576).toFixed(1) + " MB";
/** Same rules as the server (lib/content publishProblems), shown before clicking Publish. */
const problems = (c: {kind: string; imageUrl?: string | null; altText?: string | null; rightsStatus?: string | null; url?: string | null; fileType?: string | null}) => {
  const p: string[] = [];
  if (c.imageUrl && !c.altText) p.push("alt text");
  if (c.imageUrl && (!c.rightsStatus || c.rightsStatus === "PENDING_APPROVAL")) p.push(c.rightsStatus === "PENDING_APPROVAL" ? "approved rights (now: pending approval)" : "image rights status");
  if (c.kind === "DOWNLOAD" && !c.url) p.push("a file (upload a PDF or enter a link)");
  if (c.kind === "DOWNLOAD" && c.url && !c.fileType) p.push("file type");
  return p;
};

/** FR-005/009/034/035/038 content: drafts visible only in CMS; publish requires rights + alt text for media. NEWS = home "Exhibition insights & updates" cards + article pages. */
export default function ContentPage() {
  const {actor} = useCmsSession();
  const canWrite = actor?.role === "SUPER_ADMIN" || actor?.role === "CONTENT_EDITOR";
  const [items, setItems] = useState<Item[]>([]), [kind, setKind] = useState("PARTNER"), [msg, setMsg] = useState<{text: string; err?: boolean} | null>(null);
  const [f, setF] = useState(EMPTY), [blocks, setBlocks] = useState(starter), [editing, setEditing] = useState<Item | null>(null), [busy, setBusy] = useState("");
  const say = (text: string, err = false) => { setMsg({text, err}); if (err) setTimeout(() => document.getElementById("content-msg")?.scrollIntoView({block: "nearest", behavior: "smooth"}), 0); };
  const load = useCallback(async () => { try { setItems((await call("/api/admin/content?kind=" + kind)).items); } catch (e) { say((e as Error).message, true); } }, [kind]);
  useEffect(() => { void load(); setEditing(null); setF(EMPTY); setBlocks(starter()); }, [load]);
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => { setMsg(null); setBusy(key); try { await fn(); say(ok); await load(); } catch (e) { say((e as Error).message, true); } finally { setBusy(""); } };
  const ask = useConfirm();
  /** Delete (replaces archive): a warning modal says what disappears; the item is removed permanently. */
  const remove = async (i: Item) => {
    const where = news ? "the home page and /news/ (card and article page)" : downloads ? "the exhibitor page downloads and the customer portal’s Documents tab" : "the website";
    const r = await ask({title: `Delete “${i.title}”?`, tone: "danger", confirmLabel: "Yes, delete", reason: {min: 0, label: "Reason (optional, saved in the audit log)"},
      changes: [`“${i.title}” (${LABEL[i.kind] || i.kind}, ${i.locale === "zh" ? "中文" : "English"}) is deleted permanently.`],
      impact: [i.status === "PUBLISHED" ? `It disappears from ${where} immediately.` : "It was not public, so the website does not change.",
        ...(news ? ["The other language version with the same slug (if any) is not deleted."] : []), "This cannot be undone; the audit log keeps a record of what was deleted."]});
    if (!r) return;
    await act(i.id, async () => { await call("/api/admin/content/" + i.id, "DELETE", {reason: r.reason || undefined}); if (editing?.id === i.id) reset(); }, `Deleted “${i.title}”.`);
  };
  const opt = (v: string) => v.trim() ? v.trim() : null;
  const news = kind === "NEWS", logos = LOGO_KINDS.includes(kind), ordered = news || logos, downloads = kind === "DOWNLOAD";
  const reset = () => { setEditing(null); setF(EMPTY); setBlocks(starter()); };
  const edit = (i: Item) => {
    setEditing(i); setF({title: i.title, slug: i.slug, locale: i.locale, summary: i.summary || "", url: i.url || "", fileType: i.fileType || "", fileSizeBytes: i.fileSizeBytes, imageUrl: i.imageUrl || "", altText: i.altText || "",
      rightsStatus: i.rightsStatus || "", role: i.role || "", sortOrder: String(i.sortOrder)});
    { const b = parseBlocks(i.body) ?? legacyToBlocks(i.body); setBlocks(b.length ? withIds(b) : starter()); } setMsg(null);
    setTimeout(() => document.getElementById("content-form")?.scrollIntoView({behavior: "smooth"}), 0);
  };
  const body = () => { const b = stripIds(blocks).filter(x => !(x.t === "p" && !x.text.trim())); return b.length ? serializeBlocks(b) : null; };
  const payload = () => ({title: f.title, slug: f.slug, summary: opt(f.summary), ...(news ? {body: body()} : {}), url: opt(f.url), fileType: opt(f.fileType), fileSizeBytes: f.fileSizeBytes, imageUrl: opt(f.imageUrl), altText: opt(f.altText),
    rightsStatus: opt(f.rightsStatus), role: opt(f.role), sortOrder: Math.max(0, Math.min(9999, Number(f.sortOrder) || 0))});
  const preview = (i: Item) => (i.locale === "zh" ? "/zh" : "") + "/news/article/?slug=" + encodeURIComponent(i.slug);

  /** Image upload: checked here first (type, size), then sent; alt text and rights may be added afterwards. */
  const uploadImage = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error(`“${file.name}” is ${file.type || "an unknown type"}. Use PNG, JPG or WebP (iPhone HEIC: export as JPG).`);
    if (file.size > IMAGE_MAX) throw new Error(`“${file.name}” is ${mb(file.size)}; the limit is 12 MB.`);
    const fd = new FormData(); fd.append("file", file); if (f.altText.trim()) fd.append("altText", f.altText.trim()); if (f.rightsStatus) fd.append("rightsStatus", f.rightsStatus);
    return (await sendFile("/api/admin/assets", fd)).url as string;
  };
  const onCover = async (file: File) => {
    setBusy("upload"); setMsg(null);
    try {
      const url = await uploadImage(file);
      setF(prev => ({...prev, imageUrl: url}));
      if (editing) { await call("/api/admin/content/" + editing.id, "PATCH", {imageUrl: url, reason: "Image replaced in CMS"}); await load(); say("Image uploaded and saved." + (problems({...f, kind, imageUrl: url}).length ? " Add alt text and rights before publishing." : "")); }
      else say("Image uploaded. Save the draft to keep it.");
    } catch (e) { say((e as Error).message, true); } finally { setBusy(""); }
  };
  const onPdf = async (file: File) => {
    setBusy("upload"); setMsg(null);
    try {
      if (file.type && file.type !== "application/pdf") throw new Error(`“${file.name}” is not a PDF. Export or save it as PDF first.`);
      if (file.size > PDF_MAX) throw new Error(`“${file.name}” is ${mb(file.size)}; the limit is 25 MB.`);
      const fd = new FormData(); fd.append("file", file);
      const r = await sendFile("/api/admin/files", fd) as {url: string; fileType: string; fileSizeBytes: number; name: string};
      const title = f.title || r.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
      setF(prev => ({...prev, url: r.url, fileType: r.fileType, fileSizeBytes: r.fileSizeBytes, title: prev.title || title, slug: prev.slug || slugify(title)}));
      if (editing) { await call("/api/admin/content/" + editing.id, "PATCH", {url: r.url, fileType: r.fileType, fileSizeBytes: r.fileSizeBytes, reason: "PDF replaced in CMS"}); await load(); say(`PDF uploaded and saved (${mb(r.fileSizeBytes)}).`); }
      else say(`PDF uploaded (${mb(r.fileSizeBytes)}). Save the draft to keep it.`);
    } catch (e) { say((e as Error).message, true); } finally { setBusy(""); }
  };

  return <main className="cms-page"><header className="imdx-cms-heading"><div><h1>Website content</h1><p>Partners, organizers, downloads, news and contact details shown on the public website. Only published items are public; changes show on the website immediately.
    {news && <> News items appear as the cards of <strong>Exhibition insights &amp; updates</strong> on the home page and /news/; each card opens its own article page.</>}
    {kind === "ORGANIZER" && <> Organizers appear as logo cards in <strong>Organizer &amp; Partners</strong> on /partners/ and the home page, in the order below.</>}
    {kind === "PARTNER" && <> Media partners appear as logo cards in <strong>Media Partners</strong> on /partners/ (the section is hidden while none is published).</>}
    {downloads && <> Downloads appear on the exhibitor page and in the customer portal’s Documents tab.</>}</p></div></header>
    <div className="tabline">{KINDS.map(k => <button key={k} type="button" className={k === kind ? "chosen" : ""} onClick={() => setKind(k)}>{LABEL[k] || k}</button>)}</div>
    {!canWrite && actor && <p className="notice">Read-only: your role ({actor.role.toLowerCase().replace(/_/g, " ")}) can view content. Publishing and uploads need a Super Admin or Content Editor.</p>}
    <div id="content-msg" aria-live="polite">{msg && <p role={msg.err ? "alert" : "status"} className={msg.err ? "cms-dl-error" : "notice"}>{msg.text}</p>}</div>
    <div className="cms-table-wrap"><table className="cms-table"><thead><tr>{(logos || news) && <th>{news ? "Image" : "Logo"}</th>}<th>Title</th><th>Locale</th><th>Status</th>{ordered && <th>Order</th>}{downloads ? <th>File</th> : <th>Rights</th>}<th /></tr></thead><tbody>
      {!items.length && <tr><td colSpan={7}><div className="cms-dl-empty"><strong>No {(LABEL[kind] || kind).toLowerCase()} yet.</strong> Create the first one with the form below.</div></td></tr>}
      {items.map(i => { const p = problems(i); return <tr key={i.id}>{(logos || news) && <td>{i.imageUrl ? <img className="content-logo-thumb" src={i.imageUrl} alt="" /> : <span className="micro">none</span>}</td>}
        <td>{i.title}<br /><span className="micro">{i.slug}{i.role ? " · " + i.role : ""}</span>{i.status !== "PUBLISHED" && p.length > 0 && <span className="content-needs">To publish, add {p.join(", ")}.</span>}</td>
        <td>{i.locale}</td><td><CmsStatus domain="Content" value={i.status}/></td>{ordered && <td>{i.sortOrder}</td>}
        {downloads ? <td>{i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.fileType || "Open"}{i.fileSizeBytes ? " · " + mb(i.fileSizeBytes) : ""}</a> : "—"}</td> : <td>{i.rightsStatus?.toLowerCase().replace(/_/g, " ") || "—"}</td>}
        <td><div className="cms-row-actions">
          <button className="ghost cms-small" onClick={() => edit(i)}>{canWrite ? "Edit" : "View"}</button>
          {canWrite && i.status !== "PUBLISHED" && <button className="cms-small" disabled={busy === i.id} title={p.length ? "Add " + p.join(", ") + " first" : undefined}
            onClick={() => p.length ? (edit(i), say(`“${i.title}” needs ${p.join(", ")} before it can be published. Complete the form below, save, then publish.`, true)) : void act(i.id, () => call("/api/admin/content/" + i.id, "PATCH", {status: "PUBLISHED", reason: "Publish approved content"}), `Published “${i.title}”. It is live on the website now.`)}>{busy === i.id ? "Publishing…" : "Publish"}</button>}
          {canWrite && i.status === "PUBLISHED" && <button className="ghost cms-small" disabled={busy === i.id} onClick={() => void act(i.id, () => call("/api/admin/content/" + i.id, "PATCH", {status: "DRAFT", reason: "Unpublish for review"}), "Moved to draft; it is no longer on the website.")}>Unpublish</button>}
          {news && i.status === "PUBLISHED" && <a className="cms-small" href={preview(i)} target="_blank" rel="noreferrer">View page ↗</a>}
          {canWrite && <button className="ghost cms-small cms-danger-outline" disabled={busy === i.id} onClick={() => void remove(i)}>Delete</button>}</div></td></tr>; })}
    </tbody></table></div>

    <section className="cms-panel content-editor" aria-labelledby="content-form">
    <h2 id="content-form">{editing ? `Edit “${editing.title}” (${editing.locale})` : `New ${(LABEL[kind] || kind).toLowerCase()} draft`}</h2>
    {editing && <p className="micro">Changes to a published item are live immediately after saving. <button type="button" className="link" onClick={reset}>Cancel editing</button></p>}
    {news && !editing && <p className="micro">Add the English version and a 中文 version with the <strong>same slug</strong>; the Chinese site shows the 中文 version (or English when there is none).</p>}
    <form className="form-grid" onSubmit={e => { e.preventDefault(); if (!canWrite) return; void act("save", async () => {
      if (editing) { await call("/api/admin/content/" + editing.id, "PATCH", {...payload(), reason: "Content edited in CMS"}); reset(); }
      else { await call("/api/admin/content", "POST", {kind, locale: f.locale, ...payload()}); reset(); }
    }, editing ? "Saved." : "Draft saved. Publish it from the list when it is ready."); }}>
      <fieldset disabled={!canWrite} className="content-fields">
      <label>Title<input required minLength={2} maxLength={200} value={f.title} onChange={e => setF({...f, title: e.target.value, slug: !editing && (f.slug === "" || f.slug === slugify(f.title)) ? slugify(e.target.value) : f.slug})} /></label>
      <label>Slug (a-z, 0-9, -){news && " — part of the article address"}<input required pattern="[a-z0-9-]{2,80}" value={f.slug} onChange={e => setF({...f, slug: e.target.value})} /></label>
      <label>Locale<select value={f.locale} disabled={!!editing} onChange={e => setF({...f, locale: e.target.value})}><option value="en">English</option><option value="zh">中文</option></select></label>
      {news && <label>Card label (e.g. INDUSTRY FOCUS)<input value={f.role} maxLength={80} onChange={e => setF({...f, role: e.target.value})} /></label>}
      {ordered && <label>Order (0 = first card)<input type="number" min={0} max={9999} value={f.sortOrder} onChange={e => setF({...f, sortOrder: e.target.value})} /></label>}
      <label className={news ? "span-2" : undefined}>Summary{news && " (shown on the card and as the article intro)"}<textarea value={f.summary} maxLength={500} onChange={e => setF({...f, summary: e.target.value})} /></label>
      {news && <div className="span-2 content-article"><span className="content-label">Article</span><BlockEditor value={blocks} onChange={setBlocks} upload={uploadImage} /></div>}

      {downloads && <div className="span-2 content-upload">
        <span className="content-label">PDF file</span>
        {f.url ? <div className="content-file"><span className="doc-icon" aria-hidden="true">PDF</span><a href={f.url} target="_blank" rel="noreferrer">{f.title || "Open file"}</a><span className="micro">{[f.fileType, mb(f.fileSizeBytes)].filter(Boolean).join(" · ")}</span></div> : <p className="micro">No file yet.</p>}
        <label className="be-upload">{busy === "upload" ? "Uploading…" : f.url ? "Replace PDF" : "Upload PDF"}<input type="file" accept="application/pdf,.pdf" disabled={busy === "upload"} onChange={e => { const file = e.target.files?.[0]; if (file) void onPdf(file); e.target.value = ""; }} /></label>
        <span className="micro">PDF up to 25 MB. Or enter a link below.</span></div>}
      {!news && !logos && <label>{downloads ? "File URL (filled in by the upload, or an https:// link)" : "Link / file URL"}<input value={f.url} onChange={e => setF({...f, url: e.target.value})} placeholder="/downloads/brochure.pdf or https://…" /></label>}
      {downloads && <label>File type<input value={f.fileType} onChange={e => setF({...f, fileType: e.target.value})} placeholder="PDF" /></label>}
      {logos && <label>Role under the name (optional, e.g. {kind === "PARTNER" ? "Official media partner" : "Supporting association"})<input value={f.role} maxLength={80} onChange={e => setF({...f, role: e.target.value})} /></label>}

      {!downloads && <div className="span-2 content-upload">
        <span className="content-label">{news ? "Cover image" : logos ? "Logo" : "Image"}</span>
        {f.imageUrl ? <img className={logos ? "content-logo-preview" : "content-cover-preview"} src={f.imageUrl} alt={f.altText || "Image preview"} /> : <p className="micro">No image yet.</p>}
        <label className="be-upload">{busy === "upload" ? "Uploading…" : f.imageUrl ? "Replace image" : "Upload image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy === "upload"} onChange={e => { const file = e.target.files?.[0]; if (file) void onCover(file); e.target.value = ""; }} /></label>
        <span className="micro">PNG, JPG or WebP up to 12 MB (converted to WebP). Alt text and rights are needed before publishing.</span></div>}
      {!downloads && <label>{news ? "Cover image URL" : "Image / logo URL"}<input value={f.imageUrl} onChange={e => setF({...f, imageUrl: e.target.value})} /></label>}
      {!downloads && <label>Alt text (describe the image)<input value={f.altText} onChange={e => setF({...f, altText: e.target.value})} /></label>}
      {!downloads && <label>Rights status<select value={f.rightsStatus} onChange={e => setF({...f, rightsStatus: e.target.value})}><option value="">—</option><option value="OWNED">Owned</option><option value="LICENSED">Licensed</option><option value="ORGANIZER_PROVIDED">Organizer provided</option><option value="PENDING_APPROVAL">Pending approval (cannot publish)</option></select></label>}
      </fieldset>
      {canWrite && <div className="cms-row-actions span-2"><button disabled={busy === "save" || busy === "upload"}>{busy === "save" ? "Saving…" : editing ? "Save changes" : "Save draft"}</button>{editing && <button type="button" className="ghost" onClick={reset}>Cancel</button>}
        {problems({...f, kind}).length > 0 && <span className="micro">To publish later, add {problems({...f, kind}).join(", ")}.</span>}</div>}
    </form></section></main>;
}
