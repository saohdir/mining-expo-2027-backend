/** CR-LANG-01: the public site is English + Simplified Chinese ("zh"). "id" stays accepted for content created earlier.
 * Any non-English locale falls back to the English version when it has no published content of its own. */
export const LOCALES = ["en", "zh", "id"] as const;
export type Locale = typeof LOCALES[number];
export const toLocale = (v: string | null | undefined): Locale => (LOCALES as readonly string[]).includes(v || "") ? v as Locale : "en";
