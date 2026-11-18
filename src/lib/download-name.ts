/** Owner prompt 04: the saved file is named after the document's public title, never the storage key.
 * Precedence: CMS title of the published download → (no title) "IMDX 2027 document". The real extension is appended once.
 * Only characters that are invalid in Windows/macOS/Linux filenames, control characters and path separators are replaced;
 * spaces, parentheses and Unicode are kept. */
export function downloadFileName(title: string | null | undefined, ext: string): string {
  const e = ext.replace(/^\.+/, "").toLowerCase();
  let base = String(title ?? "").normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")     // invalid on common filesystems / separators
    .replace(/\s+/g, " ").trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");                      // no leading dots (hidden files) or trailing dots/spaces (Windows)
  if (e && base.toLowerCase().endsWith("." + e)) base = base.slice(0, -(e.length + 1)).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = "_" + base; // Windows reserved names
  // Keep names well within the 255-byte filesystem limit (UTF-8), cutting on a character boundary.
  const enc = new TextEncoder(); while (enc.encode(base).length > 200) base = Array.from(base).slice(0, -1).join("").trimEnd();
  return (base || "IMDX 2027 document") + (e ? "." + e : "");
}

/** Content-Disposition: attachment with an ASCII fallback plus the exact UTF-8 name (RFC 6266 / RFC 5987). */
export function attachmentHeader(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").replace(/\s+/g, " ").trim() || "download";
  const star = encodeURIComponent(name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${star}`;
}
