# UAT sample data — what is a placeholder and how to replace it

Loaded with `scripts/seed-uat-sample-data.ts --confirm` (safe to re-run; it never overwrites fields an editor already filled in).
Everything is labelled "sample"/"示例". Remove the sample content with `--remove`.

| Placeholder | Sample value | Replace with real data in |
| --- | --- | --- |
| Bank account (invoices) | `BANK CONTOH (DUMMY UAT)` / `IMDX UAT - JANGAN TRANSFER` / `0000000000` | `.env.uat` `APPROVED_BANK_NAME`, `APPROVED_BANK_ACCOUNT_NAME`, `APPROVED_BANK_ACCOUNT_NUMBER`, then restart app + worker |
| Conference prices / capacity / time | Green Mining Conference IDR 2,500,000 · 200 seats · 26 May 13:00; Coal & Energy IDR 1,500,000 · 150 · 27 May 09:30; Networking Reception free · 300 · 27 May 18:30 | CMS → Events & Programmes |
| Booth floorplan | published "Hall layout (SAMPLE…)" with 60 units in halls A/B/C (9, 18, 36, 72 m²) | CMS → Floorplans (upload the real plan as a draft, publish it — it replaces the sample) |
| Booth fee estimator | Standard 3.5 M/m², Corner 3.85 M/m², Premium 4.25 M/m², Raw space 3.0 M/m² + two shell packages | CMS → Fee Estimator |
| Group discount | 5 % from 5 delegates, 10 % from 10 | CMS → Invoice Taxes & Fees (`groupDiscounts`) |
| Sponsorship packages | Platinum / Gold / Silver cards on /partners/ (EN + 中文), "price on request" | CMS → Pages & layout → partners → "Sponsorship packages (sample)" block |
| Partner logos | 6 placeholder logos `/assets/samples/partner-N.svg` | CMS → Website Content → Partners (upload logo via Assets, set rights status) |
| Downloads | Exhibitor Manual, Event Brochure, Sponsorship Packages — sample PDFs in `/assets/samples/` | CMS → Website Content → Downloads |
| News | 3 sample posts (EN + 中文) | CMS → Website Content → News |
| SMS | `SMS_PROVIDER=mailpit`: SMS codes arrive in Mailpit as `<number>@sms.uat.invalid` | `.env.uat` `SMS_PROVIDER=twilio` + `TWILIO_*` |
| WhatsApp | `WHATSAPP_PROVIDER=mailpit`: template messages arrive in Mailpit as `<number>@whatsapp.uat.invalid` | `.env.uat` `WHATSAPP_PROVIDER=meta` + `WHATSAPP_*` |
| Sample participants | 20 accounts `sample01…20@sample.imdx.invalid`: 12 visitors (6 checked in on 26 May), 8 conference delegates (paid / unpaid / free), 5 exhibitor requests (new indoor, custom size, outdoor, offered, confirmed + paid) with 7 invoices | They feed CMS lists, finance and reports; remove with `--remove` before go-live |
| Legal texts | privacy + terms v1.0 (EN + 中文), prepared drafts | CMS → Pages & layout → privacy / terms (after legal review) |

Customer flows enabled on UAT by this setup: visitor registration (QR pass), conference booking (paid → manual invoice with the dummy
bank account; free reception → organizer confirmation), booth request on the floorplan (→ quotation → invoice), exhibitor
representatives, group delegates, fee estimate. Money must never be transferred to the dummy account — the invoice PDF and the
footer show "UAT / NOT VALID FOR REAL PAYMENT".

## Registration forms (Product Owner request, 9 Nov 2026)
- **Exhibition visitor** and **conference delegate**: salutation (Bapak/Ibu), full name, job title, company, e-mail from sign-up and a
  WhatsApp number verified with a one-time code sent by SMS or WhatsApp. One account = one person. The server refuses registration
  until all are present (`PROFILE_INCOMPLETE`).
- **Exhibitor**: company name, PIC name, PIC WhatsApp (verified by code), products to display, indoor/outdoor, optional custom size
  (when no displayed booth fits) — then preferred booths, filtered to indoor or outdoor units (outdoor = hall/zone "Outdoor").
- Reports: registrations export adds Salutation, Job title, WhatsApp; booth export adds PIC WhatsApp, Products, Indoor/Outdoor, Custom size.

## Prospect report for the next edition (Product Owner request, 9 Nov 2026)
CMS → Insights → **Participant Prospects** (`/admin/prospects`; Super Admin, Sales, Operations): one row per person who registered
as exhibition visitor, conference delegate or exhibitor, with salutation, name, job title, company, e-mail, verified WhatsApp,
country, programmes, exhibitor products/location, attendance (checked in or not) and registration date. Filters: type, programme,
attendance, contact permission, search. Summary tiles and charts (by role, top companies, top job titles). **Export Excel** is audited
(`PROSPECTS_EXPORTED`).

Everyone who registered appears in the report and export (owner decision, 9 Nov 2026: no separate "future events" checkbox).
The group delegate registration ("Register a group of delegates") was removed from the customer portal and is switched off
(`ENABLE_GROUP_ENROLLMENT=false`).
