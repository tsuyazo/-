"""独自名 → 実際のカード名への置き換え。

カード名は YGOPro の日本語カードDB（mycard/ygopro-database の locales/ja-JP/cards.cdb）から引く。
効果文は本ゲームで書いた2011年当時の性能の文章のまま、中のカード名・テーマ名だけを実名にする。
"""
import sqlite3
import unicodedata

# テーマ（『』で書いた部分）→ 実際のカテゴリ名
ARCHETYPES = {
    "『元素の勇士』": "「E・HERO」", "『勇士』": "「HERO」", "『武士団』": "「六武衆」", "『蒼月』": "「紫炎」",
    "『夜鴉』": "「BF」", "『機巧』": "「カラクリ」", "『試作機』": "「TG」", "『魔窟』": "「暗黒界」",
    "『ハーモン』": "「シンクロン」", "『轟魔』": "「魔轟神」", "『星使』": "「代行者」", "『廃材』": "「スクラップ」",
    "『光道』": "「ライトロード」", "『鉄鎖』": "「C」", "『剣兵』": "「X－セイバー」",
}
# 収録外だが効果文に出てくる名前
EXTRA_NAMES = {
    "ハーモン・ドリル": "ドリル・シンクロン", "ハーモン・ロード": "ロード・シンクロン", "元素の勇士 ノヴァ": "E・HERO ネオス",
    "冥門の残光トークン": "冥府の使者カイエントークン", "分身トークン": "ドッペル・トークン", "綿毛トークン": "綿毛トークン",
    "身代わり羊トークン": "羊トークン", "双頭の恐竜王": "二頭を持つキング・レックス", "爆弾男": "ミスター・ボンバー",
    "磁力兵1号": "マグネッツ１号", "磁力兵2号": "マグネッツ２号", "電脳竜": "サイバー・ドラゴン", "融合": "融合",
}
# 本ゲーム独自の用語 → 遊戯王の用語
TERMS = [("同調召喚", "シンクロ召喚"), ("同調素材", "シンクロ素材"), ("同調モンスター", "シンクロモンスター"), ("同調", "シンクロ"),
         ("重ね召喚", "エクシーズ召喚"), ("重ね素材", "エクシーズ素材"), ("重ねモンスター", "エクシーズモンスター"),
         ("調律以外", "チューナー以外"), ("調律", "チューナー")]


def norm(s):
    return unicodedata.normalize("NFKC", s)


class Renamer:
    def __init__(self, ja_cdb):
        self.db = sqlite3.connect(ja_cdb)
        self.map = {}          # 独自名 → 実名

    def real_name(self, cid):
        r = self.db.execute("select name from texts where id=?", (cid,)).fetchone()
        return norm(r[0]) if r else None

    def add(self, invented, cid):
        real = self.real_name(cid)
        if real:
            self.map[invented] = real
        return real

    def finish(self):
        for k, v in EXTRA_NAMES.items():
            self.map.setdefault(k, norm(v))

    def text(self, s, terms=True):
        # 長い名前から置き換える（「ハーモン・スクラップ」と「スクラップ・ファイター」のような部分一致を避ける）
        for k in sorted(self.map, key=len, reverse=True):
            s = s.replace(f"「{k}」", f"「{self.map[k]}」")
        for k, v in ARCHETYPES.items():
            s = s.replace(k, v)
        if terms:
            for a, b in TERMS:
                s = s.replace(a, b)
        return s
