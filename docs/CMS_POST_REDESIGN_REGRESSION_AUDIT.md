# CMS post-redesign regression audit — PRD v1.4

Scope: restore functionality behind the new admin design without changing bank transfer policy, floorplan publication guards, active booth assignments, or existing migration history.

## Repaired regressions

1. **Floorplan editor does not open** — initial floorplan list did not select a version automatically; loading a plan used `Promise.all` with the publication preflight. If publication/preflight failed (e.g., missing pending `BoothHold` table on VPS), the draft canvas was not shown. New behavior opens most recent draft (or latest published edition for read-only use), loads geometry separately, and shows a publication warning without disabling editing. Publish remains strictly disabled unless approved preflight succeeds.
2. **No straightforward way to create booths** — floorplan now has `+ Add booth unit`, pointer drawing mode, distinct nonoverlapping default placements, editable dimensions and server-side Save. Saves use the existing rowVersion optimistic concurrency guard and staff RBAC. Clearing available units from a draft is supported; publish still requires non-empty floorplan.
3. **CMS operational finance/settings sections unreachable** — redesign hid the old sidebar, but the finance and event settings workflows still lived in the old workspace. Restore visible, role-filtered workspace tabs, and make the `section=` URL drive the tab. Existing finance links now land on the appropriate finance subsections. Failures in authorized module requests are shown rather than silently becoming empty tables.
4. **Registration review button lost** — registration registry now exposes Operations/Super Admin review form wired to the existing audited `/review` backend. Confirmation is allowed only for conference bookings when their existing fee and Finance-verified payment policy permits it. Exhibitors and visitors are not confirmed by this generic action.
5. **Global search to record mismatch** — registration server-side query now supports enrollment ID prefix; global booth and invoice search navigate directly to a matching booking or invoice (not just the top 100 generic results).
6. **Role-navigation inconsistency** — Payments nav now includes Sales read access (matching the API), removes Operations which has no payments GET permission; unimplemented Staff Settings link is removed. Role privileges on write APIs are unchanged.

## QA / UAT

- Run GitHub Actions test suite, `tsc`, and Next.js build after review.
- At `/admin/floorplans` as SUPER_ADMIN/OPERATIONS: newly created draft opens editable blank canvas, create three units by button without stacking, edit code/area/size, draw on blank region, drag, save, refresh, verify persistence. Delete final *available* unit and save an empty draft. Test JPG/PNG/WebP background upload and version clone.
- Verify SALES/FINANCE see floorplan in read-only mode and cannot create/modify it.
- Verify publication controls remain disabled until full preflight succeeds, have positive owner-approved reason, and there are no unresolved bookings/holds/assignments. If preflight fails, confirm editing still works and no publish is possible.
- At `/admin/workspace?section=finance`, create test draft invoice and test issue/send only when existing FINANCE/SUPER_ADMIN policy permits; do not send live payments. Check `/admin/workspace?section=settings` as SUPER_ADMIN.
- At `/admin/registrations` as OPERATIONS: review test conference enrollment in paid or free eligible state, reject controlled test record with audit reason; as FINANCE/SALES review is read-only. Confirm global search by registration reference.
- Global search for booking/invoice must open the exact requested record; no PII shown outside authorized roles.

## Important VPS prerequisite / known limitations

The existing UAT database may still be missing migrations from PR #3 and #4: `prisma/migrations/20261108072000_booth_offers/migration.sql` and `prisma/migrations/20261108090000_floorplan_holds/migration.sql`. **Do not run them blindly or assume merging code applied them.** Check `docs/BOOTH_OFFER_MIGRATION.md` and `docs/FLOORPLAN_ROLLBACK_HOLDS.md`, take and verify PostgreSQL backup, apply in order only if needed, and reconcile unique index conflicts first.

This PR includes no NEW database table or index. Integration testing on the VPS is still needed; CI alone cannot confirm live user workflows. The PRD v1.4 floorplan editor still lacks resize/rotate handles, undo/redo, approved category colors, and some keyboard tools; these are remaining feature development, not evidence that old functions are fixed.


## Follow-up CMS regression pass (PRD v1.4, post PR #7)

This pass extends the completed editor/finance/tab recovery without introducing new tables or payment policies.

1. **Reports and Sales role:** `/admin/reports` is linked for SALES, but `/api/admin/reports/attendance` previously rejected SALES. The report endpoint now permits Sales to read *aggregate-only* attendance counts; customer/pass identities are not returned. Exports remain subject to their existing role checks.
2. **Workspace false module failures:** the legacy operational workspace fetched seven endpoints for every staff role (including privileged Event policies and Finance). Unauthorized 403 responses appeared as broken modules and empty records. API calls now follow the same role policy as the backend; form action visibility matches issuer/reviewer permissions and issue/send remains Finance-controlled. A real failure of a permitted module is still surfaced.
3. **Scanner duplicate callback:** live QR camera frames could trigger concurrent `POST /api/admin/check-in/scan` calls because the existing `working` state was stale inside the camera callback. A synchronous lock holds until camera stops, allowing one result per operator-initiated scan. A 422 denial/duplicate from the server is displayed as a decision (no entry), and network vs authorization failures are differentiated. Gate and zone fields cannot be modified mid-scan.
4. **Notification inbox:** “Mark all as read” previously sent one HTTP request per message. One batch PATCH updates up to 100 IDs atomically with role-specific audience filtering, while single-ID calls remain backward compatible. Stale error messages clear after successful reload.
5. **Programme create:** after POST the programme list was sorted alphabetically and selected a different entry; the editor now chooses the newly created draft from the returned ID.
6. **Booth request operations:** after a quotation/hold action the CMS fetched only the selected request and replaced the whole list with that one record. Refresh now retains the latest 100 plus a separately resolved deep-linked/selected request, keeping the list available for staff navigation.

### Role-based UAT verification (use test accounts only)

- SALES: Overview, Reports attendance counts, PDF/XLSX export, draft invoice creation, **no Issue button**, no false Event policies/Attendance 403 banner.
- FINANCE: payment requests, invoices, ledger, Reports, no event-policy 403 banner, no registration confirmation action.
- OPERATIONS: Floorplans, Booths, conference review, scanner access, no payment issuing controls.
- SUPER_ADMIN: all permitted tasks, audit, event policy, notifications; compare old design flows after refresh and switching between sections.
- CONTENT_EDITOR / VIEWER / CHECKIN_STAFF: only the routes and records permitted by the real backend; do not interpret hidden controls as API authorization.
- Programme: create two drafts with alphabetically reversed titles; newly created draft should be selected without choosing the wrong programme. Save and refresh to confirm.
- Booths: after quote, hold, release or assignment check that the list does not collapse to one record and the selected booking remains open.
- Notifications: with 25 or more unread test alerts, mark all and verify a single PATCH request and role-appropriate read state.
- Scanner: simulate repeated camera frames for one token, verify one scan HTTP request and no duplicate admissions; test accepted, HTTP 422 INVALID, ALREADY_CHECKED_IN, HTTP 403 and offline. **Never accept a pass without a positive server decision.**

**Release gates:** GitHub tests/typecheck/build plus authenticated role/browser UAT are required; no change to schema, migrations, financial verification, QR token format or published layout data. Existing PR #3/#4 schema migrations must still be checked on VPS before deploying current `main`. The underlying PRD v1.4 gate-assignment enforcement and complete scanner E2E load testing remain separate launch blockers.
