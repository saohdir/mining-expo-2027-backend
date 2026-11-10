# Super Admin: full access with warnings (Nov 2026)

## Why Super Admin seemed blocked

1. **Buttons disabled until a separate "Reason" field was filled.** Staff (create, role, deactivate, reset password), Floors
   (active/inactive, booked-by, split, merge), Gates & passes, Payment ledger, Estimator, Invoice taxes, Retention and CSV import
   kept their buttons greyed out until 8–10 characters were typed in a reason box elsewhere on the page.
2. **Browser prompts (`window.prompt` / `window.confirm`).** Reset password, publish, rollback, revoke, mailout approve,
   OTP switches, lead/data-request updates, gallery delete and others used native prompts. Many browsers, in-app/embedded
   views and pop-up blockers suppress them silently, so the click did nothing.
3. **Business rules applied to everyone, including Super Admin**: approving your own receipt or mailout (four-eyes),
   demoting/deactivating yourself, confirming visitor/exhibitor registrations manually, confirming an unpaid conference seat,
   moving a booth request outside the normal status order.

## What changed

- **One warning modal for every important action** (`components/Confirm.tsx`): title, *What will change*, *Impact*, the audit
  reason (pre-filled from the page's reason box if typed), an extra field when needed (new password), and a typed word for
  irreversible actions (`PURGE`, `CANCEL`). Choose **Yes, continue** or **No, cancel** (Esc, backdrop). No native prompts remain
  in the CMS.
- **Super Admin overrides** — the server accepts `override: true` only from a Super Admin and writes an `…_OVERRIDE` audit entry:

| Rule | Code | Where |
|---|---|---|
| Approve a receipt you recorded | `SAME_ACTOR` | Payments → ledger |
| Approve your own mailout | `SECOND_APPROVER_REQUIRED` | Pre-registration → mailouts |
| Demote / deactivate yourself | `SELF_LOCKOUT` | Staff & roles |
| Confirm a visitor manually | `VISITOR_POLICY` | Registrations → Review |
| Confirm an exhibitor without booth allocation | `EXHIBITOR_POLICY` | Registrations → Review |
| Confirm a conference seat without verified payment | `PAYMENT_REQUIRED` | Registrations → Review |
| Confirm without an approved conference fee | `FEE_NOT_APPROVED` | Registrations → Review |
| Set any booth request status (outside the normal order) | `INVALID_TRANSITION` | Booth requests → "Super Admin: set status" |

  When a Super Admin action is refused by one of these rules, the CMS shows the warning and, if confirmed, re-sends the same
  request with the override (`OverrideInterceptor` in `CmsShell.tsx`). Other roles keep the rules.

## What stays protected (also for Super Admin)

These protect data consistency rather than permissions; the modal or error explains what to do instead:

- At least one **active Super Admin** must remain (otherwise nobody can manage the CMS).
- **Money**: amounts above the outstanding balance, refunds above what was paid, duplicate bank references.
- **Inventory**: a booth unit cannot have two active assignments; occupied units cannot be removed.
- **Concurrent edits** (`VERSION_CONFLICT`, `CONCURRENT_*`): reload and retry.
- Only a **published** floor can be set active/inactive (a draft is not visible anyway); cancelling a booth that has an invoice
  goes through the invoice cancellation in Payments.

## Tests

`tests/e2e/superadmin-overrides.e2e.mjs` (API: overrides accepted only from Super Admin, audited) and
`tests/e2e/superadmin-modal.browser.mjs` (staff create / reset password / deactivate through the modal, Esc cancels, no
native dialogs).
