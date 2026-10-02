#!/usr/bin/env python3
"""
Verify which candidate display serifs can actually render this product's
two languages, using the real character inventory rather than a marketing
claim of "supports Cyrillic".

"Supports Cyrillic" is not good enough. The Kazakh alphabet needs the
Cyrillic Supplement block (U+0490-04FF) for Ә Ғ Қ Ң Ө Ұ Ү Һ — a font can
cover basic Russian perfectly and still drop half the Kazakh alphabet.
Coverage is therefore checked per character, and every missing glyph is
named.

Usage:  python3 scripts/check_font_coverage.py <font-file> [<font-file> ...]

Pointing this at a *slice* rather than a whole family. The shipped fonts
are cut into `cyrillic`, `cyrillic-ext`, `latin` and `latin-ext` files,
and the browser picks between them by `unicode-range` and renders the
union. Measuring one slice alone therefore reports hundreds of missing
glyphs that no reader has ever seen missing — the Kazakh letters all live
in `cyrillic-ext`, and asking the `cyrillic` slice about them answers a
question nobody asked. So when the path looks like a slice
(`<family>-<style>-<subset>.woff2`), its siblings in the same directory
are loaded too and the result is the union, which is what actually
renders. Pass a variable `.ttf` — a candidate from
`fetch_display_candidates.py` — and it is measured on its own, because a
candidate has no split.

To audit exactly one file in isolation, pass `--no-siblings`.
"""
import os
import re
import sys
from fontTools.ttLib import TTFont

# Exactly what the product renders, taken from the deck + the UI strings.
KAZAKH = (
    "ӘҒҚҢӨҰҮҺІәғқңөұүһі"
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    "Сәлем, сіздің атыңыз кім? Қайырлы таңер! Менің атым — Айгүл. "
    "Кітапхана, университет, тіл, сөз, ертең, бүгін, кеше."
)
RUSSIAN = (
    "ЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ"
    "ёйцукенгшщзхъфывапролджэячсмитьбю"
    "Учите казахский так, как когда-то учили свой язык предки. "
    "Карточки с интервальным повторением."
)
PUNCT = "«»—–…№·"

# family-style-subset.woff2, e.g. sourceserif4-normal-cyrillic.woff2
SLICE = re.compile(r"^(?P<stem>.+?)-(?P<style>normal|italic)-(?P<subset>[a-z-]+)\.woff2$")
SUBSETS = ("cyrillic-ext", "cyrillic", "latin-ext", "latin")


def coverage(paths, chars):
    """Return (covered, missing) for `chars` across the union of `paths`."""
    cmap = set()
    for path in paths:
        font = TTFont(path, fontNumber=0)
        for table in font["cmap"].tables:
            if table.isUnicode():
                cmap.update(table.cmap.keys())
        font.close()
    covered, missing = [], []
    for c in chars:
        (covered if ord(c) in cmap else missing).append(c)
    return covered, missing


def family_of(path):
    """If `path` is one slice of a family, return every sibling slice."""
    m = SLICE.match(os.path.basename(path))
    if not m:
        return [path]
    stem, style = m.group("stem"), m.group("style")
    d = os.path.dirname(path) or "."
    siblings = [os.path.join(d, f"{stem}-{style}-{s}.woff2") for s in SUBSETS]
    found = [p for p in siblings if os.path.exists(p)]
    return found or [path]


def main(argv):
    no_siblings = "--no-siblings" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rows = []
    for p in paths:
        used = [p] if no_siblings else family_of(p)
        try:
            _, miss_kk = coverage(used, KAZAKH)
            _, miss_ru = coverage(used, RUSSIAN)
            _, miss_pu = coverage(used, PUNCT)
        except Exception as e:
            print(f"{p}: UNREADABLE ({e})")
            continue
        total = len(KAZAKH) + len(RUSSIAN) + len(PUNCT)
        missing = miss_kk + miss_ru + miss_pu
        rows.append((p, total, missing, len(used)))

    print(f"{'font':<44} {'missing':>8}  detail")
    for p, total, missing, nfiles in rows:
        detail = "".join(missing[:24]) + ("…" if len(missing) > 24 else "") if missing else "— full coverage —"
        label = p.split("/")[-1] + (f"  [{nfiles} slices]" if nfiles > 1 else "")
        print(f"{label:<44} {len(missing):>8}  {detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
