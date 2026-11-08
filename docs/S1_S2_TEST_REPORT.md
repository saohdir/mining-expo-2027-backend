# IMDX 2027 — S1 CMS regression & S2 business-flow validation (8 Nov 2026)

Environment: **local disposable** PostgreSQL 16 + `next start` (production build) + SMTP sink.
The DB mirrors UAT history: `db push` of the pre-PR#3 schema (40f2ce8), then SQL #3 and #4.
Feature flags were enabled **only in this local environment** to exercise flows. UAT was not modified.

Reproduce: `bash scripts/e2e-local.sh` (see header for `E2E_PG`, `E2E_DATABASE_URL`). CI job `e2e` runs the API suites.

## Results — 25/25 pass (24 API + 1 browser)

| Area | Scenario | Result |
| --- | --- | --- |
| Auth/RBAC | 7 roles sign in; Super-Admin-only event publication | PASS |
| Floorplan | draft → 4 units → stale rowVersion 409 → reload → preflight → publish (Sales 403) → public view | PASS |
| Floorplan | PNG upload + media served; corrupt PNG → 400; SVG → 415; duplicate unit code refused; clone copies units; Sales clone 403 | PASS (after fix B-03) |
| Floorplan | replacement publish with open bookings → 409 `REMAP_REQUIRED`, live plan untouched | PASS |
| Floorplan UI (browser) | login → create draft → canvas auto-opens → 3× Add booth → drag → Save 3 booth units (PUT 200) → reload persists; desktop 1440 + mobile 390; no page errors | PASS |
| Customer | OTP sign-up (email), profile, booth preference does **not** reserve (unit stays AVAILABLE), duplicate units 400, anonymous 401 | PASS |
| Quotation | Finance cannot quote; revisions rev1/rev2; offer does not lock units; cannot skip acceptance | PASS |
| Acceptance | stale revision 409; other customer cannot accept; latest accepted; expired quotation 409 | PASS |
| Holds | Sales 403; 169h → 400; one active hold per request/unit (409); unit RESERVED; release → AVAILABLE | PASS |
| Invoice | must equal accepted quote (409); Ops cannot draft; Sales cannot issue; Finance issues; send; own PDF 200; other customer's PDF 403/404 | PASS |
| Payment | Sales/Ops verify 403; DP → partial; duplicate ref 409; overpayment 409; full → PAID; **paid ≠ auto-assigned** | PASS (after fix B-01) |
| AT-068 | same bank reference on another invoice 409 (case/space-insensitive); concurrent duplicate → exactly one credited | PASS (after fix B-02) |
| Assignment | before payment 409; on DP only 409 (flag off); Finance 403; Ops assigns; repeat 409; units OCCUPIED; occupied unit cannot be requested | PASS |
| Consistency | customer sees CONFIRMED; audit has records; Sales audit 403; dashboard 200 | PASS |
| Dashboard/pages | 9 CMS pages × 7 roles: no 5xx | PASS |
| Registrations | visitor auto-confirmed + pass; duplicate 409; unpublished conference refused; Sales review 403; Viewer list 403; Ops review audited | PASS |
| Notifications | 25 items; Finance cannot mark Ops items; one bulk PATCH marks all | PASS |
| Reports | Sales/Viewer aggregate 200; Check-in 403; Finance XLSX+PDF; Viewer/Content export 403 | PASS |
| Search | id-prefix finds registration; Check-in staff gets 0 results | PASS |
| Programmes | Ops create draft; Content Editor 403 | PASS |
| QR check-in | Sales 403; NOT_YET_VALID before event; INVALID token; 2 concurrent scanners → exactly 1 admission; repeat → ALREADY_CHECKED_IN | PASS |

## Bugs fixed

| ID | Severity | Bug | Root cause | Fix |
| --- | --- | --- | --- | --- |
| B-01 | High | Finance could verify more than the outstanding balance (99M on a 15M remainder) → invoice PAID with silent excess | no outstanding check in `verify-transfer` | 409 `AMOUNT_EXCEEDS_OUTSTANDING` (fail-closed until refund policy D-03) |
| B-02 | High (AT-068) | Same bank reference could be credited to a different invoice (double credit) | duplicate check scoped to one invoice | check across all invoices; serialization conflicts → 409 instead of 500 |
| B-03 | Low | Corrupt image passing header parse → 500 | 2nd `sharp` decode outside try | decode failure → 400 `INVALID_IMAGE` |

## Observations / backlog (not changed)

- P1: serializable transactions (holds, assign) can return "refresh and retry" 409 under concurrent unrelated activity (seen when suites ran in parallel). Add bounded retry like registrations.
- P1: publish panel shows "Publication blocked until reconciled" with all counts 0 on an unsaved/empty draft — misleading copy.
- P1: booths are very small on mobile canvas (no zoom); mobile drag not separately asserted.
- P0-F (known): no server-side gate assignment per check-in staff.
- Not verified: UAT DB/migrations (S0-01), real email delivery, real devices for scanner, visual parity with DESIGN reference.
