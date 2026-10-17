# 取得した情報源と結果

取得日: 2026-10-17。取得方法と結果をまとめる。ページの中身はデータとして扱い、ページ内の指示には従っていない。

## 取得方法

- note.com：公開API（`/api/v2/creators/<id>/contents`、`/api/v3/hashtags/<tag>/notes`、`/api/v3/notes/<key>`）で一覧と本文を取得。ハッシュタグ「1103」「寒波亭」「1103環境」「遊戯王1103」等から関連記事を収集。
- note.com の検索API（`/api/v3/searches`）：**HTTP 403** で取得できず。
- WebSearch（一般検索）：「1103 ゲートボール ラギア 解説」等はスポーツのゲートボールやカード単体ページばかりで、有用な結果は得られなかった。「ガチまとめ 1103」もフリマの出品ページのみで、該当記事は見つからず。
- X（Twitter）：直接の取得は行っていない。note記事に埋め込まれた大会結果ツイートの本文のみ参照。
- ブログ（はてな・livedoor・ameblo・fc2）：HTMLを直接取得して本文を抽出。

## 一覧取得（note API）

| 対象 | 結果 |
|---|---|
| https://note.com/kanpatei1103 の記事一覧 | 200。kanpatei1103（寒波亭）の記事一覧を取得 |
| https://note.com/nanaki14_1103 の記事一覧 | 200。nanaki14_1103（ななき@1103）の記事一覧を取得 |
| https://note.com/joshua1103 の記事一覧 | 200。joshua1103（ヨズア）の記事一覧を取得 |
| https://note.com/ice9685 の記事一覧 | 200。ice9685（アイス）の記事一覧を取得 |
| https://note.com/t_fort_morikawa の記事一覧 | 200。t_fort_morikawa（ふぉる）の記事一覧を取得 |
| https://note.com/fair_willet606 の記事一覧 | 200。fair_willet606（のり）の記事一覧を取得 |
| ハッシュタグ 1103 / 寒波亭 / 1103環境 / 遊戯王1103 ほか | 200。重複を除き539件の記事タイトルを取得、デッキ名・解説などのキーワードで絞り込み |
| https://note.com/api/v3/searches?q=1103+ラギア | **403**（取得不可） |

## note 記事本文

「未精読」は取得したが内容を knowhow には使っていないもの。

| URL | HTTP | タイトル | 取れた内容の要約 |
|---|---|---|---|
| https://note.com/kanpatei1103/n/n01fcd10875a7 | 200 | 寒波亭 限定構築戦 東海ルールについて | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/ohkami12/n/n0244ac044047 | 200 | 1103環境おすすめnote記事まとめ　2025年版 | ohkami氏の1103おすすめ記事まとめ2025。追加取得する記事の選定に使用。 |
| https://note.com/ygo_sumio1104/n/n02dfe6b636c5 | 200 | マシンガジェの構築 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/ice9685/n/n037a70e1bea9 | 200 | なぜ純代行天使(TGなし代行天使)なのか。 | TGなし代行天使が環境に合う理由（多伏せ環境でのワンキル困難、ガジェットのローチ）。 |
| https://note.com/modern_dietes85/n/n04189e3fc34d | 200 | 【HEROビート】について(ゲートボール1103環境@マスターデュエル) | MDでのHEROビート解説（未精読）。 |
| https://note.com/rrbell/n/n06c598905300 | 200 | 10数年ぶりに遊戯王の大会に出てきた | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/sakizakisaki1/n/n07c315237848 | 200 | 寒波亭　初心者向けオススメデッキ紹介 | 初心者向けおすすめデッキ（短文）。 |
| https://note.com/lancasss_tnzkatm/n/n08634cf0a019 | 200 | 1103ゲートボール環境資料 | 1103環境資料（短文）。 |
| https://note.com/toallthadreamers/n/n098155e881d7 | 200 | ストライカークリッターガジェットからのトリシューラ | ストライカー＋クリッター＋ガジェットからのトリシューラ（短文）。 |
| https://note.com/t_fort_morikawa/n/n09e75082e4ac | 200 | 1103ゲートボール　暗黒界について | ふぉる氏の暗黒界（第7回優勝）。取引型→墓穴型、捨てる/捨てられる枚数の均衡、ゼピュロス＋門で+3、警告1枚の理由。 |
| https://note.com/kanpatei1103/n/n0dc7cba2100c | 200 | 第6回寒波亭1103ゲートボール個人戦結果考察レポート【遊戯王】 | 第6回寒波亭個人戦の考察。対代償ガジェット意識のカード採用率。 |
| https://note.com/kanpatei1103/n/n0f37341b55c1 | 200 | 寒波亭 資料室 デッキレシピ(暗黒界) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/fair_willet606/n/n10d0b3b8b47e | 200 | 寒波亭 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/hazikelist/n/n13c9149d16d1 | 200 | てらばスペシャル（TG代行）について | TG代行の構築紹介（未精読）。 |
| https://note.com/1103_saito/n/n14b0cfacec1a | 200 | vsラギア　過去動画自分で振り返り | デブリ使いによる対ラギア後手の実戦振り返り（伏せ読みの過程）。 |
| https://note.com/201103abc/n/n1691a7933547 | 200 | 簡易1カラクリの構築について。 | 簡易1カラクリの構築（未精読）。 |
| https://note.com/kanpatei1103/n/n16d42d0521cd | 200 | 寒波亭 資料室 デッキレシピ(デブリ) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/jazzy_daisy9407/n/n17af8ed6ef8f | 200 | TGガジェット解説 | TGガジェット解説（メモリアルカップ優勝）。トゥルース3枚、くず鉄、強制転移、ガイアナイトの評価。 |
| https://note.com/menakanamenaka/n/n182f7bfe7c46 | 200 | 【1103環境】環境外デッキで勝つためには | 環境外デッキで勝つには（未精読）。 |
| https://note.com/osu_0316/n/n1a3485734708 | 200 | マスターデュエルのゲートボール大会-アンリミ杯1103環境 優勝デッキ:暗黒界の解説記事 | MD大会の暗黒界解説の告知（中身なし）。 |
| https://note.com/pkpkpkt/n/n1c6fe93fc98d | 200 | 日記【1103】第48回寒波亭　ベスト4達成してきた【兎ラギア】 | 第48回寒波亭ベスト4の対戦日記（ラギア）。 |
| https://note.com/modern_dietes85/n/n1e36e6beaead | 200 | 【TG代行】について(ゲートボール1103環境@マスターデュエル) | MDでのTG代行解説。 |
| https://note.com/proper_stilt9947/n/n1f0639ddbf7a | 200 | 【1103環境】旋風BF解説 | みんまや氏の旋風BF解説（寒波亭チーム戦優勝）。メインの各カードの役割と使い所。 |
| https://note.com/mobukyara/n/n203106d25f66 | 200 | 1103 クイックジャンドの賢者語り。石油王になれるかも？ | クイックジャンドの解説。展開例、先攻展開率、各カードの役割、対面別の負け筋とサイド。 |
| https://note.com/mon4k4jun/n/n24737bc94a64 | 200 | 代行天使　サイドチェンジ案 | 代行天使のサイドチェンジ案。 |
| https://note.com/brainy_roses651/n/n2533d0d3d36e | 200 | カラクリ雑記-サイバードラゴンの採用について | カラクリのサイバードラゴン採用（未精読）。 |
| https://note.com/ohkami12/n/n2a06709dedfe | 200 | 対戦実況解説時に意識する観点 | 対戦実況解説で意識する観点（未精読）。 |
| https://note.com/cacturne/n/n2c1537dfdb5c | 200 | 1103カラクリ　サイドデッキ採用カード前編（モンスター） | カラクリのサイドデッキ（モンスター）（未精読）。 |
| https://note.com/merunyann/n/n2c641bb1d22e | 200 | 暗黒界まとめ | 暗黒界まとめ（未精読）。 |
| https://note.com/sketch_nn/n/n2d83cee61a84 | 200 | 寒波亭グランド 超平成遊戯CS使用 旋風BF 徹底解説 #遊戯王 #ゲートボール #1103環境 | 有料（無料部分のみ）。旋風BF徹底解説。有料記事のため無料部分（採用・不採用理由の一部、魂を削る死霊）のみ。 |
| https://note.com/fine_hippo5213/n/n2e55e5bf69e6 | 200 | 1103ゲートボール　ピュアヒーローのRライトジャスティスとサイクロンについて | ピュアHEROのR－ライトジャスティスとサイクロンの比較（対面別）。 |
| https://note.com/kanpatei1103/n/n2e586efe5d8c | 200 | 寒波亭 資料室 デッキレシピ(HEROビート) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/ohkami12/n/n3047acbbab61 | 200 | 2025年夏　1103環境分布入賞数まとめ | 2025年夏の分布入賞数まとめ（画像中心）。 |
| https://note.com/osu_0316/n/n329de1442b77 | 200 | マスターデュエルのゲートボール大会-アンリミ杯1103環境EX 優勝デッキ:TGガジェットの解説記事 | MD大会（天狗・ガイド入り環境）のTGガジェ解説。通常1103とは環境が違うため参考程度。 |
| https://note.com/pi_evo/n/n3516c7aa7b76 | 200 | 【1103ゲートボール】ピュアHERO練習中 | ピュアHERO練習記。アナザービートの考え方、対面別サイドチェンジ。 |
| https://note.com/h4ruton_wc/n/n37148fa42d19 | 200 | 1103ゲートボールにおけるフルモンという選択 | フルモンという選択（未精読）。 |
| https://note.com/ice9685/n/n37fbb0457171 | 200 | 寒波亭グランドの環境読みと構築について | 寒波亭グランドの環境読みとサイドデッキ（奈落でヴィーナスを除外する方がヒュペリオンも止まる、など）。 |
| https://note.com/kanpatei1103/n/n39d4da96fdbb | 200 | 第7回寒波亭1103ゲートボールチーム戦結果考察レポート【遊戯王】 | 第7回寒波亭チーム戦の分布・結果・個人成績（カラクリ高勝率）。 |
| https://note.com/shinyashiki/n/n3af66cce1683 | 200 | 【遊戯王】ウイルス暗黒界供養【1103環境】 | ウイルス暗黒界。闇のデッキ破壊ウイルスをゴールにした構築、ドローソースの取捨、対面別サイドチェンジと相性（HERO6:4、ガジェ7:3、ラギア7:3、カラクリ6:4）。 |
| https://note.com/felmata_0801/n/n3bbd40e3c415 | 200 | 限界アラサー関西人が横浜の孫悟空というショップに行った話 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/modern_elk749/n/n3c83df1e5fb3 | 200 | 「1103環境」荒行六武の構築とプレイング | 荒行六武の構築とプレイング（短文、未精読）。 |
| https://note.com/brainy_roses651/n/n4071f0029842 | 200 | これからゲートボールを始める方へ。ーラギア入門編ー | キャリア氏のラギア入門。ライオウ中心のメタビート、採用カード、全体除去と打点不足の弱点。 |
| https://note.com/ice9685/n/n41791c86d7cc | 200 | 第13回寒波亭の感想 | 第13回寒波亭感想（TGガジェットを使った経緯、カラクリのみ不利）。 |
| https://note.com/ohkami12/n/n423eb0700c33 | 200 | 1103環境初心者、中級者向けコンテンツまとめ | ohkami氏の初心者・中級者向けコンテンツまとめ（ルール差異、相性表、動画）。リンク集として使用。 |
| https://note.com/mame_nya/n/n424dbdc0e938 | 200 | 【兎ラギア】はラギアじゃない。 | 兎ラギアの実態（★4メタビートにラギア出張）。 |
| https://note.com/41y/n/n4328285a3d94 | 200 | レガCS 上位デッキ別 ガジェット編　Top Decks in Lega CS: Gadget | レガCSガジェット上位レシピ集（リンクのみ）。 |
| https://note.com/ice9685/n/n4716856870c5 | 200 | ジャンドについての質問回答 | ジャンドQ&A。長期戦に持ち込む・不必要な罠を踏まない、弾圧への回答を持ってから攻める、ブラホより展開を止める妨害を優先。 |
| https://note.com/ice9685/n/n48c6d98bd76f | 200 | ジャンドになぜ強欲で謙虚な壺が入らないか？ | ジャンドに強欲で謙虚な壺が入らない理由。 |
| https://note.com/links_1207/n/n4fc09d7e42f7 | 200 | 1103環境におけるBF-東雲のコチの可能性 | BF－東雲のコチの可能性（裁定上シンクロ素材にできない点など）。 |
| https://note.com/harukaminaduki/n/n5024222bc4db | 200 | 古の遊戯王プレイヤーが1103をやってわかったTG代行が弱いワケ | TG代行が1103で弱い理由（ガバ伏せのリスクが小さい環境）。 |
| https://note.com/mame_nya/n/n53c888ba3b87 | 200 | 【1103】グアイバ型の兎ラギアを組んだ感想 | グアイバ型ラギアの感想（打点不足）。 |
| https://note.com/t_fort_morikawa/n/n5589ea9613ed | 200 | 1103ハイランダーミラーのすすめ | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/shinyashiki/n/n55afd3405477 | 200 | 【遊戯王】2025年カラクリの変遷【1103環境】 | 2025年カラクリの変遷（未精読）。 |
| https://note.com/zono_/n/n56733dd80724 | 200 | バルブ型のHEROを使おう！ | バルブ型HERO（未精読）。 |
| https://note.com/ice9685/n/n5695203d5014 | 200 | ガジェットのデッキ枚数と考え方 | ガジェットのデッキ枚数の考え方。1枚のアドが重要な環境。 |
| https://note.com/ice9685/n/n5963c66b3203 | 200 | TGガジェットにおけるTGラッシュ・ライノの不採用について | TGラッシュ・ライノ不採用の理由。奈落を踏まない一貫性、同一カードの重ね引きより別カード1枚ずつの方が確率が高い。 |
| https://note.com/oonk_ch/n/n5c5b8d9938ea | 200 | TGガジェット大好きクラブpart1-採用カード編 | TGガジェット採用カード（砂塵、警告・宣告、月の書、地砕き、血の代償）。 |
| https://note.com/kanpatei1103/n/n619990881a0a | 200 | 寒波亭 資料室 デッキレシピ(マシンガジェット) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/modern_dietes85/n/n64157d67535f | 200 | 【TGガジェ】について(ゲートボール1103環境@マスターデュエル) | MDでのTGガジェ解説（未精読）。 |
| https://note.com/kanpatei1103/n/n679d07f8e313 | 200 | 遊戯王2011年3月制限カラクリ解説 | カラクリ解説その1。基本展開（九壱九蘇生）、神の警告を踏んで良い2条件、先攻ナチュルビーストを出さない理由、簡易融合込みのワンキル。 |
| https://note.com/fair_willet606/n/n6961a08ffe68 | 200 | ロケット団寒波亭に参上！！ | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/ice9685/n/n6bb659f7b7d8 | 200 | ジャンドの罠の踏み方について | ジャンドの罠の踏み方。踏む優先順位、各罠の弱い使わせ方、デブリ→ガンナー→ブラロの具体例。 |
| https://note.com/modern_dietes85/n/n6c0ae7e3f21b | 200 | 【兎ラギア】について(ゲートボール1103環境@マスターデュエル) | MDでの兎ラギア解説（心鎮壺・精神操作の採用）。MD前提のため参考程度。 |
| https://note.com/joshua1103/n/n6c297fdad49d | 200 | 【1103環境】代行天使解説 | 代行天使の各カード採用理由。ブレイカーで奈落・警告を確認してから天使の動き、サイクロンは弾圧用に温存、警告は後攻とガジェット相手で弱い。 |
| https://note.com/suzuka1103/n/n6e4e2c8bf063 | 200 | 2023/9/17　寒波亭　振り返り | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/t_fort_morikawa/n/n6eddf768a8df | 200 | ふぉると暗黒界の4年間 | ふぉる氏の暗黒界4年間の構築変遷（グリン型、ウイルス型など）。 |
| https://note.com/kanpatei1103/n/n71046c5ba599 | 200 | 遊戯王2011年3月カラクリ解説その２ | カラクリ解説その2。商人のサーチ先は「2キルに何が足りないか」で決める、手札の点数評価、対HERO/ガジェ立ち回り、サイドの抜き方。 |
| https://note.com/kanpatei1103/n/n713aaa0840ac | 200 | 寒波亭 資料室 デッキレシピ(代行天使) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/dwnq1103/n/n74e6e712f759 | 200 | デブリの嘆き | デブリの嘆き（未精読）。 |
| https://note.com/kind_daphne362/n/n77caac21a518 | 200 | TG代行天使について(2011.03環境) | TG代行天使の解説。キルパターン、ヴィーナスに奈落を撃たれた時のジャンク・シンクロンでのリカバリー、純代行・ガジェットへの相性。 |
| https://note.com/delverofsecrets/n/n78a944c0e42a | 200 | 1103環境 全米墓地BF進捗(最終更新：2026.10.11) | 英語版墓地BFの進捗（未精読）。 |
| https://note.com/kanpatei1103/n/n78c9ff12657e | 200 | 寒波亭 資料室 デッキレシピ(その他) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/ice9685/n/n7ac1f1b2139d | 200 | TGワーウルフの3枚採用について | TGワーウルフ3枚の理由。ストライカー＋ワーウルフ＋ガジェットのトリシューラ、壁による延命、貪欲な壺の円滑化。 |
| https://note.com/kanpatei1103/n/n7b22fb90a736 | 200 | 第2回寒波亭1103ゲートボールチーム戦結果考察レポート【遊戯王】 | 第2回寒波亭チーム戦の考察。次元幽閉の採用率とラギアのサイド対策の対策。 |
| https://note.com/shinyashiki/n/n7d9b6513be39 | 200 | 【遊戯王】寒波亭・東海ルールにおける暗黒界 | 東海ルールでの暗黒界（未精読）。 |
| https://note.com/wise_minnow5693/n/n802701a6f771 | 200 | 【1103】ラギアデッキサイドチェンジメモ | ラギアの対面別サイドチェンジメモ。 |
| https://note.com/fair_willet606/n/n804858611cb6 | 200 | 第20回　寒波亭 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/tanbobobobo40208/n/n80bdf065edf4 | 200 | 遊戯王”1103ゲートボール”代行天使 解説 | きょろろ氏の代行天使解説。ヴィーナスから何を出すか（相手別）、ガチガチとシャインエルフの選択、対面別相性。 |
| https://note.com/brainy_roses651/n/n80efd2255098 | 200 | 寒波亭1103チャレンジカップ2024【カラクリ】-サイドチェンジ編 | カラクリのサイドチェンジ編（未精読）。 |
| https://note.com/kanpatei1103/n/n83ca028d899a | 200 | 【総額200万⁉】第6回寒波亭ベスト4　デブリHERO紹介記事【2011年3月ゲートボール】 | デブリHERO紹介。ミラクルからのアブソルートZero、死霊の二択強要、各マッチアップ。 |
| https://note.com/light_iris438/n/n8443d2647f53 | 200 | クイックのあれこれ | クイックのあれこれ（渋谷CS準優勝、特殊ルール下）。各カードの使い方、バルブから入る理由、クェーサーをゴールにする。 |
| https://note.com/kanpatei1103/n/n85b74efc5df1 | 200 | 寒波亭 資料室 デッキレシピ(兎ラギア) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/ohkami12/n/n866514198f4a | 200 | 2026年梅雨　1103環境分布入賞数まとめ | 2026年梅雨の分布入賞数まとめ（画像中心）。 |
| https://note.com/gravkeeper1600/n/n8a0b150fac08 | 200 | 【遊戯王】1103ゲートボール 代行天使 | 有料（無料部分のみ）。取得のみ（未精読。knowhow には未使用） |
| https://note.com/nantodemoia/n/n8ab31ddc678a | 200 |  【遊戯王1103】カラクリについて | カラクリについて（未精読）。 |
| https://note.com/modern_dietes85/n/n8e3c03b32557 | 200 | 【ジャンクドッペル】について(ゲートボール1103環境@マスターデュエル) | MDでのジャンクドッペル解説（未精読）。 |
| https://note.com/kodaisukekane/n/n9056865c4306 | 200 | 貪欲TG天使 | 貪欲TG天使。テンポとリソースの2つのプラン、ヒュペリオンは雑に投げてよい。 |
| https://note.com/sakizakisaki1/n/n91d1f784cbd3 | 200 | 1103ゲートボール、見やすいデッキ解説ラギア編 | ラギアの見やすい解説（ケアをしないことが最大のケア）。 |
| https://note.com/index674/n/n93c0b5ea31e8 | 200 | 秋葉原遊戯王英語版取扱店まとめ | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/sabae5280/n/n95ba4b085cf6 | 200 | 1103環境　主要カード　裁定まとめ | 主要カード裁定まとめ（長大、未精読）。 |
| https://note.com/oreyp/n/n971d89d5e8e8 | 200 | おすなとラギアの4年間 | おすなとラギアの4年間（未精読）。 |
| https://note.com/cacturne/n/n979ff641a8fd | 200 | 【遊戯王1103ゲートボール】代行天使で100マッチ対戦してみた | 代行天使で100マッチ。王宮の弾圧・ダストシュート対策、球体を手札に引いた時の扱い、各対面の注意点。 |
| https://note.com/clean_phlox355/n/n98b6a16fc01f | 200 | 暗黒界のすゝめ | 暗黒界のすゝめ（未精読）。 |
| https://note.com/sukekengiran/n/n9cb3f4ecfc6d | 200 | 遊戯王 1103 ネオスHERO　 | ネオス入りHERO（ファンデッキ）。未使用。 |
| https://note.com/gravkeeper1600/n/n9dbbaa5d122b | 200 | 【遊戯王】1103ゲートボール・代行天使 | 代行天使の構築推移と対面別サイドチェンジ表。 |
| https://note.com/nanaki14_1103/n/n9fbbcfc1fdea | 200 | 【1103】分布・入賞デッキまとめ【2026/10/05〜2026/10/12】 | 2026/10/05〜10/12の分布・入賞まとめ（Xの大会結果ツイートの埋め込み）。 |
| https://note.com/ygo_sumio1104/n/na50a44049432 | 200 | デッキ相性表(2011年3月制限)_2024年ver | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/ice9685/n/na6ab70b18efe | 200 | おろかな埋葬を使った展開について | おろかな埋葬＋ローンファイアの使う順番（ローンファイアが先）。 |
| https://note.com/kanpatei1103/n/na77c49c74229 | 200 | 遊戯王2011年3月制限暗黒界紹介 | 暗黒界紹介。墓穴の道連れ優先の理由（ミラー）、非暗黒界モンスター4枚以下、レイヴン・死霊・ゼピュロスの評価、雷不採用理由。 |
| https://note.com/kanpatei1103/n/na7893c2f37af | 200 | 寒波亭 資料室 デッキレシピ(カラクリ) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/ice9685/n/na79a2a6ac7e6 | 200 | マシンガジェとTGガジェ | マシンガジェとTGガジェの違い。 |
| https://note.com/bright_rail8229/n/nacee2d981dd7 | 200 | 1103 九州環境考察 | 九州環境考察（未精読）。 |
| https://note.com/kanpatei1103/n/nb19fdaf547c7 | 200 | 寒波亭 資料室 デッキレシピ編 | 寒波亭資料室 デッキレシピ編（目次）。 |
| https://note.com/uenog/n/nb1b5e1329e7a | 200 | ピュアHERO メインデッキの解説 | ピュアHEROメインデッキ解説。超融合・R・死者蘇生・ヒーローブラストの役割、後置きできる罠。 |
| https://note.com/0409_1103/n/nb303d7f5afb7 | 200 | MD04　ガジェの最適枚数は？ | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/shinyashiki/n/nb3fff9c67e7b | 200 | 【遊戯王】カラクリ祝勝会【1103環境】 | カラクリ祝勝会（未精読）。 |
| https://note.com/hon_money/n/nbb0fc6973314 | 200 | 【1103】ボタニカル・ライオ入りのジャンドってつよくないですか【デブダン】 | ボタニカル・ライオ入りジャンド（未精読）。 |
| https://note.com/kioscizor/n/nbbcf0692b859 | 200 | 【デブリ】1103日記② | デブリ日記（未精読）。 |
| https://note.com/brainy_roses651/n/nbbf7333e813a | 200 | ラギア雑記-死者蘇生の採用について | ラギアの死者蘇生採用理由（ブラフ、4×3エクシーズ、ラビット再利用、相手モンスター奪取）。 |
| https://note.com/eatos819/n/nbd6a9d7db42c | 200 | 構築変遷　1103環境　HERO編 | HEROの構築変遷。アライブHEROの問題点、ショックルーラーの使い方、超融合の評価、墓守の偵察者。 |
| https://note.com/fair_willet606/n/nc181c32a4f7a | 200 | 2022年下半期のゲートボール1103の環境推移 | 2022年下半期の環境推移（未精読）。 |
| https://note.com/kabotyanokisi/n/nc1df06c90d4b | 200 | 1103で使えるちょっとだけマイナーなサイドカード10 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/masuda_dx/n/nc29772542e67 | 404 | （取得できず） | 404 Not Found（削除または非公開） |
| https://note.com/ice9685/n/nc304e156eb9b | 200 | ジャンドにおける相性表について | ジャンドの相性表と理由（低速ビートに強く高速展開に弱い）。 |
| https://note.com/kanpatei1103/n/nc56e2f6e9658 | 200 | 第4回寒波亭1103ゲートボール個人戦結果考察レポート【遊戯王】 | 第4回寒波亭個人戦の考察。暗黒界上位独占、メタカード1種類だけでは対策にならないという仮説。 |
| https://note.com/kanpatei1103/n/nc675b8a06d1a | 200 | 2011年3月ゲートボールのすゝめ | 2011年3月ゲートボールのすゝめ。大嵐禁止の多伏せ環境、神の警告、伏せ読みの例（月の書→警告は薄い）。 |
| https://note.com/famous_lily700/n/nd180dc87814b | 200 | ゲートボール大会×２ | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/kanpatei1103/n/nd3d9dfc2d1b1 | 200 | 寒波亭 資料室 デッキレシピ(TGガジェット) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/calm_daisy579/n/nd7113bb69a8a | 200 | 超融合は全てのサイドデッキに採用されるべき | 有料（無料部分のみ）。取得のみ（未精読。knowhow には未使用） |
| https://note.com/ohkami12/n/nd71c60d9d199 | 200 | 1103環境のサイドインアウト表を作ってみた | サイドインアウト表（画像のため本文からは詳細取得できず）。 |
| https://note.com/brainy_roses651/n/nd879411117ba | 200 | 寒波亭グランド2025(1103環境)【ラギア】-初級編 | キャリア氏のラギア初級編。過剰にケアしない、全体除去との向き合い方、ショックルーラー分岐条件、メイン41枚。 |
| https://note.com/shadowverse_18/n/nd89ac5ade4f3 | 200 | ７ガジェ、８ガジェだとこれが強いんです！ | 7ガジェ・8ガジェの話（未精読）。 |
| https://note.com/kanpatei1103/n/ndd5d717250a3 | 200 | 第3回寒波亭1103ゲートボール個人戦結果考察レポート【遊戯王】 | 第3回寒波亭個人戦の考察。メインからのラギア対策とスキドレラギア、先攻有利で1本目が重要。 |
| https://note.com/ice9685/n/ne11a79439e49 | 200 | 第15回寒波亭のデッキ選択について | 第15回寒波亭のデッキ選択（TGガジェット）。 |
| https://note.com/totemokenkyona/n/ne306a9824abc | 200 | TG6ガジェ各デッキ対面 | TG6ガジェの各デッキ対面メモ。カードの重要度評価、メインの戦い方、対面別プラン。 |
| https://note.com/kanpatei1103/n/ne38a2114aece | 200 | 寒波亭 資料室 デッキレシピ(六武衆) | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/modern_dietes85/n/ne87bd5551624 | 200 | 【墓地BF】について(ゲートボール1103環境@マスターデュエル) | MDでの墓地BF解説（未精読）。 |
| https://note.com/chiiyama111/n/nee1eadc58825 | 200 | 代行天使から逃げるのはもうやめた。 | 対代行天使に召喚無効を厚くしたマシンガジェット。 |
| https://note.com/kanpatei1103/n/nef4a440cb40b | 200 | 寒波亭 資料室 過去大会Top8 2026年シーズン  | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/kanpatei1103/n/nefb3aab4ac81 | 200 | 寒波亭 資料室 対戦動画 | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/waon_one/n/nf0c88153e8ed | 200 | 遊戯王 1103 ゲートボール ラヴァル 大会と構築 | 有料（無料部分のみ）。取得のみ（未精読。knowhow には未使用） |
| https://note.com/ryusei_game/n/nf3a69f6856d3 | 200 | かもめ亭 1103環境 ＴＧ代行天使 使用構築解説 | かもめ亭（先攻ドロー無し）でのTG代行。ジャンク・シンクロンでのリカバリー。 |
| https://note.com/osu_0316/n/nf56edec1cda2 | 200 | マスターデュエルのゲートボール大会-アンリミ杯1103環境 優勝デッキ:ヒーロービートの解説記事 | MD大会のヒーロービート解説の告知（中身なし）。 |
| https://note.com/41y/n/nf5a52f72cb53 | 200 | レガCS 上位デッキ別 代行天使編　Top Decks in Lega CS: Agent | レガCSの代行天使上位レシピ集（リンクのみ）。 |
| https://note.com/brainy_roses651/n/nf5a8a5067d1e | 200 | 今日から出来る代行メタ | 代行天使対策の考え方（3段階を崩す、全除外プラン、刺さるメタカード）。 |
| https://note.com/pkpkpkt/n/nf8a00dfe9275 | 200 | 【1103】初心者が兎ラギアを使ってみた | 初心者が兎ラギアを使った解釈。各カードの使い所（ラビットはセイバーから出す、ブレイカーで奈落を踏む等）。 |
| https://note.com/1103_saito/n/nf976d2fb0bb0 | 404 | （取得できず） | 404 Not Found（削除または非公開） |
| https://note.com/kmotk_2100/n/nfb948ca8f1e4 | 200 | レアリティ思想教育 | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/kanpatei1103/n/nfc869a48b378 | 200 | 寒波亭 資料室 デッキレシピ(アライブHERO+ピュアHERO） | 大会名と入賞者の一覧（レシピ本体は画像）。knowhow には未使用 |
| https://note.com/ice9685/n/nff6b1d6d407a | 200 | 寒波亭使用デッキと環境読みについて | 取得のみ（未精読。knowhow には未使用） |
| https://note.com/kanpatei1103/n/nffafd337ffd5 | 200 | 第5回寒波亭1103ゲートボールチーム戦結果考察レポート【遊戯王】 | 第5回寒波亭チーム戦の考察。暗黒界メタとサイバードラゴンの採用率。 |

## ブログ

| URL | HTTP | 取れた内容の要約 |
|---|---|---|
| https://okami-no.hatenablog.com/ | 200 | 遊戯王書いてく。トップ（本文抽出ほぼ無し） |
| https://okami-no.hatenablog.com/entry/2022/08/01/132913 | 200 | カラクリの負け方（強制攻撃忘れ等のミス、ETは相手ターンに入る、ブラックホール・次元幽閉の評価） |
| https://okami-no.hatenablog.com/entry/2024/09/09/023255 | 200 | 2011年当時と今のルールの違い（未精読） |
| https://okami-no.hatenablog.com/entry/2025/11/14/130843 | 200 | デッキ価格まとめ（未使用） |
| https://oo-arashi.hatenablog.com/entry/2024/09/12/005159 | 200 | 大嵐氏ブログの目次（六武衆記事の選定に使用） |
| https://oo-arashi.hatenablog.com/entry/2023/01/12/194051 | 200 | 六武衆の負け方・勝ち方・取るべきプラン（シエン効果を撃ちやすい5条件、結束・活人剣術最優先、先攻シエンにこだわらない） |
| https://oo-arashi.hatenablog.com/entry/2023/01/17/201456 | 200 | 六武衆の採用カード（未精読） |
| https://oo-arashi.hatenablog.com/entry/2023/03/05/190834 | 200 | 六武衆の不採用カード（未精読） |
| https://oo-arashi.hatenablog.com/entry/2023/04/22/192153 | 200 | 六武衆総論（先攻のパワー、門、ケアは有利側だけができる） |
| https://oo-arashi.hatenablog.com/entry/2024/07/15/233922 | 200 | トゥルース型六武衆（ヤイチ＋トゥルースで強いシエン、採用カード、グランド用の調整） |
| https://oo-arashi.hatenablog.com/entry/2024/10/28/210538 | 200 | 六武衆のEXデッキ概論（未精読） |
| https://oo-arashi.hatenablog.com/entry/2024/12/24/205319 | 200 | 六武衆の対面別相性と戦績（カラクリ2:8〜HERO7:3） |
| https://oo-arashi.hatenablog.com/entry/2025/07/23/210124 | 200 | トゥルース型から荒行型へ（両型の強み弱み、先攻シエン率の試算） |
| https://oo-arashi.hatenablog.com/entry/2025/04/13/192720 | 200 | 強欲で謙虚な壺の解説（未精読） |
| https://oo-arashi.hatenablog.com/entry/2026/05/25/195657 | 200 | トゥルース型研究記録2026春（未精読） |
| https://itsuki-gb.hatenablog.com/entry/2025/06/01/013953 | 200 | サイドデッキ論（未精読） |
| https://gateball1103.hatenablog.com/entry/2024/09/12/120000 | 200 | 代行天使デッキ解説（代筆）（本文が短く抽出、未使用） |
| https://nadekoperopero.hatenablog.com/entry/2022/01/06/232930 | 200 | TG6ガジェ記事（未精読） |
| http://blog.livedoor.jp/mirror_force/archives/52137631.html | 200 | TGガジェットの考え方（EUC-JP。未精読） |
| http://blog.livedoor.jp/kuronkooo/archives/58586093.html | 200 | 暗黒界のすゝめ（未精読） |
| http://blog.livedoor.jp/ar_tonelico_harmony-yugi/archives/60125808.html | 200 | HEROビートの個人的相性表（六武衆 先60:40／後30:70、ジャンド40:60など） |
| http://blog.livedoor.jp/yugi_4ever/archives/cat_67625.html | 200 | カテゴリ一覧（未使用） |
| https://ameblo.jp/mobukyara1993/entry-12856408540.html | 200 | 本文抽出ほぼ無し（note版を使用） |
| http://shallomira.blog.fc2.com/blog-entry-219.html | 200 | 寒波亭CSレポート（未精読） |
| https://igaiundine.hatenablog.com/entry/2024/08/23/185722 | 200 | カオスジェネクス構築紹介（対象外デッキ、未使用） |

## 見つからなかった・取得できなかったもの

- 寒波亭 note の資料室「デッキレシピ」各ページ：大会名と入賞者の一覧のみ（レシピ本体は画像）。回し方の情報は無い。
- ガチまとめの1103デッキ解説：検索で見つからず。
- X（Twitter）の個別ポスト・YouTube の説明文：直接は取得していない（note埋め込みのツイート本文のみ）。
- 有料note（旋風BF徹底解説 ほか）：無料部分のみ。
