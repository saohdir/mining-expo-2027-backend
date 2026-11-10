"use client";
import {useConfirm} from "../components/Confirm";
import {useCallback, useEffect, useRef, useState} from "react";
import {useCmsSession} from "../components/CmsShell";

/** Event Highlights gallery (/highlights/): year buttons, upload of photos and videos (compressed automatically), texts EN/中文,
 * publish/unpublish, order, move between years, delete. */
type Year = {year: number; label: string | null; published: boolean; total: number; liveCount: number};
type Item = {id: string; year: number; kind: string; status: string; processing: string; processingError: string | null; thumbKey: string | null; fileKey: string | null; originalName: string | null;
  originalBytes: number; bytes: number | null; width: number | null; height: number | null; durationSec: number | null; titleEn: string | null; titleZh: string | null; captionEn: string | null; captionZh: string | null;
  altEn: string | null; altZh: string | null; rightsStatus: string | null; sortOrder: number; problems: string[]};
type Upload = {name: string; size: number; progress: number; state: "queued" | "uploading" | "done" | "error"; error?: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || (j.issues ? j.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Request failed")); return j; };
const mb = (b: number | null | undefined) => b == null ? "—" : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const dur = (s: number | null) => s == null ? "" : Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
const media = (k: string | null) => k ? "/api/public/gallery-media/" + k : "";
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo";

export default function GalleryCms() {
  const ask = useConfirm();
  const {actor} = useCmsSession();
  const canWrite = actor?.role === "SUPER_ADMIN" || actor?.role === "CONTENT_EDITOR";
  const [years, setYears] = useState<Year[]>([]), [year, setYear] = useState<number | null>(null), [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0), [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<{text: string; err?: boolean} | null>(null), [busy, setBusy] = useState(false), [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [rights, setRights] = useState("ORGANIZER_PROVIDED"), [uploads, setUploads] = useState<Upload[]>([]), [drag, setDrag] = useState(false), [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Item>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async (y = year, p = page) => {
    try { const d = await call(`/api/admin/gallery?${new URLSearchParams({...(y ? {year: String(y)} : {}), page: String(p), ...(filter ? {status: filter} : {})})}`);
      setYears(d.years); setYear(d.year); setItems(d.items); setPage(d.page); setPages(d.pages); setTotal(d.total); }
    catch (e) { setMsg({text: (e as Error).message, err: true}); }
  }, [year, page, filter]);
  useEffect(() => { void load(); }, [load]);
  // Videos are compressed in the background — refresh while any is waiting.
  useEffect(() => { if (!items.some(i => i.processing === "PENDING" || i.processing === "PROCESSING")) return; const t = setTimeout(() => void load(), 5000); return () => clearTimeout(t); }, [items, load]);
  const run = async (fn: () => Promise<string>) => { setBusy(true); setMsg(null); try { setMsg({text: await fn()}); await load(); } catch (e) { setMsg({text: (e as Error).message, err: true}); } finally { setBusy(false); } };

  const upload = (files: FileList | File[]) => {
    if (!year) { setMsg({text: "Add or choose a year first.", err: true}); return; }
    const list = [...files]; if (!list.length) return;
    const start = uploads.length;
    setUploads(u => [...u, ...list.map(f => ({name: f.name, size: f.size, progress: 0, state: "queued" as const}))]);
    const set = (i: number, p: Partial<Upload>) => setUploads(u => u.map((x, j) => j === start + i ? {...x, ...p} : x));
    (async () => {
      for (const [i, f] of list.entries()) {
        set(i, {state: "uploading"});
        await new Promise<void>(resolve => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/admin/gallery/upload?${new URLSearchParams({year: String(year), name: f.name.slice(0, 200), rightsStatus: rights})}`);
          xhr.setRequestHeader("Content-Type", f.type || "application/octet-stream");
          xhr.upload.onprogress = e => { if (e.lengthComputable) set(i, {progress: Math.round(e.loaded / e.total * 100)}); };
          xhr.onload = () => { if (xhr.status === 201) set(i, {state: "done", progress: 100}); else { let m = "Upload failed"; try { m = JSON.parse(xhr.responseText).message || m; } catch {} set(i, {state: "error", error: m}); } resolve(); };
          xhr.onerror = () => { set(i, {state: "error", error: "Network error"}); resolve(); };
          xhr.send(f);
        });
      }
      await load(year, 1);
    })();
  };
  const startEdit = (i: Item) => { setOpen(i.id); setEdit({titleEn: i.titleEn ?? "", titleZh: i.titleZh ?? "", captionEn: i.captionEn ?? "", captionZh: i.captionZh ?? "", altEn: i.altEn ?? "", altZh: i.altZh ?? "", rightsStatus: i.rightsStatus ?? "", year: i.year, sortOrder: i.sortOrder}); };
  const saveEdit = (i: Item, extra: Record<string, unknown> = {}) => run(async () => {
    const n = (v: unknown) => typeof v === "string" ? (v.trim() || null) : v;
    await call("/api/admin/gallery/" + i.id, "PATCH", {titleEn: n(edit.titleEn), titleZh: n(edit.titleZh), captionEn: n(edit.captionEn), captionZh: n(edit.captionZh), altEn: n(edit.altEn), altZh: n(edit.altZh),
      rightsStatus: n(edit.rightsStatus), year: Number(edit.year), sortOrder: Number(edit.sortOrder) || 0, ...extra});
    setOpen(null); return extra.status === "PUBLISHED" ? "Saved and published." : "Saved.";
  });
  const curYear = years.find(y => y.year === year);
  const ready = items.filter(i => i.status !== "PUBLISHED" && !i.problems.length);

  return <main className="cms-page gallery-cms">
    <header><p className="eyebrow">WEBSITE · EVENT HIGHLIGHTS</p><h1>Event gallery</h1>
      <p>Photos and videos for <a href="/highlights/" target="_blank" rel="noreferrer">/highlights/ ↗</a>, grouped by year (each year is a button on the page; 12 items per page).
        Uploads are compressed automatically: photos to WebP (max 2000 px), videos to MP4 (max 1280 px) — videos take a few minutes after upload.</p></header>
    {msg && <div className={"notice" + (msg.err ? " warning" : "")} role={msg.err ? "alert" : "status"}>{msg.text}</div>}

    <section className="cms-panel"><div className="imdx-cms-panel-title"><h2>Years</h2><span className="micro">Hidden years and years without published items are not shown on the website.</span></div>
      <div className="gallery-years" role="tablist" aria-label="Year">
        {years.map(y => <button key={y.year} type="button" role="tab" aria-selected={y.year === year} className={y.year === year ? "is-on" : ""} onClick={() => { setYear(y.year); setPage(1); }}>
          <strong>{y.label || y.year}</strong><small>{y.published ? `${y.liveCount} live · ${y.total} total` : "hidden"}</small></button>)}
        {canWrite && <form className="gallery-add-year" onSubmit={e => { e.preventDefault(); void run(async () => { await call("/api/admin/gallery/years", "POST", {year: Number(newYear)}); setYear(Number(newYear)); return "Year " + newYear + " added."; }); }}>
          <label className="programme-sr" htmlFor="new-year">New year</label><input id="new-year" type="number" min={2000} max={2100} value={newYear} onChange={e => setNewYear(e.target.value)} /><button className="ghost" disabled={busy}>+ Add year</button></form>}
      </div>
      {curYear && canWrite && <div className="cms-row-actions gallery-year-tools">
        <label>Button label<input defaultValue={curYear.label ?? ""} key={curYear.year} placeholder={String(curYear.year)} maxLength={60} onBlur={e => { const v = e.target.value.trim(); if (v !== (curYear.label ?? "")) void run(async () => { await call("/api/admin/gallery/years/" + curYear.year, "PATCH", {label: v || null}); return "Label saved."; }); }} /></label>
        <label className="consent"><input type="checkbox" checked={curYear.published} onChange={e => void run(async () => { await call("/api/admin/gallery/years/" + curYear.year, "PATCH", {published: e.target.checked}); return e.target.checked ? "Year visible on the website." : "Year hidden from the website."; })} /> Show this year on the website</label>
        <button type="button" className="ghost cms-small" disabled={busy || curYear.total > 0} title={curYear.total ? "Move or delete its items first" : ""} onClick={async () => (await ask({title: `Delete year ${curYear.year}?`, tone: "danger", confirmLabel: "Yes, delete year", changes: ["The empty year and its button on /highlights/ are removed."]})) && void run(async () => { await call("/api/admin/gallery/years/" + curYear.year, "DELETE"); setYear(null); return "Year deleted."; })}>Delete year</button>
      </div>}
    </section>

    {canWrite && year && <section className="cms-panel"><div className="imdx-cms-panel-title"><h2>Upload to {curYear?.label || year}</h2><span className="micro">Photos up to 30 MB · videos up to 600 MB · several files at once</span></div>
      <div className="cms-row-actions"><label>Image / video rights<select value={rights} onChange={e => setRights(e.target.value)}><option value="ORGANIZER_PROVIDED">Organizer provided</option><option value="OWNED">Owned</option><option value="LICENSED">Licensed</option><option value="PENDING_APPROVAL">Pending approval</option></select></label></div>
      <div className={"gallery-drop" + (drag ? " is-drag" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
        <p><strong>Drop photos or videos here</strong></p><p className="micro">JPG, PNG, WebP, HEIC · MP4, MOV, WebM</p>
        <button type="button" onClick={() => fileInput.current?.click()}>Choose files</button>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      </div>
      {uploads.length > 0 && <ul className="gallery-uploads">{uploads.map((u, i) => <li key={i} data-state={u.state}><span>{u.name} <small>{mb(u.size)}</small></span>
        <span className="gallery-progress" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} aria-label={"Upload " + u.name}><i style={{width: u.progress + "%"}} /></span>
        <small>{u.state === "error" ? u.error : u.state === "done" ? "Uploaded" : u.state === "uploading" ? u.progress + "%" : "Waiting"}</small></li>)}
        <li><button type="button" className="link" onClick={() => setUploads([])}>Clear list</button></li></ul>}
    </section>}

    {year && <section className="cms-panel"><div className="imdx-cms-panel-title"><h2>{curYear?.label || year} <span className="micro">({total})</span></h2>
      <span className="cms-row-actions"><label className="programme-sr" htmlFor="gf">Show</label><select id="gf" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="">All</option><option value="PUBLISHED">Published</option><option value="DRAFT">Drafts</option></select>
        {canWrite && ready.length > 0 && <button type="button" className="cms-small" disabled={busy} onClick={() => void run(async () => { for (const i of ready) await call("/api/admin/gallery/" + i.id, "PATCH", {status: "PUBLISHED"}); return ready.length + " item(s) published."; })}>Publish all ready ({ready.length})</button>}</span></div>
      {!items.length ? <p className="micro">No photos or videos yet{canWrite ? " — upload above." : "."}</p> :
      <ul className="gallery-cms-grid">{items.map(i => <li key={i.id} className="gallery-cms-item">
        <div className="gallery-cms-thumb">{i.thumbKey ? <img src={media(i.thumbKey)} alt="" loading="lazy" /> : <span>{i.processing === "FAILED" ? "!" : "…"}</span>}
          {i.kind === "VIDEO" && <b className="gallery-badge">▶ {dur(i.durationSec)}</b>}</div>
        <div className="gallery-cms-meta">
          <div className="cms-row-actions"><span className="imdx-cms-status-chip" data-tone={i.status === "PUBLISHED" ? "positive" : "neutral"}>{i.status === "PUBLISHED" ? "Live" : "Draft"}</span>
            {i.processing !== "READY" && <span className="imdx-cms-status-chip" data-tone={i.processing === "FAILED" ? "negative" : "waiting"}>{i.processing === "FAILED" ? "Compression failed" : "Compressing…"}</span>}</div>
          <strong>{i.titleEn || i.originalName || (i.kind === "VIDEO" ? "Video" : "Photo")}</strong>
          <small>{mb(i.originalBytes)} → {mb(i.bytes)}{i.width ? ` · ${i.width}×${i.height}` : ""}</small>
          {i.processingError && <small className="programme-warn">{i.processingError}</small>}
          {i.status !== "PUBLISHED" && i.problems.length > 0 && i.processing === "READY" && <small className="programme-warn">To publish: {i.problems.join("; ")}</small>}
          {canWrite && <div className="cms-row-actions">
            <button type="button" className="ghost cms-small" onClick={() => open === i.id ? setOpen(null) : startEdit(i)}>{open === i.id ? "Close" : "Edit"}</button>
            {i.status === "PUBLISHED" ? <button type="button" className="ghost cms-small" disabled={busy} onClick={() => void run(async () => { await call("/api/admin/gallery/" + i.id, "PATCH", {status: "DRAFT"}); return "Unpublished."; })}>Unpublish</button>
              : <button type="button" className="cms-small" disabled={busy || i.problems.length > 0} title={i.problems.join("; ")} onClick={() => void run(async () => { await call("/api/admin/gallery/" + i.id, "PATCH", {status: "PUBLISHED"}); return "Published."; })}>Publish</button>}
            {i.processing === "FAILED" && <button type="button" className="ghost cms-small" onClick={() => void run(async () => { await call("/api/admin/gallery/" + i.id, "PATCH", {retry: true}); return "Queued again."; })}>Retry</button>}
            <button type="button" className="ghost cms-small" disabled={busy} onClick={async () => (await ask({title: "Delete this photo/video?", tone: "danger", confirmLabel: "Yes, delete", changes: ["The item and its compressed files are deleted from the server."], impact: ["It disappears from /highlights/ immediately.", "This cannot be undone; upload it again if needed."]})) && void run(async () => { await call("/api/admin/gallery/" + i.id, "DELETE"); return "Deleted."; })}>Delete</button></div>}
          {open === i.id && <form className="gallery-edit" onSubmit={e => { e.preventDefault(); void saveEdit(i); }}>
            <label>Description / alt text (English, required)<input required maxLength={300} value={edit.altEn ?? ""} onChange={e => setEdit({...edit, altEn: e.target.value})} /></label>
            <label>描述（中文）<input maxLength={300} value={edit.altZh ?? ""} onChange={e => setEdit({...edit, altZh: e.target.value})} /></label>
            <label>Title (English, optional)<input maxLength={160} value={edit.titleEn ?? ""} onChange={e => setEdit({...edit, titleEn: e.target.value})} /></label>
            <label>标题（中文）<input maxLength={160} value={edit.titleZh ?? ""} onChange={e => setEdit({...edit, titleZh: e.target.value})} /></label>
            <label>Caption (English)<textarea rows={2} maxLength={500} value={edit.captionEn ?? ""} onChange={e => setEdit({...edit, captionEn: e.target.value})} /></label>
            <label>说明（中文）<textarea rows={2} maxLength={500} value={edit.captionZh ?? ""} onChange={e => setEdit({...edit, captionZh: e.target.value})} /></label>
            <label>Rights<select value={edit.rightsStatus ?? ""} onChange={e => setEdit({...edit, rightsStatus: e.target.value})}><option value="">—</option><option>ORGANIZER_PROVIDED</option><option>OWNED</option><option>LICENSED</option><option>PENDING_APPROVAL</option></select></label>
            <label>Year<select value={edit.year} onChange={e => setEdit({...edit, year: Number(e.target.value)})}>{years.map(y => <option key={y.year} value={y.year}>{y.label || y.year}</option>)}</select></label>
            <label>Order (lower = first)<input type="number" min={0} max={99999} value={edit.sortOrder ?? 0} onChange={e => setEdit({...edit, sortOrder: Number(e.target.value)})} /></label>
            <div className="cms-row-actions"><button disabled={busy}>Save</button>{i.status !== "PUBLISHED" && <button type="button" className="ghost" disabled={busy} onClick={() => void saveEdit(i, {status: "PUBLISHED"})}>Save &amp; publish</button>}</div>
          </form>}
        </div></li>)}</ul>}
      {pages > 1 && <nav className="programme-pager-cms" aria-label="Pagination"><button type="button" className="ghost cms-small" disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span className="micro">Page {page} of {pages}</span><button type="button" className="ghost cms-small" disabled={page === pages} onClick={() => setPage(page + 1)}>Next →</button></nav>}
    </section>}
  </main>;
}
