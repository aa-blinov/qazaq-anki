#!/usr/bin/env python3
"""Build a minimal test .apkg for import tests.

Creates an Anki collection with 3 notes (Basic model: Front + Back):
  - "тест" / "тест"
  - "жаңа" / "новый"
  - "үй" / "дом"

Then zips it with the structure Anki expects: collection.anki21 in
the root, no media. Run as: `python3 scripts/build-test-apkg.py
/tmp/test.apkg`.
"""
import json
import os
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

def make_apkg(out_path: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "collection.anki21")
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        # Anki schema — minimal subset that sql.js / Anki Desktop can read.
        cur.executescript("""
        CREATE TABLE col (
            id INTEGER PRIMARY KEY, crt INTEGER, mod INTEGER, scm INTEGER,
            ver INTEGER, dty INTEGER, usn INTEGER, ls INTEGER,
            conf TEXT, models TEXT, decks TEXT, dconf TEXT, tags TEXT
        );
        CREATE TABLE notes (
            id INTEGER PRIMARY KEY, guid TEXT, mid INTEGER, mod INTEGER,
            usn INTEGER, tags TEXT, flds TEXT, sfld TEXT, csum INTEGER,
            flags INTEGER, data TEXT
        );
        CREATE TABLE cards (
            id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER, ord INTEGER,
            type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER,
            reps INTEGER, lapses INTEGER, left INTEGER, odue INTEGER, odid INTEGER,
            flags INTEGER, data TEXT
        );
        CREATE TABLE revlog (
            id INTEGER PRIMARY KEY, cid INTEGER, usn INTEGER, ease INTEGER,
            ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER
        );
        CREATE TABLE graves (usn INTEGER, oid INTEGER, type INTEGER);
        """)
        # Single Basic model.
        models = {
            "1": {
                "id": 1,
                "name": "Basic",
                "type": 0,
                "flds": [
                    {"name": "Front", "ord": 0, "sticky": False},
                    {"name": "Back",  "ord": 1, "sticky": False},
                ],
                "tmpls": [{
                    "name": "Card 1", "ord": 0,
                    "qfmt": "{{Front}}", "afmt": "{{FrontSide}}\n\n<hr id=answer>\n{{Back}}",
                }],
            }
        }
        decks = {
            "1": {"id": 1, "name": "Test Kazakh", "mod": 0},
        }
        cur.execute(
            "INSERT INTO col (id, models, decks) VALUES (1, ?, ?)",
            (json.dumps(models), json.dumps(decks)),
        )
        notes = [
            (1, "guid-1", 1, "тест", "тест"),
            (2, "guid-2", 1, "жаңа", "новый"),
            (3, "guid-3", 1, "үй", "дом"),
        ]
        for nid, guid, mid, front, back in notes:
            flds = f"{front}\x1f{back}"
            cur.execute(
                "INSERT INTO notes (id, guid, mid, flds, sfld) VALUES (?, ?, ?, ?, ?)",
                (nid, guid, mid, flds, front),
            )
            cur.execute(
                "INSERT INTO cards (id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (nid, nid, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0),
            )
        con.commit()
        con.close()

        # Zip
        with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(db_path, "collection.anki21")

if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/test.apkg"
    make_apkg(out)
    print(f"Wrote {out} ({os.path.getsize(out)} bytes)")
