# CR-AUTH-01 — Customer authentication: Email OTP for registration + Email & Password for sign-in

**Status:** Approved by Product Owner (change request, 2026-11-09). **PRD addendum to v1.4.** Previous requirement text is kept for history below.

## 1. Why (root cause of the change)
PRD v1.4 specified passwordless sign-in: every login required an Email/SMS OTP (FR-068, FR-115, AT-057/059/061, NFR-18/23). In practice this makes every sign-in depend on email delivery; peaks (many customers signing in at once, e.g. before the event) would hit provider limits, delays and spam filtering, and users found repeated codes inconvenient.

## 2. Decision
| Before (PRD v1.4) | After (CR-AUTH-01) |
| --- | --- |
| OTP on every sign-in (email or SMS) | OTP **only** to verify the email during registration |
| No password | Customer creates a password after email verification; sign-in = email + password |
| Account recovery = new OTP | Forgot password → single-use, short-lived email link → new password |
| — | Accounts created before this change (OTP-only) set up a password once via an emailed link |

Admin CMS authentication is unchanged (separate mechanism).

## 3. Affected requirements (old text retained, new acceptance applies)
| ID | Original (v1.4) | Amended acceptance |
| --- | --- | --- |
| FR-068 | Register/login via EMAIL_OTP or SMS_OTP | Register: email OTP verification; sign-in: email + password; SMS OTP not used for sign-in |
| FR-115 | OTP channel selection for registration/login | OTP for registration only; hashed, single use, ≤5 min, ≤5 attempts, rate limited, CMS on/off switch |
| FR-116 | Contact change needs OTP to new target | Unchanged (still OTP to the new address + recent sign-in) |
| AT-057 | Return URL restored after OTP | Return URL restored after **password sign-in** |
| AT-059 | Email OTP login succeeds, single-use | Registration OTP single-use and never creates a session; sign-in uses password |
| AT-060 | SMS OTP login | Superseded (SMS not used for sign-in; registration SMS deferred, D-04) |
| AT-061 | OTP brute force/expiry/reuse | Same for registration OTP **plus** password brute force/credential stuffing throttling |
| NFR-18 | OTP via verified channel | Password + verified email; secure session; recovery via email link |
| NFR-23 | OTP throttling | OTP + login + reset throttling, non-enumerating messages |

New acceptance tests AT-CR1-01 … AT-CR1-12 are implemented in `tests/e2e/customer-password-auth.e2e.mjs` and `tests/e2e/ui-regression.browser.mjs`.

## 4. Implementation summary
- **API:** `POST /api/auth/register/start|resend|verify`, `POST /api/auth/password/set`, `POST /api/auth/password/forgot`, `GET /api/auth/password/token`, `POST /api/auth/login`. `/api/auth/request-otp` and `/api/auth/verify-otp` now return **410** (no OTP sign-in path remains).
- **Passwords:** scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte key) — memory-hard, OWASP-recommended alternative to Argon2id/bcrypt, no native dependency. Policy: 10–128 chars, letters + digits, must not contain the email name, not trivial. Plaintext never stored, logged or emailed.
- **Registration token:** OTP verification issues a 15-minute single-use token that can only set the password for that verified account; forged/expired/reused tokens are rejected. The account is `PENDING_VERIFICATION` and cannot sign in until the password is set.
- **Reset/setup tokens:** random 256-bit, stored as SHA-256 hash, single use, RESET 30 min / SETUP 60 min, newer link invalidates older; all sessions revoked after reset; the reset page removes the token from the address bar.
- **Sign-in protection:** identical message for unknown email / wrong password / no password; constant-work hash check; 5 failures per email in 15 min and 30 per IP → 429; LoginAttempt log; audit `CUSTOMER_SIGNED_IN` / `CUSTOMER_LOGIN_FAILED` without secrets; new session token on every sign-in; HttpOnly, SameSite=Lax, Secure in production; Origin check on auth POSTs (CSRF).
- **Flags:** `ENABLE_REGISTRATION` controls only registration; `ENABLE_CUSTOMER_LOGIN` (default on) controls sign-in/reset. Closing registration does not block existing customers (tested with a second app instance).
- **Duplicate registration:** generic response; the owner of an existing email receives an "already have an account" notice; legacy OTP-only owners receive a set-up link.
- **UI:** `/account` Sign in · Create account (details → code with countdown/resend/change email → create password with requirements/show-hide → done) · Forgot password · Check email; `/account/reset-password`.

## 5. Database impact & migration
Migration `20261110010000_customer_password_auth` (additive): `CustomerAccount.passwordHash, passwordSetAt, failedLoginCount, lockedUntil, lastLoginAt, termsVersion, termsAcceptedAt`; tables `AuthToken`, `LoginAttempt`.
- Existing customers: data untouched; `passwordHash` NULL ⇒ cannot sign in until they use **Forgot password / set up** (no default passwords, nothing emailed proactively).
- Local audit showed all existing UAT-like accounts are OTP-only (`ACTIVE`, no password). Run the read-only check on UAT before applying:
  `SELECT status, count(*) FROM "CustomerAccount" GROUP BY status;`
- Apply only after backup + preflight + approval, in order after `20261109070000_governance`.

## 6. Open decisions (documented, defaults fail safe)
| ID | Question | Current default |
| --- | --- | --- |
| CR1-D1 | "Remember me" / longer sessions | Not offered; 7-day session as before |
| CR1-D2 | Proactively email existing customers a set-up link? | No — users self-serve via "Forgot password" (owner may approve a one-time mailing) |
| CR1-D3 | Password policy strength | 10+ chars, letters + digits (NIST 800-63B aligned) |
| CR1-D4 | SMS for registration verification | Not used (email only) pending D-04 |
| CR1-D5 | Production email | Mailpit in UAT; Gmail/real SMTP is the final step |
