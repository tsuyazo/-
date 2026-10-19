// デュエルエンジン層：ocgcore（EDOProのコア）を動かし、メッセージを日本語ログと盤面状態に変換する。
// DOMには依存しない（Nodeのテストからも使う）。
import createCore, {
  OcgDuelMode, OcgLocation as L, OcgPosition as POS, OcgMessageType as M,
  OcgResponseType as R, OcgQueryFlags as Q, OcgProcessResult as PR, OcgHintType as HT,
} from 'ocgcore-wasm';
import { aiRespond } from './ai.js';
import { aiRespond as aiSimple } from './ai_baseline.js';

export { L, POS, M, R };

export const PHASE_NAME = { 1: 'ドロー', 2: 'スタンバイ', 4: 'メイン1', 8: 'バトル', 16: 'バトル', 32: 'バトル', 64: 'バトル', 128: 'バトル', 256: 'メイン2', 512: 'エンド' };

// システム文言（EDOPro strings.conf の番号）→ 日本語
const SYS = {
  2: '特殊召喚', 3: '反転召喚', 7: '発動', 10: 'カウンターを取り除く', 11: 'LPを払う', 12: '素材を取り除く',
  30: '攻撃が巻き戻りました。攻撃を続けますか？', 31: '直接攻撃しますか？', 90: 'リリースなしで通常召喚しますか？',
  91: '追加の通常召喚を使いますか？', 92: '相手のモンスターを使いますか？', 93: '素材の選択を続けますか？',
  94: '今この効果を発動しますか？', 95: '「%ls」の効果を使いますか？', 96: '「%ls」の効果で破壊を回避しますか？',
  97: '「%ls」を魔法・罠ゾーンに置きますか？', 98: 'コストを代わりに払う効果を使いますか？', 99: '汎用の効果で発動',
  500: 'リリースするカードを選択', 501: '捨てるカードを選択', 502: '破壊するカードを選択', 503: '除外するカードを選択',
  504: '墓地へ送るカードを選択', 505: '手札に戻すカードを選択', 506: '手札に加えるカードを選択', 507: 'デッキに戻すカードを選択',
  508: '通常召喚するカードを選択', 509: '特殊召喚するカードを選択', 510: 'セットするカードを選択', 511: '融合素材を選択',
  512: 'シンクロ素材を選択', 513: 'エクシーズ素材を選択', 514: '表側表示のカードを選択', 515: '裏側表示のカードを選択',
  516: '攻撃表示モンスターを選択', 517: '守備表示モンスターを選択', 518: '装備するカードを選択', 519: '取り除くエクシーズ素材を選択',
  520: 'コントロールを移すモンスターを選択', 521: '入れ替えるカードを選択', 522: '表側攻撃表示モンスターを選択',
  523: '表側守備表示モンスターを選択', 524: '裏側攻撃表示モンスターを選択', 525: '裏側守備表示モンスターを選択',
  526: '公開するカードを選択', 527: 'フィールドに出すカードを選択', 528: '表示形式を変更するモンスターを選択',
  529: '自分のカードを選択', 530: '相手のカードを選択', 531: 'アドバンス召喚のリリースを選択', 532: 'エクシーズ素材を取り除くモンスターを選択',
  534: 'フィールドに残すカードを選択', 549: '攻撃対象を選択', 550: '発動する効果を選択', 551: '効果の対象を選択',
  552: 'コインの表裏を選択', 553: 'サイコロの目を選択', 554: 'カードの種類を宣言', 555: 'オプションを選択',
  556: '適用する効果を選択', 560: '選択', 561: '表示形式を選択', 562: '属性を宣言', 563: '種族を宣言', 564: 'カード名を宣言',
  565: '数字を宣言', 566: '発動する効果を選択', 567: 'レベル／ランクを宣言', 568: '処理するカードを選択',
  569: '「%ls」を置くゾーンを選択', 570: '使用不能にするゾーンを選択', 571: '移動先のゾーンを選択', 572: 'カウンターを置くカードを選択',
  573: '手札に加える', 574: '墓地へ送る', 575: '効果を無効にするカードを選択', 576: '攻守を変更するカードを選択',
  577: '効果を適用するカードを選択', 578: '素材として重ねるカードを選択', 579: '墓地に戻すカードを選択',
  1150: '発動', 1151: '通常召喚', 1152: '特殊召喚', 1153: 'セット', 1154: '反転召喚', 1155: '守備表示にする',
  1156: '攻撃表示にする', 1157: '攻撃', 1159: '魔法・罠をセット', 1161: '効果を処理', 1162: '効果をリセット',
  1170: '融合召喚', 1172: 'シンクロ召喚', 1173: 'エクシーズ召喚',
};
const TOKEN_NAMES = { 15341822: '綿毛トークン', 15341823: '綿毛トークン', 53855410: 'ドッペル・トークン', 53855411: 'ドッペル・トークン',
  44330099: '冥府の使者カイエントークン', 73915052: '羊トークン', 73915053: '羊トークン', 73915054: '羊トークン', 73915055: '羊トークン' };
const LOC_NAME = { 1: 'デッキ', 2: '手札', 4: 'モンスターゾーン', 8: '魔法・罠ゾーン', 16: '墓地', 32: '除外', 64: 'エクストラデッキ', 128: 'エクシーズ素材', 256: 'フィールドゾーン' };
// Q.TYPE は 0.1.2 のパーサーで手札・EXの読み取りに失敗するため使わない（種類はカードデータから引く）
const QFLAGS = Q.CODE | Q.POSITION | Q.LEVEL | Q.RANK | Q.ATTACK | Q.DEFENSE | Q.BASE_ATTACK | Q.BASE_DEFENSE
  | Q.OVERLAY_CARD | Q.COUNTERS | Q.OWNER | Q.IS_PUBLIC | Q.ATTRIBUTE | Q.RACE;
// これらが起きた後は、チェーン確認「要所のみ」でも人間に発動の機会を聞く
// （召喚は「召喚する時」と「召喚に成功した時」の2回、戦闘は攻撃宣言とダメージステップ）
// 以前の設定名（保存データ）との対応
const CHAIN_MODE_ALIAS = { events: 'auto', always: 'on' };
const EVENT_TYPES = new Set([M.CHAINING, M.CHAIN_END, M.SUMMONING, M.SPSUMMONING, M.FLIPSUMMONING,
  M.SUMMONED, M.SPSUMMONED, M.FLIPSUMMONED, M.ATTACK, M.BATTLE, M.DAMAGE_STEP_START]);

export function locName(l) { return LOC_NAME[l] || ''; }

function setcodes(v) { v = BigInt(v); const a = []; while (v > 0n) { const s = Number(v & 0xffffn); if (s) a.push(s); v >>= 16n; } return a; }

export class GameData {
  constructor(raw) {
    this.raw = raw;
    this.byId = {};                         // 本ゲームのカード情報（id → card）
    raw.cards.forEach(c => { this.byId[c.id] = c; });
    this.engine = {};                       // エンジン用の数値（id → OcgCardData）
    for (const [id, v] of Object.entries(raw.cardData)) {
      const [code, alias, sc, type, atk, def, level, race, attr] = v.row;
      this.engine[id] = { code, alias, setcodes: setcodes(sc), type, level: level & 0xff, attribute: attr, race: BigInt(race),
        attack: atk, defense: def, lscale: 0, rscale: 0, link_marker: 0 };
    }
  }
  name(code) { return this.byId[code]?.name || TOKEN_NAMES[code] || (code ? 'カード' : '裏側のカード'); }
  card(code) { return this.byId[code]; }
  eng(code) { return this.engine[code]; }
  desc(d) {
    if (d == null) return '';
    d = BigInt(d);
    if (d < 10000n) return (SYS[Number(d)] || '効果').replace('%ls', '');
    const code = Number(d >> 20n), idx = Number(d & 0xfffffn);   // aux.Stringid(id,n) = id<<20 | n
    const known = this.raw.effectStrings[`${code}:${idx}`];
    if (known) return known;
    const c = this.byId[code];
    if (c && c.category !== 'モンスター') return '発動';
    return `「${this.name(code)}」の効果${idx + 1}`;
  }
  hint(h) {
    if (h == null) return '';
    h = BigInt(h);
    if (h < 10000n) return SYS[Number(h)] || '';
    return this.desc(h);
  }
}

// エンジンのメモリ（WebAssembly.Memory）も捕まえておく。CPUの先読みで局面を丸ごと保存・復元するのに使う
export async function loadCore() {
  let memory = null;
  const W = WebAssembly, orig = W.instantiate, origS = W.instantiateStreaming;
  const grab = r => { const inst = r.instance || r; for (const v of Object.values(inst.exports || {})) if (v instanceof W.Memory) memory = v; return r; };
  W.instantiate = (...a) => orig.apply(W, a).then(grab);
  if (origS) W.instantiateStreaming = (...a) => origS.apply(W, a).then(grab);
  try {
    const lib = await createCore({ sync: true });
    lib.memory = memory;
    return lib;
  } finally {
    W.instantiate = orig;
    if (origS) W.instantiateStreaming = origS;
  }
}

export class Duel {
  // opts: { decks:[key,key], ai:[bool,bool], names:[str,str], seed:[4 bigint as string], responses:[] }
  constructor(lib, data, opts) {
    this.lib = lib; this.data = data; this.opts = opts;
    this.ai = opts.ai; this.names = opts.names;
    this.lp = [8000, 8000]; this.turn = 0; this.turnPlayer = 0; this.phase = 1;
    this.nsUsed = false;                     // このターンの通常召喚（セット含む）を使ったか
    this.uiEvents = [];                      // 画面の演出用（ターン交代・フェイズ・行動）
    this.log = []; this.chain = []; this.win = null; this.req = null; this.lastReq = null;
    this.hintMsg = [null, null]; this.retry = 0;
    // プレイヤーごとに「自分が最後に応答してから起きた出来事」。相手の応答では消さない
    this.events = [new Set(), new Set()];
    this.history = []; this.errors = []; this.reveal = null;
    // 人間のチェーン確認のタイミング（マスターデュエルと同じ3段階）
    //  'auto'：相手が発動・召喚・攻撃した時だけ止まる / 'on'：発動できる場面では毎回止まる / 'off'：強制効果以外は止まらない
    this.chainMode = 'auto';
    this.stopRequest = false;                // 「ここで止める」：次に発動できる場面で1回だけ止まる（モードに関係なく）
    // プレイヤーごとに「自分が最後に応答してから、相手がした行動」（オートの判断に使う）
    this.oppActs = [new Set(), new Set()];
    this.aiMemo = { turn: -1, used: {} };
  }
  start() {
    const { lib, data } = this;
    const seed = this.opts.seed.map(BigInt);
    this.h = lib.createDuel({
      flags: OcgDuelMode.MODE_MR2, seed,
      team1: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
      team2: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
      cardReader: code => data.eng(code) || null,
      scriptReader: name => {
        const m = name.match(/(c\d+\.lua)$/);
        return data.raw.scripts[m ? `official/${m[1]}` : name] ?? null;
      },
      errorHandler: (t, s) => { if (this.simming) return; if (!/attempt to call a nil value \(field 'initial_effect'\)/.test(s)) this.errors.push(s); },
    });
    lib.loadScript(this.h, 'constant.lua', data.raw.scripts['constant.lua']);
    lib.loadScript(this.h, 'utility.lua', data.raw.scripts['utility.lua']);
    // エンジンは開始時にデッキを混ぜないので、シードから決まる乱数でここでシャッフルする（再開時も同じ順になる）
    const rand = seededRandom(seed);
    this.opts.decks.forEach((key, team) => {
      const d = data.raw.decks[key];
      const expand = list => list.flatMap(([n, id]) => Array(n).fill(id));
      const main = expand(d.main);
      for (let i = main.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [main[i], main[j]] = [main[j], main[i]]; }
      const add = (ids, location) => ids.forEach(id =>
        lib.duelNewCard(this.h, { team, duelist: 0, code: id, controller: team, location, sequence: 0, position: POS.FACEDOWN_DEFENSE }));
      add(main, L.DECK); add(expand(d.extra), L.EXTRA);
    });
    lib.startDuel(this.h);
    this.say(`デュエル開始：${this.names[0]}（先攻）vs ${this.names[1]}`);
  }
  destroy() { if (this.h) this.lib.destroyDuel(this.h); this.h = null; }

  // 次に人間の入力が必要になるまで（またはAIの番になるまで）進める
  // 戻り値: 'human' | 'ai' | 'end'
  advance() {
    if (this.win) return 'end';
    for (let guard = 0; guard < 5000; guard++) {
      const st = this.lib.duelProcess(this.h);
      const ms = this.lib.duelGetMessage(this.h);
      let req = null, retried = false;
      for (const m of ms) { if (m.type === M.RETRY) retried = true; else if (this.isRequest(m)) req = m; this.onMessage(m); }
      if (this.win) return 'end';
      if (st === PR.END) return 'end';
      if (st === PR.CONTINUE) continue;
      if (!req && retried) { req = this.lastReq; this.retry++; } else this.retry = 0;
      if (!req) continue;
      this.lastReq = req;
      // 再開時：記録した応答をそのまま再生する
      if (this.replay && this.replay.length) { this.respond(this.replay.shift()); continue; }
      const auto = this.autoResponse(req);
      if (auto) { this.respond(auto); continue; }
      this.req = req;
      return this.ai[req.player] ? 'ai' : 'human';
    }
    this.errors.push('処理が進まなくなりました');
    return 'end';
  }
  aiAct() {
    const req = this.req;
    let res;
    // CPUの思考で例外が起きても止まらないよう、規則上安全な応答に切り替える
    const think = this.opts.level === 'weak' ? aiSimple : aiRespond;   // 強さ「弱い」は初期版のCPU
    try { res = this.retry > 1 ? fallback(req) : think(this, req); }
    catch (e) { this.errors.push(`CPU: ${e && e.message}`); console.error(e); res = fallback(req); }
    this.respond(res);
  }
  respond(res) {
    this.history.push(res);
    if (this.req) { this.events[this.req.player] = new Set(); this.oppActs[this.req.player] = new Set(); }
    this.req = null;
    this.lib.duelSetResponse(this.h, res);
  }
  isRequest(m) {
    return [M.SELECT_BATTLECMD, M.SELECT_IDLECMD, M.SELECT_EFFECTYN, M.SELECT_YESNO, M.SELECT_OPTION, M.SELECT_CARD,
      M.SELECT_CHAIN, M.SELECT_PLACE, M.SELECT_POSITION, M.SELECT_TRIBUTE, M.SORT_CHAIN, M.SELECT_COUNTER, M.SELECT_SUM,
      M.SELECT_DISFIELD, M.SORT_CARD, M.SELECT_UNSELECT_CARD, M.ANNOUNCE_RACE, M.ANNOUNCE_ATTRIB, M.ANNOUNCE_CARD,
      M.ANNOUNCE_NUMBER, M.ROCK_PAPER_SCISSORS].includes(m.type);
  }
  autoResponse(m) {
    switch (m.type) {
      case M.SELECT_CHAIN:
        if (!m.selects.length && !m.forced) return { type: R.SELECT_CHAIN, index: null };
        if (!this.ai[m.player] && !m.forced) {
          const pass = { type: R.SELECT_CHAIN, index: null };
          // 誘発効果（ドッペル・ウォリアーなど、自分の行動をきっかけに発動できる効果）は、どの設定でも必ず聞く
          if (m.spe_count > 0) return null;
          if (this.stopRequest) { this.stopRequest = false; return null; }
          const mode = CHAIN_MODE_ALIAS[this.chainMode] || this.chainMode;
          // オートでも、相手ターンのエンドフェイズには1回だけ止まる（エンドサイク・強制脱出などの定番の使い所）
          const endStop = mode === 'auto' && this.phase === 512 && this.turnPlayer !== m.player && this.endStopped !== this.turn;
          if (endStop) { this.endStopped = this.turn; return null; }
          if (mode === 'off' || (mode === 'auto' && !this.oppActs[m.player].size)) return pass;
        }
        return null;
      case M.SELECT_PLACE: case M.SELECT_DISFIELD: return placeResponse(m);
      case M.SORT_CARD: case M.SORT_CHAIN: return { type: R.SORT_CARD, order: null };
      case M.SELECT_COUNTER: { let left = m.count; return { type: R.SELECT_COUNTER, counters: m.cards.map(c => { const t = Math.min(left, c.count); left -= t; return t; }) }; }
      case M.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 + Math.floor(Math.random() * 3) };
      case M.SELECT_POSITION: { const ps = [1, 2, 4, 8].filter(p => m.positions & p); return ps.length === 1 ? { type: R.SELECT_POSITION, position: ps[0] } : null; }
      default: return null;
    }
  }
  // p: その出来事の主体のプレイヤー（分かる場合）。画面側の演出用に uiEvents にも積む
  // 画面の演出用（召喚・攻撃・ダメージ・発動・場から離れる）。影のデュエルでは積まない
  fx(e) { if (!this.isSim) this.uiEvents.push({ k: 'fx', ...e }); }
  say(s, p = null) { this.log.push({ t: this.turn, s, p }); this.uiEvents.push({ k: 'log', s, p }); }
  takeUiEvents() { const e = this.uiEvents; this.uiEvents = []; return e; }
  cardLabel(loc, code) {
    const hidden = !code;
    return hidden ? '裏側のカード' : `「${this.data.name(code)}」`;
  }
  onMessage(m) {
    const n = p => this.names[p];
    const D = this.data;
    if (EVENT_TYPES.has(m.type)) this.events.forEach(e => e.add(m.type));
    // 相手の行動（発動・召喚・攻撃）を、行動したプレイヤー以外に記録する
    const actor = this.actorOf(m);
    if (actor != null) this.oppActs.forEach((s, p) => { if (p !== actor) s.add(m.type); });
    switch (m.type) {
      case M.NEW_TURN: this.turn++; this.turnPlayer = m.player; this.nsUsed = false; this.uiEvents.push({ k: 'turn', p: m.player, t: this.turn }); this.events.forEach(e => e.clear()); this.oppActs.forEach(e => e.clear()); this.say(`――― ターン${this.turn}：${n(m.player)} ―――`, m.player); break;
      case M.NEW_PHASE: this.phase = m.phase; this.uiEvents.push({ k: 'phase', ph: m.phase, p: this.turnPlayer }); if (m.phase === 512 || m.phase === 8) this.events.forEach(e => e.add('phase')); break;
      case M.HINT:
        if (m.hint_type === HT.SELECTMSG) this.hintMsg[m.player] = m.hint;
        else if (m.hint_type === HT.OPSELECTED || m.hint_type === HT.EFFECT) { /* 相手の選択の表示は省略 */ }
        break;
      case M.DRAW: this.say(`${n(m.player)}が${m.drawn.length}枚ドロー`, m.player); break;
      case M.SUMMONING: this.fx({ t: 'summon', kind: 'normal', p: m.controller, loc: m.location, seq: m.sequence, code: m.code }); this.lastSummon = { code: m.code, player: m.controller, kind: 'normal', turn: this.turn }; if (m.controller === this.turnPlayer) this.nsUsed = true; this.say(`${n(m.controller)}が「${D.name(m.code)}」を召喚`, m.controller); break;
      case M.SPSUMMONING: this.fx({ t: 'summon', kind: 'special', p: m.controller, loc: m.location, seq: m.sequence, code: m.code }); this.lastSummon = { code: m.code, player: m.controller, kind: 'special', loc: m.location, turn: this.turn }; this.say(`${n(m.controller)}が「${D.name(m.code)}」を特殊召喚`, m.controller); break;
      case M.FLIPSUMMONING: this.fx({ t: 'summon', kind: 'flip', p: m.controller, loc: m.location, seq: m.sequence, code: m.code }); this.lastSummon = { code: m.code, player: m.controller, kind: 'flip', turn: this.turn }; this.say(`${n(m.controller)}が「${D.name(m.code)}」を反転召喚`, m.controller); break;
      case M.SET: if (m.location === L.MZONE && m.controller === this.turnPlayer) this.nsUsed = true; this.say(`${n(m.controller)}がカードをセット`, m.controller); break;
      case M.CHAINING:
        this.chain.push({ code: m.code, player: m.controller, desc: m.description });
        this.fx({ t: 'activate', p: m.controller, loc: m.location, seq: m.sequence, code: m.code, n: m.chain_size });
        this.say(`チェーン${m.chain_size}：${n(m.controller)}の「${D.name(m.code)}」（${D.desc(m.description)}）`, m.controller); break;
      case M.CHAIN_NEGATED: this.say(`チェーン${m.chain_size}の発動が無効になった`); break;
      case M.CHAIN_DISABLED: this.say(`チェーン${m.chain_size}の効果が無効になった`); break;
      case M.CHAIN_SOLVED: this.chain.pop(); break;
      case M.CHAIN_END: this.chain = []; break;
      case M.DAMAGE: this.fx({ t: 'damage', p: m.player, amount: m.amount }); this.lp[m.player] = Math.max(0, this.lp[m.player] - m.amount); this.say(`${n(m.player)}に${m.amount}ダメージ（LP ${this.lp[m.player]}）`, m.player); break;
      case M.RECOVER: this.fx({ t: 'recover', p: m.player, amount: m.amount }); this.lp[m.player] += m.amount; this.say(`${n(m.player)}が${m.amount}回復（LP ${this.lp[m.player]}）`, m.player); break;
      case M.PAY_LPCOST: this.fx({ t: 'cost', p: m.player, amount: m.amount }); this.lp[m.player] = Math.max(0, this.lp[m.player] - m.amount); this.say(`${n(m.player)}が${m.amount}LPを払った（LP ${this.lp[m.player]}）`, m.player); break;
      case M.LPUPDATE: this.lp[m.player] = m.lp; break;
      case M.ATTACK: {
        const a = this.query(m.card), t = m.target ? this.query(m.target) : null;
        this.fx({ t: 'attack', p: m.card.controller, from: { p: m.card.controller, loc: m.card.location, seq: m.card.sequence }, to: m.target ? { p: m.target.controller, loc: m.target.location, seq: m.target.sequence } : null });
        this.lastAttack = { player: m.card.controller, code: a?.code, atk: a?.attack ?? 0, target: t ? { code: t.code, atk: t.attack, def: t.defense, position: t.position } : null, turn: this.turn };
        this.say(`${n(m.card.controller)}の「${D.name(a?.code)}」が${t ? `「${D.name(t.code)}」に` : '直接'}攻撃`, m.card.controller); break;
      }
      case M.MOVE: {
        const f = m.from, t = m.to;
        if (f.location & L.MZONE && t.location & (L.GRAVE | L.REMOVED) && m.card)
          this.fx({ t: 'leave', p: f.controller, loc: f.location, seq: f.sequence, to: t.location });
        if (f.location & (L.MZONE | L.SZONE) && t.location & (L.GRAVE | L.REMOVED | L.HAND | L.DECK | L.EXTRA) && m.card)
          this.say(`「${D.name(m.card)}」が${locName(t.location)}へ`);
        break;
      }
      case M.CONFIRM_CARDS:
        if (m.cards.length) { this.reveal = { player: m.player, cards: m.cards.map(c => c.code) }; this.say(`公開：${m.cards.map(c => `「${D.name(c.code)}」`).join('')}`); }
        break;
      case M.TOSS_COIN: this.say(`コイントス：${m.results.map(r => r ? '表' : '裏').join('・')}`); break;
      case M.TOSS_DICE: this.say(`サイコロ：${m.results.join('・')}`); break;
      case M.WIN: this.win = { player: m.player, reason: m.reason }; this.say(`${m.player === 2 ? '引き分け' : `${n(m.player)}の勝利`}`); break;
      default: break;
    }
  }
  // オートのチェーン確認で「相手が何かした」とみなす出来事と、その行動をしたプレイヤー
  actorOf(m) {
    switch (m.type) {
      case M.SUMMONING: case M.SPSUMMONING: case M.FLIPSUMMONING: this.pendingSummon = m.controller; return m.controller;
      case M.CHAINING: return m.controller;
      // 召喚の宣言（SUMMONING 等）の直後でなければ誰の召喚か分からないので、両方に記録する（止まる側に倒す）
      case M.SUMMONED: case M.SPSUMMONED: case M.FLIPSUMMONED: { const p = this.pendingSummon; this.pendingSummon = null; return p ?? -1; }
      case M.ATTACK: return m.card?.controller ?? null;
      case M.BATTLE: case M.DAMAGE_STEP_START: return this.lastAttack?.player ?? null;
      default: return null;
    }
  }
  query(loc) {
    const r = this.lib.duelQuery(this.h, { flags: QFLAGS, controller: loc.controller, location: loc.location, sequence: loc.sequence, overlaySequence: 0 });
    return r;
  }
  zone(p, location) { return this.lib.duelQueryLocation(this.h, { flags: QFLAGS, controller: p, location }); }
  field() {
    const out = [];
    for (const p of [0, 1]) {
      const mz = this.zone(p, L.MZONE).slice(0, 5);
      const szAll = this.zone(p, L.SZONE);
      out.push({
        mz, sz: szAll.slice(0, 5), fz: szAll[5] || null,
        hand: this.zone(p, L.HAND), gy: this.zone(p, L.GRAVE), ban: this.zone(p, L.REMOVED), extra: this.zone(p, L.EXTRA),
        deck: this.lib.duelQueryCount(this.h, p, L.DECK),
      });
    }
    return out;
  }
}

// シード4つから作る再現可能な乱数（mulberry32）
function seededRandom(seed) {
  let a = Number(seed.reduce((h, s) => (h * 31n + BigInt(s)) & 0xffffffffn, 7n));
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function placeResponse(m) {
  const places = [];
  const order = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 24, 25, 26, 27, 28, 29];
  for (const b of order) {
    if (places.length >= m.count) break;
    if (m.field_mask & (1 << b)) continue;
    const player = b >= 16 ? 1 - m.player : m.player, bb = b % 16;
    places.push({ player, location: bb < 8 ? L.MZONE : L.SZONE, sequence: bb % 8 });
  }
  return { type: m.type === M.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places };
}

// 不正応答が続いた時の安全な応答
export function fallback(m) {
  switch (m.type) {
    case M.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: m.to_ep ? 7 : 6, index: null };
    case M.SELECT_BATTLECMD:
      if (!m.to_m2 && !m.to_ep) return { type: R.SELECT_BATTLECMD, action: 1, index: 0 };   // 攻撃が強制される場合
      return { type: R.SELECT_BATTLECMD, action: m.to_ep ? 3 : 2, index: null };
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
    case M.SELECT_CARD: return { type: R.SELECT_CARD, indicies: [...Array(m.min).keys()] };
    case M.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: [...Array(m.min).keys()] };
    case M.SELECT_UNSELECT_CARD: return { type: R.SELECT_UNSELECT_CARD, index: m.can_finish ? null : 0 };
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: false };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: false };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 };
    case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: [1, 2, 4, 8].find(p => m.positions & p) };
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: sumSolve(m) || [0] };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 };
    case M.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: firstBits(m.available, m.count).map(BigInt) };
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: firstBits(m.available, m.count) };
    default: return placeResponse(m);
  }
}
export function firstBits(mask, count) { const out = []; let v = BigInt(mask); for (let b = 0n; b < 64n && out.length < count; b++) if (v & (1n << b)) out.push(Number(1n << b)); return out; }
// 合計値選択：条件を満たす組み合わせを探す（小さい組み合わせ優先）
export function sumSolve(m, prefer) {
  const n = m.selects.length;
  const must = m.selects_must.reduce((s, c) => s + (c.amount & 0xffff), 0);
  const idx = [...Array(n).keys()];
  if (prefer) idx.sort((a, b) => prefer(m.selects[a]) - prefer(m.selects[b]));
  let best = null;
  for (let mask = 1; mask < (1 << n); mask++) {
    let lo = must, hi = must; const pick = [];
    for (let k = 0; k < n; k++) if (mask & (1 << k)) { const i = idx[k]; const a = m.selects[i].amount; lo += a & 0xffff; hi += (a >> 16) || (a & 0xffff); pick.push(i); }
    const ok = m.select_max ? (lo >= m.amount || hi >= m.amount) : (lo === m.amount || hi === m.amount);
    if (ok && pick.length >= m.min && pick.length <= m.max && (!best || pick.length < best.length)) best = pick;
  }
  return best;
}
