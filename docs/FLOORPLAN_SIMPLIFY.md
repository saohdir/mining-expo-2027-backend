# Floorplans: simpler publishing, live editing and deletion (Nov 2026)

| Before | Now |
|---|---|
| Publish needed: saved changes, at least one booth, an 8-character reason, a review checkbox, all imported booths placed, background alt text + rights, and — when replacing a floor with bookings — a previewed and approved remap whose booked booth codes all exist in the draft. | **Publish floor** is one click with a confirmation that says what happens. Pending changes are saved first. Nothing else is required. |
| Booths could only be changed in a draft (clone → edit → publish). | Live floors have **Edit booth layout**; saved changes are visible to customers right away. |
| Drafts and old floors could not be deleted. | **Delete draft**, **Delete floor** (inactive floors) and **Delete version** (archived). |

## What still protects bookings

- **Replacing a live floor:** bookings, holds, assignments and accepted quotations move automatically to booths with the same code. Booked booths that are missing in the draft are copied in from the old floor, so no booking loses its booth (`restoredUnits` in the response and the audit log).
- **Editing a live floor:** booked, reserved or blocked booths, and booths in an open quotation, cannot be removed. Removed booths are taken out of customers' preferences.
- **Deleting:** an active floor must be set inactive first. A floor with booking history (requests, holds or assignments) is moved to *Archived versions* instead of being destroyed, so invoices and quotations keep real booths. Archived versions with history cannot be deleted.
- **Not changed:** concurrent-edit protection (row version), roles (Operations and Super Admin), and the audit log.
- **Draft only:** CSV/SVG import and alignment stay in drafts.

API: `POST /api/admin/floorplans/{id}/publish` accepts `{rowVersion}` only (reason optional); `PUT …/units` and `PATCH …/{id}` accept live floors; new `DELETE /api/admin/floorplans/{id}` (`result: deleted | archived`). No migration.
