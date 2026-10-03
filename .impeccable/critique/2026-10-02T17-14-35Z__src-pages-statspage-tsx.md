---
target: src/pages/StatsPage.tsx
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:/Users/justcomex/Documents/pet/anki-qazaq/src/pages/StatsPage.tsx"
target_fingerprint: "sha256:d1a9921ab693c7f6b1a30d6f348708602657e925ce50a25f31a28d304f30d039"
target_path: /Users/justcomex/Documents/pet/anki-qazaq/src/pages/StatsPage.tsx
timestamp: 2026-10-02T17-14-35Z
slug: src-pages-statspage-tsx
---
# Critique: `src/pages/StatsPage.tsx`

Mode: Operate. Surface: the Stats page (route `/stats`). Brand world: "The Study Notebook".

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | A rejected `/api/stats` only `console.warn`s (`StatsPage.tsx:86-89`); `serverStats` stays null, the forecast row never renders, and `LevelMasteryRingsSkeleton` holds at `aria-busy="true"` indefinitely. A dead server is visually identical to a page that never loads. |
| 2 | Match System / Real World | 2 | `stats.ease.subtitle` "Anki хранит «легкость»…" (`ru.ts:413`) and `stats.config.subtitle` "…как в Anki" (`ru.ts:430`) name another product inside this one. The ease histogram shows raw `< 1.5` / `1.5–2.0` because five warm Russian bucket names exist in the table and are never rendered. |
| 3 | User Control and Freedom | 2 | The reset dialog is real, but `handleLeechReset` (:146), `handleResetAllLeeches` (:157) and `confirmImport` (:412) each end in `window.location.reload()` — losing scroll, active tab, and every in-flight fetch. No undo anywhere. |
| 4 | Consistency and Standards | 2 | Two container grammars on one page: rings on bare paper between two white cards, while activity and config sit in `--surface` cards. `styles.kpiRow` is referenced once (:525) and defined nowhere. `a:hover { text-decoration: underline }` (`global.css:537`, 0-1-1) outranks `.kpiLink { text-decoration: none }` (0-1-0), so a hovered KPI tile underlines itself. |
| 5 | Error Prevention | 3 | The strongest heuristic. `ConfirmDialog` with a typed `consequences` array, exact counts, correct Russian plurals via `pluralRu`; import restates the file's contents and warns on a username mismatch. Held off 3 only by the destructive paths having no progress feedback — `handleResetAllLeeches` reports to `console.log` (:156) and reloads. |
| 6 | Recognition Rather Than Recall | 2 | Topics are labeled, status-chipped and deep-link into study — but the Темы tab is 48 equal-weight links with no filter, no sort, no "due only". The actionable subset must be found by scanning. |
| 7 | Flexibility and Efficiency | 1 | The one shortcut that would make this page earn its keep — "study my leeches now" — is explicitly deferred in a code comment (:549-551). Deep-linking stops at `?tab=`. Every destructive action costs a full reload. No filter, search or sort anywhere. |
| 8 | Aesthetic and Minimalist Design | 2 | Density is earned and the palette is disciplined, but the 30-day chart and the 13-week heatmap read the same `reviewLog` at two granularities with no cross-reference, and `83` appears under three labels. `preserveAspectRatio="none"` on a 100×100 viewBox stretched to 1000×96px distorts the bars. |
| 9 | Error Recovery | 1 | The `serverStats` catch is console-only. The topics loading state is a literal `…` character while everything else uses `<Skeleton>`. The heatmap's `role="grid"` over 91 non-navigable cells is a contract the source knows it isn't keeping. |
| 10 | Help and Documentation | 2 | Real Russian explainers ship with every block — the ring outer/inner distinction, "Здоровый диапазон: 80–95%", the backup tooltips. But two of them explain *Anki*, and no block ends with a sentence telling the learner what to do next. |
| **Total** | | **19/40** | **Poor (12–19). Four verified defects account for nearly all of the gap.** |

All ten heuristics apply: this is an Operate surface, not a landing page. Nothing is `n/a`.

## Design Specificity Verdict

**An unrelated analytics product could use most of this page unchanged.** The inventory is product-specific — CEFR rings, an ease histogram, a topic grid, an SM-2 parameter dump — but the treatment is category-default: a 4-tile KPI band, a bar chart, a GitHub heatmap, a tab bar, a definition list. `ActivityHeatmap` is documented in the source as a "GitHub-style activity heatmap" (`StatsPage.tsx:1230`), imported with its 13-week shape intact and recolored to clay, carrying GitHub's job with it — the subtitle tells the learner the map exists so they can see «где вы выпали из ритма» (`ru.ts:496`).

Three findings, in weight order:

1. **The typographic mechanism is exactly inverted.** The north star is that Source Serif 4 appears only where the learner meets the new language. The one Kazakh string on the page — `.leechKk`, the leech row's word — sets **no `font-family` at all** (`StatsPage.module.css:762-769`), so it inherits Inter, while `h1`, every section title and every KPI numeral are serif. No `[lang]` rule exists anywhere in `global.css` to compensate. The contrast is decorative, and on the wrong side.

2. **The accent has been demoted from accent to palette.** DESIGN.md says it "has to earn every appearance." On this page terracotta became data ink: 17 chart bars, 91 heatmap cells, 5 histogram fills, the leech keyline — a generic series colour on every chart at once, and never once as emphasis, focus, or a moment. The one role that was supposed to be rationed has been spent entirely, on nothing.

3. **The one genuinely authored idea gets the least room.** The dual-ring mastery concept — outer = "opened at least once", inner = "interval ≥ 21 days", explicitly refusing to conflate *seen* with *owned*, plus a three-state ETA that admits ignorance with `…` rather than inventing a number (`LevelMasteryRings.tsx:15-27, 46-55`) — is real product thinking. It gets five 96px circles in a `repeat(5, 1fr)` row, marooned across ~950px, floating on bare paper with no card around it.

Missed opportunities: the five CEFR levels are the product's spine and render as five identical rings, though the page already knows each deck's weight (A1 712 words, B1 1 559). The ease histogram authored warm Russian words — `Каверзные / Сложные / Средние / Уверенные / Лёгкие` (`ru.ts:414-418`), loaded into `Bucket.labelKey` (`EaseHistogram.tsx:28-32`) — and then renders `b.range` instead (:62), so the strings are dead. And "Anki" appears twice in user-visible copy on a product positioned as a real SM-2 implementation rather than Anki.

**Deterministic scan.** `impeccable detect --json src/pages/StatsPage.tsx` → exit 0, zero findings. That is not evidence of a clean markup surface: a control experiment proved the scanner reads `.tsx` and parses inline style props (it fired on an inline `borderRadius`), but emits **no JSX or accessibility rules at all** — an identical control file fired 2 findings as `.css` and 1 as `.tsx`. Treat markup and a11y as unscanned, not clean. The stylesheet scope returned 7 advisories: `design-system-color` ×5 (`:642` `:660` `:661` `:699` `:724`) and `design-system-radius` ×2 (`:716` `4px`, `:918` `3px`). Both radius hits are accurate — DESIGN.md and `global.css:191-195` define the scale as exactly 6/8/12/16/999px. The colour hits re-detect a known open item already logged at DESIGN.md:1332-1339. The project scan returned 4 `overused-font` failures, all in `src/styles/fonts.css` and outside this target, where one `@font-face` family split by `unicode-range` is counted four times.

**Visual overlays.** Injection succeeded client-side — 10 overlay nodes mounted, including `#impeccable-live-bar`, and the bundle logged `Live variant mode ready`. The SSE channel back to the CLI was blocked by the app's own CSP (`connect-src 'self' ws: wss:`), so `connectedClients` stayed 0 and no element picks could round-trip. **No user-visible overlay exists and none is possible here**: everything ran headless under Playwright, so there is no human-facing tab in this environment. The only artefact is a screenshot of the mounted overlay bar.

## Overall Impression

The page is competently built and quietly undermined by one visible break and one values break. The forecast row — the block that answers "what's coming?" — renders as three stacked full-width bands because its class is a dead reference; on mobile it spends ~250px on three zeros while the KPI band directly above it is a tight 2×2. And the page ships a streak counter and a personal-best counter, which the product's own principles forbid by name, in the second-most-visible block. The biggest single opportunity: the page does not know what it is for. It is currently "everything the app knows, in four bands", which is why one number appears three times, two charts read the same array, and the tab bar sits 1,200px down.

## What's Working

1. **The dual-ring mastery concept is the best thinking on the page.** It refuses to conflate "opened once" with "owns it", splits the two into concentric rings, and says so in plain Russian: "Внешнее кольцо: сколько слов из уровня вы уже открыли. Внутреннее: сколько закрепили в долгой памяти (интервал ≥ 21 день)." That distinction — *seen* vs *reliably remembered* — is a real pedagogical idea, it carries the same distinction to assistive tech, and the three-state ETA deliberately admits ignorance instead of rendering a fake estimate.

2. **Destructive-action design is careful and specific.** `ConfirmDialog` with a typed `consequences` array, exact counts, correct Russian plurals through `pluralRu`, native `<details>` for the SM-2 dump, import restating the file's contents plus a different-username warning. On a surface with a delete-everything button, this is the right level of care.

3. **The empty state and the skeleton are real work.** "Сделайте несколько повторений, и здесь появятся графики, точность, прогнозы и темы с прогрессом" tells the learner what will appear instead of scolding them for having none. `LevelMasteryRingsSkeleton` was built to match the real block's height by construction, specifically to kill a measured 0.218 CLS. Most analytics pages ship a shrug here.

## Priority Issues

**[P0] The forecast row renders broken — its grid class is a dead reference.**
`styles.kpiRow` is referenced once (`StatsPage.tsx:525`) and defined in no stylesheet. CSS Modules resolve it to `undefined`, `className` is omitted, the `<section>` gets no `display: grid`, and the three `.kpi` children stack as full-width blocks. Confirmed in both screenshots: "НА 7 ДНЕЙ", "НА 30 ДНЕЙ", "ПРОКЛЯТЫХ" are three stacked bands, ~330px on desktop and ~250px on mobile where ~110px was intended, with no gap and no group border. The hovered tile reads as a different kind of object from its siblings.
*Why it matters:* the second-most-important block on the page is visibly broken, and the flush edges make three tiles look like three unrelated cards.
*Fix:* define `.kpiRow` mirroring `.kpis` (`StatsPage.module.css:51-59`) — `grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden`. While there, add `.kpiLink:hover { text-decoration: none }` to stop the `a:hover` underline leaking in from `global.css:537`.
*Suggested command:* `/impeccable layout`

**[P1] The Темы tab opens beneath ~900px of activity charts that have nothing to do with topics.**
The non-overview branch (`StatsPage.tsx:712`) re-renders the same activity card and heatmap that the overview branch renders at `:639`. So `?tab=topics` shows activity, the 13-week heatmap and the SM-2 `<details>` before the topic grid begins. Measured on the captured Темы tab: the grid starts at roughly 54% down a 3,566px document.
*Why it matters:* the entire reason to open a stats page is to decide what to study next, and that view starts with a screen of unrelated charts. The comment at `:576-582` states the tab bar "splits the rest of the page ... into three focused views" — the two branches do not implement that.
*Fix:* move the activity + heatmap blocks into the `activity` branch only, and let the `topics` branch render the grid directly under the tab bar. The duplicate block should be deleted, not re-shared.
*Suggested command:* `/impeccable layout`

**[P1] The page breaks the product's no-ceremony commitment in its second-most-visible block.**
`stats.activity.streak` = "Серия" with sub "Подряд с повторениями", and `stats.activity.bestDay` = "Лучший день" (`ru.ts:482-490`) are a streak counter and a personal best — the two gamification primitives PRODUCT.md principle 4 forbids by name. Reinforced by two subtitles that prescribe a rhythm and then point at the failure: "Видно, как вы держите ритм" and "Сразу видно, где вы выпали из ритма." The headline tile opens the page with "ИЗУЧЕНО КАРТОЧЕК 0 / 3 996" and the sub "0% от всех карточек" — the gap typeset as the hero.
*Why it matters:* the learner who took a week off — explicitly a normal event in this product — lands on a 0-series, a stale record, and terracotta cells under copy that names their absence as a problem. The commitment is honoured at the reset dialog and broken everywhere they simply came back.
*Fix:* delete the streak and best-day KPIs. Replace the third activity KPI with something forward-looking and honest — cards currently due, or days until the next batch. Rewrite both subtitles to describe the data without prescribing behaviour.
*Suggested command:* `/impeccable clarify`

**[P1] A failed `/api/stats` is indistinguishable from a page that never loads.**
The `catch` only `console.warn`s (`:86-89`); `serverStats` stays null, so the forecast row never renders and `LevelMasteryRingsSkeleton` holds at `aria-busy="true"` indefinitely.
*Why it matters:* this is a local-first product whose server is optional. A learner whose server is asleep sees a permanently loading skeleton; a transient failure silently amputates the forecast with no message.
*Fix:* add a `serverStatsError` state and render a one-line inline note in place of the forecast row ("Прогноз недоступен — считаем на устройстве") with a retry affordance. The four client-computable KPIs stay visible, which is the honest local-first answer.
*Suggested command:* `/impeccable harden`

**[P1] The typographic contrast is inverted: the only Kazakh word on the page is in Inter, and every Russian label is in the serif.**
`.leechKk` (`StatsPage.module.css:762-769`) sets no `font-family`, so the Kazakh word inherits Inter, while `h1`, all five section-title roles and every KPI numeral are Source Serif 4. No `[lang]` rule exists anywhere in `global.css` to compensate.
*Why it matters:* the product's strongest typographic idea does nothing on the one page where actual Kazakh content appears — and the block carrying it, the leech list, is the block the design system would want to be the most beautiful thing on the page.
*Fix:* `.leechKk { font-family: var(--font-display); font-size: var(--text-lead); font-weight: 500; }` and pull `.kpiValue` back to `--font-sans` with its existing `tabular-nums`, so the serif is reserved rather than decorative. Also drop `text-overflow: ellipsis` from `.leechKk` — long Kazakh compounds are common, and ellipsis on the one string the product exists to display is the wrong failure mode.
*Suggested command:* `/impeccable typeset`

## Persona Red Flags

**Alex (Impatient Power User)** — primary action: *find what to study next, act on it.*

- **The tab bar that changes the page sits below 1,200px of content** — captured at y≈1,026 in the 1280px shot, under the KPI band, the broken forecast stack and the rings row. The IA control belongs above the always-on KPIs, not beneath content that belongs *inside* one of its tabs.
- **The topic grid cannot get him to his due cards.** 48 equal-weight links, no sort by due, no "due only" filter, no search. He reads 48 cards to find the 3 that matter — and they now sit below 900px of charts.
- **Every leech reset is a full page reload** (`:146`). Wiping 1 of 12 leeches re-downloads all five decks, re-runs both API calls, and throws away his scroll position and active tab. No optimistic update, no batch path that avoids it.
- **Bulk leech reset reports to `console.log`** (`:156`) — the only feedback for a destructive network action is written to a console he isn't looking at, followed by a reload.
- **The forecast tiles link to `/study`, not to his due cards specifically** — and they are the broken block, so the click targets are unclear.

**Sam (Accessibility-Dependent User)** — primary action: *read my accuracy and find my weak words.*

- **The tab control is decorative ARIA.** Three `role="tab"` buttons with no `id`, no `aria-controls`, no roving tabindex, and no Left/Right/Home/End handling anywhere in the file. Sam switches views with arrow keys; nothing happens. The project already solved exactly this for the study page's pickers and extracted `src/lib/listboxKeys.ts` for reuse — it was not reused here.
- **Two elements carry `role="tabpanel"` on the overview tab** (`:566`, `:640`), neither wired to a tab, and the non-overview branch adds a third. The tab↔panel relationship is announced as broken.
- **The tablist is labelled with one of its own tabs:** `aria-label={t('stats.tab.overview')}` (:583) announces the group as "Сводка".
- **The heatmap is `role="grid"` with 91 `role="gridcell"` divs**, no `role="row"`, no keyboard access, and a hover-only custom tooltip (`onMouseEnter`/`onMouseMove` only). DESIGN.md:1252-1256 records this as knowingly unfixed. The honest fix the doc names — drop the role, summarise the grid as an image — is the one to take.
- **The weekday axis labels are hidden from everyone.** `.heatmapDays` is `aria-hidden="true"` (:1374) *and* CSS `visibility: hidden`s the 2nd, 4th and 6th spans. The sighted user gets two labels (Пн, Пт); Sam gets zero.
- **Both charts ship hardcoded English `aria-label`s** — `"Daily reviews, last 30 days"` (:1181) and `"Daily retention, last 30 days"` (:1688) — on a Russian-only interface, in the two places the product most needs the scaffolding language. These are the only untranslated strings a Russian screen-reader user will hear here.
- **The ease histogram is unreadable out of context:** the track is `aria-hidden="true"` and the only label is the raw range, so Sam hears "1.5–2.0 10" — while five warm Russian bucket names sit unused at `ru.ts:414-418`.

**Ren, the owner-operator** — project-specific and inferred. PRODUCT.md documents one audience and says future work must not invent cohorts, so this is inferred from the repo's own framing, not documented. The README tells people to fork and self-host, and the project is MIT with a `docker-compose` server; the person deploying it is a different user from the person studying with it, and this stats page is the only surface he has. He fails it at: the SM-2 parameter dump, the one genuinely console-grade tool on the page, is hidden behind a `<details>` under a tab with no indication it exists; there is no aggregate export, so he can back up raw progress but never inspect it; and `/api/stats` failure is invisible to him entirely.

## Minor Observations

- **The ease histogram's zero buckets paint a sliver.** `.fill` is `width: 100%; transform: scaleX(0); border-radius: 4px`, so a zero bucket still rasterizes a 1–2px clay tick. It reads as "a very small amount" rather than "none."
- **`RetentionChart`'s y-axis labels are laid out on the x-axis.** Three ticks read `0% / 50% / 100%` positioned by `left: 0/50/100%`. The 80% and 95% reference lines are drawn but never labeled, so the "Здоровый диапазон: 80–95%" copy has no visible referent.
- **Three different month vocabularies on one page.** The heatmap uses `toLocaleDateString(undefined, { month: 'short' })` while the activity axis uses `getDate()` and the month table is hardcoded in `ru.ts:514-525` — which is why the capture shows "авг." beside "июнь/июль".
- **The 30-day chart's x-axis prints day-of-month only** — "24, 31, 7, 14, 21" — two months with no context, so "31" and "7" are ambiguous.
- **Topic names truncate on every card** at 1280px: "Приветствия и этик…", "Семья и родствен…", "Работа и професси…". Four columns is too many for these labels.
- **The empty state is overview-only** (:622). A new user arriving on `?tab=topics` gets a 48-card grid with no empty state at all.
- **`alert()` for import success and export failure** (:406, :332) — native, unstyled, blocking, in a product with its own toast vocabulary used one screen away.
- **`.tabButtonActive` uses `--surface-2`**, while DESIGN.md:985 assigns `--surface-3` to active filter chips. The stats tab is an active filter and is one step weaker than its stated role.
- **The detector's whole-project failure count is misleading as read**: 4 `overused-font` hits are one `@font-face` family split by `unicode-range` into four `@font-face` blocks.

## Questions to Consider

- **What is this page actually for?** The current answer — "everything the app knows, in four bands" — is why it needs three tabs, 48 topic links, a heatmap *and* a bar chart over the same array, and why the same number appears three times. If the answer is *"tell me what to study in the next five minutes,"* then the forecast row, the leech list and a "due now" list are the page, and the heatmap, the retention chart, the ease histogram and the SM-2 dump are an appendix. That one decision would let four sections go and would make the streak and best-day tiles obviously wrong rather than defensible.
- **If the serif is reserved for the learner meeting the new language, what is the page's one Kazakh moment?** Right now it is a hidden leech list, and it is set in Inter. A stats page for a Kazakh app could make its *subject* Kazakh: the leech list promoted to a proper panel with the word set large in the display serif, the mastery rings labeled with real vocabulary, the topic grid showing actual words per topic. That is not decoration — it would be the only surface where the learner sees her own vocabulary as a body of work rather than a count.
- **Can the 30-day chart and the 13-week heatmap be one honest thing instead of two?** They read the same array at two granularities, occupy ~400px between them, and the heatmap's own subtitle frames itself as a commit map. One chart answering both questions would buy the vertical space the tab bar needs to be visible, and would let the ring row be the focal point.
