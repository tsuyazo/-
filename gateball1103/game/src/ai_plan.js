// CPUの先読み：メインフェイズの行動の候補をそれぞれ「影のデュエル」で試し、ターンの終わりまで進めた盤面で比べる。
//  - 影のデュエルは、これまでの応答を最初から再生して今の局面を作る（エンジンに局面の複製機能が無いため）
//  - 試した後の続きは通常の思考（ai.js）で進める。相手は任意の発動を一切しない
//    （相手の伏せカードや手札をCPUが覗き見しないため。強制効果だけはエンジンが処理する）
import { OcgMessageType as M, OcgResponseType as R, OcgLocation as L, OcgPosition as POS } from 'ocgcore-wasm';
import { Duel, fallback } from './engine.js';

// 1ターンに先読みする回数と、1回の先読みで試す候補数の上限（ブラウザで待たせすぎないため）
export const PLAN = { perTurn: 12, candidates: 8, steps: 500 };

export function planIdle(ctx, m, greedy, respond, value) {
  const { duel, me, memo } = ctx;
  if (duel.isSim || !duel.lib || PLAN.perTurn <= 0 || duel.opts.level === 'normal') return null;   // 強さ「普通」は先読みしない
  memo.plans = memo.plans || 0;
  if (memo.plans >= PLAN.perTurn) return null;
  const cands = candidates(duel, m, greedy);
  if (cands.length < 2) return null;
  memo.plans++;
  // エンジンのメモリを今の局面で保存（候補ごとにここへ戻す）
  if (duel.lib.memory) duel._snap = new Uint8Array(duel.lib.memory.buffer).slice();
  let best = null;
  for (const c of cands) {
    const v = rollout(duel, me, c.res, respond, value);
    if (v == null) continue;
    // 同じ評価なら普段の判断（greedy）を優先する
    const score = v + (c.greedy ? 1 : 0);
    if (!best || score > best.score) best = { ...c, score };
  }
  duel._snap = null;
  return best ? best.res : null;
}

// 試す候補：普段の判断＋召喚・特殊召喚・発動（同じカードの重複は1つにまとめる）＋何もしない
function candidates(duel, m, greedy) {
  const out = [], seen = new Set();
  const add = (res, k, isGreedy = false) => {
    if (seen.has(k)) return;
    seen.add(k); out.push({ res, greedy: isGreedy });
  };
  add(greedy, keyOf(m, greedy), true);
  const groups = [[1, 'special_summons'], [5, 'activates'], [0, 'summons'], [3, 'monster_sets']];
  for (const [action, f] of groups) m[f].forEach((c, index) => {
    if (out.length >= PLAN.candidates) return;
    // リバース効果モンスターを表で召喚するのは候補にしない（ターン終了時の盤面では損が見えないため）
    if (action === 0 && ((duel.data.eng(c.code)?.type || 0) & 0x200000)) return;
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

// 影のデュエルを作る。エンジンのメモリを保存できる時は、今の局面を写した上でJS側の状態だけ複製する（速い）。
// できない時は、これまでの応答を最初から再生する（遅い）
function shadow(duel) {
  // インスタンスに直接付いた関数（テストの差し替えなど、元のデュエルに束縛されたもの）は写さない
  const s = Object.create(Object.getPrototypeOf(duel));
  for (const [k, v] of Object.entries(duel)) if (typeof v !== 'function') s[k] = v;
  Object.assign(s, {
    isSim: true, replay: [], lp: [...duel.lp], log: [], uiEvents: [], chain: duel.chain.map(c => ({ ...c })),
    events: duel.events.map(e => new Set(e)), history: [], errors: [], hintMsg: [...duel.hintMsg],
    aiMemo: JSON.parse(JSON.stringify(duel.aiMemo)),
  });
  return s;
}
function rollout(duel, me, first, respond, value) {
  const mem = duel.lib.memory;
  if (mem) {
    const snap = duel._snap;
    new Uint8Array(mem.buffer).set(snap);
    const s = shadow(duel);
    duel.simming = true;
    try { return play(s, me, first, respond, value); }
    catch (e) { return null; }
    finally { new Uint8Array(mem.buffer).set(snap); duel.simming = false; }
  }
  const s = new Duel(duel.lib, duel.data, { ...duel.opts, ai: [true, true] });
  s.isSim = true;
  s.replay = [...duel.history];
  try {
    s.start();
    const st = s.advance();
    if (st !== 'ai' || s.replay.length || s.req.type !== M.SELECT_IDLECMD) return null;
    s.aiMemo = JSON.parse(JSON.stringify(duel.aiMemo));
    return play(s, me, first, respond, value);
  } catch (e) {
    return null;
  } finally {
    s.destroy();
  }
}
function play(s, me, first, respond, value) {
  let st;
  {
    s.respond(first);
    const turn = s.turn;
    for (let n = 0; n < PLAN.steps; n++) {
      st = s.advance();
      if (st === 'end' || s.turn !== turn) break;
      const q = s.req;
      if (q.player !== me) {
        // 相手：表側のカード（場のモンスター・表側の魔法罠＝誰でも見える情報）の効果だけ使う。
        // 手札・伏せカードは見えないので使わせない（ライオウや王宮の弾圧は読み込める）
        if (q.type === M.SELECT_CHAIN) {
          if (q.forced) { s.respond({ type: R.SELECT_CHAIN, index: 0 }); continue; }
          const pub = q.selects.map((c, i) => ({ c, i })).filter(({ c }) => isPublic(s, c));
          let index = null;
          if (pub.length) {
            const r = respond(s, { ...q, selects: pub.map(x => x.c) });
            if (r && r.index != null) index = pub[r.index]?.i ?? null;
          }
          s.respond({ type: R.SELECT_CHAIN, index }); continue;
        }
        if (q.type === M.SELECT_EFFECTYN) { s.respond({ type: R.SELECT_EFFECTYN, yes: isPublic(s, q) }); continue; }
      }
      s.respond(s.retry > 1 ? fallback(q) : respond(s, q));
    }
    return value(s, me);
  }
}

function isPublic(s, c) {
  if (c.location === L.MZONE) return true;
  if (c.location !== L.SZONE) return false;
  const q = s.query({ controller: c.controller, location: c.location, sequence: c.sequence });
  return !!(q && (q.position & POS.FACEUP));
}
