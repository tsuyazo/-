// 大量テストプレイ：CPU同士、またはCPU対ランダムに選ぶプレイヤーで対戦させ、不具合の兆候を集める。
//   node stress.mjs [対戦数=1000] [開始シード=1]
// 集めるもの：例外、エンジンのスクリプトエラー、不正応答の繰り返し、決着しない対戦、
//             名前の無いカード表示、盤面の不整合（枚数・LP）。
import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel, M, R, L, fallback, sumSolve, firstBits } from './src/engine.js';
import { aiRespond } from './src/ai.js';

const N = +(process.argv[2] || 1000), START = +(process.argv[3] || 1);
const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
const keys = Object.keys(raw.decks);
const issues = new Map();        // 種類 → {count, examples[]}
const note = (kind, detail) => {
  const e = issues.get(kind) || { count: 0, examples: [] };
  e.count++; if (e.examples.length < 5) e.examples.push(detail);
  issues.set(kind, e);
};

// 乱数（シード固定で再現できる）
let rs = 1;
const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];

// 人間がしそうな「変わった」選択をランダムに返す
function randomResponse(m) {
  switch (m.type) {
    case M.SELECT_IDLECMD: {
      const opts = [];
      ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'].forEach((k, a) => m[k].forEach((_, i) => opts.push([a, i])));
      if (!opts.length || rnd() < 0.2) {
        // 『カラクリ』の「可能な限り攻撃」などで終了できない場合があるので、選べる方だけを使う
        const ends = [...(m.to_bp ? [6] : []), ...(m.to_ep ? [7] : [])];
        if (ends.length) return { type: R.SELECT_IDLECMD, action: pick(ends), index: null };
      }
      if (!opts.length) return fallback(m);
      const [action, index] = pick(opts); return { type: R.SELECT_IDLECMD, action, index };
    }
    case M.SELECT_BATTLECMD:
      if (m.attacks.length && rnd() < 0.7) return { type: R.SELECT_BATTLECMD, action: 1, index: Math.floor(rnd() * m.attacks.length) };
      if (m.chains.length && rnd() < 0.3) return { type: R.SELECT_BATTLECMD, action: 0, index: Math.floor(rnd() * m.chains.length) };
      return fallback(m);
    case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.selects.length && (m.forced || rnd() < 0.5) ? Math.floor(rnd() * m.selects.length) : null };
    case M.SELECT_CARD: case M.SELECT_TRIBUTE: {
      if (m.can_cancel && rnd() < 0.1) return { type: m.type === M.SELECT_CARD ? R.SELECT_CARD : R.SELECT_TRIBUTE, indicies: null };
      const n = m.min + Math.floor(rnd() * (Math.min(m.max, m.selects.length) - m.min + 1));
      const idx = [...m.selects.keys()].sort(() => rnd() - 0.5).slice(0, n);
      return { type: m.type === M.SELECT_CARD ? R.SELECT_CARD : R.SELECT_TRIBUTE, indicies: idx };
    }
    case M.SELECT_UNSELECT_CARD:
      if (m.can_finish && rnd() < 0.5) return { type: R.SELECT_UNSELECT_CARD, index: null };
      if (!m.select_cards.length) return { type: R.SELECT_UNSELECT_CARD, index: null };
      return { type: R.SELECT_UNSELECT_CARD, index: Math.floor(rnd() * m.select_cards.length) };
    case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: rnd() < 0.6 };
    case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: rnd() < 0.5 };
    case M.SELECT_OPTION: return { type: R.SELECT_OPTION, index: Math.floor(rnd() * m.options.length) };
    case M.SELECT_POSITION: { const ps = [1, 2, 4, 8].filter(p => m.positions & p); return { type: R.SELECT_POSITION, position: pick(ps) }; }
    case M.SELECT_SUM: return { type: R.SELECT_SUM, indicies: sumSolve(m) || [0] };
    case M.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: Math.floor(rnd() * m.options.length) };
    case M.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: firstBits(m.available, m.count).map(BigInt) };
    case M.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: firstBits(m.available, m.count) };
    default: return fallback(m);
  }
}

function deckSize(key) { const d = raw.decks[key]; return d.main.reduce((s, x) => s + x[0], 0) + d.extra.reduce((s, x) => s + x[0], 0); }

const t0 = Date.now();
let finished = 0, turnsTotal = 0, wins = [0, 0, 0];
const deckWins = Object.fromEntries(keys.map(k => [k, { w: 0, g: 0 }]));
for (let g = 0; g < N; g++) {
  const seedNo = START + g;
  rs = seedNo;
  const a = pick(keys), b = pick(keys);
  const mode = rnd() < 0.5 ? 'cpu' : 'random';      // random: 後攻側（チーム1）がランダムに選ぶ
  const duel = new Duel(lib, data, { decks: [a, b], ai: [true, mode === 'cpu'], names: ['A', 'B'], seed: [seedNo, 7, 11, 13] });
  const ctx = `#${seedNo} ${a} vs ${b} (${mode})`;
  let steps = 0, st, lastTurn = 0, sameTurnSteps = 0;
  try {
    duel.start();
    while ((st = duel.advance()) !== 'end') {
      if (++steps > 6000) { note('stall:steps', `${ctx} turn ${duel.turn}`); break; }
      if (duel.turn === lastTurn) { if (++sameTurnSteps > 600) { note('stall:turn', `${ctx} turn ${duel.turn} req ${duel.req.type} ${duel.log.slice(-2).map(x => x.s).join(' / ')}`); break; } }
      else { lastTurn = duel.turn; sameTurnSteps = 0; }
      if (duel.turn > 150) { note('stall:turns>150', ctx); break; }
      if (duel.retry > 3) note('retry-loop', `${ctx} req ${duel.req.type} turn ${duel.turn}`);
      const res = st === 'ai' ? aiRespond(duel, duel.req) : randomResponse(duel.req);
      duel.respond(res);
      // 盤面の整合性
      if (steps % 25 === 0) {
        const f = duel.field();
        for (const p of [0, 1]) {
          if (duel.lp[p] < 0) note('lp-negative', ctx);
          const count = f[p].mz.filter(Boolean).length + f[p].sz.filter(Boolean).length + (f[p].fz ? 1 : 0)
            + f[p].hand.length + f[p].gy.length + f[p].ban.length + f[p].extra.length + f[p].deck
            + f[p].mz.filter(Boolean).reduce((s, q) => s + (q.overlayCards?.length || 0), 0);
          if (count > deckSize(duel.opts.decks[0]) + deckSize(duel.opts.decks[1]) + 10) note('card-count', `${ctx} p${p} ${count}`);
        }
      }
    }
  } catch (e) {
    note('exception', `${ctx} turn ${duel.turn}: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
  }
  for (const e of duel.errors) note('script-error', `${ctx}: ${e.split('\n')[0]}`);
  for (const l of duel.log) if (/「カード」|「裏側のカード」の効果|undefined|NaN/.test(l.s)) note('bad-label', `${ctx}: ${l.s}`);
  if (duel.win) {
    finished++; turnsTotal += duel.turn; wins[duel.win.player === 2 ? 2 : duel.win.player]++;
    if (mode === 'cpu' && duel.win.player !== 2) {
      const wk = duel.opts.decks[duel.win.player], lk = duel.opts.decks[1 - duel.win.player];
      deckWins[wk].w++; deckWins[wk].g++; deckWins[lk].g++;
    }
  }
  duel.destroy();
  if ((g + 1) % 100 === 0) console.error(`${g + 1}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const report = {
  duels: N, finished, avgTurns: +(turnsTotal / Math.max(1, finished)).toFixed(1), firstPlayerWins: wins[0], secondPlayerWins: wins[1], draws: wins[2],
  seconds: Math.round((Date.now() - t0) / 1000),
  deckWinRate: Object.fromEntries(Object.entries(deckWins).map(([k, v]) => [k, v.g ? `${(100 * v.w / v.g).toFixed(0)}% (${v.g})` : '-'])),
  issues: Object.fromEntries(issues),
};
console.log(JSON.stringify(report, null, 1));
