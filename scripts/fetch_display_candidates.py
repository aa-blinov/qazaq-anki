#!/usr/bin/env python3
"""
Download candidate display serifs and verify each one can actually render
this product's two languages before any of them is considered.

"Supports Cyrillic" is not the bar. The Kazakh alphabet needs the Cyrillic
Supplement block (U+0490-04FF) for Ә Ғ Қ Ң Ө Ұ Ү Һ — a face can cover
Russian perfectly and still be missing most of the alphabet this product
teaches. Sources are the upstream font repos under the SIL OFL, not a font
CDN, matching the project's self-host stance.

Usage:  python3 scripts/fetch_display_candidates.py <dest-dir>
"""
import os
import sys
import urllib.request
from fontTools.ttLib import TTFont

BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

# (id, upstream path, human label)
CANDIDATES = [
    ("sourseserif4",     "sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf",        "Source Serif 4"),
    ("alegreya",         "alegreya/Alegreya%5Bwght%5D.ttf",                      "Alegreya"),
    ("literata",         "literata/Literata%5Bopsz,wght%5D.ttf",                "Literata"),
    ("vollkorn",         "vollkorn/Vollkorn%5Bwght%5D.ttf",                      "Vollkorn"),
    ("lora",             "lora/Lora%5Bwght%5D.ttf",                              "Lora"),
    ("bitter",           "bitter/Bitter%5Bwght%5D.ttf",                          "Bitter"),
    ("ptserif",          "ptserif/PTSerif%5Bwght%5D.ttf",                        "PT Serif"),
    ("petrona",          "petrona/Petrona%5Bwght%5D.ttf",                        "Petrona"),
    ("faustina",         "faustina/Faustina%5Bwght%5D.ttf",                      "Faustina"),
    ("eczar",            "eczar/Eczar%5Bwght%5D.ttf",                            "Eczar"),
]

# The exact inventory the product renders. Kazakh headwords first, then the
# Russian UI copy, then the punctuation the CSS and copy actually use.
REQUIRED = (
    # Kazakh-specific: these live in the Cyrillic Supplement block
    "ӘҒҚҢӨҰҮҺІәғқңөұүһі"
    # Russian alphabet, upper and lower
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    # Real sentences from the product
    "СәлемСіздіңатыңызкімҚайырлытаңерМеніңатымАйгүлКітапханауниверситеттілсөзертеңбүгінкеше"
    "УчитеказахскийтаккаккогдатоучилисвойязыкпредкиКарточкисинтервальнымповторением"
    "НастройкиСтатистикаУровниВсекповторениюТренировкаГлавнаяСкачатьбэкап"
    # Punctuation the interface uses
    "«»—–…№·’‘“”"
)


def fetch(fid, path, dest):
    url = BASE + path
    out = os.path.join(dest, f"{fid}.ttf")
    if os.path.exists(out) and os.path.getsize(out) > 10_000:
        return out, None
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            data = r.read()
        if len(data) < 10_000:
            return None, f"too small ({len(data)} bytes) — likely a 404 page"
        with open(out, "wb") as fh:
            fh.write(data)
        return out, None
    except Exception as e:
        return None, str(e)


def check(path):
    f = TTFont(path, fontNumber=0)
    cmap = set()
    for t in f["cmap"].tables:
        if t.isUnicode():
            cmap.update(t.cmap.keys())
    axes = ""
    if "fvar" in f:
        axes = ", ".join(f"{a.axisTag} {a.minValue:.0f}-{a.maxValue:.0f}" for a in f["fvar"].axes)
    ital = "fvar" in f and any(a.axisTag == "ital" for a in f["fvar"].axes)
    name = {r.nameID: str(r) for r in f["name"].names if r.platformID == 3}
    f.close()
    missing = [c for c in REQUIRED if ord(c) not in cmap]
    return {
        "axes": axes,
        "italic": ital,
        "version": name.get(5, "?"),
        "family": name.get(1, "?"),
        "missing": missing,
        "total": len(REQUIRED),
    }


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "/tmp/display-candidates"
    os.makedirs(dest, exist_ok=True)
    print(f"{'face':<20} {'miss':>5}  {'axes':<28} italic  detail")
    print("-" * 108)
    ok = []
    for fid, path, label in CANDIDATES:
        local, err = fetch(fid, path, dest)
        if err:
            print(f"{label:<20} {'—':>5}  fetch failed: {err}")
            continue
        try:
            r = check(local)
        except Exception as e:
            print(f"{label:<20} {'—':>5}  unreadable: {e}")
            continue
        miss = r["missing"]
        detail = ("FULL COVERAGE" if not miss
                  else "missing " + "".join(miss[:18]) + ("…" if len(miss) > 18 else ""))
        print(f"{label:<20} {len(miss):>5}  {r['axes']:<28} {str(r['italic']):<6}  {detail}")
        if not miss:
            ok.append((label, fid, local, r))
    print()
    print(f"full-coverage candidates: {', '.join(l for l, *_ in ok) or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
