"""jspeed氏（ブログ「くされにっき」）のデッキリストで、デッキを作り直す。

jspeed/decks.json（ブログから書き写したリスト）のうち、アーキタイプごとに選んだリストを使う。
1103の制限リストと2011年8月31日までのカードプールに合わないカードだけを、役割の近いカードに差し替える
（差し替えは SUBS に全部書き、recipes_meta.json と decklists.md に残す）。
新しく必要になるカードは cards_src.py に追加する（名前と効果文は日本語のカードDBのもの）。

使い方:
    python3 apply_jspeed.py babel.cdb ja.cdb
その後 build.py・gen_engine_data.py を実行する。
"""
import json
import os
import pprint
import runpy
import sqlite3
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 使うリスト（decks.json の名前の先頭）
PICK = {
    "blackwing": "【1103】墓地BF（2011.03 ISDCS第10回）",
    "agent": "TG天使（2011.10 浜松CS）",
    "karakuri": "カラクリ（2011.11 岡山CS）",
    "debris_plant": "TOKYOデブリ（2010.11 東京CS）",
    "quick_plant": "クイックダンディ（お触れ型、2010.09 フリー）",
    "six_samurai": "六武衆（2012.05 LCS）",
}
# 1103で使えないカードの差し替え：(デッキ, 区分, 外すカード, 外す枚数, 入れるカード, 理由)
SUBS = [
    ("agent", "main", "カオス・ソルジャー -開闢の使者-", 1, "オネスト", "1103では禁止"),
    ("agent", "main", "大嵐", 1, "サイクロン", "1103では禁止"),
    ("karakuri", "main", "カラクリ無双 八壱八", 1, "カラクリ参謀 弐四八", "2011年9月発売で1103のカードプール外"),
    ("karakuri", "main", "大嵐", 1, "ハリケーン", "1103では禁止"),
    ("karakuri", "main", "サイクロン", 1, "トラップ・スタン", "1103では準制限（2枚まで）"),
    ("debris_plant", "main", "デブリ・ドラゴン", 1, "キラー・トマト", "1103では準制限（2枚まで）"),
    ("debris_plant", "main", "ダンディライオン", 1, "カードガンナー", "1103では制限（1枚まで）"),
    ("debris_plant", "main", "大寒波", 1, "サイクロン", "1103では禁止"),
    ("debris_plant", "extra", "ゴヨウ・ガーディアン", 1, "TG ハイパー・ライブラリアン", "1103では禁止"),
    ("quick_plant", "main", "デブリ・ドラゴン", 1, "スノーマンイーター", "1103では準制限（2枚まで）"),
    ("quick_plant", "main", "ダンディライオン", 1, "カードガンナー", "1103では制限（1枚まで）"),
    ("quick_plant", "main", "大寒波", 1, "ハリケーン", "1103では禁止。同じく相手の魔法罠を止めて展開を通す役割"),
    ("six_samurai", "main", "大嵐", 1, "サイクロン", "1103では禁止"),
    ("six_samurai", "extra", "H-C エクスカリバー", 1, "No.17 リバイス・ドラゴン", "2012年4月発売で1103のカードプール外"),
    ("six_samurai", "extra", "M.X-セイバー インヴォーカー", 1, "ジェムナイト・パール", "2011年11月発売で1103のカードプール外"),
    ("six_samurai", "extra", "機甲忍者ブレード・ハート", 1, "A・O・J ディサイシブ・アームズ", "2011年11月発売で1103のカードプール外"),
]

norm = lambda s: unicodedata.normalize("NFKC", s).replace(" ", "").replace("　", "")


def main(babel, ja):
    bdb, jdb = sqlite3.connect(babel), sqlite3.connect(ja)
    jid = {}
    for i, n in jdb.execute("select t.id,t.name from texts t join datas d on d.id=t.id where d.alias=0"):
        jid.setdefault(norm(n), i)
    def en_of(name):
        i = jid.get(norm(name))
        if i is None:
            sys.exit(f"日本語のカードDBに無いカード: {name}")
        r = bdb.execute("select name from texts where id=?", (i,)).fetchone()
        if not r:
            sys.exit(f"BabelCDBに無いカード: {name} ({i})")
        return i, r[0]

    src = json.load(open(os.path.join(ROOT, "jspeed", "decks.json")))
    cards = runpy.run_path(os.path.join(HERE, "cards_src.py"))["CARDS"]
    decks = runpy.run_path(os.path.join(HERE, "decks_src.py"))["DECKS"]
    meta = json.load(open(os.path.join(HERE, "recipes_meta.json")))
    new_cards = {}

    for key, title in PICK.items():
        v = src[title]
        parts = {p: [[n, c] for n, c in v.get(p, [])] for p in ("main", "extra")}
        changes = []
        for dk, part, out, n, inn, why in SUBS:
            if dk != key:
                continue
            row = next(r for r in parts[part] if r[1] == out)
            row[0] -= n
            add = next((r for r in parts[part] if r[1] == inn), None)
            if add:
                add[0] += n
            else:
                parts[part].append([n, inn])
            changes.append(f"{out}→{inn}（{why}）")
        out_deck = {}
        for part in ("main", "extra"):
            lst = []
            for n, c in parts[part]:
                if n <= 0:
                    continue
                cid, en = en_of(c)
                if en not in cards:
                    desc = jdb.execute("select desc from texts where id=?", (cid,)).fetchone()[0]
                    cards[en] = dict(name=c, text=desc.replace("\r", ""))
                    new_cards[en] = cards[en]
                lst.append((n, en))
            out_deck[part] = lst
        decks[key] = out_deck
        m = meta.get(key, {})
        meta[key] = {
            "archetype": m.get("archetype", key), "title": title, "event": v.get("event"), "date": v.get("date"),
            "placing": v.get("result"), "player": "jspeed", "source_url": v.get("url"), "placing_confirmed": True,
            "period": v.get("period"), "side": v.get("side", []), "uncertain": [], "illegible": v.get("unreadable", []),
            "changes": changes, "source": "jspeed（くされにっき）",
        }

    # cards_src.py に新しいカードを追記する
    if new_cards:
        with open(os.path.join(HERE, "cards_src.py"), "a", encoding="utf-8") as f:
            f.write("\n# ---------------- jspeed氏のリストで追加したカード（名前・効果文は日本語のカードDBのもの） ----------------\n")
            f.write("CARDS.update({\n")
            for en, v in new_cards.items():
                f.write(f"{en!r}: dict(name={v['name']!r}, text={v['text']!r}),\n")
            f.write("})\n")
    # decks_src.py を書き直す
    with open(os.path.join(HERE, "decks_src.py"), "w", encoding="utf-8") as f:
        f.write("# 10デッキのレシピ。tools/recipes_meta.json に出典・順位・差し替えを記録。\n")
        f.write("# rabbit・hero・tg_gadget・dark_world は寒波亭の大会入賞レシピ、それ以外は jspeed氏（くされにっき）のリスト（tools/apply_jspeed.py）。\n")
        f.write("# 形式: (枚数, \"元カード英語名\")。サイドデッキはゲームでは使わないので記録のみ（recipes_meta.json）。\n\n")
        f.write("DECKS = " + pprint.pformat(decks, width=120, sort_dicts=False) + "\n")
    json.dump(meta, open(os.path.join(HERE, "recipes_meta.json"), "w"), ensure_ascii=False, indent=1)
    print(f"作り直したデッキ {len(PICK)} / 追加したカード {len(new_cards)}: {', '.join(v['name'] for v in new_cards.values())}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
