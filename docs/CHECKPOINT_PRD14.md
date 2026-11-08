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
| H/I/A CMS admin, exports, leads, content | 74ae02c | `20261109050000_cms_admin` |

All SQL is additive. Replay of all SQL on a `db push` of the pre-PR#3 schema (40f2ce8) gives **zero drift** against `prisma/schema.prisma` (`prisma migrate diff`).

## How to test
```bash
npm install --no-audit --no-fund && npx prisma generate
npm test && npm run typecheck
# API + browser E2E on a disposable PostgreSQL (recreates the DB named E2E_DB):
E2E_PG="-h localhost -p 5432 -U postgres" E2E_DATABASE_URL=postgresql://postgres:pw@localhost:5432/imdx_e2e bash scripts/e2e-local.sh
```
Last run: unit 67/67, E2E 60/60 (API + Playwright), `next build` OK. Frontend PR saohdir/mining-expo-2027-demo#1 verified with Playwright behind a local proxy.

## New env / ops settings
`FINANCE_APPROVAL_THRESHOLD_MINOR` (maker-checker, unset = off, D-11), `PRIVATE_FILE_DIR` + compose volume `private_data` (encrypted proofs),
`OTP_IP_LIMIT_PER_HOUR` (60), `OTP_DESTINATION_LIMIT_PER_HOUR` (5), `CONFERENCE_ACCESS_ON_DP` (false). Nginx routes `/floorplan` to the app.
After deploying Slice G, Operations must create gates and assign CHECKIN_STAFF in `/admin/check-in/settings`.

## Remaining backlog (next slices, in order)
1. EN/ID locale routes + per-locale SEO/sitemap (FR-001/011, NFR-04/09) — needs approved Indonesian copy (D-12).
2. KPI period presets & dashboard measure basis (FR-149); async 100k exports with signed expiring links (FR-122, NFR-26).
3. Editor free-form resize handles (FR-093), SVG upload sanitizer (FR-091), FR-110 boothNo for exhibitor directory (with P1 FR-014).
4. Browser tests for account hub/banners (FR-117/119), scanner offline/visual (FR-084/088), venue page checks (FR-004/008).
5. Hardening & UAT: apply migrations on UAT (backup → preflight → SQL in order), security review, backup/restore drill, real-device scanner test, UAT sign-off.

## Blockers needing the owner
UAT DB state (run `scripts/uat-preflight-readonly.sh`), D-01 bank/tax, D-02 prices/DP, D-03 refund policy, D-04 SMS provider, D-09 re-entry default, D-10 proof retention, D-11 maker-checker threshold, D-12 legal/content, D-13 retention.
