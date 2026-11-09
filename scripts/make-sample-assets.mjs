// Generates clearly-labelled SAMPLE assets for UAT (placeholder partner logos + sample PDF downloads) into the frontend repo.
//   node scripts/make-sample-assets.mjs ../mining-expo-2027-demo/assets/samples
import fs from "node:fs"; import path from "node:path"; import {PDFDocument, StandardFonts, rgb} from "pdf-lib";
const out = process.argv[2]; fs.mkdirSync(out, {recursive: true});
const colors = ["#102b43", "#1d587c", "#7a3b12", "#2f5d3a", "#4b3a6b", "#5a5a5a"];
const names = ["Sample Organizer", "Sample Industry Association", "Sample Mining Partner", "Sample Technology Partner", "Sample Media Partner", "Sample Supporting Partner"];
names.forEach((n, i) => fs.writeFileSync(path.join(out, `partner-${i + 1}.svg`),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" role="img" aria-label="${n} logo (sample)"><rect width="320" height="120" rx="10" fill="#fff" stroke="${colors[i]}" stroke-width="3"/><circle cx="58" cy="60" r="32" fill="${colors[i]}"/><text x="58" y="68" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text><text x="104" y="54" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="${colors[i]}">${n}</text><text x="104" y="80" font-family="Arial, sans-serif" font-size="13" fill="#666">LOGO PLACEHOLDER · SAMPLE</text></svg>\n`));
async function pdf(file, title, lines) {
  const doc = await PDFDocument.create(); const bold = await doc.embedFont(StandardFonts.HelveticaBold), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle(title + " (SAMPLE)"); const page = doc.addPage([595, 842]); let y = 780;
  page.drawRectangle({x: 0, y: 812, width: 595, height: 30, color: rgb(.76, .25, .05)}); page.drawText("SAMPLE DOCUMENT - FOR UAT TESTING ONLY - TO BE REPLACED BY THE ORGANIZER", {x: 40, y: 822, size: 10, font: bold, color: rgb(1, 1, 1)});
  page.drawText("IMDX 2027", {x: 40, y, size: 14, font: bold, color: rgb(.76, .25, .05)}); y -= 30;
  page.drawText(title, {x: 40, y, size: 22, font: bold}); y -= 40;
  for (const l of lines) { page.drawText(l, {x: 40, y, size: l.startsWith("#") ? 13 : 11, font: l.startsWith("#") ? bold : font, color: rgb(.15, .15, .15)}); y -= l.startsWith("#") ? 22 : 17; }
  fs.writeFileSync(path.join(out, file), await doc.save());
}
await pdf("exhibitor-manual-sample.pdf", "Exhibitor Manual", ["# 1. Key dates", "Build-up: 24-25 May 2027 · Show days: 26-28 May 2027 · Dismantling: 28 May 2027 evening", "# 2. Booth types", "Shell scheme (9 m2 and up) and raw space (36 m2 and up).", "# 3. Services", "Electricity, furniture, internet and cleaning can be ordered from the organizer.", "# 4. Rules", "Follow venue safety rules. All prices and dates in this sample are placeholders."]);
await pdf("event-brochure-sample.pdf", "Event Brochure", ["# Indonesia Mining & Downstream Industries Exhibition 2027", "26-28 May 2027 · JIEXPO Kemayoran, Jakarta", "# Exhibition sectors", "Mining equipment, mineral processing, metallurgy, downstream materials,", "digital automation, green mining, supporting equipment, exploration & investment.", "# Contact", "Use the contact page of the event website. Sample content."]);
await pdf("sponsorship-packages-sample.pdf", "Sponsorship Packages", ["# Platinum (sample)", "Logo on all materials, keynote slot, 72 m2 premium booth.", "# Gold (sample)", "Logo on website and signage, panel slot, 36 m2 booth.", "# Silver (sample)", "Logo on website, 18 m2 booth.", "Prices are placeholders - the organizer confirms packages and prices."]);
console.log("sample assets written to", out, fs.readdirSync(out));
