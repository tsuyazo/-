"""data/*.json を埋め込んで game/index.html（単体で動くデュエル盤）を作る。"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    cards = json.load(open(os.path.join(ROOT, "data", "cards.json")))
    decks = json.load(open(os.path.join(ROOT, "data", "decks.json")))
    keep = ("code", "name", "category", "subtype", "level", "attribute", "race", "tags", "atk", "def_", "text", "limit")
    data = {
        "cards": [{k: c[k] for k in keep if k in c} for c in cards],
        "decks": {k: {"name": d["name"], "ref": d["ref_archetype"],
                      "main": [[e["n"], e["code"]] for e in d["main"]],
                      "extra": [[e["n"], e["code"]] for e in d["extra"]]} for k, d in decks.items()},
    }
    tpl = open(os.path.join(ROOT, "game", "template.html")).read()
    out = tpl.replace("__DATA__", json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    open(os.path.join(ROOT, "game", "index.html"), "w").write(out)
    print("game/index.html", len(out.encode()), "bytes")


if __name__ == "__main__":
    main()
