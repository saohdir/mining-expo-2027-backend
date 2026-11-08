# IMDX 2027 — PRD v1.4 implementation checkpoint

Use this file to resume work in a new Claude Code session. Requirement-level status: `docs/PRD_TRACKING_MATRIX.md`.

## Merge order (latest)
`main` ← #11 `feat/prd14-completion` ← #13 `feat/customer-password-auth` (CR-AUTH-01) ← #15 `feat/cms-page-builder-v2` ← #16 `feat/public-conference-pages` ← #17 `feat/prd14-p1-p2` (P1/P2 extensions, all flags off — `docs/P1_P2_EXTENSIONS.md`) ← `feat/prd14-p0-remaining` (AT-077, FR-125 taxes/fees if configured, FR-150 retention engine).
#14 is superseded by #15 (same feature, rebased). Frontend: saohdir/mining-expo-2027-demo#1. Last full run on `feat/prd14-p0-remaining`: E2E 109/109, unit 84/84 (on `feat/prd14-p1-p2`: 106/106, 82/82). Earlier on #16: E2E 93/93 (API + Playwright incl. static site via local proxy), unit 70/70.

## Branches & PRs (backend `saohdir/mining-expo-2027-backend`)
| PR | Branch | Content | State |
| --- | --- | --- | --- |
| #9 | `fix/s0-worker-isolation-uat-baseline` | worker isolation, read-only VPS preflight, lockfile | open |
| #10 | `fix/s1-finance-verification-guards` | overpayment / AT-068 guards, E2E harness | open |
| #11 (draft) | `feat/prd14-completion` | #9 + #10 + slices F, G, E, B/C (one commit each) | open — **merge this one** (supersedes #9/#10) |

## Slices done (commit on `feat/prd14-completion`)
| Slice | Commit | Migration (apply in order after `20261108090000_floorplan_holds`) |
| --- | --- | --- |
| F finance controls | 43123e6 | `20261109010000_finance_controls` |
| G admission controls | b82ba8d | `20261109020000_admission_controls` |
| E floorplan editor/remap/viewer | d456c2e | `20261109030000_floorplan_editor` |
| B/C account security, conference access | 00f76cf | `20261109040000_account_security` |
| H/I/A CMS admin, exports, leads, content | 74ae02c | `20261109050000_cms_admin` |
| Technical completion (exports, KPI, SVG, directory, waitlist…) | 41e…/see log | `20261109060000_engagement` |
| Governance (OTP switches, receipts, revisions, data requests, assets) | see log | `20261109070000_governance` |
| CR-AUTH-01 / page builder | see PR #13/#15 | `20261110010000_customer_password_auth`, `20261110020000_page_builder` |
| P1/P2 extensions | branch `feat/prd14-p1-p2` | `20261110030000_p1_p2_extensions` |
| Remaining P0 (FR-125/150) | branch `feat/prd14-p0-remaining` | `20261111010000_p0_remaining` |

All SQL is additive. Replay of all SQL on a `db push` of the pre-PR#3 schema (40f2ce8) gives **zero drift** against `prisma/schema.prisma` (`prisma migrate diff`).

## How to test
```bash
npm install --no-audit --no-fund && npx prisma generate
npm test && npm run typecheck
# API + browser E2E on a disposable PostgreSQL (recreates the DB named E2E_DB):
E2E_PG="-h localhost -p 5432 -U postgres" E2E_DATABASE_URL=postgresql://postgres:pw@localhost:5432/imdx_e2e bash scripts/e2e-local.sh
```
Last run: unit 68/68, E2E 77/77 (API + Playwright, worker running), `next build` OK. Frontend PR saohdir/mining-expo-2027-demo#1 verified with Playwright behind a local proxy.

## New env / ops settings
`FINANCE_APPROVAL_THRESHOLD_MINOR` (maker-checker, unset = off, D-11), `PRIVATE_FILE_DIR` + compose volume `private_data` (encrypted proofs),
`OTP_IP_LIMIT_PER_HOUR` (60), `OTP_DESTINATION_LIMIT_PER_HOUR` (5), `CONFERENCE_ACCESS_ON_DP` (false). Nginx routes `/floorplan` to the app.
P1/P2 (all optional, default off): `ENABLE_EXHIBITOR_STAFF`, `EXHIBITOR_STAFF_LIMIT`, `ENABLE_GROUP_ENROLLMENT`, `ENABLE_BULK_TOOLS`, `ENABLE_FEE_ESTIMATOR`, `CRM_WEBHOOK_URL`/`CRM_WEBHOOK_SECRET`/`CRM_SYNC_ENTITIES`, `ENABLE_MESSAGING_AUTOMATION` + `WHATSAPP_*`, `ACTIVE_EVENT_CODE`, `CONTENT_APPROVAL_REQUIRED`.
After deploying Slice G, Operations must create gates and assign CHECKIN_STAFF in `/admin/check-in/settings`.

## Remaining backlog
All remaining P0 gaps need owner input or devices: EN/ID copy & locale routes (FR-001/011, D-12), exhibition category wording (FR-004), partner logos & downloads (FR-005/009), legal text (FR-012), scanner device tests (FR-089). Tax/fee rates (FR-125, D-01) and retention periods (FR-150, D-13) are now entered in CMS (Invoice Taxes & Fees, Data Retention) once approved.
P1/P2: FR-032/041/059/113/154/156/157/158/159 are built behind flags (default off) — switching on needs PO approval; still open: FR-017 packages (D-02), FR-059 discounts, FR-154 scheduled mailouts/ID reconciliation, FR-158 live provider (D-05) and SMS (D-04).
Then: apply migrations on UAT (backup → preflight → SQL in order), set canonical/sitemap domain at go-live, UAT sign-off.

## Blockers needing the owner
UAT DB state (run `scripts/uat-preflight-readonly.sh`), D-01 bank/tax, D-02 prices/DP, D-03 refund policy, D-04 SMS provider, D-09 re-entry default, D-10 proof retention, D-11 maker-checker threshold, D-12 legal/content, D-13 retention.
