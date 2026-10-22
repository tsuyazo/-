// CPUの思考（第2版）。エンジンの選択要求ごとに、1103環境の基本的なプレイ方針で応答を決める。
//  - 罠は「相手の何に対して撃つか」を決めて使う（召喚無効は重要なモンスターに、攻撃反応は強い攻撃に）
//  - 伏せ除去は、相手ターンのエンドフェイズか、自分が展開する前に使う
//  - 攻撃は勝てる相手にだけ。自爆特攻はしない
//  - エクストラデッキからは、そのデッキで強いモンスターを優先して出す
// ノウハウ（knowhow の ai_rules）があれば、デッキ別のサーチ先・展開手順・止めるべきカードで上書きする。
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, OcgPosition as POS } from 'ocgcore-wasm';
import { sumSolve, firstBits, fallback } from './engine.js';
import {
  NEGATE_SUMMON, NEGATE_SPSUMMON, ON_SUMMON, WIPE_ON_SUMMON, ATTACK_RESPONSE, NEGATE_ACTIVATION, ST_REMOVAL,
  HAND_TRAP, DAMAGE_STEP, BOARD_WIPE, OWN_TURN_TRAPS, HOLD_TRAPS, SUMMON_PRIORITY, KEY_THREATS, EXTRA_VALUE,
  JS, NO_LEAD, RECRUITERS, PROBES,
} from './ai_cards.js';
import { planIdle, sigOf } from './ai_plan.js';

const T_MONSTER = 0x1, T_SPELL = 0x2, T_TRAP = 0x4, T_QUICK = 0x10000, T_FUSION = 0x40, T_SYNCHRO = 0x2000, T_XYZ = 0x800000;
const T_TUNER = 0x1000, T_CONT = 0x20000, T_EQUIP = 0x40000, T_FIELD = 0x80000, T_FLIP = 0x200000, T_EFFECT = 0x20;
const PH_DRAW = 1, PH_STANDBY = 2, PH_MAIN1 = 4, PH_END = 512;
const VEILER = 97268402, TRAP_STUN = 59616123, BOOK_OF_MOON = 14087893, HURRICANE = 42703248;
const SKILL_DRAIN = 82732705, FORBIDDEN_LANCE = 27243130, SCAPEGOAT = 73915051;
const SELF_TURN_ONLY = new Set([21007444, 32603633]);
const LOCKS = new Set([29981921, 71564252, 33198837]);   // シエン・ライオウ・ナチュル・ビースト

// 判断に使う数値。デッキごとの値（ai_params.json、CPU同士の対戦で調整したもの）があればそれを使う
export const DEFAULTS = {
  handV: 700, setV: 850, upV: 450, fdV: 1500, myLP: 0.5, opLP: 1, risk: 0.93, lockV: 1500, keyV: 1200, extraV: 600,
  fdAtk: 1900, wipeDiff: 1000, wipeDiffChain: 1500, onSummonAtk: 1500, negSumVal: 2300, negSpVal: 2000,
  prisonAtk: 1700, mirrorAtk: 2400, bookAtk: 1700, warnLP: 2500, declLP: 2000, declSpellLP: 3000, endTrap: 55, chainMin: 40,
  perTurn: 12, rollouts: 1, eps: 0.3, line: 0, vulnV: 0, threatW: 0, routeOn: 1,
};
let PAR = DEFAULTS;
// duel.aiParams[seat]（調整中の試し値）＞ デッキごとの値 ＞ 既定値
export function paramsFor(duel, seat) {
  const o = duel.aiParams?.[seat];
  if (o) return o;
  const deck = duel.opts.decks[seat];
  const t = duel.data.raw.aiParams?.[deck];
  if (!t) return DEFAULTS;
  return t._full || (t._full = { ...DEFAULTS, ...t });
}
const info = (duel, code) => duel.data.eng(code) || { type: 0, attack: 0, defense: 0, level: 0 };
const isExtra = t => (t & (T_FUSION | T_SYNCHRO | T_XYZ)) !== 0;
const ATTR_LIGHT = 0x10, RACE_WINDBEAST = 0x200n;
const OFF = new Set((globalThis.process?.env?.JS_OFF || '').split(',').filter(Boolean));   // 比較実験用：jspeedのルールを個別に止める（JS_OFF=probe,tri,cap,fine,brd,dh,cyc）
// 相手のデッキにそのカードが入っているか（デッキは対戦前に公開されている）
const oppHas = (ctx, code) => !!ctx.duel.data.raw.decks[ctx.duel.opts.decks[ctx.op]]?.main.some(([, id]) => id === code);

// モンスター・カードの「価値」：攻撃力を基本に、重要カードと大型を上乗せ
function cardValue(duel, code, q) {
  const e = info(duel, code);
  if (!(e.type & T_MONSTER)) return 1300;
  let v = q && typeof q.attack === 'number' ? Math.max(q.attack, q.defense ?? 0) : Math.max(e.attack, e.defense);
  if (KEY_THREATS.has(code)) v += PAR.keyV;
  if (isExtra(e.type)) v += PAR.extraV;
  if (EXTRA_VALUE[code]) v += EXTRA_VALUE[code] * 5;
  return v;
}
function fieldValue(duel, f, p) {
  return f[p].mz.filter(Boolean).reduce((s, q) => s + (q.position & POS.FACEDOWN ? PAR.fdV : cardValue(duel, q.code, q)), 0);
}
function strongestAtk(f, p) { return f[p].mz.filter(q => q && (q.position & POS.FACEUP)).reduce((m, q) => Math.max(m, q.attack || 0), 0); }

export function aiRespond(duel, m) {
  const me = m.player, op = 1 - me;
  PAR = paramsFor(duel, me);
  const f = duel.field();
  const memo = duel.aiMemo;
  if (memo.turn !== duel.turn) { memo.turn = duel.turn; memo.used = {}; memo.idle = 0; memo.plans = 0; memo.attackerAtk = null; memo.attackerCode = null; memo.line = null; }
  // 先読みで見つけた手順：局面が予定どおりなら、その手をそのまま打つ（相手が何かして局面が変わったら捨てる）
  if (!duel.isSim && memo.line && memo.line.length && duel.turnPlayer === me && memo.lineOwner === me) {
    const head = memo.line[0];
    if (head.sig === sigOf(m)) { memo.line.shift(); return head.res; }
    memo.line = null;
  }
  const ctx = { duel, f, me, op, memo, myTurn: duel.turnPlayer === me, rules: rulesFor(duel, me) };
  switch (m.type) {
    case M.SELECT_IDLECMD: return idle(ctx, m);
    case M.SELECT_BATTLECMD: return battle(ctx, m);
    case M.SELECT_CHAIN: return chain(ctx, m);
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: effectYes(ctx, m) };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: yesNo(ctx, m) };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 };
    case M.SELECT_CARD: case M.SELECT_TRIBUTE: {
      const idx = chooseCards(ctx, m, m.selects, Math.max(m.min, 1));
      return m.type === M.SELECT_CARD ? { type: R.SELECT_CARD, indicies: idx } : { type: R.SELECT_TRIBUTE, indicies: idx };
    }
    case M.SELECT_UNSELECT_CARD: {
      if (m.can_finish && m.unselect_cards.length >= Math.max(1, m.min)) return { type: R.SELECT_UNSELECT_CARD, index: null };
      if (!m.select_cards.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
      const [i] = chooseCards(ctx, { ...m, min: 1, max: 1 }, m.select_cards, 1);
      return { type: R.SELECT_UNSELECT_CARD, index: i };
    }
    case M.SELECT_POSITION: return { type: R.SELECT_POSITION, position: position(ctx, m) };
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: sumSolve(m, c => cardValue(duel, c.code)) || [0] };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: m.options.length - 1 };
    case M.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: firstBits(m.available, m.count).map(BigInt) };
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: firstBits(m.available, m.count) };
    case M.ANNOUNCE_CARD: return { type: R.ANNOUNCE_CARD, card: Number(Object.keys(duel.data.byId)[0]) };
    default: return fallback(m);
  }
}

/* ---------------- メインフェイズ ---------------- */
function idle(ctx, m) {
  const memo = ctx.memo;
  memo.idle = (memo.idle || 0) + 1;
  const before = { ...memo.used };
  const greedy = idleGreedy(ctx, m);
  if (memo.idle > 30) return greedy;
  // 先読み：候補を影のデュエルで試して、ターン終了時の盤面が一番良いものを選ぶ
  const after = memo.used;
  memo.used = before;
  const P = PAR;
  const planned = planIdle(ctx, m, greedy, aiRespond, boardValue, P);
  PAR = P;
  if (globalThis.PLAN_DEBUG && planned && planned !== greedy) console.log("   [plan]", JSON.stringify(planned), "greedy", JSON.stringify(greedy));
  // ターンを終える（バトルへ進む）前に、伏せるべきカードは必ず伏せる（先読みの候補に「伏せる」は無いため）
  const ending = r => r && r.type === R.SELECT_IDLECMD && (r.action === 6 || r.action === 7);
  if (ending(planned || greedy)) { const sc = setChoice(ctx, m); if (sc) { memo.used = after; return sc; } }
  if (!planned || planned === greedy || jspeedVeto(ctx, m, planned)) { memo.used = after; return greedy; }
  // 普段の判断と違う行動を選んだ時は、その行動に「使った」印を付ける（同じ発動を繰り返さない）
  const f = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'][planned.action];
  const c = f && m[f][planned.index];
  if (c) { const k = `${c.code}:${c.location}:${c.sequence}:${c.description ?? ''}`; memo.used[k] = (memo.used[k] || 0) + 1; }
  return planned;
}
// 先読みで比べる「盤面の良さ」：自分の場と手札とLP、相手の場とLP
export function boardValue(duel, me) {
  const op = 1 - me;
  PAR = paramsFor(duel, me);
  if (duel.win) return duel.win.player === me ? 1e6 : duel.win.player === 2 ? 0 : -1e6;
  const f = duel.field();
  const st = p => f[p].sz.filter(Boolean).reduce((s, q) => s + (q.position & POS.FACEDOWN ? PAR.setV : PAR.upV), 0) + (f[p].fz ? 500 : 0);
  // 相手の伏せが多いほど、場に出したモンスターは罠で失いやすい（手札は安全）
  const risk = Math.pow(PAR.risk, Math.min(4, f[op].sz.filter(q => q && (q.position & POS.FACEDOWN)).length));
  // 相手の行動を止め続けるモンスター（シエン・ライオウなど）は、先読みの中では働きが見えないので上乗せ
  const lock = f[me].mz.filter(q => q && (q.position & POS.FACEUP) && LOCKS.has(q.code)).length * PAR.lockV;
  // 次の相手ターンへの備え：攻撃表示で相手の一番強いモンスターに負けるモンスターと、壁で止められない攻撃の合計
  const oppAtk = f[op].mz.filter(q => q && (q.position & POS.FACEUP) && (q.position & POS.ATTACK)).map(q => q.attack || 0).sort((a, b) => b - a);
  const mine = f[me].mz.filter(Boolean);
  const weak = mine.filter(q => (q.position & POS.FACEUP) && (q.position & POS.ATTACK) && (q.attack || 0) < (oppAtk[0] || 0)).length;
  const through = oppAtk.slice(mine.length).reduce((a, b) => a + b, 0);
  const exposure = PAR.vulnV * weak + PAR.threatW * through;
  return fieldValue(duel, f, me) * risk + lock - exposure + st(me) + PAR.handV * f[me].hand.length + PAR.myLP * duel.lp[me]
    - fieldValue(duel, f, op) - st(op) - PAR.opLP * duel.lp[op];
}
function idleGreedy(ctx, m) {
  const { duel, f, me, op, memo } = ctx;
  const end = () => ({ type: R.SELECT_IDLECMD, action: m.to_bp && duel.turn > 1 && canAttackUsefully(ctx) ? 6 : (m.to_ep ? 7 : 6), index: null });
  if (memo.idle > 30) return end();
  const key = c => `${c.code}:${c.location}:${c.sequence}:${c.description ?? ''}`;
  const used = c => memo.used[key(c)] || 0;
  const mark = c => { memo.used[key(c)] = used(c) + 1; };
  const oppSetST = f[op].sz.filter(q => q && (q.position & POS.FACEDOWN)).length;
  const myVal = fieldValue(duel, f, me), opVal = fieldValue(duel, f, op);
  const hold = ctx.rules?.hold || new Set();

  // 1. 相手の伏せを先に割る（これから展開・攻撃するので）
  if (oppSetST) {
    // トラップ・スタンは攻撃の前（メイン1）に、攻撃できるモンスターがいる時だけ
    const stun = duel.phase === PH_MAIN1 && duel.turn > 1 && f[me].mz.some(q => q && (q.position & POS.ATTACK) && (q.attack || 0) >= 1500);
    // ハリケーンは2枚以上伏せてある時に（多伏せを一掃してから展開する）
    const i = m.activates.findIndex(c => ((ST_REMOVAL.has(c.code) && !hold.has(c.code) && (c.code !== HURRICANE || oppSetST >= 2)) || (c.code === TRAP_STUN && stun)) && !used(c) && c.location !== L.MZONE);
    if (i >= 0) { mark(m.activates[i]); return { type: R.SELECT_IDLECMD, action: 5, index: i }; }
  }
  // 1.5 記事の展開ルート：初動カードがそろっていれば、手順の中で今できる最初の一手を打つ
  if (PAR.routeOn && ctx.rules?.routes?.length) {
    const have = new Set([...f[me].hand, ...f[me].mz.filter(Boolean), ...f[me].sz.filter(Boolean)].map(q => q.code));
    const FIELD = { summon: ['summons', 0], special: ['special_summons', 1], activate: ['activates', 5] };
    const onField = id => f[me].mz.some(q => q && q.code === id && (q.position & POS.FACEUP));
    for (const r of ctx.rules.routes) {
      // 必要なカードが全部そろっている時だけ（必要なカードの記載が無ければ、初動カードのどれか）
      if (r.requires?.length ? !r.requires.every(id => have.has(id)) : !r.starters.some(id => have.has(id))) continue;
      // 手順は順番どおりに打つ。今打てない手があれば、その先へは飛ばさない
      // （小町を出せないのに簡易融合だけ撃つ、のような手順の崩れを防ぐ）
      for (let k = 0; k < r.steps.length; k++) {
        const st = r.steps[k], done = `route:${r.name}:${k}`;
        if (memo.used[done]) continue;
        const fd = FIELD[st.act]; if (!fd) continue;
        const i = m[fd[0]].findIndex(c => c.code === st.id && !used(c) && !(fd[1] === 0 && hold.has(c.code)));
        if (i >= 0) { mark(m[fd[0]][i]); memo.used[done] = 1; memo.route = r; return { type: R.SELECT_IDLECMD, action: fd[1], index: i }; }
        if (st.act === 'activate' && (info(duel, st.id).type & T_MONSTER)) continue;   // 召喚時の効果などはチェーンで処理される
        if (st.act !== 'activate' && onField(st.id)) continue;                         // もう場に出ている
        break;
      }
    }
  }
  // 2. サーチ・ドロー・展開の魔法と、場のモンスターの起動効果
  const acts = m.activates.map((c, i) => ({ c, i, e: info(duel, c.code) })).filter(({ c, e }) => {
    if (used(c) >= (c.location === L.MZONE ? 1 : 1)) return false;
    if (HAND_TRAP.has(c.code) || DAMAGE_STEP.has(c.code)) return false;
    if (SELF_TURN_ONLY.has(c.code)) return false;                        // 普段は使わず、先読みで得になる時だけ
    if (c.code === BOOK_OF_MOON) return false;                           // 月の書は相手の攻撃・召喚に合わせて使う
    if (e.type & T_TRAP) return OWN_TURN_TRAPS.has(c.code) && !HOLD_TRAPS.has(c.code);
    if (c.code === JS.ARAGYO) return false;                              // 六武衆の荒行はバトルフェイズに（jspeed）
    // 簡易融合：出した融合モンスターはエンドフェイズに破壊されるので、場に表側のチューナーがいて、そのままシンクロに使える時だけ
    if (c.code === JS.INSTANT_FUSION) return f[me].mz.some(q => q && (q.position & POS.FACEUP) && (info(duel, q.code).type & T_TUNER));
    // 強欲で謙虚な壺：このターンに特殊召喚できるなら撃たない（撃つと特殊召喚できなくなる）（jspeed）
    if (c.code === JS.PROSPERITY && m.special_summons.some(x => spValue(ctx, x) > 0)) return false;
    // ブラック・ホールは「我慢しすぎなぐらい」温存する（jspeed）
    if (!OFF.has('dh') && c.code === JS.DARK_HOLE) return opVal > myVal + PAR.wipeDiff + 1000 && (f[op].mz.filter(Boolean).length >= 2 || f[op].mz.some(q => q && KEY_THREATS.has(q.code)));
    if (BOARD_WIPE.has(c.code)) return opVal > myVal + PAR.wipeDiff;
    // 温存するよう勧められた除去（王宮の弾圧などへの回答）は、表側の永続カードにだけ使う
    if (ST_REMOVAL.has(c.code) && hold.has(c.code)) return f[op].sz.some(q => q && (q.position & POS.FACEUP) && (info(duel, q.code).type & T_CONT));
    if (c.code === HURRICANE) return oppSetST >= 2;
    if (ST_REMOVAL.has(c.code)) return oppSetST > 0 || f[op].sz.some(q => q && (q.position & POS.FACEUP));
    if (c.code === 72892473) return f[me].hand.length <= 2;           // 手札抹殺は手札が少ない時だけ
    return true;
  });
  // 優先：サーチ・ドロー（手札を増やす）→ 永続・フィールド → その他
  acts.sort((a, b) => actPriority(ctx, b) - actPriority(ctx, a));
  if (acts.length && actPriority(ctx, acts[0]) > 0) { mark(acts[0].c); return { type: R.SELECT_IDLECMD, action: 5, index: acts[0].i }; }

  // 3. 特殊召喚（エクストラは価値の高い順。手札からの特殊召喚は素直に出す）
  if (m.special_summons.length) {
    const opts = m.special_summons.map((c, i) => ({ c, i, v: spValue(ctx, c) })).filter(x => used(x.c) < 2 && x.v > 0 && !(x.c.code === JS.TRISHULA && trishulaLater(ctx, m))).sort((a, b) => b.v - a.v);
    if (opts.length) { mark(opts[0].c); return { type: R.SELECT_IDLECMD, action: 1, index: opts[0].i }; }
  }
  // 4. 通常召喚（展開の起点を優先）
  // リバース効果モンスターは表で出さず、セットする（下の5で）
  const summons = m.summons.map((c, i) => ({ c, i })).filter(({ c }) => !(info(duel, c.code).type & T_FLIP) && !noLead(ctx, c.code));
  if (summons.length) {
    // カラクリ小町は、手札に他のカラクリがいれば先に出す（小町が表側でいる間だけカラクリをもう1体召喚できる）
    const karakuri = id => (info(duel, id).setcodes || []).includes(0x11) && (info(duel, id).type & T_MONSTER);
    const komachiFirst = c => c.code === JS.KOMACHI && f[me].hand.some(q => q.code !== JS.KOMACHI && karakuri(q.code)) ? 3000 : 0;
    const best = summons.map(({ c, i }) => ({ i, v: (SUMMON_PRIORITY[c.code] || 0) * 100 + komachiFirst(c) + cardValue(duel, c.code) - (hold.has(c.code) ? 20000 : 0) })).sort((a, b) => b.v - a.v)[0];
    return { type: R.SELECT_IDLECMD, action: 0, index: best.i };
  }
  if (acts.length) { mark(acts[0].c); return { type: R.SELECT_IDLECMD, action: 5, index: acts[0].i }; }
  // 5. 弱いモンスターは裏守備で出しておく
  const sets = m.monster_sets.map((c, i) => ({ i, c, v: cardValue(duel, c.code) })).filter(x => x.c.code !== JS.GREPHER || duel.turn > 2);
  if (sets.length && !duel.nsUsed) return { type: R.SELECT_IDLECMD, action: 3, index: sets.sort((a, b) => b.v - a.v)[0].i };
  // 6. 罠・速攻魔法を伏せる（バトルの後、メイン2で伏せる方が情報を与えない）
  const setNow = setChoice(ctx, m);
  if (setNow) return setNow;
  // 7. 攻撃表示で弱いモンスターは守備に
  const pi = m.pos_changes.findIndex(c => {
    const q = f[me].mz[c.sequence];
    // 相手の一番強いモンスターに負けるなら、守備力が低くても守備にする（守備表示ならLPは減らない）
    return q && (q.position & POS.ATTACK) && (q.position & POS.FACEUP) && q.attack < strongestAtk(f, op);
  });
  if (pi >= 0 && duel.phase !== PH_MAIN1) return { type: R.SELECT_IDLECMD, action: 2, index: pi };
  return end();
}
// 今伏せるべき罠・速攻魔法（無ければ null）
function setChoice(ctx, m) {
  const { duel, f, me } = ctx;
  if (!(duel.phase !== PH_MAIN1 || duel.turn === 1 || !canAttackUsefully(ctx))) return null;
  if (f[me].sz.filter(Boolean).length >= 5) return null;
  // 伏せすぎない（jspeed：「少数の伏せで戦う。ガバ伏せは損をしないことが保証されている時だけ」）。
  // 3枚まで（墓地BFの先攻は2枚まで）。サイクロン・神の宣告と、手札があふれる時は別
  const down = f[me].sz.filter(q => q && (q.position & POS.FACEDOWN)).length;
  const cap = OFF.has('cap') ? 5 : duel.opts.decks[me] === 'blackwing' && duel.turn <= 2 ? 2 : 3;
  const free = c => c.code === JS.CYCLONE || c.code === 41420027 || f[me].hand.length > 6;
  const si = m.spell_sets.findIndex(c => { const t = info(duel, c.code).type; return ((t & T_TRAP) || (t & T_QUICK)) && (down < cap || free(c)); });
  return si >= 0 ? { type: R.SELECT_IDLECMD, action: 4, index: si } : null;
}
function actPriority(ctx, { c, e }) {
  const { duel, f, me } = ctx;
  const code = c.code;
  const draw = new Set([98645731, 70368879, 67169062, 72345736, 85541675, 213326, 54031490, 32807846, 96363153, 94886282, 8949584, 91351370, 80204957]);
  if (draw.has(code)) return 90;                                         // サーチ・ドロー
  if (code === 83764718) return f[me].gy.length + f[1 - me].gy.length ? 70 : 0; // 死者蘇生
  if (e.type & T_FIELD || e.type & T_CONT) return 60;
  if (c.location === L.MZONE) return 55;                                 // 場のモンスターの起動効果
  if (c.location === L.GRAVE) return 50;
  if (e.type & T_SPELL) return 40;
  return 10;
}
function spValue(ctx, c) {
  const { duel } = ctx;
  const ord = ctx.rules?.extraOrder || [];
  const rank = ord.indexOf(c.code);
  // ブラック・ローズ・ドラゴンは、場を流して得をする時だけ優先する（jspeed：あまり出さない、アドが取れる場面なら投げる）
  if (!OFF.has('brd') && c.code === JS.BRD && !brdWorth(ctx)) return 1000 + 300 + info(duel, c.code).attack / 10;
  if (c.location === L.EXTRA) return 1000 + (EXTRA_VALUE[c.code] || 50) * 10 + (info(duel, c.code).attack / 10) + (rank >= 0 && PAR.routeOn ? (ord.length - rank) * 40 : 0);
  return 500 + cardValue(duel, c.code) / 10;
}
// 攻撃して得をするモンスターがいるか
function canAttackUsefully(ctx) {
  const { f, me, op } = ctx;
  const mine = f[me].mz.filter(q => q && (q.position & POS.FACEUP) && (q.position & POS.ATTACK));
  if (!mine.length) return false;
  const opp = f[op].mz.filter(Boolean);
  if (!opp.length) return true;
  return mine.some(a => opp.some(t => beats(a, t)));
}
function beats(a, t) {
  if (t.position & POS.FACEDOWN) return (a.attack || 0) >= PAR.fdAtk;
  if (t.position & POS.ATTACK) return (a.attack || 0) > (t.attack || 0);
  return (a.attack || 0) > (t.defense || 0);
}

/* ---------------- バトルフェイズ ---------------- */
function battle(ctx, m) {
  const { f, me, op, memo } = ctx;
  const opMons = f[op].mz.filter(Boolean);
  const atks = m.attacks.map((c, i) => ({ c, i, q: f[me].mz[c.sequence] })).filter(x => x.q);
  // 直接攻撃できるなら最優先、次に勝てる相手がいるもの（攻撃力の高い順）
  const direct = atks.filter(x => x.c.can_direct).sort((a, b) => (b.q.attack || 0) - (a.q.attack || 0));
  // 攻撃対象を選ぶ時に使うので、攻撃するモンスターの攻撃力を覚えておく
  const go = x => { memo.attackerAtk = x.q.attack || 0; memo.attackerCode = x.q.code; return { type: R.SELECT_BATTLECMD, action: 1, index: x.i }; };
  // 六武衆の荒行はバトルフェイズに使う（想定外の打点、ヴェーラーをかわす）（jspeed）
  const ar = m.chains.findIndex(c => c.code === JS.ARAGYO);
  if (ar >= 0 && !memo.used.bAragyo && atks.length) { memo.used.bAragyo = 1; return { type: R.SELECT_BATTLECMD, action: 0, index: ar }; }
  if (direct.length) return go(direct[0]);
  // 裏守備（ライコウなど）は、失っても損の少ないモンスター（トマト・ガンナー）で先に叩く（jspeed）
  const probe = !OFF.has('probe') && opMons.some(t => t.position & POS.FACEDOWN) && atks.find(x => PROBES.has(x.q.code) && (x.q.position & POS.ATTACK));
  if (probe) return go(probe);
  // オネストが返ってくる光属性と、倒すと相手が得をするリクルーターは、自分から殴らない（jspeed）
  const fine = t => OFF.has('fine') || (!honestRisk(ctx, t) && !((t.position & POS.FACEUP) && RECRUITERS.has(t.code)));
  const good = atks.filter(x => opMons.some(t => beats(x.q, t) && fine(t))).sort((a, b) => (b.q.attack || 0) - (a.q.attack || 0));
  if (good.length) return go(good[0]);
  if (!m.to_m2 && !m.to_ep && atks.length) return go(atks[0]);  // 攻撃が強制される場合
  if (!m.to_m2 && !m.to_ep && m.attacks.length) return { type: R.SELECT_BATTLECMD, action: 1, index: 0 };
  // バトルフェイズに自分から使うのは、場のモンスターの起動効果だけ（伏せた罠をむやみに撃たない）
  const reactive = c => ATTACK_RESPONSE.has(c.code) || NEGATE_ACTIVATION.has(c.code) || NEGATE_SPSUMMON.has(c.code);   // 相手の行動に合わせて使うもの
  const ci = m.chains.findIndex(c => c.location === L.MZONE && !reactive(c) && !HAND_TRAP.has(c.code) && !DAMAGE_STEP.has(c.code) && !memo.used[`b${c.code}`]);
  if (ci >= 0) { memo.used[`b${m.chains[ci].code}`] = 1; return { type: R.SELECT_BATTLECMD, action: 0, index: ci }; }
  return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
}

/* ---------------- チェーン（罠・手札誘発の使いどころ） ---------------- */
function chain(ctx, m) {
  const { duel, f, me, op, myTurn } = ctx;
  if (!m.selects.length) return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
  if (m.forced) return { type: R.SELECT_CHAIN, index: 0 };
  const ev = duel.events[me];
  const top = duel.chain[duel.chain.length - 1];
  const oppTop = top && top.player === op;
  const ls = duel.lastSummon && duel.lastSummon.turn === duel.turn ? duel.lastSummon : null;
  const oppSummoning = ls && ls.player === op && (ev.has(M.SUMMONING) || ev.has(M.SPSUMMONING) || ev.has(M.FLIPSUMMONING));
  const oppSummoned = ls && ls.player === op && (ev.has(M.SUMMONED) || ev.has(M.SPSUMMONED) || ev.has(M.FLIPSUMMONED));
  const summonValue = ls ? cardValue(duel, ls.code) : 0;
  const la = duel.lastAttack && duel.lastAttack.turn === duel.turn ? duel.lastAttack : null;
  const oppAttacking = la && la.player === op && ev.has(M.ATTACK) && !myTurn;
  const lp = duel.lp[me];
  const lethal = la && !la.target && la.atk >= lp;

  const score = c => {
    const code = c.code, t = info(duel, code).type;
    // 自分のモンスターの誘発効果・墓地や手札から出る効果は基本的に使う
    if (ATTACK_RESPONSE.has(code) && (t & T_MONSTER)) return oppAttacking ? 75 : 0;   // ホープ：相手の攻撃にだけ
    // シエン：止めない理由が無ければ魔法・罠は止める（jspeed：「止めない理由を探す。謙虚には8〜9割止める」）
    if (code === JS.SHIEN && oppTop && top && (info(duel, top.code).type & (T_SPELL | T_TRAP))) return 85;
    if (NEGATE_ACTIVATION.has(code) && (t & T_MONSTER) && code !== 74294676) return oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 88 : 0;  // シエンなど
    if ((c.location === L.MZONE || c.location === L.GRAVE || c.location === L.REMOVED) && (t & T_MONSTER)) {
      if (NEGATE_SPSUMMON.has(code) || code === 74294676) return oppSummoning && summonValue >= 1800 ? 80 : (oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 70 : 0);
      return 60;
    }
    // 手札から出られる誘発効果（ドッペル・ウォリアーなど、自分の行動をきっかけにしたもの）は使う
    if (c.location === L.HAND && (t & T_MONSTER) && m.spe_count > 0 && !HAND_TRAP.has(code)) return 60;
    if (HAND_TRAP.has(code)) {
      if (code === VEILER) return oppTop && !myTurn && top && (info(duel, top.code).type & T_MONSTER) && KEY_THREATS.has(top.code) ? 85 : (oppTop && !myTurn && top && (info(duel, top.code).type & T_MONSTER) ? 40 : 0);
      return 60;   // ゴーズなど（条件はエンジンが判定）
    }
    if (DAMAGE_STEP.has(code)) return 70;                                   // ダメージステップで出てくる時は使う
    // トラップ・スタン：相手が罠を発動した時にチェーンして、その罠を無効にする（ミラーフォース・奈落・激流葬など）
    if (code === TRAP_STUN) return oppTop && top && (info(duel, top.code).type & T_TRAP) && impact(duel, top.code, ctx.rules) >= 2 ? 85 : 0;
    // スキルドレイン：相手の効果モンスターが召喚に成功した時か、相手の場に効果の強いモンスターがいる時に表にする
    if (code === SKILL_DRAIN) {
      const effMon = q => q && (q.position & POS.FACEUP) && (info(duel, q.code).type & T_EFFECT) && (KEY_THREATS.has(q.code) || cardValue(duel, q.code, q) >= 2200);
      if (oppSummoned && ls && (info(duel, ls.code).type & T_EFFECT) && (KEY_THREATS.has(ls.code) || summonValue >= 1900 || ctx.rules?.threats.has(ls.code))) return 80;
      if (oppTop && top && (info(duel, top.code).type & T_MONSTER) && impact(duel, top.code, ctx.rules) >= 2 && lp > 1000) return 75;
      if (!myTurn && duel.phase === PH_END && f[op].mz.some(effMon) && lp > 1000) return 60;
      return 0;
    }
    // 禁じられた聖槍：攻撃力を800下げて戦闘の勝ち負けを変える（相手の攻撃を返す／自分の攻撃を通す）
    if (code === FORBIDDEN_LANCE && la && la.target && la.turn === duel.turn) {
      const tv = la.target.position & POS.DEFENSE ? la.target.def : la.target.atk;
      if (oppAttacking && la.atk >= tv && la.atk - 800 < tv) return 80;
      if (myTurn && la.player === me && la.target.position & POS.ATTACK && la.atk <= la.target.atk && la.atk > la.target.atk - 800) return 80;
      return 0;
    }
    // スケープ・ゴート：相手の直接攻撃を止める。相手ターンのエンドフェイズに、素材用に出しておく
    if (code === SCAPEGOAT) {
      if (oppAttacking && !la.target && la.atk >= 1200 && !f[me].mz.some(Boolean)) return 85;
      if (!myTurn && duel.phase === PH_END && f[me].mz.filter(Boolean).length <= 1) return 55;
      return 0;
    }
    if (code === BOOK_OF_MOON) {
      // 月の書：強い攻撃を止める／重要なモンスターの召喚成功時に裏にして効果を使わせない
      if (oppAttacking) return la.atk >= PAR.bookAtk || lethal ? 80 : 0;
      if (oppSummoned && (KEY_THREATS.has(ls.code) || ctx.rules?.threats.has(ls.code) || summonValue >= 2400)) return 75;
      return 0;
    }
    if (NEGATE_SUMMON.has(code)) {
      if (!oppSummoning) return oppTop && top && impact(duel, top.code, ctx.rules) >= 3 && code === 41420027 && lp > PAR.declSpellLP ? 75 : 0;
      if (code === 41420027 && lp <= PAR.declLP) return 0;                        // 神の宣告はLPが少ないと撃たない
      if (code === 84749824 && lp <= PAR.warnLP) return 0;                        // 神の警告（2000払う）
      return summonValue >= PAR.negSumVal || KEY_THREATS.has(ls.code) || ctx.rules?.threats.has(ls.code) ? 90 : 0;
    }
    if (NEGATE_SPSUMMON.has(code)) return oppSummoning && ls.kind === 'special' && summonValue >= PAR.negSpVal && lp > 1000 ? 85 : 0;
    if (ON_SUMMON.has(code)) return oppSummoned && summonValue >= PAR.onSummonAtk ? 85 : 0;     // 奈落：攻撃力1500以上（記事より）
    if (WIPE_ON_SUMMON.has(code)) return oppSummoned && f[op].mz.filter(Boolean).length >= f[me].mz.filter(Boolean).length + 1 ? 80 : 0;
    if (ATTACK_RESPONSE.has(code)) {
      if (!oppAttacking) return 0;
      if (code === 44095762) return f[op].mz.filter(q => q && (q.position & POS.ATTACK)).length >= 2 || la.atk >= PAR.mirrorAtk || lethal ? 90 : 0;
      if (code === 70342110) return la.atk >= PAR.prisonAtk || lethal || KEY_THREATS.has(la.code) ? 85 : 0;
      return 70;   // くず鉄のかかし・ホープは何度でも使える
    }
    if (NEGATE_ACTIVATION.has(code)) return oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 88 : 0;
    if (ST_REMOVAL.has(code)) {
      // 相手ターンのエンドフェイズに伏せを割る／相手の永続カードが表になった時に割る
      // 目的の無いエンドサイクはしない（jspeed）：次のターンに攻撃を通したい時か、伏せが2枚以上ある時だけ
      const downs = f[op].sz.filter(q => q && (q.position & POS.FACEDOWN)).length;
      if (!myTurn && duel.phase === PH_END && downs) return OFF.has('cyc') || code !== JS.CYCLONE || downs >= 2 || f[me].mz.some(q => q && (q.position & POS.FACEUP) && (q.attack || 0) >= 1500) ? 65 : 0;
      if (oppTop && top && (info(duel, top.code).type & (T_CONT | T_EQUIP | T_FIELD))) return 70;
      if (myTurn && duel.phase === PH_MAIN1 && f[op].sz.some(q => q && (q.position & POS.FACEDOWN))) return 50;
      return 0;
    }
    // ゴッドバードアタック：鳥獣を逃がしながら2枚割る（jspeed：除去への返し・攻撃された時のサクリファイス・エスケープ、
    // 相手ターンのエンドフェイズに伏せを割る。割る先が2枚無い時は撃たない）
    if (code === JS.GODBIRD) {
      const bird = q => q && (q.position & POS.FACEUP) && (info(duel, q.code).race & RACE_WINDBEAST);
      const targets = f[op].mz.filter(Boolean).length + f[op].sz.filter(Boolean).length;
      if (!f[me].mz.some(bird) || targets < 2) return 0;
      if (oppTop && top && impact(duel, top.code, ctx.rules) >= 2) return 82;
      if (oppAttacking && la.target && (info(duel, la.target.code).race & RACE_WINDBEAST)) return 80;
      if (!myTurn && duel.phase === PH_END && f[op].sz.some(q => q && (q.position & POS.FACEDOWN))) return 62;
      return 0;
    }
    // 王宮のお触れ：自分の罠も止めるので、相手の重要な罠にチェーンして止めるのが基本。
    // 相手ターンのエンドフェイズに表にするのは、自分の伏せ罠が無い時だけ（jspeed：お触れは自分の罠を否定する）
    if (code === JS.DECREE) {
      if (oppTop && top && (info(duel, top.code).type & T_TRAP) && impact(duel, top.code, ctx.rules) >= 2) return 86;
      const myTraps = f[me].sz.filter(q => q && (q.position & POS.FACEDOWN) && q.code !== JS.DECREE && (info(duel, q.code).type & T_TRAP)).length;
      if (!myTurn && duel.phase === PH_END && !myTraps && f[op].sz.some(q => q && (q.position & POS.FACEDOWN))) return PAR.endTrap;
      return 0;
    }
    if (HOLD_TRAPS.has(code)) return 0;
    if (BOARD_WIPE.has(code)) return fieldValue(duel, f, op) > fieldValue(duel, f, me) + PAR.wipeDiffChain ? 70 : 0;
    if (t & T_TRAP) {
      // 用途を分類していない罠：相手ターンのエンドフェイズか、相手が何かした時に使う
      if (SELF_TURN_ONLY.has(code)) return 0;                              // 諸刃の活人剣術・背水の陣は自分のメインフェイズに（先読みで判断）
      if (!myTurn && duel.phase === PH_END) return PAR.endTrap;
      if (oppTop) return 35;
      return OWN_TURN_TRAPS.has(code) && myTurn ? 50 : 0;
    }
    if (t & T_QUICK) return oppTop && impact(duel, top.code, ctx.rules) >= 2 ? 45 : 0;
    return 0;
  };
  // 同じ効果を1ターンに何度も発動しない（「スキルドレイン」で無効にされ続ける効果などで、終わらなくなるのを防ぐ）
  const ck = c => `c${c.code}:${c.description ?? ''}`;
  let best = -1, bestScore = 0;
  m.selects.forEach((c, i) => { if ((ctx.memo.used[ck(c)] || 0) >= 2) return; const s = score(c); if (s > bestScore) { bestScore = s; best = i; } });
  if (bestScore < PAR.chainMin) return { type: R.SELECT_CHAIN, index: null };
  const k = ck(m.selects[best]); ctx.memo.used[k] = (ctx.memo.used[k] || 0) + 1;
  return { type: R.SELECT_CHAIN, index: best };
}
// 相手が発動したカードの危険度（0〜3）
function impact(duel, code, rules) {
  if (BOARD_WIPE.has(code) || rules?.threats.has(code)) return 3;
  if (code === 83764718 || code === 37520316 || code === 53567095) return 3;  // 死者蘇生・精神操作・ゴッドバードアタック
  if (code === 45906428 || code === 42703248 || code === 77565204) return 3;  // ミラクル・フュージョン・ハリケーン・未来融合（神の宣告の温存先）
  if (KEY_THREATS.has(code)) return 2;
  if (ATTACK_RESPONSE.has(code) || ST_REMOVAL.has(code) || NEGATE_SUMMON.has(code) || ON_SUMMON.has(code)) return 2;
  const t = info(duel, code).type;
  if (t & (T_SPELL | T_TRAP)) return 1;
  return 1;
}

/* ---------------- 対象・コストの選び方 ---------------- */
function chooseCards(ctx, m, list, want) {
  const { duel, f, me } = ctx;
  const hint = Number(duel.hintMsg[me] ?? 0);
  const n = Math.min(Math.max(m.min, want, 1), m.max);
  const giveUp = [500, 501, 504, 507, 511, 512, 513, 519, 531, 534 - 1].includes(hint);   // 自分のカードを失う系
  const take = [506, 509, 527, 518, 573].includes(hint);                                 // 自分が得をする系
  const gyGood = graveyardGood(duel);
  const scored = list.map((c, i) => {
    const q = c.location === L.MZONE ? f[c.controller]?.mz[c.sequence] : null;
    const v = cardValue(duel, c.code, q);
    const opp = c.controller !== me;
    let s;
    if (hint === 549) s = attackTargetScore(ctx, c);
    // デッキから墓地へ（おろかな埋葬など）：記事の推奨順、なければ墓地で働くカード
    else if (!opp && c.location === L.DECK && (hint === 504 || hint === 501)) s = searchScore(ctx, c, v) + (gyGood.has(c.code) ? 50000 : 0);
    // 手札を捨てる：捨てられて働くカード（暗黒界など）を先に、次に価値の低いカード
    else if (!opp && c.location === L.HAND && (hint === 501 || hint === 504)) s = (gyGood.has(c.code) ? 100000 + v : -v);
    else if (giveUp) s = opp ? 5000 + v : -v + (c.location === L.HAND ? 0 : -200);
    else if (take) s = searchScore(ctx, c, v);
    else s = opp ? 10000 + v + usageBonus(ctx, c) : -v;   // 対象を取る系：相手の強いカードを優先（記事で挙がった対象はさらに優先）
    return { i, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => x.i);
}
// 墓地に送られて得をするカード（暗黒界は捨てられると効果、植物などは墓地から効果）
const GY_GOOD_IDS = [15341821, 67441435, 11747708, 85087012, 26202165];
function graveyardGood(duel) {
  if (!duel.data._gyGood) {
    const set = new Set(GY_GOOD_IDS);
    for (const c of Object.values(duel.data.byId)) if (c.category === 'モンスター' && String(c.name).startsWith('暗黒界の')) set.add(c.id);
    duel.data._gyGood = set;
  }
  return duel.data._gyGood;
}
// 処理中の自分のカードについて、記事が対象に挙げたカードなら上乗せ
function usageBonus(ctx, c) {
  if (!PAR.routeOn) return 0;
  const src = ctx.duel.chain[ctx.duel.chain.length - 1];
  const t = src && src.player === ctx.me && ctx.rules?.usageTargets?.[src.code];
  return t && t.includes(c.code) ? 3000 : 0;
}
function searchScore(ctx, c, v) {
  // 今処理している効果のカード（チェーンの一番上）ごとに、記事で推奨された持ってくる順
  const src = ctx.duel.chain[ctx.duel.chain.length - 1];
  const order = src && src.player === ctx.me && ctx.rules?.searchBy?.[src.code];
  if (order) {
    const k = order.indexOf(c.code);
    // 推奨順の中でも、もう手札にあるカード（2枚目）は後回し（例：小町を持っているなら商人は解体新書を持ってくる）
    const held = ctx.f[ctx.me].hand.some(q => q.code === c.code);
    if (k >= 0) return 100000 - (k + (held && order.length > 1 ? order.length : 0)) * 100;
  }
  return (SUMMON_PRIORITY[c.code] || 0) * 50 + v;
}
function attackTargetScore(ctx, c) {
  const { f, duel, me } = ctx;
  const q = f[c.controller]?.mz[c.sequence];
  if (!q) return 0;
  const la = duel.lastAttack;
  const myAtk = duel.turnPlayer === me && ctx.memo.attackerAtk != null ? ctx.memo.attackerAtk : (la && la.player === me ? la.atk : strongestAtk(f, me));
  if (q.position & POS.FACEDOWN) return !OFF.has('probe') && PROBES.has(ctx.memo.attackerCode) ? 6000 : myAtk >= PAR.fdAtk ? 2500 : 500;
  const val = q.position & POS.ATTACK ? q.attack : q.defense;
  const win = q.position & POS.ATTACK ? myAtk > q.attack : myAtk > q.defense;
  if (!OFF.has('fine') && honestRisk(ctx, q)) return 100 - val / 10;
  if (!OFF.has('fine') && win && RECRUITERS.has(q.code)) return 3000 + cardValue(duel, q.code, q) / 10;
  if (win) return 4000 + cardValue(duel, q.code, q) / 10;
  // 勝てない攻撃（カラクリの攻撃の強制など）：守備表示を殴れば自分は破壊されない。攻撃表示なら差の小さい相手に
  return q.position & POS.DEFENSE ? 2000 - (val - myAtk) : 1000 - (val - myAtk);
}
function position(ctx, m) {
  const { duel, f, op } = ctx;
  const e = info(duel, m.code);
  const oppMax = strongestAtk(f, op);
  // 相手の一番強いモンスターより強ければ攻撃表示。相手の場に攻撃役がいなければ攻撃力が守備力以上で攻撃表示。それ以外は守備表示
  const wantAtk = e.attack > oppMax || (oppMax === 0 && e.attack >= e.defense);
  const order = wantAtk ? [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]
    : [POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEUP_ATTACK, POS.FACEDOWN_ATTACK];
  return order.find(p => m.positions & p);
}
// 「効果を使いますか」：攻撃を止める効果（ホープなど）は相手の攻撃にだけ。それ以外は使う
function effectYes(ctx, m) {
  const { duel, op } = ctx;
  if (!OFF.has('brd') && m.code === JS.BRD) return brdWorth(ctx, true);
  if (ATTACK_RESPONSE.has(m.code)) {
    const la = duel.lastAttack;
    return !!(la && la.turn === duel.turn && la.player === op);
  }
  return true;
}
function yesNo(ctx, m) {
  // 「攻撃を続けますか」（巻き戻し）は、勝てる相手がいる時だけ続ける
  if (Number(m.description) === 30) return canAttackUsefully(ctx);
  return true;
}

/* ---------------- デッキ別ノウハウ（knowhow の ai_rules.json から、rawdata.mjs でカード番号にしたもの） ---------------- */
function rulesFor(duel, me) {
  const r = duel.data.raw.aiRules?.[duel.opts.decks[me]];
  if (!r) return null;
  if (!r._sets) r._sets = { threats: new Set(r.threats), hold: new Set(r.hold) };
  return { searchBy: r.searchBy, threats: r._sets.threats, hold: r._sets.hold, routes: r.routes || [], usageTargets: r.usageTargets || {}, extraOrder: r.extraOrder || [] };
}

/* ---------------- jspeed氏（くされにっき）の助言から作ったルール ---------------- */
// 先出ししない札（グレファー、墓地BFのガンナー）：序盤や、相手の場に殴る相手がいない時は出さない
function noLead(ctx, code) {
  if (!NO_LEAD.has(code)) return false;
  if (code === JS.GREPHER) return ctx.duel.turn <= 2;
  // ガンナーの後出しは墓地BFの助言（植物系ではシンクロ素材として早く出す）
  return ctx.duel.opts.decks[ctx.me] === 'blackwing' && (ctx.duel.turn <= 2 || !ctx.f[ctx.op].mz.some(Boolean));
}
// トリシューラはメイン2に出す（相手の反応でヴェーラーの有無が分かる）。攻撃で得ができるならバトルを先に
function trishulaLater(ctx, m) { return !OFF.has('tri') && ctx.duel.phase === PH_MAIN1 && ctx.duel.turn > 1 && !!m.to_bp && canAttackUsefully(ctx); }
// ブラック・ローズ・ドラゴンで場を流して得をするか（onField：ローズ自身がもう場にいる）
function brdWorth(ctx, onField = false) {
  const { duel, f, me, op } = ctx;
  const mine = fieldValue(duel, f, me) - (onField ? cardValue(duel, JS.BRD) : 0);
  return fieldValue(duel, f, op) > mine + 500;
}
// オネストを持つデッキ（ライトロード・天使）の、光属性の表側攻撃表示モンスターは、相手に手札がある間は殴らない
function honestRisk(ctx, t) {
  if (!(t.position & POS.FACEUP) || !(t.position & POS.ATTACK)) return false;
  if (!(info(ctx.duel, t.code).attribute & ATTR_LIGHT) || !ctx.f[ctx.op].hand.length) return false;
  return oppHas(ctx, JS.HONEST);
}
// 先読みが選んだ手でも、助言に反するもの（先出し・メイン1のトリシューラ）は採らない
function jspeedVeto(ctx, m, r) {
  if (r.type !== R.SELECT_IDLECMD) return false;
  const c = r.action === 0 ? m.summons[r.index] : r.action === 1 ? m.special_summons[r.index] : r.action === 5 ? m.activates[r.index] : null;
  if (!c) return false;
  const { duel, f, me } = ctx;
  // 簡易融合は場に表側のチューナーがいる時だけ
  if (r.action === 5) return c.code === JS.INSTANT_FUSION && !f[me].mz.some(q => q && (q.position & POS.FACEUP) && (info(duel, q.code).type & T_TUNER));
  // 小町を出せるのに、他のカラクリを先に通常召喚しない
  if (r.action === 0 && c.code !== JS.KOMACHI && m.summons.some(x => x.code === JS.KOMACHI) && (info(duel, c.code).setcodes || []).includes(0x11)) return true;
  return (r.action === 0 && noLead(ctx, c.code)) || (c.code === JS.TRISHULA && trishulaLater(ctx, m));
}
