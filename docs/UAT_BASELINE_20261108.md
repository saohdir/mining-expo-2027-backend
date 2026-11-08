# IMDX 2027 — S0 UAT baseline (8 Nov 2026)

Stage S0 (Environment & Database Verification). **Observed** = verified in this session; **Assumed/Unverified** = needs VPS operator output from `scripts/uat-preflight-readonly.sh`.

## 1. Observed

| Item | Result | Evidence |
| --- | --- | --- |
| Backend `main` | `1039279ac438…` (merge of PR #8) | `git ls-remote origin` |
| Frontend `main` | `337e04c7429e…` | clone |
| PR #1–#8 | All merged into `main` (merge SHAs 7f163a6, 40f2ce8, 3f1bd25, 777aeae, 3570f24, f46575f, eca1f5a, 1039279) | GitHub REST `pulls?state=all` + `git log` |
| CI on `main` | run 42460302390 success (npm test, tsc, build). No DB/browser E2E in CI | `gh run list` |
| Local re-run | `npm test` 53/53 pass, `tsc` clean, `next build` OK | this session |
| UAT HTTPS | `/`, `/api/health`, `/account`, `/admin`, `/admin/floorplans`, `/admin/workspace`, `/api/public/floorplan` → 200; Caddy → nginx/1.27.5 → Next.js | curl from session |
| Health payload | `payments=MANUAL_TRANSFER_ONLY`, `registrationEnabled=false`, `admissionEnabled=false`, capabilities `smsOtp=false` | `/api/health`, `/api/public/capabilities` |
| Deployed code version | PR #4/#5 routes exist (401/405 not 404); PR #8 client markers (`imdx:notifications-updated`, `cms-scanner-section`) present in UAT JS bundles. Strong indication UAT runs PR #8 code; exact SHA not exposed publicly | route probe + bundle grep |
| Public floorplan | `{"state":"COMING_SOON","units":[]}` — no published floorplan on UAT | `/api/public/floorplan` |
| Migration SQL #3 + #4 | Applied cleanly, in order, to a local PostgreSQL 16 DB built with `db push` from the pre-PR#3 schema (40f2ce8); resulting schema has **zero drift** vs current `schema.prisma`; partial unique indexes created | local simulation |
| `prisma migrate deploy` | **Fails on an empty DB** (`20261108072000_booth_offers` references `BoothRequest`, no baseline migration exists) | local test |

## 2. Findings

| ID | Finding | Risk | Action |
| --- | --- | --- | --- |
| S0-01 | UAT appears to run PR #8 code. If SQL #3/#4 were **not** applied, Booth offer/hold/assign, Invoice draft for booths, Dashboard KPI (`boothHold.count`) and floorplan publish preflight fail with 500 | **P0 / High** | Run preflight §5; if objects missing → backup, duplicate checks, apply SQL #3 then #4 (runbooks) with approval |
| S0-02 | Worker ran hold expiry and outbox drain in one `try`; a missing `BoothHold` table (or any expiry error) **stopped all outbox emails** every cycle | **High** | Fixed in this PR (`src/lib/worker-cycle.ts`) + regression test |
| S0-03 | No baseline Prisma migration; `npm run db:deploy` cannot build a fresh DB and must never be run on UAT (`db push` origin) | High (prod readiness) | Separate approved task: create `0_init` baseline, `migrate resolve --applied` on UAT after backup |
| S0-04 | No `package-lock.json`; CI and Dockerfile use `npm install` with `^` ranges → VPS image can differ from CI-tested deps | Medium | Commit lockfile + `npm ci` (separate PR) |
| S0-05 | Nginx resolves `app` once at start; PR #6 mitigates by restarting `web` in the deploy script only. Manual `up -d app` or container restart can still cause 502 | Medium | Optional: Docker DNS `resolver 127.0.0.11` + variable upstream (separate PR after UAT test) |
| S0-06 | No evidence of scheduled DB backups or restore drill | High (ops) | Preflight §6; add cron `pg_dump` + restore drill on separate DB |
| S0-07 | `SESSION_KEY` listed in `.env.example` but not referenced in code | Low | Clarify/remove later |

## 3. Unverified (needs VPS output)

VPS HEAD SHA, container health/restarts, logs, flags in `.env.uat`, leftover `ADMIN_SEED_*`, BoothOffer/BoothHold/index presence, duplicate rows, backups, volumes, Caddy config, deployed `nginx.conf`.

## 4. Rollback readiness

- Code: `git checkout <previous SHA>` on VPS + `bash scripts/deploy-uat.sh` is **not** possible as-is (script requires branch `main` and pulls). Rollback = revert PR on GitHub then redeploy.
- DB: SQL #3/#4 are additive. Rollback = restore the pre-migration `pg_dump` (verified by restore drill), or drop the new tables/indexes only with approval.
