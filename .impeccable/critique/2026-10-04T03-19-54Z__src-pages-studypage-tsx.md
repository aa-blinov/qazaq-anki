---
target: окно повтора / study screen
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
target_identity: "file:/Users/justcomex/Documents/pet/anki-qazaq/src/pages/StudyPage.tsx"
target_fingerprint: "sha256:fa2772c73dd69586ccc6d8572a1a9b6a7a3301a9c185db835f46310971301000"
target_path: /Users/justcomex/Documents/pet/anki-qazaq/src/pages/StudyPage.tsx
timestamp: 2026-10-04T03-19-54Z
slug: src-pages-studypage-tsx
---
# Critique — study screen (окно повтора)

Method: dual-agent (A: design review, code-grounded · B: detector + live-browser measurement)
Target: src/pages/StudyPage.tsx + src/components/Flashcard.tsx
Mode: Operate · surface: the review screen

Detector: 0 findings on markup. 6 advisory on CSS (raw rgba(0,0,0,.08/.14), radii 4px/10px off-scale).
Browser overlay: not provable — inline <script> blocked by the app's own `script-src 'self'`.

## Design Health Score — 26/40

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | counterPill entirely below the 860px fold at 1280 (y=876.6-906.3) |
| 2 | Match system / real world | 2 | useState<Mode>('all') — pool, not the due queue |
| 3 | User control and freedom | 3 | 5s undo exists; no "finish session" |
| 4 | Consistency and standards | 3 | <=600px turns the grade row into 2x2, order breaks |
| 5 | Error prevention | 3 | "Again" reinserts 3 slots later silently |
| 6 | Recognition over recall | 2 | four SM-2 grades with no visible consequence |
| 7 | Flexibility and efficiency | 4 | 1-4, Space, tap-anywhere, direction switch, cram |
| 8 | Aesthetic and minimalist design | 2 | 22 controls before reveal, 28 after |
| 9 | Error recovery | 2 | TTS failure is a title tooltip, invisible on touch |
| 10 | Help and documentation | 2 | PROBEL chip hidden <=600px; scale unexplained in-product |

All ten applicable (Operate). Rating band: mid — system solid, product instinct lost.

## Design specificity

An unrelated product could ship this unchanged. The one product idea — Source Serif 4
for the language being learned, Inter for scaffolding — is inverted on the default
branch: `Flashcard.tsx:103` puts the Russian translation in `backMain`, and
`.kazakhWordSmall` (Flashcard.module.css:212) sets it in `var(--font-display)`.
Front and back are both serif, differing only in size.

## Priority issues

- **P0 CSP kills the service worker.** nginx sends `script-src 'self'`
  (web/default.conf.template:87); the SW registration is inline (index.html:95-101).
  Verified live on :8080: 0 registrations, 1 CSP console error. Offline/PWA is dead
  in the deployed stack. The test passes because it calls register() directly.
  -> /impeccable harden
- **P0 Wrong default queue.** useState<Mode>('all') + no levelId = all 3,996 cards
  instead of 22 due. Breaks the product's own stated ritual. -> /impeccable shape
- **P1 Russian answer in the Kazakh serif.** Choose family by direction, not by side.
  -> /impeccable typeset
- **P1 Rating row hides the interval.** nextIntervalLabel goes to aria-label only, so
  blind learners know more than sighted ones. -> /impeccable clarify
- **P1 2x2 grade grid on the primary device.** 1280 = 154x4; 390 = 160x2 (134px).
  Breaks the ordered scale and puts "Again" in the worst thumb position. Labels do
  not truncate — hold repeat(4, 1fr). -> /impeccable adapt
- **P2 Desktop chrome.** 22 controls, card at 73% of viewport height. -> /impeccable distill
- **P2 "источник" on the answer.** Verified: the `example` field is empty on 0 of
  3,996 cards; the curated set is 98 words, so ~2% of backs carry an example. -> /impeccable clarify
- **P3** Sparkles + "Отлично!" (violates the no-gamification principle); empty
  .metaBar; counterPill percentage claimed in CSS comment but never rendered.

## Persona red flags

- **Returning, phone, tired, week off.** Empty progress bar and "1 из 3996" first;
  reads as failure. 22 real due cards shuffled among ~3,974 unseen. "Снова" lands
  top-left of the 2x2.
- **First-timer.** "1 из 3996" and four unexplained SM-2 grades. Three pickers to
  configure before the first action. Nothing surfaces the CEFR spine.

## Questions

1. What if the grade buttons showed the consequence instead of the judgement?
2. Is the deck hiding a teaching aid (the cognate pair) inside a lookup table?
3. If each card carried one line about itself, would the loop read as a relationship?
4. If the ending cannot say "Отлично!", what should a 20-minute session feel like
   after a week away?
