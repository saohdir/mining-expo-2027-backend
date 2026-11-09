"use client";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useCmsSession} from "../components/CmsShell";

/** CR-PROGRAMME — CMS for /programme/ cards and /programme/<slug>/ pages (EN + 中文). Editorial content only: it never creates
 * seats, prices or invoices; booking happens on a linked, published Conference (Events & Programmes). */
type Row = {id: string; slug: string; category: string; status: string; deleted: boolean; isLegacy: boolean; displayOrder: number; programmeStatus: string; editorialStatus: string;
  sourceSystem: string | null; sourceId: string | null; imageUrl: string | null; conference: string | null; title: string; locales: string[]; updatedAt: string; problems: string[]};
type Tr = {title: string; categoryLabel: string; summary: string; overview: string; highlights: string[]; imageAlt: string; seoTitle: string; seoDescription: string; reviewStatus: string};
type Form = {slug: string; category: string; programmeStatus: string; isLegacy: boolean; displayOrder: string; imageUrl: string; imageRightsStatus: string; eventDate: string; startTime: string; endTime: string;
  venue: string; feeLabel: string; currency: string; dateConfirmed: boolean; venueConfirmed: boolean; feeConfirmed: boolean; conferenceId: string; sourceSystem: string; sourceId: string; sourceUrl: string;
  sourceTitle: string; editorialStatus: string; editorialNote: string; en: Tr; zh: Tr; hasZh: boolean};
type Detail = {item: {id: string; status: string; deletedAt: string | null; editorialStatus: string; sourceFacts: Record<string, unknown> | null; publishedAt: string | null} & Record<string, unknown>;
  revisions: {version: number; reason: string; createdAt: string}[]; audit: {action: string; createdAt: string; afterState: {reason?: string} | null}[]; problems: string[]};
const CATS = [["CONFERENCE", "Conference"], ["MAIN_FORUM", "Main forum"], ["FORUM", "Forum"], ["NETWORKING", "Networking"], ["WORKSHOP", "Workshop"], ["REFERENCE", "Reference"]];
const emptyTr = (): Tr => ({title: "", categoryLabel: "", summary: "", overview: "", highlights: [""], imageAlt: "", seoTitle: "", seoDescription: "", reviewStatus: "APPROVED"});
const EMPTY: Form = {slug: "", category: "CONFERENCE", programmeStatus: "TBA", isLegacy: false, displayOrder: "100", imageUrl: "", imageRightsStatus: "", eventDate: "", startTime: "", endTime: "", venue: "",
  feeLabel: "", currency: "", dateConfirmed: false, venueConfirmed: false, feeConfirmed: false, conferenceId: "", sourceSystem: "", sourceId: "", sourceUrl: "", sourceTitle: "", editorialStatus: "APPROVED",
  editorialNote: "", en: emptyTr(), zh: emptyTr(), hasZh: true};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || (j.issues ? j.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Request failed")); return j; };
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const nul = (s: string) => s.trim() ? s.trim() : null;
const tone = (s: string) => s === "PUBLISHED" ? "positive" : s === "ARCHIVED" || s === "DELETED" ? "negative-muted" : s === "PENDING_REVIEW" ? "waiting" : "neutral";
const Chip = ({v, label}: {v: string; label?: string}) => <span className="imdx-cms-status-chip" data-tone={tone(v)}>{label || v.toLowerCase().replace(/_/g, " ")}</span>;

export default function ProgrammePages() {
  const {actor} = useCmsSession();
  const role = actor?.role || "";
  const canWrite = ["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS"].includes(role), canConfirm = ["SUPER_ADMIN", "OPERATIONS"].includes(role), isOwner = role === "SUPER_ADMIN";
  const [rows, setRows] = useState<Row[]>([]), [conferences, setConferences] = useState<{id: string; title: string; published: boolean}[]>([]), [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({q: "", status: "", group: "", category: "", missing: ""});
  const [msg, setMsg] = useState<{text: string; tone: "ok" | "err"; link?: string} | null>(null), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null), [f, setF] = useState<Form>(EMPTY), [loc, setLoc] = useState<"en" | "zh">("en"), [reason, setReason] = useState("");
  const [order, setOrder] = useState<{regular: Row[]; legacy: Row[]} | null>(null);
  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    try { const d = await call("/api/admin/programme-items?" + q); setRows(d.rows); setTotal(d.total); setConferences(d.conferences); } catch (e) { setMsg({text: (e as Error).message, tone: "err"}); }
  }, [filters]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  const run = async (fn: () => Promise<string | {text: string; link?: string}>) => { setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg(typeof r === "string" ? {text: r, tone: "ok"} : {...r, tone: "ok"}); await load(); } catch (e) { setMsg({text: (e as Error).message, tone: "err"}); } finally { setBusy(false); } };

  const open = async (id: string | null) => {
    setMsg(null); setReason(""); setLoc("en"); setOrder(null);
    if (!id) { setEditing("new"); setDetail(null); setF(EMPTY); return; }
    const d: Detail = await call("/api/admin/programme-items/" + id);
    const i = d.item as unknown as Record<string, unknown> & {translations: (Record<string, unknown> & {locale: string})[]};
    const tr = (l: string): Tr | null => { const t = i.translations.find(x => x.locale === l); return t ? {title: String(t.title), categoryLabel: String(t.categoryLabel ?? ""), summary: String(t.summary), overview: String(t.overview),
      highlights: Array.isArray(t.highlights) && t.highlights.length ? t.highlights as string[] : [""], imageAlt: String(t.imageAlt ?? ""), seoTitle: String(t.seoTitle ?? ""), seoDescription: String(t.seoDescription ?? ""), reviewStatus: String(t.reviewStatus)} : null; };
    const s = (k: string) => i[k] == null ? "" : String(i[k]);
    setF({slug: s("slug"), category: s("category"), programmeStatus: s("programmeStatus"), isLegacy: !!i.isLegacy, displayOrder: s("displayOrder"), imageUrl: s("imageUrl"), imageRightsStatus: s("imageRightsStatus"),
      eventDate: s("eventDate").slice(0, 10), startTime: s("startTime"), endTime: s("endTime"), venue: s("venue"), feeLabel: s("feeLabel"), currency: s("currency"), dateConfirmed: !!i.dateConfirmed, venueConfirmed: !!i.venueConfirmed,
      feeConfirmed: !!i.feeConfirmed, conferenceId: s("conferenceId"), sourceSystem: s("sourceSystem"), sourceId: s("sourceId"), sourceUrl: s("sourceUrl"), sourceTitle: s("sourceTitle"), editorialStatus: s("editorialStatus"),
      editorialNote: s("editorialNote"), en: tr("en") || emptyTr(), zh: tr("zh") || emptyTr(), hasZh: !!tr("zh")});
    setDetail(d); setEditing(id);
    setTimeout(() => document.getElementById("programme-editor")?.scrollIntoView({behavior: "smooth", block: "start"}), 0);
  };
  const payload = () => {
    const t = (x: Tr) => ({title: x.title.trim(), categoryLabel: nul(x.categoryLabel), summary: x.summary.trim(), overview: x.overview.trim(), highlights: x.highlights.map(h => h.trim()).filter(Boolean),
      imageAlt: nul(x.imageAlt), seoTitle: nul(x.seoTitle), seoDescription: nul(x.seoDescription), reviewStatus: x.reviewStatus});
    return {slug: f.slug.trim(), category: f.category, programmeStatus: f.programmeStatus, isLegacy: f.isLegacy, displayOrder: Math.max(0, Math.min(9999, Number(f.displayOrder) || 0)), imageUrl: nul(f.imageUrl),
      imageRightsStatus: nul(f.imageRightsStatus), eventDate: nul(f.eventDate), startTime: nul(f.startTime), endTime: nul(f.endTime), venue: nul(f.venue), feeLabel: nul(f.feeLabel), currency: nul(f.currency.toUpperCase()),
      dateConfirmed: f.dateConfirmed, venueConfirmed: f.venueConfirmed, feeConfirmed: f.feeConfirmed, conferenceId: nul(f.conferenceId), sourceSystem: nul(f.sourceSystem), sourceId: nul(f.sourceId), sourceUrl: nul(f.sourceUrl),
      sourceTitle: nul(f.sourceTitle), editorialStatus: f.editorialStatus, editorialNote: nul(f.editorialNote), translations: {en: t(f.en), zh: f.hasZh && f.zh.title.trim() ? t(f.zh) : null}};
  };
  const save = () => run(async () => {
    if (editing === "new") { const r = await call("/api/admin/programme-items", "POST", payload()); await open(r.item.id); return r.warning ? {text: "Draft created. " + r.warning} : "Draft created — review, then publish."; }
    await call("/api/admin/programme-items/" + editing, "PUT", {...payload(), reason: reason.trim() || "Edited in CMS"}); await open(editing!); return "Saved." + (detail?.item.status === "PUBLISHED" ? " The live page is updated (within ~30 s)." : "");
  });
  const action = (id: string, a: string, why: string, extra: Record<string, unknown> = {}) => run(async () => {
    const r = await call(`/api/admin/programme-items/${id}/action`, "POST", {action: a, reason: why, ...extra}); if (editing === id) await open(id);
    return a === "publish" ? {text: "Published.", link: r.previewUrl} : a === "unpublish" ? "Unpublished — the page now returns 404 and the card is hidden." : a === "delete" ? "Moved to Deleted (soft delete; bookings are never touched)." : a === "approve" ? "Editorial review approved." : a === "rollback" ? "Content restored from the published version." : "Done.";
  });
  const confirmAct = (r: Row | {id: string; title: string}, a: string, text: string) => { if (window.confirm(text)) void action(r.id, a, `${a} via CMS`); };

  const regular = useMemo(() => rows.filter(r => !r.isLegacy && !r.deleted), [rows]), legacy = useMemo(() => rows.filter(r => r.isLegacy && !r.deleted), [rows]);
  const trSet = (k: keyof Tr, v: string | string[]) => setF(x => ({...x, [loc]: {...x[loc], [k]: v}}));
  const t = f[loc];
  const preview = (slug: string) => `/programme/${slug}/?cmsPreview=1`;
  const move = (g: "regular" | "legacy", i: number, d: number) => setOrder(o => { if (!o) return o; const a = [...o[g]]; const j = i + d; if (j < 0 || j >= a.length) return o; [a[i], a[j]] = [a[j], a[i]]; return {...o, [g]: a}; });

  const table = (list: Row[], title: string, hint: string) => <section className="cms-panel programme-group">
    <div className="imdx-cms-panel-title"><h2>{title} <span className="micro">({list.length})</span></h2><span className="micro">{hint}</span></div>
    {!list.length ? <p className="micro">Nothing here with the current filters.</p> :
    <div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>#</th><th>Programme</th><th>Status</th><th>Languages</th><th>Booking link</th><th /></tr></thead><tbody>
      {list.map((r, n) => <tr key={r.id} className={editing === r.id ? "is-selected" : ""}>
        <td>{n + 1}</td>
        <td><div className="programme-row">{r.imageUrl ? <img src={r.imageUrl} alt="" width={56} height={36} /> : <span className="programme-row-ph" aria-hidden="true" />}
          <div><strong>{r.title}</strong><small>/programme/{r.slug}/{r.sourceSystem ? ` · ${r.sourceSystem} #${r.sourceId}` : ""}</small>
            {r.problems.length > 0 && r.status !== "PUBLISHED" && <small className="programme-warn">Before publishing: {r.problems.join("; ")}</small>}</div></div></td>
        <td><Chip v={r.status} />{r.sourceSystem && <> <Chip v={r.editorialStatus} label={r.editorialStatus === "APPROVED" ? "approved" : "needs review"} /></>}</td>
        <td>{["en", "zh"].map(l => <span key={l} className={"tag" + (r.locales.includes(l) ? " ok" : "")}>{l === "en" ? "EN" : "中文"}{r.locales.includes(l) ? "" : " missing"}</span>)}</td>
        <td>{r.conference ? <span className="tag info">{r.conference}</span> : <span className="micro">— information only</span>}</td>
        <td><div className="cms-row-actions">
          <button type="button" className="ghost cms-small" onClick={() => void open(r.id)}>Edit</button>
          <a className="cms-small" href={preview(r.slug)} target="_blank" rel="noreferrer">Preview ↗</a>
          {canWrite && r.status !== "PUBLISHED" && <button type="button" className="cms-small" disabled={busy || r.problems.length > 0} title={r.problems.join("; ")} onClick={() => confirmAct(r, "publish", `Publish “${r.title}”? It becomes visible on /programme/ and at /programme/${r.slug}/.`)}>Publish</button>}
          {canWrite && r.status === "PUBLISHED" && <button type="button" className="ghost cms-small" disabled={busy} onClick={() => confirmAct(r, "unpublish", `Unpublish “${r.title}”? The card disappears and the page returns 404.`)}>Unpublish</button>}
          {canWrite && r.status !== "ARCHIVED" && <button type="button" className="ghost cms-small" disabled={busy} onClick={() => confirmAct(r, "archive", `Archive “${r.title}”?`)}>Archive</button>}
          {canWrite && <button type="button" className="ghost cms-small" disabled={busy} onClick={() => confirmAct(r, "delete", `Delete “${r.title}”? It is kept as deleted (can be restored); bookings and conferences are not affected.`)}>Delete</button>}
        </div></td></tr>)}
    </tbody></table></div>}
  </section>;

  return <main className="cms-page programme-pages">
    <header><p className="eyebrow">WEBSITE · PROGRAMME</p><h1>Programme pages</h1>
      <p>The cards on <a href="/programme/" target="_blank" rel="noreferrer">/programme/ ↗</a> (3 per page) and their detail pages, in English and 中文. Only published pages are public.
        This is editorial content — seats, prices and invoices stay in <a href="/admin/programmes">Events &amp; Programmes</a>; link a page to a published conference to show a “Register” button.</p></header>
    {msg && <div className={"notice " + (msg.tone === "err" ? "warning" : "")} role={msg.tone === "err" ? "alert" : "status"}>{msg.text} {msg.link && <a href={msg.link} target="_blank" rel="noreferrer">View page ↗</a>}</div>}
    <div className="prospects-filters" role="search">
      <label>Search<input type="search" placeholder="Title or slug" value={filters.q} onChange={e => setFilters({...filters, q: e.target.value})} /></label>
      <label>Status<select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}><option value="">Active (not deleted)</option><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option><option value="DELETED">Deleted</option></select></label>
      <label>Group<select value={filters.group} onChange={e => setFilters({...filters, group: e.target.value})}><option value="">Regular + reference</option><option value="regular">Regular</option><option value="legacy">Reference / legacy</option></select></label>
      <label>Type<select value={filters.category} onChange={e => setFilters({...filters, category: e.target.value})}><option value="">All types</option>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Language<select value={filters.missing} onChange={e => setFilters({...filters, missing: e.target.value})}><option value="">All</option><option value="zh">中文 missing</option></select></label>
      {canWrite && <button type="button" onClick={() => void open(null)}>+ Add programme</button>}
      {canWrite && <button type="button" className="ghost" onClick={() => { setEditing(null); setOrder({regular, legacy}); }}>Reorder</button>}
    </div>
    <p className="micro">{total} programme{total === 1 ? "" : "s"}. Public order: regular programmes first (by order number), then reference / legacy programmes — reference pages always come last.</p>

    {order && <section className="cms-panel"><div className="imdx-cms-panel-title"><h2>Reorder</h2><span className="micro">Move within each group. Reference programmes always stay after regular ones.</span></div>
      {(["regular", "legacy"] as const).map(g => <div key={g}><h3 className="micro">{g === "regular" ? "Regular programmes" : "Reference / legacy programmes"}</h3>
        <ol className="programme-order">{order[g].map((r, i) => <li key={r.id}><span>{i + 1}. {r.title}</span><span><button type="button" className="ghost cms-small" aria-label={"Move up " + r.title} disabled={i === 0} onClick={() => move(g, i, -1)}>↑</button>
          <button type="button" className="ghost cms-small" aria-label={"Move down " + r.title} disabled={i === order[g].length - 1} onClick={() => move(g, i, 1)}>↓</button></span></li>)}</ol>
        {order[g].length > 1 && <button type="button" className="cms-small" disabled={busy} onClick={() => void run(async () => { await call("/api/admin/programme-items/reorder", "POST", {group: g, ids: order[g].map(r => r.id)}); return "Order saved."; })}>Save {g === "regular" ? "regular" : "reference"} order</button>}</div>)}
      <button type="button" className="ghost" onClick={() => setOrder(null)}>Close</button></section>}

    {table(regular, "Regular programmes", "Shown first, in this order.")}
    {table(legacy, "Reference / legacy programmes", "Always listed after all regular programmes. Imported content needs editorial approval before publishing.")}
    {filters.status === "DELETED" && <section className="cms-panel"><h2>Deleted</h2>{rows.filter(r => r.deleted).map(r => <p key={r.id}>{r.title} {canWrite && <button type="button" className="ghost cms-small" onClick={() => void action(r.id, "restore", "Restore deleted programme")}>Restore</button>}</p>)}</section>}

    {editing && <section className="cms-panel programme-editor" id="programme-editor" aria-labelledby="pe-h">
      <div className="imdx-cms-panel-title"><h2 id="pe-h">{editing === "new" ? "New programme (draft)" : "Edit: " + (f.en.title || f.slug)}</h2>
        <span>{detail && <Chip v={detail.item.deletedAt ? "DELETED" : detail.item.status} />} <button type="button" className="ghost cms-small" onClick={() => { setEditing(null); setDetail(null); }}>Close</button></span></div>
      {detail && detail.problems.length > 0 && <p className="warning micro" role="status">To publish: {detail.problems.join("; ")}</p>}
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <fieldset disabled={!canWrite}>
          <legend>1. Card &amp; address</legend>
          <div className="form-grid">
            <label>Address (slug)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={e => setF({...f, slug: e.target.value})} /><small className="micro">/programme/{f.slug || "…"}/ — keep it stable once published.</small></label>
            <label>Type<select value={f.category} onChange={e => setF({...f, category: e.target.value})}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label>Status shown<select value={f.programmeStatus} onChange={e => setF({...f, programmeStatus: e.target.value})}><option value="TBA">Schedule to be announced</option><option value="CONFIRMED">Confirmed</option><option value="REFERENCE">Reference (details not confirmed)</option></select></label>
            <label>Order number (lower = earlier)<input type="number" min={0} max={9999} value={f.displayOrder} onChange={e => setF({...f, displayOrder: e.target.value})} /></label>
            <label className="consent"><input type="checkbox" checked={f.isLegacy} onChange={e => setF({...f, isLegacy: e.target.checked})} /> Reference / legacy programme — always listed after regular programmes (not a statement that it already took place)</label>
          </div>
        </fieldset>
        <fieldset disabled={!canWrite}>
          <legend>2. Content</legend>
          <div className="seg" role="tablist" aria-label="Language">{(["en", "zh"] as const).map(l => <button key={l} type="button" role="tab" aria-selected={loc === l} aria-pressed={loc === l} onClick={() => setLoc(l)}>{l === "en" ? "English (required)" : "中文"}{l === "zh" && !f.zh.title ? " — missing" : ""}</button>)}</div>
          {loc === "zh" && <p className="micro">Without a 中文 version the Chinese page shows the English text with a note. Mark machine-assisted or unchecked translations as “needs review”.</p>}
          <div className="form-grid">
            <label>Title<input required={loc === "en"} minLength={3} maxLength={160} value={t.title} onChange={e => { trSet("title", e.target.value); if (loc === "en" && editing === "new" && (f.slug === "" || f.slug === slugify(f.en.title))) setF(x => ({...x, slug: slugify(e.target.value), en: {...x.en, title: e.target.value}})); }} /></label>
            <label>Card label (e.g. CONFERENCE)<input maxLength={60} value={t.categoryLabel} onChange={e => trSet("categoryLabel", e.target.value)} /></label>
            <label className="span-2">Card summary (1–2 sentences)<textarea required={loc === "en"} minLength={10} maxLength={400} rows={2} value={t.summary} onChange={e => trSet("summary", e.target.value)} /><small className="micro">{t.summary.length}/400</small></label>
            <label className="span-2">Overview (blank line = new paragraph)<textarea rows={7} maxLength={8000} value={t.overview} onChange={e => trSet("overview", e.target.value)} /></label>
            <div className="span-2"><span className="micro">Highlights (one per line item)</span>
              {t.highlights.map((h, i) => <div className="cms-row-actions" key={i}><input aria-label={"Highlight " + (i + 1)} maxLength={240} value={h} onChange={e => trSet("highlights", t.highlights.map((x, j) => j === i ? e.target.value : x))} />
                <button type="button" className="ghost cms-small" aria-label={"Remove highlight " + (i + 1)} onClick={() => trSet("highlights", t.highlights.filter((_, j) => j !== i).concat(t.highlights.length === 1 ? [""] : []))}>×</button></div>)}
              {t.highlights.length < 12 && <button type="button" className="ghost cms-small" onClick={() => trSet("highlights", [...t.highlights, ""])}>+ Add highlight</button>}</div>
            <label>Cover image alt text<input maxLength={300} value={t.imageAlt} onChange={e => trSet("imageAlt", e.target.value)} /></label>
            <label>SEO title (optional, ≤70)<input maxLength={70} value={t.seoTitle} onChange={e => trSet("seoTitle", e.target.value)} /></label>
            <label>SEO description (optional, ≤170)<input maxLength={170} value={t.seoDescription} onChange={e => trSet("seoDescription", e.target.value)} /></label>
            {loc === "zh" && <label>Translation review<select value={f.zh.reviewStatus} onChange={e => setF({...f, zh: {...f.zh, reviewStatus: e.target.value}})}><option value="APPROVED">Reviewed</option><option value="PENDING_REVIEW">Needs review</option></select></label>}
          </div>
        </fieldset>
        <fieldset disabled={!canWrite}>
          <legend>3. Cover image</legend>
          <div className="form-grid">
            <label>Image URL (/assets/… or https://)<input value={f.imageUrl} onChange={e => setF({...f, imageUrl: e.target.value})} /></label>
            <label>Image rights<select value={f.imageRightsStatus} onChange={e => setF({...f, imageRightsStatus: e.target.value})}><option value="">—</option><option>OWNED</option><option>LICENSED</option><option>ORGANIZER_PROVIDED</option><option>PENDING_APPROVAL</option></select></label>
            <label>Upload (PNG/JPG/WebP ≤8 MB; uses the English alt text and the rights above)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return; if (!f.en.imageAlt || !f.imageRightsStatus) { setMsg({text: "Enter the English alt text and the image rights first.", tone: "err"}); e.target.value = ""; return; }
              const fd = new FormData(); fd.append("file", file); fd.append("altText", f.en.imageAlt); fd.append("rightsStatus", f.imageRightsStatus);
              const r = await fetch("/api/admin/assets", {method: "POST", body: fd}); const j = await r.json(); if (r.ok) { setF(x => ({...x, imageUrl: j.url})); setMsg({text: "Image uploaded — save to keep it.", tone: "ok"}); } else setMsg({text: j.message, tone: "err"}); }} /></label>
            {f.imageUrl && <img className="programme-cover-preview" src={f.imageUrl} alt={f.en.imageAlt || "Cover preview"} />}
          </div>
        </fieldset>
        <fieldset disabled={!canWrite}>
          <legend>4. Facts — shown publicly only when confirmed by the organizer</legend>
          {!canConfirm && <p className="micro">Only Super Admin or Operations can confirm facts or link a conference.</p>}
          <div className="form-grid">
            <label>Date<input type="date" value={f.eventDate} onChange={e => setF({...f, eventDate: e.target.value})} /></label>
            <label>Start – end (WIB)<span className="cms-row-actions"><input type="time" aria-label="Start time" value={f.startTime} onChange={e => setF({...f, startTime: e.target.value})} /><input type="time" aria-label="End time" value={f.endTime} onChange={e => setF({...f, endTime: e.target.value})} /></span></label>
            <label>Venue<input maxLength={160} value={f.venue} onChange={e => setF({...f, venue: e.target.value})} /></label>
            <label>Admission / fee label<input maxLength={120} placeholder="e.g. Free admission" value={f.feeLabel} onChange={e => setF({...f, feeLabel: e.target.value})} /></label>
            <label className="consent"><input type="checkbox" disabled={!canConfirm} checked={f.dateConfirmed} onChange={e => setF({...f, dateConfirmed: e.target.checked})} /> Date &amp; time confirmed</label>
            <label className="consent"><input type="checkbox" disabled={!canConfirm} checked={f.venueConfirmed} onChange={e => setF({...f, venueConfirmed: e.target.checked})} /> Venue confirmed</label>
            <label className="consent"><input type="checkbox" disabled={!canConfirm} checked={f.feeConfirmed} onChange={e => setF({...f, feeConfirmed: e.target.checked})} /> Fee label confirmed (display only — prices are set on the conference)</label>
            <label className="span-2">Register button: linked conference<select disabled={!canConfirm} value={f.conferenceId} onChange={e => setF({...f, conferenceId: e.target.value})}><option value="">None — show “Registration details coming soon”</option>{conferences.map(c => <option key={c.id} value={c.id}>{c.title}{c.published ? "" : " (unpublished)"}</option>)}</select>
              <small className="micro">The button appears only while that conference is published and registration is open; capacity and price come from the conference.</small></label>
          </div>
        </fieldset>
        <fieldset disabled={!canWrite}>
          <legend>5. Source &amp; editorial review</legend>
          <div className="form-grid">
            <label>Source system<input maxLength={40} placeholder="e.g. ICEE" value={f.sourceSystem} onChange={e => setF({...f, sourceSystem: e.target.value})} /></label>
            <label>Source ID<input maxLength={40} value={f.sourceId} onChange={e => setF({...f, sourceId: e.target.value})} /></label>
            <label className="span-2">Source URL (https)<input value={f.sourceUrl} onChange={e => setF({...f, sourceUrl: e.target.value})} /></label>
            <label className="span-2">Original source title<input maxLength={200} value={f.sourceTitle} onChange={e => setF({...f, sourceTitle: e.target.value})} /></label>
            {detail?.item.sourceFacts && <div className="span-2 programme-facts-box"><strong className="micro">Source-reported facts (not official, not shown publicly)</strong><pre>{JSON.stringify(detail.item.sourceFacts, null, 2)}</pre></div>}
            <label className="span-2">Editorial note<textarea rows={3} maxLength={2000} value={f.editorialNote} onChange={e => setF({...f, editorialNote: e.target.value})} /></label>
            <p className="micro span-2">Editorial review: <Chip v={f.editorialStatus} label={f.editorialStatus === "APPROVED" ? "approved" : "needs review"} />
              {editing !== "new" && f.sourceSystem && f.editorialStatus !== "APPROVED" && (isOwner ? <> <button type="button" className="cms-small" onClick={() => window.confirm("Approve this imported content for publication?") && void action(editing!, "approve", "Editorial review approved")}>Approve content</button></> : <> — approval by Super Admin (Product Owner).</>)}</p>
          </div>
        </fieldset>
        {canWrite && <div className="programme-save">
          {editing !== "new" && <label>Change note (audit)<input maxLength={300} placeholder="What changed?" value={reason} onChange={e => setReason(e.target.value)} /></label>}
          <div className="cms-row-actions"><button disabled={busy}>{editing === "new" ? "Create draft" : "Save changes"}</button>
            {editing !== "new" && <a className="cms-small" href={preview(f.slug)} target="_blank" rel="noreferrer">Preview ↗</a>}
            {editing !== "new" && detail && detail.item.status !== "PUBLISHED" && !detail.item.deletedAt && <button type="button" disabled={busy || detail.problems.length > 0} onClick={() => window.confirm("Publish this page?") && void action(editing!, "publish", reason.trim() || "Published from editor")}>Publish</button>}
            <button type="button" className="ghost" onClick={() => { setEditing(null); setDetail(null); }}>Cancel</button></div></div>}
      </form>
      {detail && <div className="programme-history"><h3>History</h3>
        {detail.revisions.length > 0 && <><p className="micro">Published versions — restore the content of a version (status stays as it is):</p>
          <ul>{detail.revisions.map(r => <li key={r.version}>v{r.version} · {new Date(r.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} · {r.reason} {canWrite && <button type="button" className="ghost cms-small" onClick={() => window.confirm(`Restore content from v${r.version}?`) && void action(editing!, "rollback", "Restore v" + r.version, {version: r.version})}>Restore</button>}</li>)}</ul></>}
        <ul className="micro">{detail.audit.map((a, i) => <li key={i}>{new Date(a.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} — {a.action.replace("PROGRAMME_", "").toLowerCase().replace(/_/g, " ")}{a.afterState?.reason ? ": " + a.afterState.reason : ""}</li>)}</ul></div>}
    </section>}
  </main>;
}
