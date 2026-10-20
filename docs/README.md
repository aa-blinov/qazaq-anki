# Documentation

The documents of `qazaq-anki`, a self-hosted spaced-repetition flashcard app
for learning Kazakh. A React front end talks to an Express API over one
SQLite file, and the vocabulary, the pronunciation clips and the topic
taxonomy are all committed to the repository.

| Document | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | The three processes, the modules, the data flow and the boundaries. |
| [CARDS.md](CARDS.md) | The card format, the fields and what each one means. |
| [USER-STORIES.md](USER-STORIES.md) | What the app is for, written as the situations it serves. |
| [SECURITY.md](SECURITY.md) | The security review: the threats, the controls and the gaps. |
| [DEPLOY.md](DEPLOY.md) | The deployment: the images, the Caddy profile, the backups. |
| [concepts.md](concepts.md) | The vocabulary and the reasoning behind the domain model. Its numbers are out of date, and the note below says which. |
| [screenshots/README.md](screenshots/README.md) | The 23 images, what each one shows and how they were captured. |
| [../README.md](../README.md) | The front door: the deck, what the app does, the configuration. |
| [../AGENTS.md](../AGENTS.md) | The traps, the commands and the rules of the project. |
| [../PRODUCT.md](../PRODUCT.md) | The product truth: who it is for, and what it promises. |
| [../DESIGN.md](../DESIGN.md) | The visual system: the tokens, the type ramp, the components. |

The `docs/` folder also holds the two landing pages, `index.html` and
`en-index.html`, with their stylesheet and their script. They are static
pages for GitHub Pages, and they are published from the `gh-pages` branch
by `npm run deploy`.

## Reading order

New here: [../README.md](../README.md), then
[architecture.md](architecture.md). The README says what the app does, and
the architecture says where each part of it lives.

Learning the domain: [CARDS.md](CARDS.md) for the shape of a card, then
[concepts.md](concepts.md) for the reasoning. The second one was written
against an earlier version of the app, and its counts are wrong: the deck
is 3,996 cards across five CEFR levels now, there is no "Common" level,
and the progress lives on the server rather than in the browser. The
distinction the document argues for is still worth reading.

Changing the code: [architecture.md](architecture.md) first, then
[../AGENTS.md](../AGENTS.md) for the traps. Several of them describe files
that look live and are not.

## A note on the languages

The documents in this folder are in English. The application is in Russian,
because the learner is a Russian speaker, and the Kazakh word is the only
Kazakh surface in the product. The two landing pages exist in both
languages, and the card data itself is Kazakh with a Russian translation.
