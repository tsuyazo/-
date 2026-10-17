"""エンジン用のカード数値表 game/card_data.json を作る。

data/cards.json の収録カードに加えて、そのスクリプトが参照するカード（トークンなど）も含める。

使い方:
    python3 gen_engine_data.py cards.cdb
"""
import json
import os
import re
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def main(cdb):
    db = sqlite3.connect(cdb)
    cards = json.load(open(os.path.join(ROOT, "data", "cards.json")))
    exists = lambda i: db.execute("select 1 from datas where id=?", (i,)).fetchone() is not None
    want = {c["id"] for c in cards}
    for c in cards:
        # トークンは本体の番号+1〜5に置かれていることが多い
        for d in (1, 2, 3, 4, 5):
            r = db.execute("select name from texts where id=?", (c["id"] + d,)).fetchone()
            if r and "Token" in r[0]:
                want.add(c["id"] + d)
        p = os.path.join(ROOT, "game", "scripts", "official", f"c{c['id']}.lua")
        if os.path.exists(p):
            for n in re.findall(r"\b(\d{5,9})\b", open(p, encoding="utf-8").read()):
                if exists(int(n)):
                    want.add(int(n))
    rows = {}
    for i in sorted(want):
        r = db.execute("select id,alias,setcode,type,atk,def,level,race,attribute from datas where id=?", (i,)).fetchone()
        name = db.execute("select name from texts where id=?", (i,)).fetchone()[0]
        rows[i] = {"row": [r[0], r[1], str(r[2]), r[3], r[4], r[5], r[6], r[7], r[8]], "ref": name}
    out = os.path.join(ROOT, "game", "card_data.json")
    json.dump(rows, open(out, "w"), ensure_ascii=False, indent=0)
    extra = {k: v["ref"] for k, v in rows.items() if k not in {c["id"] for c in cards}}
    print(f"card_data.json: {len(rows)} rows (収録外の参照 {len(extra)}: {extra})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "cards.cdb"))
