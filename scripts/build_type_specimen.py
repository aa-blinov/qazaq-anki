#!/usr/bin/env python3
"""
Build a type specimen that renders each candidate display face doing the
jobs the product actually gives it — the real Russian UI copy and the real
Kazakh headwords, at the real sizes and the real colours.

A typeface decision made from a name is a guess. This exists so the choice
is made from rendered output: the same Kazakh words the learner sees on the
card, set in each candidate, next to what it currently falls back to.

Usage:  python3 scripts/build_type_specimen.py <candidates-dir> <out.html>
"""
import os
import sys
from fontTools.ttLib import TTFont

# The exact strings the product renders, pulled from the app and the deck.
HERO_RU = "Учите казахский так, как когда-то учили свой язык предки"
H2_RU = "3 факта про колоду"
CARD_KK = "ақкөңіл"          # a real deck headword, and it has ақ, ө, і, ң
CARD_KK_SENT = "Менің атым — Айгүл. Кітапханада кітап оқыдым."
SMALL_KK = "әкең"
RU_ANSWER = "добрый"
TRANSIT = "aqkönil"          # rendered italic in the product
SETTINGS_H = "Настройки"
DIALOG_H = "Удалить карточку?"

ROWS = [
    ("Hero · h1 · 2.65rem", "display", 2.65, 1.12, 600, HERO_RU, "ru"),
    ("Section · h2 · 1.7rem", "display", 1.70, 1.25, 600, H2_RU, "ru"),
    ("Card word · clamp(2.4,6vw,3.4)", "display", 3.40, 1.12, 500, CARD_KK, "kk"),
    ("Card word small · 1.6rem", "display", 1.60, 1.25, 500, SMALL_KK, "kk"),
    ("Card sentence · 1.15rem italic", "display", 1.15, 1.60, 400, CARD_KK_SENT, "kk"),
    ("Answer · 1rem", "sans", 1.00, 1.55, 400, RU_ANSWER, "ru"),
    ("Transliteration · 0.95rem italic", "display", 0.95, 1.50, 400, TRANSIT, "lat"),
    ("Dialog title · 1.3rem", "display", 1.30, 1.25, 600, DIALOG_H, "ru"),
]

PALETTE = {
    "bg": "#FAF7F2", "surface": "#FFFFFF", "surface2": "#F2EEE6",
    "text": "#1F1E1B", "textstrong": "#0E0D0B", "muted": "#6B6862",
    "border": "#E8E2D2", "accent": "#A8522F",
}


def axes_of(path):
    f = TTFont(path, fontNumber=0)
    if "fvar" not in f:
        f.close()
        return None
    a = {x.axisTag: (x.minValue, x.maxValue, x.defaultValue) for x in f["fvar"].axes}
    f.close()
    return a


def face_css(fid, path, label):
    """A @font-face for the candidate, using the full axis range it ships."""
    a = axes_of(path)
    if a is None:
        wght = "400"
    elif "wght" in a:
        lo, hi, _ = a["wght"]
        wght = f"{lo:.0f} {hi:.0f}"
    else:
        wght = "400"
    return (
        f"@font-face{{font-family:'{fid}';font-style:normal;font-weight:{wght};"
        f"font-display:block;src:url('file://{path}') format('truetype');}}"
    )


def build(cand_dir, out_path, faces, inter_path, newsreader_path):
    css = [face_css(fid, p, label) for fid, p, label in faces]
    if inter_path and os.path.exists(inter_path):
        css.append("@font-face{font-family:'SpecInter';font-style:normal;font-weight:100 900;"
                   f"src:url('file://{inter_path}') format('truetype');}}")
    if newsreader_path and os.path.exists(newsreader_path):
        css.append("@font-face{font-family:'SpecNews';font-style:normal;font-weight:200 800;"
                   f"src:url('file://{newsreader_path}') format('truetype');}}")

    blocks = []
    for fid, path, label in faces:
        rows = []
        for name, role, size, lh, weight, text, script in ROWS:
            fam = f"'{fid}'" if role == "display" else "'SpecInter', sans-serif"
            it = "italic" if "italic" in name else "normal"
            # Highlight the Kazakh-specific letters so the eye lands on them.
            marked = text
            for ch in "ӘҒҚҢӨҰҮҺәғқңөұүһі":
                marked = marked.replace(ch, f'<b class="kk">{ch}</b>')
            rows.append(
                f'<div class="row"><div class="meta"><span class="role">{name}</span>'
                f'<span class="script">{script}</span></div>'
                f'<div class="spec" style="font-family:{fam};font-size:{size}rem;'
                f'line-height:{lh};font-weight:{weight};font-style:{it}">{marked}</div></div>'
            )
        blocks.append(
            f'<section class="face"><h2 class="facename">{label}'
            f'<span class="fam">\'{fid}\'</span></h2>{"".join(rows)}</section>'
        )

    html = f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>Display face specimen</title>
<style>
{''.join(css)}
*{{box-sizing:border-box}}
body{{background:{PALETTE['bg']};color:{PALETTE['text']};margin:0;padding:40px 32px 80px;
 font-family:'SpecInter',sans-serif;-webkit-font-smoothing:antialiased}}
header{{max-width:980px;margin:0 auto 36px;padding-bottom:24px;border-bottom:1px solid {PALETTE['border']}}}
header h1{{font-size:1.05rem;font-weight:600;margin:0 0 6px;color:{PALETTE['textstrong']}}}
header p{{margin:0;font-size:0.9rem;line-height:1.6;color:{PALETTE['muted']};max-width:70ch}}
header .kk{{color:{PALETTE['accent']}}}
.face{{max-width:980px;margin:0 auto 44px;background:{PALETTE['surface']};
 border:1px solid {PALETTE['border']};border-radius:12px;padding:26px 28px 12px}}
.facename{{font-family:'SpecInter',sans-serif;font-size:0.8rem;font-weight:600;letter-spacing:0.04em;
 text-transform:uppercase;color:{PALETTE['muted']};margin:0 0 4px;display:flex;gap:10px;align-items:baseline}}
.fam{{font-weight:400;text-transform:none;letter-spacing:0;color:{PALETTE['muted']};opacity:.7}}
.row{{border-top:1px solid {PALETTE['surface2']};padding:16px 0 6px}}
.meta{{font-size:0.68rem;letter-spacing:0.03em;color:{PALETTE['muted']};margin-bottom:6px;display:flex;gap:10px}}
.role{{font-weight:500}}
.script{{opacity:.55;font-family:monospace}}
.spec{{color:{PALETTE['textstrong']};overflow-wrap:anywhere}}
.row:nth-child(2n) .spec{{color:{PALETTE['text']}}}
.b{{font-weight:inherit}}
.kk{{color:{PALETTE['accent']}}}
</style></head><body>
<header>
<h1>Display face specimen — the real copy, the real sizes</h1>
<p>Every line below is a string the product actually renders, at the size it actually renders it.
Letters tinted clay are the Kazakh-specific ones — Ә Ғ Қ Ң Ө Ұ Ү Һ. A face that lacks them
does not render this product's language; it renders a fallback's.</p>
</header>
{''.join(blocks)}
</body></html>"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    return len(blocks)


def main():
    cand_dir = sys.argv[1]
    out = sys.argv[2]
    order = ["sourseserif4", "alegreya", "literata", "vollkorn", "lora", "bitter"]
    labels = {
        "sourseserif4": "Source Serif 4", "alegreya": "Alegreya",
        "literata": "Literata", "vollkorn": "Vollkorn",
        "lora": "Lora", "bitter": "Bitter",
    }
    faces = []
    for fid in order:
        p = os.path.join(cand_dir, f"{fid}.ttf")
        if os.path.exists(p):
            faces.append((fid, p, labels[fid]))
    n = build(cand_dir, out, faces, "/tmp/inter41/InterVariable.ttf",
              "public/fonts/newsreader-normal-latin.woff2")
    print(f"wrote {out} with {n} candidate faces")


if __name__ == "__main__":
    raise SystemExit(main())
