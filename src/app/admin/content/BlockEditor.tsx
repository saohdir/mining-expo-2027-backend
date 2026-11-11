"use client";
/** Gutenberg-style article editor: the article is a list of blocks (paragraph, heading, list, quote, image, button,
 * divider). "+" inserts a block; each block has move / duplicate / delete; text blocks have bold, italic and link.
 * Keyboard like Gutenberg: Enter = new paragraph, Backspace in an empty block removes it, "/" in an empty paragraph
 * opens the block menu, and typing "## ", "- ", "1. " or "> " at the start converts the paragraph. */
import {useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent} from "react";
import {renderBlocksHtml, type Block} from "@/lib/content-blocks";
import {useConfirm} from "../components/Confirm";

type EB = Block & {_id: string};
let seq = 0; const nid = () => "b" + (++seq) + Math.random().toString(36).slice(2, 6);
export const withIds = (b: Block[]): EB[] => b.map(x => ({...x, _id: nid()}) as EB);
export const stripIds = (b: EB[]): Block[] => b.map(({_id, ...x}) => { void _id; return x as Block; });
const TYPES: {t: Block["t"]; label: string; icon: string; hint: string; make: () => Block}[] = [
  {t: "p", label: "Paragraph", icon: "¶", hint: "Plain text", make: () => ({t: "p", text: ""})},
  {t: "h", label: "Heading", icon: "H", hint: "Section title", make: () => ({t: "h", level: 2, text: ""})},
  {t: "list", label: "List", icon: "•", hint: "Bulleted or numbered", make: () => ({t: "list", ordered: false, items: [""]})},
  {t: "quote", label: "Quote", icon: "❝", hint: "Highlighted statement", make: () => ({t: "quote", text: ""})},
  {t: "image", label: "Image", icon: "▣", hint: "Photo with caption", make: () => ({t: "image", url: "", alt: ""})},
  {t: "button", label: "Button", icon: "↗", hint: "Link styled as a button", make: () => ({t: "button", text: "", url: ""})},
  {t: "divider", label: "Divider", icon: "—", hint: "Horizontal line", make: () => ({t: "divider"})}
];
const LABEL: Record<string, string> = Object.fromEntries(TYPES.map(t => [t.t, t.label]));

function AutoText({value, onChange, onKeyDown, placeholder, className, inputRef, ariaLabel}: {value: string; onChange: (v: string) => void; onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void; placeholder?: string; className?: string; inputRef?: (el: HTMLTextAreaElement | null) => void; ariaLabel: string}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [value]);
  return <textarea ref={el => { ref.current = el; inputRef?.(el); }} rows={1} className={"be-text " + (className || "")} value={value} placeholder={placeholder} aria-label={ariaLabel}
    onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />;
}

export function BlockEditor({value, onChange, upload}: {value: EB[]; onChange: (b: EB[]) => void; upload: (file: File) => Promise<string>}) {
  const [menu, setMenu] = useState<{at: number; replace?: boolean} | null>(null), [preview, setPreview] = useState(false), [busy, setBusy] = useState<string>(""), [err, setErr] = useState("");
  const refs = useRef(new Map<string, HTMLTextAreaElement | HTMLInputElement>());
  const ask = useConfirm();
  // Focus moves in the same commit that renders the new block, so fast typing never lands in the previous block.
  const pending = useRef<{id: string; atEnd: boolean; range?: [number, number]} | null>(null);
  const focusNow = () => { const p = pending.current; const el = p && refs.current.get(p.id); if (!p || !el) return; pending.current = null;
    el.focus(); const [a, z] = p.range || [p.atEnd ? el.value.length : 0, p.atEnd ? el.value.length : 0]; try { el.setSelectionRange(a, z); } catch { /* not text */ } };
  useLayoutEffect(focusNow);
  const focusLater = (id: string, atEnd = true, range?: [number, number]) => { pending.current = {id, atEnd, range}; setTimeout(focusNow, 0); };
  const set = (i: number, patch: Partial<Block>) => onChange(value.map((b, j) => j === i ? {...b, ...patch} as EB : b));
  const insert = (at: number, b: Block, replace = false) => { const e = {...b, _id: nid()} as EB; const next = [...value]; next.splice(at, replace ? 1 : 0, e); onChange(next); setMenu(null); focusLater(e._id); };
  const remove = (i: number) => { const prev = value[i - 1]; onChange(value.filter((_, j) => j !== i)); if (prev) focusLater(prev._id); };
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const duplicate = (i: number) => { const next = [...value]; next.splice(i + 1, 0, {...value[i], _id: nid()}); onChange(next); };
  const wrap = async (id: string, i: number, before: string, after = before, field: "text" = "text") => {
    const el = refs.current.get(id) as HTMLTextAreaElement | undefined; if (!el) return;
    const b = value[i] as EB & {text: string}; const s = el.selectionStart ?? 0, e = el.selectionEnd ?? 0;
    // Pressing Ctrl+B / Ctrl+I again right before the closing mark steps out of it (like toggling bold off).
    if (s === e && before !== "[" && b[field].slice(s, s + after.length) === after) { el.focus(); el.setSelectionRange(s + after.length, s + after.length); return; }
    let mid = b[field].slice(s, e) || (before === "[" ? "link text" : "text");
    if (before === "[") {
      const r = await ask({title: "Add a link", tone: "info", confirmLabel: "Add link", field: {label: "Link address (https://… or /page/)", minLength: 2, placeholder: "https://"}});
      const url = r?.value.trim() || ""; if (!url) return;
      if (!/^https:\/\//.test(url) && !url.startsWith("/")) { setErr("Links must start with https:// or / (a page on this site)."); return; }
      after = "](" + url + ")"; mid = b[field].slice(s, e) || "link text";
    }
    set(i, {[field]: b[field].slice(0, s) + before + mid + after + b[field].slice(e)} as Partial<Block>);
    focusLater(id, true, [s + before.length, s + before.length + mid.length]);
  };
  const textKeys = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const b = value[i] as EB & {text: string}; const el = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey && (b.t === "p" || b.t === "h")) {
      e.preventDefault(); const at = el.selectionStart ?? b.text.length;
      const head = b.text.slice(0, at), tail = b.text.slice(at); const n = {t: "p", text: tail, _id: nid()} as EB;
      const next = value.map((x, j) => j === i ? {...x, text: head} as EB : x); next.splice(i + 1, 0, n); onChange(next); focusLater(n._id, false); return;
    }
    if (e.key === "Backspace" && !b.text && value.length > 1) { e.preventDefault(); remove(i); return; }
    if (e.key === "/" && !b.text && b.t === "p") { e.preventDefault(); setMenu({at: i, replace: true}); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); void wrap(b._id, i, "**"); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); void wrap(b._id, i, "*"); }
  };
  const textChange = (i: number) => (v: string) => {
    const b = value[i];
    if (b.t === "p") { // Markdown-style shortcuts at the start of a paragraph
      if (/^###\s/.test(v)) { set(i, {t: "h", level: 3, text: v.slice(4)} as Partial<Block>); focusLater(b._id); return; }
      if (/^##\s/.test(v)) { set(i, {t: "h", level: 2, text: v.slice(3)} as Partial<Block>); focusLater(b._id); return; }
      if (/^[-*]\s/.test(v)) { const id = b._id; onChange(value.map((x, j) => j === i ? {t: "list", ordered: false, items: [v.slice(2)], _id: id} as EB : x)); focusLater(id + ":0"); return; }
      if (/^1[.)]\s/.test(v)) { const id = b._id; onChange(value.map((x, j) => j === i ? {t: "list", ordered: true, items: [v.slice(3)], _id: id} as EB : x)); focusLater(id + ":0"); return; }
      if (/^>\s/.test(v)) { set(i, {t: "quote", text: v.slice(2)} as Partial<Block>); focusLater(b._id); return; }
    }
    set(i, {text: v} as Partial<Block>);
  };
  const listKeys = (i: number, k: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const b = value[i] as EB & {t: "list"}; const item = b.items[k];
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!item && k === b.items.length - 1) { // empty last item: leave the list, like Gutenberg
        const items = b.items.slice(0, -1); const p = {t: "p", text: "", _id: nid()} as EB; const next = value.map((x, j) => j === i ? {...x, items: items.length ? items : [""]} as EB : x);
        next.splice(i + 1, 0, p); onChange(next); focusLater(p._id); return;
      }
      const items = [...b.items]; items.splice(k + 1, 0, ""); set(i, {items} as Partial<Block>); focusLater(b._id + ":" + (k + 1)); return;
    }
    if (e.key === "Backspace" && !item) {
      e.preventDefault();
      if (b.items.length === 1) { const id = b._id; onChange(value.map((x, j) => j === i ? {t: "p", text: "", _id: id} as EB : x)); focusLater(id); return; }
      set(i, {items: b.items.filter((_, j) => j !== k)} as Partial<Block>); focusLater(b._id + ":" + Math.max(0, k - 1));
    }
  };
  const doUpload = async (i: number, file: File) => {
    setErr(""); setBusy(value[i]._id);
    try { const url = await upload(file); set(i, {url} as Partial<Block>); } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const reg = (id: string) => (el: HTMLTextAreaElement | HTMLInputElement | null) => { if (el) refs.current.set(id, el); else refs.current.delete(id); };

  const Inserter = ({at}: {at: number}) => <div className="be-inserter">
    <button type="button" className="be-plus" aria-label="Add block here" aria-expanded={menu?.at === at && !menu.replace} onClick={() => setMenu(menu?.at === at && !menu.replace ? null : {at})}>+</button>
    {menu?.at === at && !menu.replace && <Menu onPick={t => insert(at, t.make())} />}
  </div>;
  const Menu = ({onPick}: {onPick: (t: typeof TYPES[number]) => void}) => <div className="be-menu" role="menu" aria-label="Choose a block"
    onKeyDown={e => { if (e.key === "Escape") setMenu(null); }}>
    {TYPES.map(t => <button type="button" role="menuitem" key={t.t} onClick={() => onPick(t)}><span className="be-ico" aria-hidden="true">{t.icon}</span><span><strong>{t.label}</strong><small>{t.hint}</small></span></button>)}
  </div>;

  return <div className="be">
    <div className="be-tabs" role="tablist" aria-label="Article editor">
      <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)}>Edit</button>
      <button type="button" role="tab" aria-selected={preview} onClick={() => setPreview(true)}>Preview</button>
      <span className="be-count">{value.length} block{value.length === 1 ? "" : "s"}</span>
    </div>
    {err && <p className="cms-dl-error" role="alert">{err}</p>}
    {preview ? <div className="be-preview news-article-body" dangerouslySetInnerHTML={{__html: renderBlocksHtml(stripIds(value)) || "<p><em>Nothing to preview yet.</em></p>"}} />
    : <div className="be-canvas">
      {value.length === 0 && <div className="be-empty"><p>Start writing your article.</p><Menu onPick={t => insert(0, t.make())} /></div>}
      {value.map((b, i) => <div key={b._id} className={"be-block be-" + b.t}>
        <div className="be-bar" role="toolbar" aria-label={LABEL[b.t] + " block"}>
          <span className="be-type">{LABEL[b.t]}</span>
          {b.t === "h" && <span className="be-seg">{([2, 3] as const).map(l => <button type="button" key={l} aria-pressed={b.level === l} onClick={() => set(i, {level: l} as Partial<Block>)}>H{l}</button>)}</span>}
          {b.t === "list" && <span className="be-seg"><button type="button" aria-pressed={!b.ordered} onClick={() => set(i, {ordered: false} as Partial<Block>)} title="Bulleted list">•</button><button type="button" aria-pressed={b.ordered} onClick={() => set(i, {ordered: true} as Partial<Block>)} title="Numbered list">1.</button></span>}
          {(b.t === "p" || b.t === "quote") && <span className="be-seg"><button type="button" title="Bold (Ctrl+B)" onClick={() => void wrap(b._id, i, "**")}><strong>B</strong></button><button type="button" title="Italic (Ctrl+I)" onClick={() => void wrap(b._id, i, "*")}><em>I</em></button><button type="button" title="Link" onClick={() => void wrap(b._id, i, "[")}>🔗</button></span>}
          <span className="sp" />
          <button type="button" title="Move up" aria-label="Move block up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
          <button type="button" title="Move down" aria-label="Move block down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
          <button type="button" title="Duplicate" aria-label="Duplicate block" onClick={() => duplicate(i)}>⧉</button>
          <button type="button" title="Delete" aria-label="Delete block" className="be-del" onClick={() => remove(i)}>×</button>
        </div>
        {b.t === "p" && <AutoText ariaLabel="Paragraph" inputRef={reg(b._id)} value={b.text} onChange={textChange(i)} onKeyDown={textKeys(i)} placeholder={i === 0 ? "Write the article… (type / to choose a block)" : "Type / to choose a block"} />}
        {b.t === "h" && <AutoText ariaLabel={"Heading " + b.level} inputRef={reg(b._id)} className={"be-h be-h" + b.level} value={b.text} onChange={v => set(i, {text: v} as Partial<Block>)} onKeyDown={textKeys(i)} placeholder="Heading" />}
        {b.t === "quote" && <><AutoText ariaLabel="Quote" inputRef={reg(b._id)} className="be-quote-text" value={b.text} onChange={v => set(i, {text: v} as Partial<Block>)} onKeyDown={textKeys(i)} placeholder="Quote" />
          <input className="be-small" aria-label="Quote source" placeholder="Source (optional), e.g. Ministry of Energy and Mineral Resources" value={b.cite || ""} onChange={e => set(i, {cite: e.target.value || undefined} as Partial<Block>)} /></>}
        {b.t === "list" && <div className={"be-list" + (b.ordered ? " is-ordered" : "")}>{b.items.map((it, k) => <div className="be-li" key={k}><span aria-hidden="true">{b.ordered ? k + 1 + "." : "•"}</span>
          <AutoText ariaLabel={"List item " + (k + 1)} inputRef={reg(b._id + ":" + k)} value={it} onChange={v => set(i, {items: b.items.map((x, j) => j === k ? v : x)} as Partial<Block>)} onKeyDown={listKeys(i, k)} placeholder="List item" /></div>)}</div>}
        {b.t === "image" && <div className="be-image">
          {b.url ? <img src={b.url} alt={b.alt || ""} /> : <div className="be-drop"><span>{busy === b._id ? "Uploading…" : "Add an image"}</span>
            <label className="be-upload">Upload image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy === b._id} onChange={e => { const f = e.target.files?.[0]; if (f) void doUpload(i, f); e.target.value = ""; }} /></label></div>}
          <div className="be-fields">
            <label>Image URL<input value={b.url} placeholder="/api/public/media/… or https://…" onChange={e => set(i, {url: e.target.value.trim()} as Partial<Block>)} /></label>
            <label>Alt text (describe the image)<input value={b.alt} onChange={e => set(i, {alt: e.target.value} as Partial<Block>)} /></label>
            <label>Caption (optional)<input value={b.caption || ""} onChange={e => set(i, {caption: e.target.value || undefined} as Partial<Block>)} /></label>
            {b.url && <label className="be-upload be-upload-ghost">Replace image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) void doUpload(i, f); e.target.value = ""; }} /></label>}
          </div></div>}
        {b.t === "button" && <div className="be-fields be-row">
          <label>Button text<input ref={reg(b._id)} value={b.text} placeholder="e.g. Reserve a booth" onChange={e => set(i, {text: e.target.value} as Partial<Block>)} /></label>
          <label>Link<input value={b.url} placeholder="/floorplan or https://…" onChange={e => set(i, {url: e.target.value.trim()} as Partial<Block>)} /></label></div>}
        {b.t === "divider" && <hr />}
        {menu?.at === i && menu.replace && <Menu onPick={t => insert(i, t.make(), true)} />}
        <Inserter at={i + 1} />
      </div>)}
      {value.length > 0 && <button type="button" className="be-add" onClick={() => setMenu(menu?.at === value.length && !menu.replace ? null : {at: value.length})}>+ Add block</button>}
      {menu?.at === value.length && !menu.replace && value.length > 0 && <Menu onPick={t => insert(value.length, t.make())} />}
    </div>}
    <p className="micro be-help">Enter = new paragraph · Shift+Enter = line break · “/” = block menu · start a paragraph with “## ”, “- ”, “1. ” or “&gt; ” to convert it · Ctrl+B / Ctrl+I.</p>
  </div>;
}
