import {PDFDocument, StandardFonts, rgb, type PDFFont} from "pdf-lib";

/** FR-154 badge printing: A6 portrait name badges, one per page. Badges carry identity only (no QR / pass code):
 * admission always uses the person's own QR pass, so a lost badge cannot be used to enter. */
export type Badge = {name: string; organization: string; jobTitle: string; category: string};
const A6: [number, number] = [297.64, 419.53];
const CAT_COLOR: Record<string, [number, number, number]> = {EXHIBITOR: [0.85, 0.45, 0.1], DELEGATE: [0.1, 0.35, 0.65], VISITOR: [0.2, 0.5, 0.3]};

/** Helvetica only encodes WinAnsi; replace anything else so a name never breaks the whole print run. */
export function encodable(font: PDFFont, text: string) {
  let out = "";
  for (const ch of text.normalize("NFC")) { try { font.encodeText(ch); out += ch; } catch { const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); try { font.encodeText(base); out += base; } catch { out += "?"; } } }
  return out;
}
function fit(font: PDFFont, text: string, max: number, start: number, min: number) {
  let size = start; while (size > min && font.widthOfTextAtSize(text, size) > max) size -= 1;
  let t = text; while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2) + "…";
  return {t, size};
}

export async function badgesPdf(eventTitle: string, badges: Badge[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(eventTitle + " badges"); pdf.setProducer("IMDX CMS");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold), reg = await pdf.embedFont(StandardFonts.Helvetica);
  for (const b of badges) {
    const page = pdf.addPage(A6); const [w, h] = A6, m = 22, max = w - 2 * m;
    const c = CAT_COLOR[b.category] || [0.3, 0.3, 0.3];
    page.drawRectangle({x: 0, y: h - 70, width: w, height: 70, color: rgb(0.08, 0.1, 0.12)});
    page.drawText(encodable(bold, eventTitle).slice(0, 40), {x: m, y: h - 44, size: 15, font: bold, color: rgb(1, 1, 1)});
    const name = fit(bold, encodable(bold, b.name), max, 30, 14);
    page.drawText(name.t, {x: m, y: h / 2 + 30, size: name.size, font: bold});
    if (b.jobTitle) { const j = fit(reg, encodable(reg, b.jobTitle), max, 13, 8); page.drawText(j.t, {x: m, y: h / 2, size: j.size, font: reg, color: rgb(0.25, 0.25, 0.25)}); }
    if (b.organization) { const o = fit(bold, encodable(bold, b.organization), max, 15, 9); page.drawText(o.t, {x: m, y: h / 2 - 24, size: o.size, font: bold, color: rgb(0.15, 0.15, 0.15)}); }
    page.drawRectangle({x: 0, y: 0, width: w, height: 56, color: rgb(...c)});
    page.drawText(b.category, {x: m, y: 20, size: 20, font: bold, color: rgb(1, 1, 1)});
  }
  return pdf.save();
}
