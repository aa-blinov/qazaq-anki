# Concepts: level vs category

This document exists because "level" and "category" are easily confused in
this codebase. They are **distinct** dimensions and we treat them that way
everywhere.

## Level — proficiency tier (CEFR)

A `Level` is a **proficiency band** from the Common European Framework of
Reference for Languages:

| ID     | Name   | Meaning                                    |
| ------ | ------ | ------------------------------------------ |
| `a1`   | A1     | Beginner — survival phrases, basic verbs   |
| `a2`   | A2     | Elementary — daily life, work, travel     |
| `b1`   | B1     | Intermediate — opinion, abstract concepts  |
| `b2`   | B2     | Upper-Intermediate — argumentation, legal  |
| `c1`   | C1     | Advanced — academic, political, slangs     |

- One card belongs to exactly one `Level`.
- `Level.cardCount` is the total number of cards in the level.
- A user studies a level via `/study/:levelId`.
- A user's progress is keyed by user id, not by level — all levels share
  one progress map per user.

### How words are distributed

The 1,272-card deck mixes two sources, ranked by reliability:

1. **CEFR anchors** (per-level curated lists from wordmastery.org):
   100 hand-picked words per level. These are the level's topic-rich
   "spine".
2. **Frequency list** (1,068-word common Kazakh list from wordmastery.org):
   extra cards distributed by `(a)` the level of the same word in the
   anchor set, `(b)` the position in the frequency list, `(c)` the
   grammar category bias (Pronouns → A1, Conjunctions → A2-B1, etc.).

Each card is placed in exactly one level. There is no "Common" pseudo-level
and no card is allowed to appear in more than one level. See
`src/data/decks.test.ts` for the invariants.

## Category — topic within a level (a.k.a. "theme" / "group")

A `Category` is a **subject grouping inside a level**. It lets the user
filter the queue to e.g. "just Verbs in A1" or "Family in A1".

| Level | Sample categories |
| ----- | ------------------ |
| A1    | Greetings and Essentials, Numbers, Common Verbs, Pronouns, Family, Food and Drink, Time and Days, Places and Directions, Question Words, Adjectives and Descriptions |
| A2    | Adjectives and Descriptions, Work and Education, Health and Body, Travel and Transport, House and Daily Life, Feelings and Communication, Nature and Environment, Useful Phrases |
| B1    | Complex Verbs and Action, Descriptive Adjectives, Opinion and Abstract Concepts, Useful Phrases and Connectors, Work and Business, Technology and Science, Travel and Geography, Health and Lifestyle, Miscellaneous |
| B2    | Abstract Verbs, Advanced Adjectives, Connectors and Discourse Markers, Logic and Argumentation, Professional and Legal, Science and Education, Environment and Economy, Social and Cultural Issues, Feelings and States |
| C1    | Academic and Analytical Discourse, Advanced Adjectives, Complex Verbs and Idiomatic Actions, Discourse and Rhetoric, Economy and Globalism, Formal and Political, Philosophy and Soul, Slang and Colloquialisms |

- One card has exactly one `Category` (stored in `card.category`).
- The UI surfaces categories as a **Topic** filter on the Study page
  and a **Topic** filter on the Browse page.
- A category is only meaningful within its parent level — "Verbs" in A1
  is a different group from "Verbs" in B2.

## How they interact in the URL

`/study/a1?topic=Common%20Verbs` means:

- **Level** = `a1` (the proficiency deck)
- **Category** = `Common Verbs` (the topic filter inside that deck)

These two parameters are independent: you can change the level and keep
the topic, or change the topic and keep the level.

## Code map

| Concept | Type            | File                      |
| ------- | --------------- | ------------------------- |
| Level   | `Level`         | `src/data/decks.ts`       |
| Card    | `Card`          | `src/data/decks.ts`       |
| Category| `card.category` (string) | `src/data/decks.ts` |
| Data    | JSON files      | `src/data/decks/*.json`   |

The Card type looks like:

```ts
interface Card {
  id: string;            // unique across all levels, e.g. "a1-051" or "common-0042"
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';  // proficiency tier
  category: string;      // topic within that level
  kazakh: string;
  transliteration: string;
  translation: string;
  example: string;
  deck: 'cefr';
}
```

Both `level` and `category` are required. Neither is derived from the other.

## Progress migration across data restructures

User progress is keyed by `card.id` and stored at
`aq:progress:${userId}` in `localStorage`. When the deck data is
restructured (e.g. removing the "Common" pseudo-level), existing user
progress continues to work as long as the `id` of each card is
preserved. The card-id format is stable:

- `a1-NNN`, `a2-NNN`, …, `c1-NNN` — anchor words.
- `common-NNNN` — common-list words that have been reassigned to a
  CEFR level but kept their original id. Re-reading a user's stored
  progress at these ids returns the correct schedule state, with no
  migration step required.

The invariant is checked by `src/lib/progress.test.ts` ("progress
survives deck restructure").

## Anti-patterns to avoid

- ❌ "Level" filter chip on the Study page showing topic names
  (e.g. "Verbs" as a level).
- ❌ "Category" filter chip on the Browse page that crosses levels
  (e.g. "Verbs" matching A1's "Common Verbs" + C1's "Complex Verbs").
- ❌ Storing topic inside the level id (e.g. `levelId = "a1-verbs"`).
- ❌ Treating "Verbs" in C1 as equivalent to "Common Verbs" in A1.
- ❌ A "Common" catch-all level that holds words of mixed CEFR tiers.

If you ever feel tempted to merge them, the rule is:

> **Level answers "How hard is this word for the learner?"**
> **Category answers "What is this word about?"**

A1-001 ("Сәлем / Hello") is a *level* thing: it's for beginners. It's also a
*category* thing: it's a greeting. The two are independent properties of
the card and must stay separate in code, data, and UI.
