/** FR-041: the event edition used when a request names none (public site, account, CMS defaults).
 * Switch editions by setting ACTIVE_EVENT_CODE (e.g. IMDX-2028) — no code or content rewrite needed. */
export const activeEventCode = () => process.env.ACTIVE_EVENT_CODE || "IMDX-2027";
