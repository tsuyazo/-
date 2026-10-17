// CPUの先読み：メインフェイズの行動の候補をそれぞれ「影のデュエル」で試し、ターンの終わりまで進めた盤面で比べる。
//  - 影のデュエルは、これまでの応答を最初から再生して今の局面を作る（エンジンに局面の複製機能が無いため）
//  - 試した後の続きは通常の思考（ai.js）で進める。相手は任意の発動を一切しない
//    （相手の伏せカードや手札をCPUが覗き見しないため。強制効果だけはエンジンが処理する）
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, OcgPosition as POS } from 'ocgcore-wasm';
import { Duel, fallback } from './engine.js';

// 1ターンに先読みする回数と、1回の先読みで試す候補数の上限（ブラウザで待たせすぎないため）
export const PLAN = { perTurn: 8, candidates: 6, steps: 500 };

export function planIdle(ctx, m, greedy, respond, value) {
  const { duel, me, memo } = ctx;
  if (duel.isSim || !duel.lib || PLAN.perTurn <= 0) return null;
  memo.plans = memo.plans || 0;
  if (memo.plans >= PLAN.perTurn) return null;
  const cands = candidates(m, greedy);
  if (cands.length < 2) return null;
  memo.plans++;
  let best = null;
  for (const c of cands) {
    const v = rollout(duel, me, c.res, respond, value);
    if (v == null) continue;
    // 同じ評価なら普段の判断（greedy）を優先する
    const score = v + (c.greedy ? 1 : 0);
    if (!best || score > best.score) best = { ...c, score };
  }
  return best ? best.res : null;
}

// 試す候補：普段の判断＋召喚・特殊召喚・発動（同じカードの重複は1つにまとめる）＋何もしない
function candidates(m, greedy) {
  const out = [], seen = new Set();
  const add = (res, k, isGreedy = false) => {
    if (seen.has(k)) return;
    seen.add(k); out.push({ res, greedy: isGreedy });
  };
  add(greedy, keyOf(m, greedy), true);
  const groups = [[1, 'special_summons'], [5, 'activates'], [0, 'summons'], [3, 'monster_sets']];
  for (const [action, f] of groups) m[f].forEach((c, index) => {
    if (out.length >= PLAN.candidates) return;
    add({ type: R.SELECT_IDLECMD, action, index }, keyOf(m, { action, index }));
  });
  if (m.to_bp) add({ type: R.SELECT_IDLECMD, action: 6, index: null }, 'a6');
  else if (m.to_ep) add({ type: R.SELECT_IDLECMD, action: 7, index: null }, 'a7');
  return out;
}
function keyOf(m, r) {
  const f = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'][r.action];
  if (!f) return `a${r.action}`;
  const c = m[f][r.index];
  return `a${r.action}:${c.code}:${c.location}:${c.description ?? ''}`;
}

function rollout(duel, me, first, respond, value) {
  const s = new Duel(duel.lib, duel.data, { ...duel.opts, ai: [true, true] });
  s.isSim = true;
  s.replay = [...duel.history];
  try {
    s.start();
    let st = s.advance();
    if (st !== 'ai' || s.replay.length || s.req.type !== M.SELECT_IDLECMD) return null;
    s.aiMemo = JSON.parse(JSON.stringify(duel.aiMemo));
    s.respond(first);
    const turn = s.turn;
    for (let n = 0; n < PLAN.steps; n++) {
      st = s.advance();
      if (st === 'end' || s.turn !== turn) break;
      const q = s.req;
      if (q.player !== me) {
        // 相手：任意の発動・効果の使用はしない
        if (q.type === M.SELECT_CHAIN) { s.respond({ type: R.SELECT_CHAIN, index: q.forced ? 0 : null }); continue; }
        if (q.type === M.SELECT_EFFECTYN) { s.respond({ type: R.SELECT_EFFECTYN, yes: false }); continue; }
      }
      s.respond(s.retry > 1 ? fallback(q) : respond(s, q));
    }
    return value(s, me);
  } catch (e) {
    return null;
  } finally {
    s.destroy();
  }
}
