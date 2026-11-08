# IMDX 2027 — P1/P2 extensions (PRD v1.4 §6)

Branch `feat/prd14-p1-p2` (stacked on `feat/public-conference-pages`). Every feature is **off by default** and changes nothing on UAT
until its flag/config is set. PRD marks these P1/P2 "subject to approval": switching them on is a Product Owner decision.

Migration: `prisma/migrations/20261110030000_p1_p2_extensions/migration.sql` — additive only (`Conference.zoneCode`, `Enrollment.groupId`,
new table `Invitation`). Replay on the 40f2ce8 base + all SQL → zero drift (`prisma migrate diff`).

| FR | What | Switch / config | Evidence |
| --- | --- | --- | --- |
| FR-157 (P1) | Per-session attendance. A programme may get its own **session zone** (e.g. `CONF_GREEN`); confirmed delegates get a pass for exactly that zone, admitted only by gates serving it. Attendance report adds `bySession` (unique people). Zone unique per event; locked once passes exist. | CMS → Events & Programmes → "Session access zone"; create a gate with that zone | `tests/e2e/session-attendance.e2e.mjs` |
| FR-156 (P1) | Exhibitor booth representatives. Owner of a **CONFIRMED** booth invites colleagues by email (limit per booth); each accepts with their **own account** (invited email only) and gets an individual expo pass. Removal or booking cancellation (invoice cancel with "cancel booking") revokes the pass. | `ENABLE_EXHIBITOR_STAFF=true`, `EXHIBITOR_STAFF_LIMIT` (default 5) | `tests/e2e/invitations.e2e.mjs` |
| FR-059 (P1) | Group delegate registration. Coordinator invites 2–25 delegates for one programme; seats are checked when the coordinator submits and taken (serializable) when each delegate accepts; Operations confirms all waiting delegates of a group in one audited step after Finance verified the manual invoice; each delegate gets their own pass. Group discounts are **not** implemented (need approval) — Finance uses the normal manual invoice. | `ENABLE_GROUP_ENROLLMENT=true` (+ `ENABLE_REGISTRATION=true`); CMS → Groups & Representatives | `tests/e2e/invitations.e2e.mjs` |
| FR-154 (P1) | CSV pre-registration (dry run first; max 500 rows; dedupe against registered/invited) → invitation email → person creates/signs in to their own account → expo pass. **No account or pass is created without the person acting.** A6 name badges (PDF) for active pass holders — identity only, no QR/pass code. Scheduled mailouts and scanned-ID reconciliation are not built (PRD: explicit approval). | `ENABLE_BULK_TOOLS=true`; CMS → Pre-registration & Badges | `tests/e2e/bulk-tools.e2e.mjs`, `tests/preregistration.test.ts` |
| FR-113 (P2) | Import draft booth units from SVG element IDs (`<rect id="booth-A12" data-category data-hall>`), scaled from the viewBox; metres from drawing scale. Dry run, draft-only, rowVersion, unsafe SVG rejected, non-rect/transformed shapes reported. PDF conversion and auto space-splitting not built. | Floorplan editor → "Import booths from SVG element IDs" | `tests/e2e/floorplan-svg-import.e2e.mjs`, `tests/floorplan-svg-import.test.ts` |
| FR-032 (P2) | CRM sync: signed JSON webhook per lead (optionally booth request / enrollment) through the outbox (idempotency key, retries/backoff). https only. | `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET` (≥32 chars), `CRM_SYNC_ENTITIES` (default `LEAD`) | `tests/e2e/crm-sync.e2e.mjs`, `tests/crm-sync.test.ts` |
| FR-159 (P2) | Booth fee **estimate** from an approved tariff table (per m², 0.5 m² rounding, category minimum, smallest fitting package). Read-only; shown next to the booth request form with a "not a quotation" disclaimer. | `ENABLE_FEE_ESTIMATOR=true` + tariffs saved by Super Admin (CMS → Fee Estimator, approver + date required) | `tests/e2e/fee-estimator.e2e.mjs` |
| FR-158 (P2) | WhatsApp Business Cloud API **template** copy of customer emails, only for customers who chose WhatsApp updates **and** verified their phone; consent re-checked at send time; separate outbox job. SMS automation still waits for D-04. | `ENABLE_MESSAGING_AUTOMATION=true`, `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME` (approved template with 3 body params: name, subject, link), optional `WHATSAPP_TEMPLATE_LANG` | `tests/messaging.test.ts` (provider mocked — needs a real sandbox test before go-live, D-05) |
| FR-041 (P2) | Event editions: `ACTIVE_EVENT_CODE` selects the default edition (no code/content rewrite). Super Admin creates a new unpublished edition copying setup only (categories, gates without staff, admission policies). Opt-in four-eyes content approval: the last editor of a page draft cannot publish it. | `ACTIVE_EVENT_CODE`, `CONTENT_APPROVAL_REQUIRED=true`; `POST /api/admin/events` | `tests/e2e/multi-event.e2e.mjs` |

## Invitations (shared by FR-156/059/154)
- Token: 32 random bytes, only the SHA-256 hash stored, single use, 7-day expiry; link `/account/invitation?token=…` (token removed from the
  address bar immediately and kept in this tab's session storage across sign-in).
- Accepting requires the signed-in account email to equal the invited email (forwarded links fail) and a completed profile.
- Every create/accept/remove/revoke is audited; organizer revoke: `POST /api/admin/invitations/{id}/revoke`.
- Emails are sent synchronously through the configured SMTP (Mailpit on UAT); if sending fails the invitation is revoked and the API returns 502.

## Not changed
No payment gateway, no automatic booking/pricing, no public registration opening, no Gmail SMTP. RBAC: Super Admin/Operations manage
groups, bulk tools and editions; Sales/Finance read; customers only act on their own booking/group.
