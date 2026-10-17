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
} from './ai_cards.js';
import { planIdle } from './ai_plan.js';

const T_MONSTER = 0x1, T_SPELL = 0x2, T_TRAP = 0x4, T_QUICK = 0x10000, T_FUSION = 0x40, T_SYNCHRO = 0x2000, T_XYZ = 0x800000;
const T_CONT = 0x20000, T_EQUIP = 0x40000, T_FIELD = 0x80000;
const PH_DRAW = 1, PH_STANDBY = 2, PH_MAIN1 = 4, PH_END = 512;
const VEILER = 97268402, TRAP_STUN = 59616123;
const SELF_TURN_ONLY = new Set([21007444, 32603633]);

const info = (duel, code) => duel.data.eng(code) || { type: 0, attack: 0, defense: 0, level: 0 };
const isExtra = t => (t & (T_FUSION | T_SYNCHRO | T_XYZ)) !== 0;

// モンスター・カードの「価値」：攻撃力を基本に、重要カードと大型を上乗せ
function cardValue(duel, code, q) {
  const e = info(duel, code);
  if (!(e.type & T_MONSTER)) return 1300;
  let v = q && typeof q.attack === 'number' ? Math.max(q.attack, q.defense ?? 0) : Math.max(e.attack, e.defense);
  if (KEY_THREATS.has(code)) v += 1200;
  if (isExtra(e.type)) v += 600;
  if (EXTRA_VALUE[code]) v += EXTRA_VALUE[code] * 5;
  return v;
}
function fieldValue(duel, f, p) {
  return f[p].mz.filter(Boolean).reduce((s, q) => s + (q.position & POS.FACEDOWN ? 1500 : cardValue(duel, q.code, q)), 0);
}
function strongestAtk(f, p) { return f[p].mz.filter(q => q && (q.position & POS.FACEUP)).reduce((m, q) => Math.max(m, q.attack || 0), 0); }

export function aiRespond(duel, m) {
  const me = m.player, op = 1 - me;
  const f = duel.field();
  const memo = duel.aiMemo;
  if (memo.turn !== duel.turn) { memo.turn = duel.turn; memo.used = {}; memo.idle = 0; }
  const ctx = { duel, f, me, op, memo, myTurn: duel.turnPlayer === me, rules: rulesFor(duel, me) };
  switch (m.type) {
    case M.SELECT_IDLECMD: return idle(ctx, m);
    case M.SELECT_BATTLECMD: return battle(ctx, m);
    case M.SELECT_CHAIN: return chain(ctx, m);
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: true };
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
  const planned = planIdle(ctx, m, greedy, aiRespond, boardValue);
  if (globalThis.PLAN_DEBUG && planned && planned !== greedy) console.log("   [plan]", JSON.stringify(planned), "greedy", JSON.stringify(greedy));
  if (!planned || planned === greedy) { memo.used = after; return greedy; }
  // 普段の判断と違う行動を選んだ時は、その行動に「使った」印を付ける（同じ発動を繰り返さない）
  const f = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'][planned.action];
  const c = f && m[f][planned.index];
  if (c) { const k = `${c.code}:${c.location}:${c.sequence}:${c.description ?? ''}`; memo.used[k] = (memo.used[k] || 0) + 1; }
  return planned;
}
// 先読みで比べる「盤面の良さ」：自分の場と手札とLP、相手の場とLP
export function boardValue(duel, me) {
  const op = 1 - me;
  if (duel.win) return duel.win.player === me ? 1e6 : duel.win.player === 2 ? 0 : -1e6;
  const f = duel.field();
  const st = p => f[p].sz.filter(Boolean).reduce((s, q) => s + (q.position & POS.FACEDOWN ? 850 : 450), 0) + (f[p].fz ? 500 : 0);
  // 相手の伏せが多いほど、場に出したモンスターは罠で失いやすい（手札は安全）
  const risk = Math.pow(0.93, Math.min(4, f[op].sz.filter(q => q && (q.position & POS.FACEDOWN)).length));
  return fieldValue(duel, f, me) * risk + st(me) + 700 * f[me].hand.length + 0.5 * duel.lp[me]
    - fieldValue(duel, f, op) - st(op) - duel.lp[op];
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
    const i = m.activates.findIndex(c => ((ST_REMOVAL.has(c.code) && !hold.has(c.code)) || (c.code === TRAP_STUN && stun)) && !used(c) && c.location !== L.MZONE);
    if (i >= 0) { mark(m.activates[i]); return { type: R.SELECT_IDLECMD, action: 5, index: i }; }
  }
  // 2. サーチ・ドロー・展開の魔法と、場のモンスターの起動効果
  const acts = m.activates.map((c, i) => ({ c, i, e: info(duel, c.code) })).filter(({ c, e }) => {
    if (used(c) >= (c.location === L.MZONE ? 1 : 1)) return false;
    if (HAND_TRAP.has(c.code) || DAMAGE_STEP.has(c.code)) return false;
    if (SELF_TURN_ONLY.has(c.code)) return false;                        // 普段は使わず、先読みで得になる時だけ
    if (e.type & T_TRAP) return OWN_TURN_TRAPS.has(c.code) && !HOLD_TRAPS.has(c.code);
    if (BOARD_WIPE.has(c.code)) return opVal > myVal + 1000;
    // 温存するよう勧められた除去（王宮の弾圧などへの回答）は、表側の永続カードにだけ使う
    if (ST_REMOVAL.has(c.code) && hold.has(c.code)) return f[op].sz.some(q => q && (q.position & POS.FACEUP) && (info(duel, q.code).type & T_CONT));
    if (ST_REMOVAL.has(c.code)) return oppSetST > 0 || f[op].sz.some(q => q && (q.position & POS.FACEUP));
    if (c.code === 72892473) return f[me].hand.length <= 2;           // 手札抹殺は手札が少ない時だけ
    return true;
  });
  // 優先：サーチ・ドロー（手札を増やす）→ 永続・フィールド → その他
  acts.sort((a, b) => actPriority(ctx, b) - actPriority(ctx, a));
  if (acts.length && actPriority(ctx, acts[0]) > 0) { mark(acts[0].c); return { type: R.SELECT_IDLECMD, action: 5, index: acts[0].i }; }

  // 3. 特殊召喚（エクストラは価値の高い順。手札からの特殊召喚は素直に出す）
  if (m.special_summons.length) {
    const opts = m.special_summons.map((c, i) => ({ c, i, v: spValue(ctx, c) })).filter(x => used(x.c) < 2 && x.v > 0).sort((a, b) => b.v - a.v);
    if (opts.length) { mark(opts[0].c); return { type: R.SELECT_IDLECMD, action: 1, index: opts[0].i }; }
  }
  // 4. 通常召喚（展開の起点を優先）
  if (m.summons.length) {
    const best = m.summons.map((c, i) => ({ i, v: (SUMMON_PRIORITY[c.code] || 0) * 100 + cardValue(duel, c.code) - (hold.has(c.code) ? 20000 : 0) })).sort((a, b) => b.v - a.v)[0];
    return { type: R.SELECT_IDLECMD, action: 0, index: best.i };
  }
  if (acts.length) { mark(acts[0].c); return { type: R.SELECT_IDLECMD, action: 5, index: acts[0].i }; }
  // 5. 弱いモンスターは裏守備で出しておく
  if (m.monster_sets.length && !duel.nsUsed) {
    const i = m.monster_sets.map((c, i) => ({ i, v: cardValue(duel, c.code) })).sort((a, b) => b.v - a.v)[0].i;
    return { type: R.SELECT_IDLECMD, action: 3, index: i };
  }
  // 6. 罠・速攻魔法を伏せる（バトルの後、メイン2で伏せる方が情報を与えない）
  if (duel.phase !== PH_MAIN1 || duel.turn === 1 || !canAttackUsefully(ctx)) {
    const si = m.spell_sets.findIndex(c => { const t = info(duel, c.code).type; return (t & T_TRAP) || (t & T_QUICK); });
    if (si >= 0 && f[me].sz.filter(Boolean).length < 5) return { type: R.SELECT_IDLECMD, action: 4, index: si };
  }
  // 7. 攻撃表示で弱いモンスターは守備に
  const pi = m.pos_changes.findIndex(c => {
    const q = f[me].mz[c.sequence];
    return q && (q.position & POS.ATTACK) && (q.position & POS.FACEUP) && q.attack < strongestAtk(f, op) && (q.defense ?? 0) > q.attack;
  });
  if (pi >= 0 && duel.phase !== PH_MAIN1) return { type: R.SELECT_IDLECMD, action: 2, index: pi };
  return end();
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
  if (c.location === L.EXTRA) return 1000 + (EXTRA_VALUE[c.code] || 50) * 10 + (info(duel, c.code).attack / 10);
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
  if (t.position & POS.FACEDOWN) return (a.attack || 0) >= 1900;
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
  const go = x => { memo.attackerAtk = x.q.attack || 0; return { type: R.SELECT_BATTLECMD, action: 1, index: x.i }; };
  if (direct.length) return go(direct[0]);
  const good = atks.filter(x => opMons.some(t => beats(x.q, t))).sort((a, b) => (b.q.attack || 0) - (a.q.attack || 0));
  if (good.length) return go(good[0]);
  if (!m.to_m2 && !m.to_ep && atks.length) return go(atks[0]);  // 攻撃が強制される場合
  if (!m.to_m2 && !m.to_ep && m.attacks.length) return { type: R.SELECT_BATTLECMD, action: 1, index: 0 };
  // バトルフェイズに自分から使うのは、場のモンスターの起動効果だけ（伏せた罠をむやみに撃たない）
  const ci = m.chains.findIndex(c => c.location === L.MZONE && !HAND_TRAP.has(c.code) && !DAMAGE_STEP.has(c.code) && !memo.used[`b${c.code}`]);
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
    if (NEGATE_ACTIVATION.has(code) && (t & T_MONSTER) && code !== 74294676) return oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 88 : 0;  // シエンなど
    if ((c.location === L.MZONE || c.location === L.GRAVE || c.location === L.REMOVED) && (t & T_MONSTER)) {
      if (NEGATE_SPSUMMON.has(code) || code === 74294676) return oppSummoning && summonValue >= 1800 ? 80 : (oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 70 : 0);
      return 60;
    }
    if (HAND_TRAP.has(code)) {
      if (code === VEILER) return oppTop && !myTurn && top && (info(duel, top.code).type & T_MONSTER) && KEY_THREATS.has(top.code) ? 85 : (oppTop && !myTurn && top && (info(duel, top.code).type & T_MONSTER) ? 40 : 0);
      return 60;   // ゴーズなど（条件はエンジンが判定）
    }
    if (DAMAGE_STEP.has(code)) return 70;                                   // ダメージステップで出てくる時は使う
    if (NEGATE_SUMMON.has(code)) {
      if (!oppSummoning) return oppTop && top && impact(duel, top.code, ctx.rules) >= 3 && code === 41420027 && lp > 3000 ? 75 : 0;
      if (code === 41420027 && lp <= 2000) return 0;                        // 神の宣告はLPが少ないと撃たない
      if (code === 84749824 && lp <= 2500) return 0;                        // 神の警告（2000払う）
      return summonValue >= 2300 || KEY_THREATS.has(ls.code) || ctx.rules?.threats.has(ls.code) ? 90 : 0;
    }
    if (NEGATE_SPSUMMON.has(code)) return oppSummoning && ls.kind === 'special' && summonValue >= 2000 && lp > 1000 ? 85 : 0;
    if (ON_SUMMON.has(code)) return oppSummoned && summonValue >= 1800 ? 85 : 0;
    if (WIPE_ON_SUMMON.has(code)) return oppSummoned && f[op].mz.filter(Boolean).length >= f[me].mz.filter(Boolean).length + 1 ? 80 : 0;
    if (ATTACK_RESPONSE.has(code)) {
      if (!oppAttacking) return 0;
      if (code === 44095762) return f[op].mz.filter(q => q && (q.position & POS.ATTACK)).length >= 2 || la.atk >= 2400 || lethal ? 90 : 0;
      if (code === 70342110) return la.atk >= 1700 || lethal || KEY_THREATS.has(la.code) ? 85 : 0;
      return 70;   // くず鉄のかかし・ホープは何度でも使える
    }
    if (NEGATE_ACTIVATION.has(code)) return oppTop && top && impact(duel, top.code, ctx.rules) >= 2 ? 88 : 0;
    if (ST_REMOVAL.has(code)) {
      // 相手ターンのエンドフェイズに伏せを割る／相手の永続カードが表になった時に割る
      if (!myTurn && duel.phase === PH_END && f[op].sz.some(q => q && (q.position & POS.FACEDOWN))) return 65;
      if (oppTop && top && (info(duel, top.code).type & (T_CONT | T_EQUIP | T_FIELD))) return 70;
      if (myTurn && duel.phase === PH_MAIN1 && f[op].sz.some(q => q && (q.position & POS.FACEDOWN))) return 50;
      return 0;
    }
    if (HOLD_TRAPS.has(code)) return 0;
    if (BOARD_WIPE.has(code)) return fieldValue(duel, f, op) > fieldValue(duel, f, me) + 1500 ? 70 : 0;
    if (t & T_TRAP) {
      // 用途を分類していない罠：相手ターンのエンドフェイズか、相手が何かした時に使う
      if (SELF_TURN_ONLY.has(code)) return 0;                              // 諸刃の活人剣術・背水の陣は自分のメインフェイズに（先読みで判断）
      if (!myTurn && duel.phase === PH_END) return 55;
      if (oppTop) return 35;
      return OWN_TURN_TRAPS.has(code) && myTurn ? 50 : 0;
    }
    if (t & T_QUICK) return oppTop && impact(duel, top.code, ctx.rules) >= 2 ? 45 : 0;
    return 0;
  };
  let best = -1, bestScore = 0;
  m.selects.forEach((c, i) => { const s = score(c); if (s > bestScore) { bestScore = s; best = i; } });
  return { type: R.SELECT_CHAIN, index: bestScore >= 40 ? best : null };
}
// 相手が発動したカードの危険度（0〜3）
function impact(duel, code, rules) {
  if (BOARD_WIPE.has(code) || rules?.threats.has(code)) return 3;
  if (code === 83764718 || code === 37520316 || code === 53567095) return 3;  // 死者蘇生・精神操作・ゴッドバードアタック
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
  const scored = list.map((c, i) => {
    const q = c.location === L.MZONE ? f[c.controller]?.mz[c.sequence] : null;
    const v = cardValue(duel, c.code, q);
    const opp = c.controller !== me;
    let s;
    if (hint === 549) s = attackTargetScore(ctx, c);
    else if (giveUp) s = opp ? 5000 + v : -v + (c.location === L.HAND ? 0 : -200);
    else if (take) s = searchScore(ctx, c, v);
    else s = opp ? 10000 + v : -v;                       // 対象を取る系：相手の強いカードを優先
    return { i, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => x.i);
}
function searchScore(ctx, c, v) {
  // 今処理している効果のカード（チェーンの一番上）ごとに、記事で推奨された持ってくる順
  const src = ctx.duel.chain[ctx.duel.chain.length - 1];
  const order = src && src.player === ctx.me && ctx.rules?.searchBy?.[src.code];
  if (order) { const k = order.indexOf(c.code); if (k >= 0) return 100000 - k * 100; }
  return (SUMMON_PRIORITY[c.code] || 0) * 50 + v;
}
function attackTargetScore(ctx, c) {
  const { f, duel, me } = ctx;
  const q = f[c.controller]?.mz[c.sequence];
  if (!q) return 0;
  const la = duel.lastAttack;
  const myAtk = duel.turnPlayer === me && ctx.memo.attackerAtk != null ? ctx.memo.attackerAtk : (la && la.player === me ? la.atk : strongestAtk(f, me));
  if (q.position & POS.FACEDOWN) return myAtk >= 1900 ? 2500 : 500;
  const val = q.position & POS.ATTACK ? q.attack : q.defense;
  const win = q.position & POS.ATTACK ? myAtk > q.attack : myAtk > q.defense;
  return win ? 4000 + cardValue(duel, q.code, q) / 10 : 1000 - val;
}
function position(ctx, m) {
  const { duel, f, op } = ctx;
  const e = info(duel, m.code);
  const oppMax = strongestAtk(f, op);
  const wantAtk = e.attack >= e.defense || e.attack > oppMax || e.attack >= 2000;
  const order = wantAtk ? [POS.FACEUP_ATTACK, POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEDOWN_ATTACK]
    : [POS.FACEUP_DEFENSE, POS.FACEDOWN_DEFENSE, POS.FACEUP_ATTACK, POS.FACEDOWN_ATTACK];
  return order.find(p => m.positions & p);
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
  return { searchBy: r.searchBy, threats: r._sets.threats, hold: r._sets.hold };
}
