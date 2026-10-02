#!/usr/bin/env python3
"""
Build and verify the self-hosted webfont set.

The two halves do very different jobs, and the difference is the point.

`--check` is the guard. It is the part that must never be wrong, because
it is the only thing standing between this product and a bug that no
screenshot can show. It answers, per family and per style:

  * does the union of the shipped files cover every character the product
    actually renders?
  * does every `url()` in fonts.css resolve to a file on disk?
  * is every `.woff2` on disk actually declared in fonts.css?

That third pair is bidirectional on purpose. An @font-face rule pointing
at a file that is not there fails silently — the browser logs a 404 it
tells nobody about, falls through to the next family, and the page still
looks like a page. It is exactly the bug this script was first written
for: `inter-normal-cyrillic.woff2` was Google's "cyrillic" slice, which
stops at U+045F, and the Kazakh letters Ә Ғ Қ Ң Ө Ұ Ү Һ live in the
Cyrillic Supplement block above it, so they were never in the file — and
because `unicode-range` only offered that file for U+0400-045F, the
browser never asked for them anyway. 2,761 of the deck's 3,996 headwords
(69%) contain at least one of them. Reading the CSS would not have found
it. Reading the cmap did.

Note that coverage is checked *per family*, never as a global union.
A union check passes as long as some file somewhere has the glyph, which
is precisely the failure this script exists to catch: Newsreader was
asked for Cyrillic it did not have on nearly every screen while Inter
covered the same text, so the whole deck still "passed" a union check
while the display role was silently rendering the OS serif.

The build path regenerates the display family. It does not regenerate
Inter: the Inter files are Google's own slices of Inter 4.001
(git 66647c0bb), taken as-is on purpose. Re-subsetting them locally cost
+76 KB and, more importantly, mixing two compressors' output across one
family means a Latin letter and a Kazakh letter are no longer guaranteed
to be the same design. `--check` guards those files instead.

Usage:
    python3 scripts/build_fonts.py --check
    python3 scripts/build_fonts.py --display-roman <ttf> [--display-italic <ttf>]
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_FONTS = os.path.join(ROOT, "public", "fonts")
LANDING_FONTS = os.path.join(ROOT, "landing", "fonts")

# The pairs the CSS is checked against. The app serves from /fonts/; the
# landing site is a separate static tree and must declare the same set,
# or a face that works in the app 404s in the marketing page.
CSS_TARGETS = [
    (os.path.join(ROOT, "src", "styles", "fonts.css"), APP_FONTS),
    (os.path.join(ROOT, "landing", "fonts.css"), LANDING_FONTS),
]

# The stylesheets that declare --font-* tokens. A quoted family in one of
# these must have a matching @font-face, because a token naming a family
# that was never declared does not error: the browser simply moves to the
# next family in the stack. That is how `landing/styles.css` went on
# asking for 'Newsreader' after the face was replaced — the hero word, the
# one surface that page exists to show, was being drawn by the OS serif
# and the build stayed green.
TOKEN_TARGETS = [
    (os.path.join(ROOT, "src", "styles", "global.css"), os.path.join(ROOT, "src", "styles", "fonts.css")),
    (os.path.join(ROOT, "landing", "styles.css"), os.path.join(ROOT, "landing", "fonts.css")),
]

# Every <link rel="preload" as="font"> in an HTML entry point must point at
# a file that exists. A preload 404 is the quietest failure in webfonts:
# nothing renders wrong, there is no console error worth reading, the
# request just 404s and the page falls back. Both landing pages preloaded
# a Newsreader latin slice for a whole deployment after the face was
# replaced, and the only symptom was a 404 in the network log nobody opens.
PRELOAD_TARGETS = [
    os.path.join(ROOT, "index.html"),
    os.path.join(ROOT, "landing", "index.html"),
    os.path.join(ROOT, "landing", "en", "index.html"),
]

# Families that are legitimately declared by the operating system.
GENERIC = {
    "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
    "ui-monospace", "ui-sans-serif", "ui-serif", "ui-rounded", "math",
    "emoji", "fangsong", "-apple-system", "inherit", "initial", "unset",
}

# The character inventory this product renders. Kazakh-specific letters
# come first so a gap in them can never hide behind a large Russian
# alphabet in the report.
KAZAKH_ONLY = "ӘҒҚҢӨҰҮҺІәғқңөұүһі"
RUSSIAN = (
    "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"
    "ҐґЎў"
)
PUNCT = "«»—–…№·’‘“”"
LATIN = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    "0123456789ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜß"
    "àáâãäåæçèéêëìíîïñòóôõöøùúûüÿ"
)
REQUIRED = KAZAKH_ONLY + RUSSIAN + PUNCT + LATIN

# Google's own subset boundaries, reproduced exactly as the shipped CSS
# declares them. These are NOT ours to redesign: they are the ranges the
# upstream webfont builds were cut to, and a file only contains a glyph
# if the designer drew one there. A `unicode-range` that promises more
# than the font holds is normal and harmless — the browser falls through
# to the next family for that codepoint, which is what Google ships.
# What is not harmless is the reverse, and that is what `--check` tests.
GOOGLE_RANGES = {
    "cyrillic": [(0x0301, 0x0301), (0x0400, 0x045F), (0x0490, 0x0491),
                 (0x04B0, 0x04B1), (0x2116, 0x2116)],
    "cyrillic-ext": [(0x0460, 0x052F), (0x1C80, 0x1C8A), (0x20B4, 0x20B4),
                     (0x2DE0, 0x2DFF), (0xA640, 0xA69F), (0xFE2E, 0xFE2F)],
    "latin-ext": [(0x0100, 0x02BA), (0x02BD, 0x02C5), (0x02C7, 0x02CC),
                  (0x02CE, 0x02D7), (0x02DD, 0x02FF), (0x0304, 0x0304),
                  (0x0308, 0x0308), (0x0329, 0x0329), (0x1D00, 0x1DBF),
                  (0x1E00, 0x1E9F), (0x1EF2, 0x1EFF), (0x2020, 0x2020),
                  (0x20A0, 0x20AB), (0x20AD, 0x20C0), (0x2113, 0x2113),
                  (0x2C60, 0x2C7F), (0xA720, 0xA7FF)],
    "latin": [(0x0000, 0x00FF), (0x0131, 0x0131), (0x0152, 0x0153),
              (0x02BB, 0x02BC), (0x02C6, 0x02C6), (0x02DA, 0x02DA),
              (0x02DC, 0x02DC), (0x0304, 0x0304), (0x0308, 0x0308),
              (0x0329, 0x0329), (0x2000, 0x206F), (0x20AC, 0x20AC),
              (0x2122, 0x2122), (0x2191, 0x2191), (0x2193, 0x2193),
              (0x2212, 0x2212), (0x2215, 0x2215), (0xFEFF, 0xFEFF),
              (0xFFFD, 0xFFFD)],
}

# The weight axis is pinned, not free. The display role only ever asks for
# 400-700 (headings are 600, the wordmark and card word are 500), so the
# rest of Inter's 100-900 range is dead weight in every byte shipped.
# The optical axis is left free on purpose and NOT pinned here: this role
# runs from a 14px transliteration to a 51px card word, and pinning opsz
# would cost 61% of the file to throw away the one axis that makes a
# single face correct at both ends of that range.
DISPLAY_WGHT = "400:700"

# Which (style, range) pairs are shipped, and why the italic is latin-only.
# The deck's 1,559 B1 transliterations contain zero Cyrillic, so an
# italic Cyrillic file would never be downloaded by anything. `local()`
# is not declared either: no system reliably ships an italic Source Serif.
DISPLAY_CUTS = [
    ("normal", "cyrillic"), ("normal", "cyrillic-ext"),
    ("normal", "latin"), ("normal", "latin-ext"),
    ("italic", "latin"), ("italic", "latin-ext"),
]

# Families whose style is allowed to be latin-only. The check asserts the
# Latin half really is there and then says out loud that the Kazakh half
# is not, so the tradeoff can never quietly become a regression.
LATIN_ONLY_STYLES = {("Source Serif 4", "italic")}


def codepoint_ranges(spec):
    return ",".join(f"U+{lo:04X}" if lo == hi else f"U+{lo:04X}-{hi:04X}"
                    for lo, hi in spec)


def parse_ranges(spec):
    """Parse a CSS unicode-range value back into a set of codepoints."""
    out = set()
    for part in spec.split(","):
        part = part.strip().lower().replace("u+", "")
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-")
            out.update(range(int(lo, 16), int(hi, 16) + 1))
        else:
            out.add(int(part, 16))
    return out


def coverage_of(path):
    f = TTFont(path, fontNumber=0)
    cmap = set()
    for t in f["cmap"].tables:
        if t.isUnicode():
            cmap.update(t.cmap.keys())
    f.close()
    return cmap


def parse_faces(css_path):
    """Yield (family, style, weight, filename, declared_range) per rule."""
    with open(css_path, encoding="utf-8") as fh:
        css = fh.read()
    for block in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
        fam = re.search(r"font-family:\s*['\"]?([^'\";]+)", block)
        sty = re.search(r"font-style:\s*(\w+)", block)
        url = re.search(r"url\(['\"]?([^'\")]+)", block)
        rng = re.search(r"unicode-range:\s*([^;]+);", block)
        if not (fam and sty and url and rng):
            raise SystemExit(f"malformed @font-face in {css_path}:\n{block}")
        yield (fam.group(1).strip(), sty.group(1),
               os.path.basename(url.group(1)),
               parse_ranges(rng.group(1)))


def font_stack(value):
    """Split a CSS font-family value, honouring quotes."""
    out, buf, quote = [], "", None
    for ch in value:
        if quote:
            if ch == quote:
                quote = None
            else:
                buf += ch
        elif ch in "'\"":
            quote = ch
        elif ch == ",":
            out.append(buf.strip())
            buf = ""
        else:
            buf += ch
    if buf.strip():
        out.append(buf.strip())
    return [f for f in out if f]


def check_preloads():
    """Every font preload must resolve to a file that exists."""
    ok = True
    for html_path in PRELOAD_TARGETS:
        if not os.path.exists(html_path):
            continue
        with open(html_path, encoding="utf-8") as fh:
            html = fh.read()
        rel = os.path.relpath(html_path, ROOT)
        found = False
        for tag in re.findall(r"<link\b[^>]*>", html):
            if not re.search(r'rel=["\']?preload', tag, re.I):
                continue
            if not re.search(r'as=["\']?font', tag, re.I):
                continue
            href = re.search(r'href=["\']([^"\']+)', tag)
            if not href:
                continue
            found = True
            target = href.group(1).split("?")[0].split("#")[0]
            if target.startswith(("http://", "https://", "//")):
                print(f"  {rel}: {target} — remote, not checked here")
                ok = False
                continue
            if target.startswith("/"):
                # Root-absolute, as the app serves it: /fonts/x is
                # public/fonts/x on disk, not <repo>/fonts/x.
                path = os.path.join(ROOT, "public", target.lstrip("/"))
            else:
                path = os.path.normpath(
                    os.path.join(os.path.dirname(html_path), target))
            if os.path.exists(path):
                size = os.path.getsize(path) / 1024
                print(f"  {rel}: {os.path.basename(target):<38} {size:>7.1f} KB  ok")
            else:
                print(f"  {rel}: {os.path.basename(target):<38} MISSING — 404 on every load")
                ok = False
        if not found:
            print(f"  {rel}: no font preloads")
    return ok


def check_tokens():
    """The head of every --font-* stack must resolve to a real @font-face.

    This is the check that would have caught the Newsreader leftover. A
    missing webfont never raises: the browser walks to the next family in
    the stack, the page still looks like a page, and the only symptom is
    that the product looks different on someone else's machine.

    Only the *head* is tested. A fallback tail is supposed to be system
    fonts — that is what a fallback stack is for, and requiring every
    entry to be self-hosted would be nonsense. What must hold is that the
    first name is either declared here or is a family the OS provides.
    """
    # --font-* also covers non-family tokens such as --font-scale, a
    # multiplier. Matching everything and asking "is this a family?" would
    # need a heuristic; naming the family tokens is exact and says so.
    family_token = re.compile(r"--font-(sans|display|mono|serif|body|ui)\b")
    ok = True
    for token_css, faces_css in TOKEN_TARGETS:
        with open(token_css, encoding="utf-8") as fh:
            text = fh.read()
        declared = {fam for fam, _, _, _ in parse_faces(faces_css)}
        print(f"\n=== tokens in {os.path.relpath(token_css, ROOT)} ===")
        for name, value in re.findall(r"(--font-[\w-]+)\s*:\s*([^;]+);", text):
            if not family_token.fullmatch(name):
                print(f"  {name:<16} not a family token, skipped")
                continue
            stack = font_stack(value)
            if not stack:
                print(f"  {name:<16} no family — check the declaration")
                ok = False
                continue
            head = stack[0]
            if head in GENERIC:
                verdict = f"{head} (generic, provided by the OS) — ok"
            elif head in declared:
                verdict = f"{head} — @font-face present, ok"
            else:
                verdict = (f"{head} — NO @font-face! The browser will "
                           f"silently fall through to {', '.join(stack[1:3])}.")
                ok = False
            print(f"  {name:<16} {verdict}")
    return ok


def check():
    ok = True
    for css_path, font_dir in CSS_TARGETS:
        label = os.path.relpath(css_path, ROOT)
        print(f"\n=== {label} -> {os.path.relpath(font_dir, ROOT)}/ ===")
        if not os.path.isdir(font_dir):
            print(f"  ! {font_dir} does not exist")
            ok = False
            continue

        on_disk = {f for f in os.listdir(font_dir) if f.endswith(".woff2")}
        referenced = set()
        families = {}
        sizes = {}
        total = 0

        for fam, sty, fn, declared in parse_faces(css_path):
            referenced.add(fn)
            path = os.path.join(font_dir, fn)
            if not os.path.exists(path):
                print(f"  ! declared but MISSING on disk: {fn}")
                ok = False
                continue
            cov = coverage_of(path)
            total += os.path.getsize(path)
            families.setdefault((fam, sty), []).append(cov)
            sizes.setdefault((fam, sty), 0)
            sizes[(fam, sty)] += os.path.getsize(path)
            if declared - cov:
                # Informational, not a failure: see GOOGLE_RANGES.
                n = len(declared - cov)
                print(f"  · {fn:<42} declared {len(declared):>4}, "
                      f"holds {len(cov):>4} ({n} promised-but-undrawn)")

        orphans = on_disk - referenced
        if orphans:
            print(f"  ! on disk but never declared in CSS: {sorted(orphans)}")
            ok = False

        for (fam, sty), covs in sorted(families.items()):
            union = set().union(*covs)
            latin_only = (fam, sty) in LATIN_ONLY_STYLES
            need = LATIN if latin_only else REQUIRED
            missing = [c for c in need if ord(c) not in union]
            kk = [c for c in KAZAKH_ONLY if ord(c) not in union]
            print(f"  {fam} [{sty}] — {len(covs)} file(s), "
                  f"{sizes[(fam, sty)] / 1024:.0f} KB, "
                  f"inventory {len(REQUIRED) if not latin_only else len(LATIN)}"
                  f"{' (latin-only, by design)' if latin_only else ''}")
            if missing:
                print(f"    ! MISSING {len(missing)}: {''.join(missing)}")
                ok = False
            if kk and not latin_only:
                print(f"    ! Kazakh letters missing: {''.join(kk)}")
                ok = False
            if kk and latin_only:
                print(f"    · no Cyrillic by design; browser synthesises "
                      f"an oblique for {''.join(kk)}")
            if not missing:
                print("    ok — every character in the inventory is covered")

        print(f"  files: {len(on_disk)}  total {total / 1024:.1f} KB")
    print("\n=== font preloads ===")
    if not check_preloads():
        ok = False
    if not check_tokens():
        ok = False
    print("\nRESULT:", "OK" if ok else "FAILED")
    return 0 if ok else 1


def pin_weight(src, dst):
    """Pin the wght axis to the range the display role uses."""
    cmd = [sys.executable, "-m", "fontTools.varLib.instancer",
           src, f"wght={DISPLAY_WGHT}", "-o", dst]
    subprocess.run(cmd, check=True, capture_output=True)
    return dst


def subset(src, dst, spec):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cmd = [
        sys.executable, "-m", "fontTools.subset", src,
        f"--unicodes={codepoint_ranges(spec)}",
        "--flavor=woff2",
        "--layout-features=kern,liga,calt,tnum,lnum,onum,frac,ccmp,locl,mark,mkmk",
        "--name-IDs=*",
        "--drop-tables+=DSIG",
        "--passthrough-tables",
        "--recalc-bounds",
        "--no-hinting",
        "--desubroutinize",
        f"--output-file={dst}",
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return dst


def build_display(roman, italic, prefix, name):
    sources = {"normal": roman, "italic": italic}
    for sty, rng in DISPLAY_CUTS:
        src = sources.get(sty)
        if not src:
            print(f"  ! no italic source given, skipping {sty}/{rng}")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            pinned = pin_weight(src, os.path.join(tmp, "pinned.ttf"))
            fn = f"{prefix}-{sty}-{rng}.woff2"
            for _, font_dir in CSS_TARGETS:
                if os.path.isdir(font_dir):
                    subset(pinned, os.path.join(font_dir, fn), GOOGLE_RANGES[rng])
            size = os.path.getsize(os.path.join(APP_FONTS, fn)) / 1024
            print(f"  {fn:<42} {size:>7.1f} KB")
    print(f"\nBuilt {name}. The CSS is hand-maintained, but `--check` now "
          f"fails if a rule and a file disagree in either direction, so a "
          f"face cannot be added to disk without a rule or declared "
          f"without a file.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="verify the shipped set against the CSS and the "
                         "product's character inventory (the guard)")
    ap.add_argument("--display-roman", help="path to the display face roman variable ttf")
    ap.add_argument("--display-italic", help="path to the display face italic variable ttf")
    ap.add_argument("--display-name", default="Source Serif 4")
    ap.add_argument("--display-prefix", default="sourceserif4")
    args = ap.parse_args()

    if args.check or not (args.display_roman or args.display_italic):
        return check()
    if not args.display_roman:
        ap.error("--display-roman is required to build the display face")
    print(f"Building {args.display_name} (wght pinned to {DISPLAY_WGHT}, "
          f"opsz left free):")
    build_display(args.display_roman, args.display_italic,
                  args.display_prefix, args.display_name)
    return check()


if __name__ == "__main__":
    raise SystemExit(main())
