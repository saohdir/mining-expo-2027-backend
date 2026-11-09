# CR-LANG-01 — Public site languages: English + Simplified Chinese

**Requested by:** Product Owner, 9 Nov 2026 ("fitur terjemahan dari Inggris ke China, bukan ke Indonesia").
**Supersedes:** the EN/ID wording of FR-001, FR-011 and NFR-09 for the public site. Customer account and CMS stay in English.

| Item | Implementation |
| --- | --- |
| Language switch | `EN / 中文` in the navigation; preference remembered; `?lang=zh|en` supported |
| URLs | Chinese pages live under `/zh/...` (nginx serves the same static file; `assets/platform.js` switches language, `html lang="zh-Hans"`, canonical `/zh/...`, internal links keep the `/zh` prefix) |
| SEO | `hreflang` en / zh-Hans / x-default on every page; sitemap lists both URLs with alternates |
| Content | CMS locale `zh` for page layouts and content items; zh falls back to English when nothing is published in zh |
| Translations | 333 designed texts + image alt texts + header/footer + page SEO translated (`scripts/i18n/zh.json`, `seo-zh.json`), applied with `scripts/apply-site-content.ts --confirm --publish`; editors refine them in Pages & layout → Language 中文 |
| Database | additive migration `20261113010000_lang_zh` (locale check allows `zh`; existing `id` rows stay valid) |

Not translated: numbers, phone numbers, e-mail addresses and person names; `aria-label` attributes on a few icon buttons
(screen readers announce them in English); customer account (/account) and CMS screens.
