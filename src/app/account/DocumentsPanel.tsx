"use client";
import {useEffect, useState} from "react";
import type {CustomerInvoice} from "./InvoicePanel";

type Pass = {passId: string; qrDataUrl: string; entitlement: string};
type Download = {title: string; url: string | null; fileType: string | null; fileSizeBytes: number | null; summary: string | null};
const size = (b: number | null) => !b ? "" : b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const safeUrl = (u: string | null) => u && (/^https:\/\//.test(u) || /^\/(?!\/)/.test(u)) ? u : null;

/** Document center: everything the customer can download, in one place. Uses existing endpoints only
 * (invoice PDF + receipt, personal QR pass, published exhibitor downloads from the CMS). */
export function DocumentsPanel({invoices, passes, exhibitor}: {invoices: CustomerInvoice[]; passes: Pass[]; exhibitor: boolean}) {
  const [downloads, setDownloads] = useState<Download[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/content?kind=DOWNLOAD&locale=en").then(r => r.ok ? r.json() : {items: []})
      .then(d => { if (live) setDownloads(d.items || []); }).catch(() => { if (live) setDownloads([]); });
    return () => { live = false; };
  }, []);
  const issued = invoices.filter(i => i.state !== "NOT_INVOICED");
  return <section aria-labelledby="docs-h">
    <h2 id="docs-h">Documents</h2>
    <p>Your invoices, receipts and passes, plus documents published by the organizer.</p>
    <h3>Your documents</h3>
    {issued.length || passes.length ? <ul className="doc-list">
      {issued.map(i => <li key={i.id}><span className="doc-icon" aria-hidden="true">PDF</span><div><strong>Invoice {i.number}</strong><span className="micro">{i.state.replaceAll("_", " ").toLowerCase()}</span></div>
        <div className="doc-actions"><a href={"/api/customer/invoices/" + i.id + "/pdf"} target="_blank" rel="noreferrer">Invoice</a>
          {i.paidMinor !== "0" && <a href={"/api/customer/invoices/" + i.id + "/receipt"} target="_blank" rel="noreferrer">Receipt</a>}</div></li>)}
      {passes.map(p => <li key={p.passId}><span className="doc-icon" aria-hidden="true">QR</span><div><strong>QR pass · {p.entitlement.replaceAll("_", " ").toLowerCase()}</strong><span className="micro">Personal, do not share</span></div>
        <div className="doc-actions"><a href={p.qrDataUrl} download={"imdx-pass-" + p.passId.slice(0, 8) + ".png"}>Download</a></div></li>)}
    </ul> : <p className="micro">No documents yet. Invoices and your QR pass appear here once they are issued.</p>}
    <h3>{exhibitor ? "Exhibitor documents" : "Event documents"}</h3>
    {!downloads ? <p className="micro" role="status">Loading documents…</p>
      : downloads.filter(d => safeUrl(d.url)).length ? <ul className="doc-list">{downloads.filter(d => safeUrl(d.url)).map((d, k) => <li key={k}>
        <span className="doc-icon" aria-hidden="true">{(d.fileType || "FILE").replace(/^.*\//, "").slice(0, 4).toUpperCase()}</span>
        <div><strong>{d.title}</strong><span className="micro">{[d.summary, size(d.fileSizeBytes)].filter(Boolean).join(" · ")}</span></div>
        <div className="doc-actions"><a href={safeUrl(d.url)!} target="_blank" rel="noreferrer">Open</a></div></li>)}</ul>
      : <p className="micro">The organizer has not published documents yet.</p>}
  </section>;
}
