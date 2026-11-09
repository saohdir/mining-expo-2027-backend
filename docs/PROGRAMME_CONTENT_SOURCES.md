# Programme content — sources, provenance and approval status

All programme copy below is in `scripts/seed-programmes.ts` (EN + 中文) and editable in CMS → Programme Pages. The seed never
overwrites existing slugs or `(sourceSystem, sourceId)`.

## Regular programmes (published — same as the cards already on /programme/)
| # | Slug | Title (EN / 中文) | Basis | Facts | Image (rights) |
| --- | --- | --- | --- | --- | --- |
| 1 | `mining-downstream-industry-green-mining` | Mining Downstream Industry & Green Mining Conference / 矿业下游产业与绿色矿山大会 | existing card copy, expanded editorially (no speakers, dates or prices added) | TBA | `/assets/conference-keynote.webp` (ORGANIZER_PROVIDED — owner-supplied, provenance not independently verified) |
| 2 | `china-indonesia-coal-energy-conference` | China–Indonesia Coal & Energy Conference / 中国—印度尼西亚煤炭与能源大会 | existing card copy | TBA | `/assets/china-indonesia-forum.webp` (same) |
| 3 | `indonesia-mining-industry-networking-reception` | Indonesia Mining Industry Networking Reception / 印度尼西亚矿业商务交流酒会 | existing card copy | TBA | `/assets/networking-reception.webp` (same) |

Chinese titles/summaries reuse the already-published 中文 strings of the site (`scripts/i18n/zh.json`); overviews/highlights are new
editorial translations (review status: reviewed).

## ICEE reference programmes (legacy — DRAFT, editorial review PENDING, sorted last)
“Legacy” = provenance/sorting only. The sources describe **2027** dates; nothing states or implies a past event.

| Order | Source ID | Source URL | Original title | Source-reported date / venue / fee (stored in `sourceFacts`, **not shown publicly**) |
| --- | --- | --- | --- | --- |
| 1 | 4 | https://www.iceeind.com/activity/info.html?id=4 | Indonesia - China Coal & Energy Conference | 26 May 2027 · JIEXPO Convention Centre and Theatre · USD 800 per person (conference fee, materials, luncheon, coffee breaks, dinner; visa excluded) |
| 2 | 3 | https://www.iceeind.com/activity/info.html?id=3 | Indonesia Clean Coal and Green Mining Conference | 27 May 2027 · JIExpo Jakarta · free admission |
| 3 | 2 | https://www.iceeind.com/activity/info.html?id=2 | Indonesia Coal Conference on Underground Mining and Downstream Processing | 27 May 2027 · JIExpo Jakarta · free admission |

The source pages were not re-fetched for this change (summaries per the Product Owner's brief); verify against the live pages during review.

### Display copy (paraphrased, not copied)
**#4 — `indonesia-china-coal-energy-conference-reference`**
- EN title: Indonesia–China Coal & Energy Conference (reference) · label CONFERENCE + “Reference programme” badge
- EN summary: Explore the policy, technology and partnerships shaping China–Indonesia coal and energy cooperation, from lower-carbon solutions to cross-border projects.
- 中文: 印度尼西亚—中国煤炭与能源大会（参考）／探讨塑造中印尼煤炭与能源合作的政策、技术与伙伴关系——从低碳解决方案到跨境项目。
- Highlights: high-level government/industry exchange; coal trade and cleaner, lower-carbon solutions (coal preparation, coal chemicals); technology, equipment and coal–new-energy integration; project matchmaking and shared cooperation experience.
- **Duplicate-title issue:** near-identical to regular #2 (MAIN FORUM). Kept as a separate *reference* page with “(reference)” in the title, no booking link and no price, until the organizer confirms whether it is the same conference. **Product Owner decision required before publishing** (options: publish as reference, merge into #2, or drop).

**#3 — `indonesia-clean-coal-green-mining-conference`**
- EN summary: A forum exploring cleaner coal operations, responsible mining and technology-led collaboration for a more sustainable industrial future.
- 中文: 印度尼西亚清洁煤炭与绿色矿山大会／探讨更清洁的煤炭生产、负责任的矿业开发，以及以技术驱动的合作，共创更可持续的产业未来。
- **Source discrepancy:** its “Highlights” are substantially identical to source ID 2 although the titles differ → treated as unverified topic fit; the page says “Detailed agenda awaits organizer confirmation” and the third highlight is marked “(topics to be confirmed)”.

**#2 — `indonesia-coal-underground-mining-downstream-processing`**
- EN summary: Discover opportunities in underground mining and coal downstream development, with discussion of policy, investment, energy solutions and industrial partnerships.
- 中文: 印度尼西亚煤炭井工开采与下游加工大会／探索井工开采与煤炭下游开发的机遇，围绕政策、投资、能源解决方案与产业合作展开交流。
- **Source discrepancy:** highlights match source ID 3 verbatim → provenance kept, uncertainty noted; no unique agenda or attendee numbers asserted.

### Images for the reference pages
`/assets/industry-04.webp`, `/assets/industry-06.webp`, `/assets/industry-01.webp` — existing site photos (owner-supplied,
ORGANIZER_PROVIDED). An earlier candidate (`where-progress-dialogue.webp`) was **rejected** because its banner reads “…Conference 2026”,
which would imply a past event. No ICEE images are used.

### 中文 review status
Reference-page translations are marked **needs review** in the CMS (editorial translations of our own paraphrase, not of source facts).

## Approval workflow
1. Product Owner reviews the three reference pages in CMS → Programme Pages (Preview ↗ works for drafts).
2. Decide the #4 duplicate question.
3. Approve (Super Admin) → Publish — or run `scripts/seed-programmes.ts --confirm --approve-legacy` on UAT after approval.
4. Confirm facts (Operations / Super Admin) only when the organizer has confirmed them; link a bookable conference only after verification.
