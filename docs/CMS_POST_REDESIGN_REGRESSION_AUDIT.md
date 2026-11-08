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
