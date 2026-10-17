// CPUの思考。エンジンの選択要求ごとに、簡単な評価で応答を決める。
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L } from 'ocgcore-wasm';
import { sumSolve, firstBits, fallback } from './engine.js';

const TYPE_MONSTER = 0x1, TYPE_SPELL = 0x2, TYPE_TRAP = 0x4, TYPE_QUICK = 0x10000, TYPE_FIELD = 0x80000;
const TYPE_CONT = 0x20000, TYPE_EQUIP = 0x40000;
// 状況を見ずに撃つと損をしやすいカード（自分の場が相手より有利な時は使わない）
const BOARD_WIPES = new Set([53129443 /* 虚無の大穴 */]);
const MAXX_C = 23434538;
// 手札を捨てるコストなどで損をしやすい起動効果は控える
const AVOID_ACTIVATE = new Set([72892473 /* 手札一掃 */]);

// 相手ターンに使う手札誘発（自分ターンには使わない）
const OPP_TURN_ONLY = new Set([MAXX_C, 97268402 /* ヴェールの巫女 */]);

function info(duel, code) { return duel.data.eng(code) || { type: 0, attack: 0, defense: 0, level: 0 }; }
function value(duel, c, f) {
  const e = info(duel, c.code);
  if (e.type & TYPE_MONSTER) {
    if (c.location === L.MZONE && f) {
      const q = f[c.controller].mz[c.sequence];
      if (q && q.position & 0xA) return 1500;            // 裏側
      if (q && typeof q.attack === 'number') return Math.max(q.attack, q.defense ?? 0);
    }
    return Math.max(e.attack, e.defense) + (e.level || 0) * 50;
  }
  return 1200;
}
function countMonsters(f, p) { return f[p].mz.filter(Boolean).length; }

export function aiRespond(duel, m) {
  const me = m.player, op = 1 - me;
  const f = duel.field();
  const memo = duel.aiMemo;
  if (memo.turn !== duel.turn) { memo.turn = duel.turn; memo.used = {}; memo.idle = 0; }
  const key = c => `${c.code}:${c.location}:${c.sequence}:${c.description ?? ''}`;
  const myTurn = duel.turnPlayer === me;

  switch (m.type) {
    case M.SELECT_IDLECMD: {
      memo.idle = (memo.idle || 0) + 1;
      if (memo.idle > 25) return { type: R.SELECT_IDLECMD, action: m.to_bp && duel.turn > 1 ? 6 : 7, index: null };
      // 1. 特殊召喚（エクストラデッキからは攻撃力の高いもの優先）
      if (m.special_summons.length) {
        const order = m.special_summons.map((c, i) => ({ c, i, v: value(duel, c) + (c.location === L.EXTRA ? 500 : 0) }))
          .filter(x => (memo.used[key(x.c)] || 0) < 2).sort((a, b) => b.v - a.v);
        if (order.length) { memo.used[key(order[0].c)] = (memo.used[key(order[0].c)] || 0) + 1; return { type: R.SELECT_IDLECMD, action: 1, index: order[0].i }; }
      }
      // 2. 魔法・効果の発動
      const acts = m.activates.map((c, i) => ({ c, i })).filter(({ c }) => {
        const e = info(duel, c.code);
        if ((memo.used[key(c)] || 0) >= 1) return false;
        if (AVOID_ACTIVATE.has(c.code)) return false;
        if (OPP_TURN_ONLY.has(c.code)) return false;
        if (BOARD_WIPES.has(c.code) && countMonsters(f, me) >= countMonsters(f, op)) return false;
        if (e.type & TYPE_TRAP) return true;
        return true;
      });
      if (acts.length) { const a = acts[0]; memo.used[key(a.c)] = 1; return { type: R.SELECT_IDLECMD, action: 5, index: a.i }; }
      // 3. 通常召喚（攻撃力が高いもの優先）
      if (m.summons.length) {
        const best = m.summons.map((c, i) => ({ i, v: value(duel, c) })).sort((a, b) => b.v - a.v)[0];
        return { type: R.SELECT_IDLECMD, action: 0, index: best.i };
      }
      if (m.monster_sets.length) return { type: R.SELECT_IDLECMD, action: 3, index: 0 };
      // 4. 罠・速攻魔法をセット
      const setIdx = m.spell_sets.findIndex(c => { const t = info(duel, c.code).type; return (t & TYPE_TRAP) || (t & TYPE_QUICK); });
      if (setIdx >= 0 && f[me].sz.filter(Boolean).length < 5) return { type: R.SELECT_IDLECMD, action: 4, index: setIdx };
      // 5. 表示形式の変更：守備の低い攻撃表示モンスターはそのまま
      if (m.to_bp && duel.turn > 1 && f[me].mz.some(c => c && (c.position & 1))) return { type: R.SELECT_IDLECMD, action: 6, index: null };
      return { type: R.SELECT_IDLECMD, action: m.to_ep ? 7 : 6, index: null };
    }
    case M.SELECT_BATTLECMD: {
      const opMons = f[op].mz.filter(Boolean);
      const weakest = opMons.reduce((w, c) => Math.min(w, c.position & 0xA ? 1500 : (c.position & 1 ? c.attack : c.defense)), Infinity);
      const atk = m.attacks.map((c, i) => ({ c, i, a: f[me].mz[c.sequence]?.attack ?? 0 }))
        .filter(x => x.c.can_direct || x.a > weakest || (opMons.length && x.a >= 1900 && weakest === 1500))
        .sort((a, b) => b.a - a.a);
      if (atk.length) return { type: R.SELECT_BATTLECMD, action: 1, index: atk[0].i };
      if (!m.to_m2 && !m.to_ep && m.attacks.length) return { type: R.SELECT_BATTLECMD, action: 1, index: 0 };   // 『機巧』など攻撃が強制される場合
      const chains = m.chains.findIndex(c => !OPP_TURN_ONLY.has(c.code) && !(memo.used[key(c)]));
      if (chains >= 0) { memo.used[key(m.chains[chains])] = 1; return { type: R.SELECT_BATTLECMD, action: 0, index: chains }; }
      return { type: R.SELECT_BATTLECMD, action: m.to_m2 ? 2 : 3, index: null };
    }
    case M.SELECT_CHAIN: {
      if (!m.selects.length) return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
      if (m.forced) return { type: R.SELECT_CHAIN, index: 0 };
      const last = duel.chain[duel.chain.length - 1];
      const oppActed = (last && last.player === op) || (!myTurn && duel.events[me].size > 0);
      const i = m.selects.findIndex(c => {
        if (c.code === MAXX_C) return !myTurn && duel.events[me].has(M.SPSUMMONING);
        if (OPP_TURN_ONLY.has(c.code)) return !myTurn;
        const t = info(duel, c.code).type;
        if (c.location === L.MZONE || c.location === L.GRAVE || c.location === L.HAND && (t & TYPE_MONSTER)) return true; // 自分の誘発効果
        return oppActed;
      });
      return { type: R.SELECT_CHAIN, index: i >= 0 && Math.random() < 0.9 ? i : null };
    }
    case M.SELECT_EFFECTYN: case M.SELECT_YESNO:
      return { type: m.type === M.SELECT_YESNO ? R.SELECT_YESNO : R.SELECT_EFFECTYN, yes: true };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 };
    case M.SELECT_CARD: case M.SELECT_TRIBUTE: {
      const idx = chooseCards(duel, m, f, m.min);
      return m.type === M.SELECT_CARD ? { type: R.SELECT_CARD, indicies: idx } : { type: R.SELECT_TRIBUTE, indicies: idx };
    }
    case M.SELECT_UNSELECT_CARD: {
      if (m.can_finish && m.unselect_cards.length >= m.min) return { type: R.SELECT_UNSELECT_CARD, index: null };
      if (!m.select_cards.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
      const [i] = chooseCards(duel, { ...m, selects: m.select_cards }, f, 1);
      return { type: R.SELECT_UNSELECT_CARD, index: i };
    }
    case M.SELECT_POSITION: {
      const e = info(duel, m.code);
      const wantAtk = e.attack >= 1500 || e.attack >= e.defense;
      const order = wantAtk ? [1, 4, 8, 2] : [8, 4, 1, 2];
      return { type: R.SELECT_POSITION, position: order.find(p => m.positions & p) };
    }
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: sumSolve(m, c => value(duel, c, f)) || [0] };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: m.options.length - 1 };
    case M.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: firstBits(m.available, m.count).map(BigInt) };
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: firstBits(m.available, m.count) };
    case M.ANNOUNCE_CARD: {
      const ids = Object.keys(duel.data.byId).map(Number);
      return { type: R.ANNOUNCE_CARD, card: ids[0] };
    }
    default: return fallback(m);
  }
}

// 選ぶ枚数nを、要求の種類（ヒント）に応じて選ぶ
function chooseCards(duel, m, f, n) {
  const me = m.player;
  const hint = Number(duel.hintMsg[me] ?? 0);
  const giveUp = [500, 501, 504, 507, 511, 512, 513, 519, 531].includes(hint);   // 自分のカードを失う系
  const take = [506, 509, 527, 518, 573].includes(hint);                         // 自分が得をする系
  const scored = m.selects.map((c, i) => {
    const v = value(duel, c, f);
    const opp = c.controller !== me;
    let s;
    if (giveUp) s = opp ? 5000 + v : -v;        // 自分の価値の低いカードから
    else if (take) s = v;
    else s = opp ? 10000 + v : -v;               // 対象を取る系：相手の強いカードを優先
    if (hint === 549) s = attackTargetScore(duel, c, f, me);
    return { i, s };
  }).sort((a, b) => b.s - a.s);
  return scored.slice(0, Math.min(Math.max(m.min, n, 1), m.max)).map(x => x.i);
}
function attackTargetScore(duel, c, f, me) {
  const q = f[c.controller].mz[c.sequence];
  if (!q) return 0;
  if (q.position & 0xA) return 1000;
  return q.position & 1 ? 3000 - q.attack : 2000 - q.defense;
}
