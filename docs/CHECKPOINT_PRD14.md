# IMDX 2027 — PRD v1.4 implementation checkpoint

Use this file to resume work in a new Claude Code session. Requirement-level status: `docs/PRD_TRACKING_MATRIX.md`.

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

All SQL is additive. Replay of all SQL on a `db push` of the pre-PR#3 schema (40f2ce8) gives **zero drift** against `prisma/schema.prisma` (`prisma migrate diff`).

## How to test
```bash
npm install --no-audit --no-fund && npx prisma generate
npm test && npm run typecheck
# API + browser E2E on a disposable PostgreSQL (recreates the DB named E2E_DB):
E2E_PG="-h localhost -p 5432 -U postgres" E2E_DATABASE_URL=postgresql://postgres:pw@localhost:5432/imdx_e2e bash scripts/e2e-local.sh
```
Last run: unit 67/67, E2E 52/52 (API + Playwright), `next build` OK.

## New env / ops settings
`FINANCE_APPROVAL_THRESHOLD_MINOR` (maker-checker, unset = off, D-11), `PRIVATE_FILE_DIR` + compose volume `private_data` (encrypted proofs),
`OTP_IP_LIMIT_PER_HOUR` (60), `OTP_DESTINATION_LIMIT_PER_HOUR` (5), `CONFERENCE_ACCESS_ON_DP` (false). Nginx routes `/floorplan` to the app.
After deploying Slice G, Operations must create gates and assign CHECKIN_STAFF in `/admin/check-in/settings`.

## Remaining backlog (next slices, in order)
1. **H/I CMS admin**: staff management (create/role/deactivate), read-only settings status page, customers list/detail (FR-120), admin corrections with reason (FR-153), internal notes (FR-148), export jobs with date basis + audit (FR-121/122/031/067), KPI period presets (FR-149).
2. **A public/content**: lead form + inbox (FR-024/036/010/027/030), content CMS for partners/downloads/news (FR-005/009/034/035/038), countdown (FR-003), SEO metadata/sitemap (FR-011), EN/ID locale (FR-001/NFR-09), privacy/terms pages (FR-012 — text BLOCKED by D-12).
3. Hardening: async 100k exports (NFR-26), security review, backup/restore drill, UAT on VPS.

## Blockers needing the owner
UAT DB state (run `scripts/uat-preflight-readonly.sh`), D-01 bank/tax, D-02 prices/DP, D-03 refund policy, D-04 SMS provider, D-09 re-entry default, D-10 proof retention, D-11 maker-checker threshold, D-12 legal/content, D-13 retention.
