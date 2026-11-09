"use client";
/** Shared list building blocks for CMS collections (Directus-style): URL-backed filters, sortable headers, pager, filter chips,
 * saved filters and column choice (per browser), bulk-selection bar, loading/empty/error states. Presentation only. */
import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

/** Filters live in the URL so a view can be bookmarked, shared with a colleague and restored with Back. */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const values = useMemo(() => Object.fromEntries(keys.map(k => [k, params.get(k) || ""])) as Record<K, string>, [params, keys]);
  const set = useCallback((patch: Partial<Record<K, string>>, opts: {resetPage?: boolean} = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch) as [string, string][]) { if (v) next.set(k, v); else next.delete(k); }
    if (opts.resetPage !== false && !("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.replace(pathname + (qs ? "?" + qs : ""), {scroll: false});
  }, [params, pathname, router]);
  return {values, set, query: params.toString()};
}

/** Persist a small per-list preference in this browser only (never shared, never required). */
export function useLocalPref<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => { try { const raw = localStorage.getItem(key); if (raw) setValue(JSON.parse(raw) as T); } catch { /* storage unavailable */ } }, [key]);
  const save = useCallback((v: T) => { setValue(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }, [key]);
  return [value, save] as const;
}

export type SortState = {key: string; dir: "asc" | "desc"};
export const parseSort = (raw: string, fallback: SortState): SortState => { const [key, dir] = raw.split(":"); return key ? {key, dir: dir === "asc" ? "asc" : "desc"} : fallback; };
export function SortHeader({label, sortKey, sort, onSort, className}: {label: string; sortKey: string; sort: SortState; onSort: (s: SortState) => void; className?: string}) {
  const on = sort.key === sortKey;
  return <th className={className} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} scope="col">
    <button type="button" className="cms-sort" onClick={() => onSort({key: sortKey, dir: on && sort.dir === "desc" ? "asc" : "desc"})}>
      {label}<span aria-hidden="true">{on ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
}

export function Pager({page, pageSize, total, onPage, label = "results"}: {page: number; pageSize: number; total: number; onPage: (p: number) => void; label?: string}) {
  const pages = Math.max(1, Math.ceil(total / pageSize)), from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  return <nav className="cms-dl-pager" aria-label="Pagination">
    <span aria-live="polite">{total ? `${from}–${to} of ${total} ${label}` : `0 ${label}`}</span><span className="sp"/>
    <button type="button" className="ghost cms-small" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹ Previous</button>
    <span>Page {page} of {pages}</span>
    <button type="button" className="ghost cms-small" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">Next ›</button>
  </nav>;
}

export function FilterChips({chips}: {chips: {label: string; onRemove: () => void}[]}) {
  if (!chips.length) return null;
  return <div className="cms-dl-chips" aria-label="Active filters">{chips.map(c => <span key={c.label} className="cms-dl-chip">{c.label}
    <button type="button" aria-label={"Remove filter " + c.label} onClick={c.onRemove}>×</button></span>)}</div>;
}

/** Saved filters: name the current URL query and re-apply it later (stored in this browser). */
export function SavedFilters({listKey, query, apply}: {listKey: string; query: string; apply: (q: string) => void}) {
  const [saved, save] = useLocalPref<{name: string; q: string}[]>("imdx-cms-saved:" + listKey, []);
  const [naming, setNaming] = useState(false), [name, setName] = useState("");
  const clean = new URLSearchParams(query); clean.delete("page"); clean.delete("id"); const q = clean.toString();
  return <div className="cms-dl-saved" aria-label="Saved filters">
    {saved.length > 0 && <label className="cms-dl-inline">Saved view<select value={saved.find(s => s.q === q)?.q ?? ""} onChange={e => apply(e.target.value)}>
      <option value="">All records</option>{saved.map(s => <option key={s.name} value={s.q}>{s.name}</option>)}</select></label>}
    {naming ? <form className="cms-dl-saved" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; save([...saved.filter(s => s.name !== name.trim()), {name: name.trim().slice(0, 40), q}]); setNaming(false); setName(""); }}>
      <label className="cms-dl-inline">Name<input autoFocus value={name} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setNaming(false); }}/></label>
      <button className="cms-small">Save view</button><button type="button" className="ghost cms-small" onClick={() => setNaming(false)}>Cancel</button></form>
      : <button type="button" className="ghost cms-small" disabled={!q} title={q ? "Save the current filters" : "Set a filter first"} onClick={() => setNaming(true)}>Save view</button>}
    {saved.some(s => s.q === q) && <button type="button" className="link" onClick={() => save(saved.filter(s => s.q !== q))}>Delete view</button>}
  </div>;
}

export type Column = {key: string; label: string; required?: boolean};
/** Choose visible columns (stored per browser). Required columns cannot be hidden. */
export function useColumns(listKey: string, columns: Column[]) {
  const [hidden, setHidden] = useLocalPref<string[]>("imdx-cms-cols:" + listKey, []);
  const visible = (k: string) => !hidden.includes(k);
  const menu = <ColumnMenu columns={columns} hidden={hidden} onChange={setHidden}/>;
  return {visible, menu};
}
function ColumnMenu({columns, hidden, onChange}: {columns: Column[]; hidden: string[]; onChange: (h: string[]) => void}) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close); return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); }; }, [open]);
  return <div className="cms-dl-columns" ref={ref}>
    <button type="button" className="ghost cms-small" aria-expanded={open} onClick={() => setOpen(v => !v)}>Columns</button>
    {open && <div role="group" aria-label="Visible columns">{columns.map(c => <label key={c.key}><input type="checkbox" disabled={c.required} checked={!hidden.includes(c.key)}
      onChange={e => onChange(e.target.checked ? hidden.filter(h => h !== c.key) : [...hidden, c.key])}/>{c.label}</label>)}
      {hidden.length > 0 && <button type="button" className="link" onClick={() => onChange([])}>Show all columns</button>}</div>}
  </div>;
}

/** Row selection for bulk actions; cleared whenever the visible rows change. */
export function useSelection(ids: string[]) {
  const [sel, setSel] = useState<string[]>([]);
  const key = ids.join(",");
  useEffect(() => { setSel([]); }, [key]);
  const all = ids.length > 0 && ids.every(id => sel.includes(id));
  return {
    sel, clear: () => setSel([]), has: (id: string) => sel.includes(id),
    toggle: (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]),
    all, toggleAll: () => setSel(all ? [] : ids)
  };
}
export function BulkBar({count, onClear, children}: {count: number; onClear: () => void; children: ReactNode}) {
  if (!count) return null;
  return <div className="cms-dl-bulk" role="region" aria-label="Bulk actions"><strong>{count} selected</strong><span className="sp"/>{children}
    <button type="button" className="ghost cms-small" onClick={onClear}>Clear selection</button></div>;
}

export function SkeletonRows({cols, rows = 5}: {cols: number; rows?: number}) {
  return <>{Array.from({length: rows}, (_, i) => <tr key={i} className="cms-skeleton-row" aria-hidden="true">{Array.from({length: cols}, (_, j) => <td key={j}><span/></td>)}</tr>)}</>;
}
export function EmptyRow({cols, title, hint}: {cols: number; title: string; hint?: string}) {
  return <tr><td colSpan={cols}><div className="cms-dl-empty"><strong>{title}</strong>{hint}</div></td></tr>;
}

/** Plain CSV of what is selected/visible (client-side; the server exports remain the source for full registries). */
export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(["﻿" + [header, ...rows].map(r => r.map(cell).join(",")).join("\n")], {type: "text/csv;charset=utf-8"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
