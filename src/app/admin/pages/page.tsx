"use client";
import {useCallback, useEffect, useState} from "react";
import {useCmsSession} from "../components/CmsShell";

type Item = Record<string, string>;
type Block = {id: string; type: string; hidden: boolean; ref?: string; data?: Record<string, unknown>};
type FieldVal = {mode?: string; text?: string; href?: string; src?: string; alt?: string};
type FieldDef = {key: string; kind: "text" | "image"; tag: string; mode?: string; text?: string; href?: string; src?: string; alt?: string};
type Layout = {seo: {title: string; description: string}; blocks: Block[]; fields?: Record<string, FieldVal>};
type PageInfo = {key: string; path: string; sections: number; locales: {locale: string; version: number; unpublishedChanges: boolean}[]};
type Detail = {key: string; path: string; locale: string; sections: {id: string; label: string}[]; fields: Record<string, FieldDef[]>; draft: Layout; version: number; publishedAt: string | null; revisions: {version: number; reason: string; publishedAt: string}[]};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || (j.issues ? j.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Request failed")); return j; };
const TYPES: Record<string, {label: string; fields: [string, string, number?][]; list?: [string, string][]}> = {
  hero: {label: "Hero banner", fields: [["eyebrow", "Eyebrow"], ["title", "Title"], ["subtitle", "Subtitle", 3], ["ctaLabel", "Button label"], ["ctaHref", "Button link"], ["imageUrl", "Image URL"], ["imageAlt", "Image alt text"]]},
  text: {label: "Text section", fields: [["eyebrow", "Eyebrow"], ["heading", "Heading"], ["body", "Body (blank line = new paragraph, '- ' = bullet)", 8]]},
  cards: {label: "Cards grid", fields: [["heading", "Heading"]], list: [["title", "Title"], ["text", "Text"], ["href", "Link"], ["imageUrl", "Image URL"], ["imageAlt", "Image alt"]]},
  cta: {label: "Call to action", fields: [["heading", "Heading"], ["text", "Text", 3], ["buttonLabel", "Button label"], ["buttonHref", "Button link"]]},
  image: {label: "Image", fields: [["imageUrl", "Image URL"], ["imageAlt", "Alt text"], ["caption", "Caption"]]},
  stats: {label: "Key figures", fields: [["heading", "Heading"]], list: [["value", "Value"], ["label", "Label"]]},
  faq: {label: "FAQ", fields: [["heading", "Heading"]], list: [["q", "Question"], ["a", "Answer"]]},
  list: {label: "CMS list (partners, downloads, news, gallery, contacts)", fields: [["heading", "Heading"], ["kind", "Kind: PARTNER | DOWNLOAD | NEWS | GALLERY | CONTACT"]]}
};
const emptyData = (t: string) => Object.fromEntries([...TYPES[t].fields.map(([k]) => [k, t === "list" && k === "kind" ? "PARTNER" : ""]), ...(TYPES[t].list ? [["items", []]] : [])]);

/** CMS page builder: manage content blocks and the layout (order/visibility) of every public page,
 * with draft → preview → publish, revision history and rollback. */
export default function PagesCms() {
  const {actor} = useCmsSession();
  const canEdit = actor?.role === "SUPER_ADMIN" || actor?.role === "CONTENT_EDITOR";
  const [pages, setPages] = useState<PageInfo[]>([]), [key, setKey] = useState("home"), [locale, setLocale] = useState("en"), [d, setD] = useState<Detail | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null), [dirty, setDirty] = useState(false), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [open, setOpen] = useState<string>("");
  const loadList = useCallback(async () => { try { setPages((await call("/api/admin/pages")).pages); } catch (e) { setMsg((e as Error).message); } }, []);
  const load = useCallback(async () => { try { const x = await call(`/api/admin/pages/${key}?locale=${locale}`); setD(x); setLayout(x.draft); setDirty(false); } catch (e) { setMsg((e as Error).message); } }, [key, locale]);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); await load(); await loadList(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const edit = (fn: (l: Layout) => Layout) => { setLayout(l => l ? fn(structuredClone(l)) : l); setDirty(true); };
  const move = (i: number, dir: number) => edit(l => { const j = i + dir; if (j < 0 || j >= l.blocks.length) return l; [l.blocks[i], l.blocks[j]] = [l.blocks[j], l.blocks[i]]; return l; });
  const label = (b: Block) => b.type === "static" ? "Designed section · " + (d?.sections.find(s => s.id === b.ref)?.label || b.ref) : TYPES[b.type]?.label + (b.data && (b.data.title || b.data.heading) ? " · " + String(b.data.title || b.data.heading) : "");
  const missingStatic = d ? d.sections.filter(s => !layout?.blocks.some(b => b.type === "static" && b.ref === s.id)) : [];
  if (!layout || !d) return <main className="cms-page"><p>{msg || "Loading pages…"}</p></main>;
  return <main className="cms-page"><header><p className="eyebrow">CONTENT</p><h1>Pages &amp; layout</h1>
    <p>Change the content and layout of the public website: reorder or hide designed sections and add your own blocks. Changes stay in draft until published; every publish is a version you can roll back.</p></header>
    <div className="cms-row-actions">
      <label>Page<select value={key} onChange={e => { if (!dirty || window.confirm("Discard unsaved changes?")) setKey(e.target.value); }}>{pages.map(p => <option key={p.key} value={p.key}>{p.path} {p.locales.some(l => l.unpublishedChanges) ? "• draft" : ""}</option>)}</select></label>
      <label>Language<select value={locale} onChange={e => setLocale(e.target.value)}><option value="en">English</option><option value="zh">中文 (Simplified Chinese)</option></select></label>
      <a className="button-link ghost" href={d.path + "?cmsPreview=1"} target="_blank" rel="noreferrer">Preview draft ↗</a>
      <span className="micro">Published v{d.version}{d.publishedAt ? " · " + new Date(d.publishedAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"}) : " · showing original design"}</span>
    </div>
    {msg && <p role="status" className="notice">{msg}</p>}
    <section className="cms-card"><h2>SEO</h2>
      <div className="form-grid"><label>Page title (max 70)<input disabled={!canEdit} maxLength={70} value={layout.seo.title} onChange={e => edit(l => { l.seo.title = e.target.value; return l; })} /></label>
        <label>Meta description (max 170)<textarea disabled={!canEdit} maxLength={170} value={layout.seo.description} onChange={e => edit(l => { l.seo.description = e.target.value; return l; })} /></label></div></section>
    {key === "site" && Object.entries(d.fields).map(([group, defs]) => <section className="cms-card" key={group}><h2>{group === "site-header" ? "Header & navigation (all pages)" : group === "site-footer" ? "Footer (all pages)" : group}</h2>
      <FieldEditor defs={defs} values={layout.fields || {}} disabled={!canEdit} onChange={fn => edit(l => { l.fields = fn({...(l.fields || {})}); return l; })} /></section>)}
    {key !== "site" && <section className="cms-card"><h2>Layout ({layout.blocks.length} blocks)</h2>
      <ol className="page-blocks">{layout.blocks.map((b, i) => <li key={b.id} className={b.hidden ? "is-hidden" : ""}>
        <div className="cms-row-actions"><strong>{i + 1}. {label(b)}</strong>{b.hidden && <span className="status">Hidden</span>}
          {canEdit && <><button type="button" className="ghost cms-small" aria-label={"Move " + label(b) + " up"} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="ghost cms-small" aria-label={"Move " + label(b) + " down"} disabled={i === layout.blocks.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="ghost cms-small" onClick={() => edit(l => { l.blocks[i].hidden = !l.blocks[i].hidden; return l; })}>{b.hidden ? "Show" : "Hide"}</button>
            {b.type === "static" && (d.fields[b.ref!] || []).length > 0 && <button type="button" className="ghost cms-small" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? "" : b.id)}>{open === b.id ? "Close" : "Edit content (" + d.fields[b.ref!].length + ")"}</button>}
            {b.type !== "static" && <><button type="button" className="ghost cms-small" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? "" : b.id)}>{open === b.id ? "Close" : "Edit"}</button>
              <button type="button" className="ghost cms-small" onClick={() => { if (window.confirm("Remove this block?")) edit(l => { l.blocks.splice(i, 1); return l; }); }}>Remove</button></>}</>}
        </div>
        {open === b.id && b.data && <BlockForm block={b} onChange={data => edit(l => { l.blocks[i].data = data; return l; })} />}
        {open === b.id && b.type === "static" && <FieldEditor defs={d.fields[b.ref!] || []} values={layout.fields || {}} disabled={!canEdit} onChange={fn => edit(l => { l.fields = fn({...(l.fields || {})}); return l; })} />}
      </li>)}</ol>
      {canEdit && <div className="cms-row-actions"><label>Add block<select value="" onChange={e => { const t = e.target.value; if (!t) return; const id = t + "-" + Math.random().toString(36).slice(2, 8); edit(l => { l.blocks.push({id, type: t, hidden: false, data: emptyData(t)}); return l; }); setOpen(id); }}>
        <option value="">Choose block type…</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        {missingStatic.map(s => <button key={s.id} type="button" className="ghost cms-small" onClick={() => edit(l => { l.blocks.push({id: "s-" + s.id, type: "static", ref: s.id, hidden: false}); return l; })}>Re-add “{s.label}”</button>)}</div>}
    </section>}
    {canEdit && <section className="cms-card cms-row-actions">
      <button disabled={busy || !dirty} onClick={() => void act(() => call(`/api/admin/pages/${key}?locale=${locale}`, "PUT", layout), "Draft saved. Use Preview, then Publish.")}>Save draft</button>
      <button disabled={busy || dirty} onClick={() => { const reason = window.prompt("Publish reason (min 8 chars)"); if (reason) void act(() => call(`/api/admin/pages/${key}/publish?locale=${locale}`, "POST", {reason}), "Published to the public website (cache up to 60 s)."); }}>Publish</button>
      <button className="ghost" disabled={busy} onClick={() => { if (window.confirm("Reset the draft to the original designed page?")) { setLayout({seo: {title: "", description: ""}, fields: {}, blocks: d.sections.map(s => ({id: "s-" + s.id, type: "static", ref: s.id, hidden: false}))}); setDirty(true); } }}>Reset draft to original design</button>
      {dirty && <span className="warning micro" role="status">Unsaved changes</span>}
    </section>}
    <section className="cms-card"><h2>Published versions</h2>
      {d.revisions.length ? <ul className="micro">{d.revisions.map(r => <li key={r.version}>v{r.version} · {new Date(r.publishedAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} · {r.reason}
        {canEdit && r.version !== d.version && <> <button className="link" onClick={() => { const reason = window.prompt("Reason for rollback"); if (reason) void act(() => call(`/api/admin/pages/${key}/rollback?locale=${locale}`, "POST", {version: r.version, reason}), "Rolled back as a new version."); }}>Restore</button></>}</li>)}
        {canEdit && <li><button className="link" onClick={() => { const reason = window.prompt("Reason for restoring the original design"); if (reason) void act(() => call(`/api/admin/pages/${key}/rollback?locale=${locale}`, "POST", {version: 0, reason}), "Original design restored."); }}>Restore original design</button></li>}</ul>
        : <p className="micro">Not published yet — the website shows the original design.</p>}
    </section>
  </main>;
}

function BlockForm({block, onChange}: {block: Block; onChange: (d: Record<string, unknown>) => void}) {
  const t = TYPES[block.type], data = block.data as Record<string, unknown>;
  const items = (data.items as Item[]) || [];
  return <div className="form-grid block-form">
    {t.fields.map(([k, lab, rows]) => <label key={k}>{lab}{rows ? <textarea rows={rows} value={String(data[k] ?? "")} onChange={e => onChange({...data, [k]: e.target.value})} />
      : <input value={String(data[k] ?? "")} onChange={e => onChange({...data, [k]: e.target.value})} />}</label>)}
    {t.list && <fieldset><legend>Items ({items.length})</legend>
      {items.map((it, i) => <div key={i} className="cms-row-actions">{t.list!.map(([k, lab]) => <label key={k}>{lab}<input value={it[k] || ""} onChange={e => { const next = items.map((x, j) => j === i ? {...x, [k]: e.target.value} : x); onChange({...data, items: next}); }} /></label>)}
        <button type="button" className="ghost cms-small" onClick={() => onChange({...data, items: items.filter((_, j) => j !== i)})}>Remove item</button></div>)}
      <button type="button" className="ghost cms-small" onClick={() => onChange({...data, items: [...items, Object.fromEntries(t.list!.map(([k]) => [k, ""]))]})}>+ Add item</button></fieldset>}
  </div>;
}

/** Edit text, links and images inside a designed section (or the shared header/footer). Empty = keep the designed text. */
function FieldEditor({defs, values, disabled, onChange}: {defs: FieldDef[]; values: Record<string, FieldVal>; disabled: boolean; onChange: (fn: (f: Record<string, FieldVal>) => Record<string, FieldVal>) => void}) {
  const set = (f: FieldDef, patch: FieldVal) => onChange(all => {
    const next: FieldVal = {...(all[f.key] || {}), ...patch};
    for (const k of Object.keys(next) as (keyof FieldVal)[]) if (next[k] === "" || next[k] === undefined || (k !== "mode" && next[k] === f[k as keyof FieldDef])) delete next[k];
    if (f.kind === "text" && next.text !== undefined) next.mode = f.mode; else delete next.mode;
    if (Object.keys(next).length) all[f.key] = next; else delete all[f.key];
    return all;
  });
  return <div className="cms-field-editor">
    <p className="micro">Leave a field empty to keep the designed text. Plain text only{defs.some(f => f.mode === "rich") ? "; in multi-line fields a new line = line break, *text* = italic, **text** = bold" : ""}.</p>
    {defs.map(f => { const v = values[f.key] || {}, changed = Object.keys(v).some(k => k !== "mode");
      return <div key={f.key} className={"cms-field" + (changed ? " is-changed" : "")}>
        {f.kind === "image" ? <>
          <label>Image ({f.key}) — URL<input disabled={disabled} placeholder={f.src} value={v.src ?? ""} onChange={e => set(f, {src: e.target.value})} /></label>
          <label>Alt text<input disabled={disabled} maxLength={200} placeholder={f.alt} value={v.alt ?? ""} onChange={e => set(f, {alt: e.target.value})} /></label>
        </> : <>
          <label>{f.tag.toUpperCase()} ({f.key}){f.mode === "own" ? " — text next to an icon" : ""}
            {f.mode === "rich" || (f.text || "").length > 80
              ? <textarea disabled={disabled} rows={Math.min(8, Math.max(2, Math.ceil((f.text || "").length / 70)))} maxLength={4000} placeholder={f.text} value={v.text ?? ""} onChange={e => set(f, {text: e.target.value})} />
              : <input disabled={disabled} maxLength={4000} placeholder={f.text} value={v.text ?? ""} onChange={e => set(f, {text: e.target.value})} />}</label>
          {f.tag === "a" && <label>Link<input disabled={disabled} placeholder={f.href} value={v.href ?? ""} onChange={e => set(f, {href: e.target.value})} /></label>}
        </>}
        {changed && !disabled && <button type="button" className="ghost cms-small" onClick={() => onChange(all => { delete all[f.key]; return all; })}>Reset to design</button>}
      </div>; })}
  </div>;
}
