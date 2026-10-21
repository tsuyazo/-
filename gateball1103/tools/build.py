"""カードDB（ProjectIgnis/BabelCDB の cards.cdb）から数値を取り出し、独自カード・デッキデータを生成する。

使い方:
    curl -L -o cards.cdb https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master/cards.cdb
    python3 build.py cards.cdb
"""
import json
import os
import runpy
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

ATTR = {1: "地", 2: "水", 4: "炎", 8: "風", 16: "光", 32: "闇"}
RACE = {1: "戦士族", 2: "魔法使い族", 4: "天使族", 8: "悪魔族", 16: "アンデット族", 32: "機械族",
        64: "水族", 128: "炎族", 256: "岩石族", 512: "鳥獣族", 1024: "植物族", 2048: "昆虫族",
        4096: "雷族", 8192: "ドラゴン族", 16384: "獣族", 32768: "獣戦士族", 65536: "恐竜族",
        131072: "魚族", 262144: "海竜族", 524288: "爬虫類族", 1048576: "サイキック族"}
LIMIT = {0: "禁止", 1: "制限", 2: "準制限"}
DECK_INFO = {
    "rabbit": "兎ラギア", "agent": "代行天使", "hero": "HERO", "tg_gadget": "TGガジェット",
    "debris_plant": "デブリダンディ", "quick_plant": "クイックダンディ", "six_samurai": "六武衆",
    "dark_world": "暗黒界", "karakuri": "カラクリ", "blackwing": "BF",
}
GAME_DECK_NAME = {
    "rabbit": "古竜ラグナレイジ", "agent": "星使", "hero": "勇士", "tg_gadget": "試作機ギア人形",
    "debris_plant": "瓦礫竜ハーモン", "quick_plant": "クイックハーモン", "six_samurai": "武士団",
    "dark_world": "魔窟", "karakuri": "機巧", "blackwing": "夜鴉",
}


def kind(t):
    if t & 0x2:
        sub = {0x10000: "速攻", 0x20000: "永続", 0x40000: "装備", 0x80000: "フィールド"}
        return "魔法", next((v for k, v in sub.items() if t & k), "通常")
    if t & 0x4:
        sub = {0x20000: "永続", 0x100000: "カウンター"}
        return "罠", next((v for k, v in sub.items() if t & k), "通常")
    if t & 0x40:
        return "モンスター", "融合"
    if t & 0x2000:
        return "モンスター", "同調"
    if t & 0x800000:
        return "モンスター", "重ね"
    return "モンスター", "通常" if t & 0x10 else "効果"


def tags(t):
    out = []
    if t & 0x1000:
        out.append("調律")
    if t & 0x800:
        out.append("デュアル")
    return out


def main(cdb, ja=None):
    cards = runpy.run_path(os.path.join(HERE, "cards_src.py"))["CARDS"]
    renamer = None
    if ja:   # 実際のカード名を使う
        from real_names import Renamer
        renamer = Renamer(ja)
        dbx = sqlite3.connect(cdb)
        for ref, v in cards.items():
            r = dbx.execute("select d.id from texts t join datas d on d.id=t.id where t.name=? and d.alias=0", (ref,)).fetchone()
            if r:
                renamer.add(v["name"], r[0])
        renamer.finish()
        from real_names import ARCHETYPES, TERMS
        json.dump({"names": renamer.map, "archetypes": ARCHETYPES, "terms": TERMS},
                  open(os.path.join(ROOT, "data", "name_map.json"), "w"), ensure_ascii=False, indent=0)
    decks = runpy.run_path(os.path.join(HERE, "decks_src.py"))["DECKS"]
    lflist = {e["id"]: e["limit"] for e in json.load(open(os.path.join(HERE, "lflist_2011_03_ocg.json")))}
    db = sqlite3.connect(cdb)

    used = []
    for d in decks.values():
        for part in ("main", "extra"):
            for _, ref in d[part]:
                if ref not in used:
                    used.append(ref)
    missing = [r for r in used if r not in cards]
    if missing:
        sys.exit("cards_src.py に未定義: " + ", ".join(missing))

    # 区分順 → 名前順で通し番号を振る
    rows = {}
    for ref in used:
        r = db.execute("select d.id,d.type,d.level,d.atk,d.def,d.attribute,d.race from texts t "
                       "join datas d on d.id=t.id where t.name=? and d.alias=0", (ref,)).fetchone()
        if not r:
            sys.exit("DBに無いカード: " + ref)
        rows[ref] = r
    order = {"モンスター": 0, "魔法": 1, "罠": 2}
    used.sort(key=lambda ref: (order[kind(rows[ref][1])[0]], cards[ref]["name"]))

    out, by_ref = [], {}
    for i, ref in enumerate(used, 1):
        cid, t, lv, atk, df, attr, race = rows[ref]
        cat, sub = kind(t)
        name = renamer.map.get(cards[ref]["name"], cards[ref]["name"]) if renamer else cards[ref]["name"]
        c = {"code": f"GB-{i:03d}", "id": cid, "name": name, "category": cat, "subtype": sub}
        if cat == "モンスター":
            c.update(level=lv & 0xFF, rank_or_level="ランク" if sub == "重ね" else "レベル",
                     attribute=ATTR[attr], race=RACE[race], tags=tags(t),
                     atk="?" if atk < 0 else atk, def_="?" if df < 0 else df)
        c["text"] = renamer.text(cards[ref]["text"]) if renamer else cards[ref]["text"]
        c["limit"] = LIMIT.get(lflist.get(cid), "無制限")
        c["ref"] = ref
        out.append(c)
        by_ref[ref] = c

    deck_out = {}
    for key, d in decks.items():
        deck_out[key] = {
            "name": DECK_INFO[key] if renamer else GAME_DECK_NAME[key], "ref_archetype": DECK_INFO[key],
            "main": [{"n": n, "code": by_ref[r]["code"], "name": by_ref[r]["name"]} for n, r in d["main"]],
            "extra": [{"n": n, "code": by_ref[r]["code"], "name": by_ref[r]["name"]} for n, r in d["extra"]],
        }
        validate(key, d, by_ref)

    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "data", "cards.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(deck_out, open(os.path.join(ROOT, "data", "decks.json"), "w"), ensure_ascii=False, indent=1)
    write_cards_md(out)
    write_decklists_md(deck_out, by_ref)
    write_limit_md(out, {rows[r][0] for r in used})
    print(f"cards={len(out)} decks={len(deck_out)}")


def write_limit_md(cards, ported_ids):
    lines = ["# 制限リスト（2011年3月1日施行リスト準拠）", "",
             "禁止＝デッキに入れられない／制限＝1枚まで／準制限＝2枚まで。記載の無いカードは3枚まで。", ""]
    for lim in ("禁止", "制限", "準制限"):
        names = [f"{c['name']}（{c['code']}）" for c in cards if c["limit"] == lim]
        lines += [f"## {lim}（収録済み {len(names)}種）", ""]
        lines += [f"- {n}" for n in names] or ["- なし"]
        lines.append("")
    src = json.load(open(os.path.join(HERE, "lflist_2011_03_ocg.json")))
    rest = [e for e in src if e["id"] not in ported_ids]
    lines += ["## 開発用資料：参照元リストのうち未収録のカード", "",
              f"参照元リストは全{len(src)}種（禁止{sum(e['limit'] == 0 for e in src)}・"
              f"制限{sum(e['limit'] == 1 for e in src)}・準制限{sum(e['limit'] == 2 for e in src)}）。"
              "カードを追加移植した際は、下表の扱いをそのまま引き継ぐ。", "",
              "| 扱い | 参照元カード |", "|---|---|"]
    lines += [f"| {LIMIT[e['limit']]} | {e['ref_ja']} |" for e in rest]
    open(os.path.join(ROOT, "limit_list.md"), "w").write("\n".join(lines) + "\n")


def validate(key, d, by_ref):
    main = sum(n for n, _ in d["main"])
    extra = sum(n for n, _ in d["extra"])
    assert 40 <= main <= 60, (key, main)
    assert extra <= 15, (key, extra)
    counts = {}
    for part in ("main", "extra"):
        for n, r in d[part]:
            counts[r] = counts.get(r, 0) + n
    for r, n in counts.items():
        cap = {"禁止": 0, "制限": 1, "準制限": 2}.get(by_ref[r]["limit"], 3)
        assert n <= cap, f"{key}: {by_ref[r]['name']} {n}枚 > 上限{cap}"
    for n, r in d["main"]:
        assert by_ref[r]["subtype"] not in ("融合", "同調", "重ね"), (key, r)
    for n, r in d["extra"]:
        assert by_ref[r]["subtype"] in ("融合", "同調", "重ね"), (key, r)


def stat_line(c):
    if c["category"] != "モンスター":
        return f"{c['subtype']}{c['category']}"
    t = "・".join([c["subtype"]] + c["tags"])
    star = "ランク" if c["subtype"] == "重ね" else "★"
    return f"{c['attribute']}／{c['race']}／{t}／{star}{c['level']}／攻{c['atk']}・守{c['def_']}"


def write_cards_md(cards):
    lines = ["# カードリスト（1103準拠・第1弾）", "",
             "数値は参照元カードと同一、効果は2011年3月〜8月当時の性能を独自文章で記述。",
             "「制限」欄は rules.md の制限リスト（2011年3月リスト準拠）での扱い。", ""]
    for cat in ("モンスター", "魔法", "罠"):
        lines += [f"## {cat}", ""]
        for c in cards:
            if c["category"] != cat:
                continue
            lim = "" if c["limit"] == "無制限" else f" 【{c['limit']}】"
            lines += [f"### {c['code']} {c['name']}{lim}", "", f"*{stat_line(c)}*", "",
                      c["text"].replace("\n", "  \n"), ""]
    open(os.path.join(ROOT, "cards.md"), "w").write("\n".join(lines))


def write_decklists_md(decks, by_ref):
    meta = json.load(open(os.path.join(HERE, "recipes_meta.json")))
    lines = ["# デッキレシピ（10種・大会入賞レシピ）", "",
             "寒波亭（1103ゲートボール大会）の資料室・公式デッキDBに掲載されたレシピをそのまま使用。カード名は本ゲームの名前に置き換え。",
             "各デッキの解説は decks.md を参照。", ""]
    for key, d in decks.items():
        m = meta.get(key, {})
        main = sum(e["n"] for e in d["main"])
        extra = sum(e["n"] for e in d["extra"])
        lines += [f"## 【{d['name']}】（参照：{d['ref_archetype']}） メイン{main}／エクストラ{extra}", ""]
        src = []
        if m.get("event") or m.get("placing"):
            src.append(f"{m.get('event') or ''} {m.get('placing') or ''}".strip())
        if m.get("player"):
            src.append(f"使用者：{m['player']}")
        if m.get("date"):
            src.append(m["date"])
        lines.append(f"- 出典：{' ／ '.join(src) if src else m.get('title') or ''}（[元ページ]({m.get('source_url')})）")
        if m.get("source", "").startswith("jspeed"):
            lines.append(f"- jspeed氏のブログ「くされにっき」のリスト（{m.get('period')}環境のもの）。" + ("1103で使えないカードの差し替え：" + "、".join(m["changes"]) if m.get("changes") else "差し替えなし（1103のリストそのまま）。"))
        if not m.get("placing_confirmed"):
            lines.append("- 注意：このレシピは寒波亭が公式デッキDBに登録した参考デッキで、ページ上に入賞記録の記載はない。")
        if m.get("uncertain"):
            lines.append(f"- 注意：元画像の解像度が低く、推定で特定したカードを含む：{'、'.join(m['uncertain'])}")
        if m.get("illegible"):
            n = sum(c for part, c in m["illegible"] if part == "main")
            if n:
                lines.append(f"- 注意：元画像で判読できなかったメインの罠{n}枚は除いている（元のメインは{main + n}枚）。")
        lines.append("")
        for label, part in (("メインデッキ", "main"), ("エクストラデッキ", "extra")):
            lines.append(f"**{label}**")
            lines.append("")
            groups = {}
            for e in d[part]:
                c = next(c for c in by_ref.values() if c["code"] == e["code"])
                g = c["category"] if part == "main" else c["subtype"]
                groups.setdefault(g, []).append(f"{c['name']} ×{e['n']}")
            for g, items in groups.items():
                total = sum(int(s.rsplit('×', 1)[1]) for s in items)
                lines.append(f"- {g}（{total}）：" + "、".join(items))
            lines.append("")
        if m.get("side"):
            lines += ["**サイドデッキ（参考・元のカード名）**", "", "- " + "、".join(f"{n}×{c}" for c, n in m["side"]), ""]
    open(os.path.join(ROOT, "decklists.md"), "w").write("\n".join(lines))

if __name__ == "__main__":
    # 引数: 英語カードDB（数値用） [日本語カードDB（実名用）]
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "cards.cdb"), sys.argv[2] if len(sys.argv) > 2 else None)
