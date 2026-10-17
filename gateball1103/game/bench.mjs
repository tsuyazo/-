// CPUの強さの比較：新しいCPU（src/ai.js）と固定した初期版（src/ai_baseline.js）を、同じデッキ・同じシードで先後を入れ替えて対戦させる。
//   node bench.mjs [各組み合わせの対戦数=2]
import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel, fallback } from './src/engine.js';
import { aiRespond as aiNew } from './src/ai.js';
import { aiRespond as aiOld } from './src/ai_baseline.js';

const per = +(process.argv[2] || 2);
const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
const keys = Object.keys(raw.decks);
let newWins = 0, oldWins = 0, draws = 0, unfinished = 0;
const byDeck = Object.fromEntries(keys.map(k => [k, { w: 0, g: 0 }]));
for (let r = 0; r < per; r++) for (const a of keys) for (const b of keys) for (const newFirst of [true, false]) {
  const seed = [1000 + r * 97 + keys.indexOf(a) * 10 + keys.indexOf(b), 3, 5, 7];
  const d = new Duel(lib, data, { decks: [a, b], ai: [true, true], names: ['先', '後'], seed });
  const newSeat = newFirst ? 0 : 1;
  d.start();
  let st, n = 0;
  while ((st = d.advance()) === 'ai' && n++ < 6000) {
    // ABL=idle,chain,battle,select … 指定した種類の要求だけ新CPUでも初期版で応答する（どこが効いているかの切り分け用）
    const abl = (process.env.ABL || '').split(',');
    const kind = { 11: 'idle', 10: 'battle', 16: 'chain', 15: 'select', 26: 'select', 20: 'select', 23: 'select' }[d.req.type] || 'other';
    const fn = d.req.player === newSeat ? (abl.includes(kind) ? aiOld : aiNew) : aiOld;
    d.respond(d.retry > 1 ? fallback(d.req) : fn(d, d.req));
  }
  if (!d.win) unfinished++;
  else if (d.win.player === 2) draws++;
  else if (d.win.player === newSeat) { newWins++; byDeck[d.opts.decks[newSeat]].w++; }
  else oldWins++;
  byDeck[d.opts.decks[newSeat]].g++;
  d.destroy();
}
const total = newWins + oldWins;
console.log(JSON.stringify({ newWins, oldWins, draws, unfinished, newWinRate: `${(100 * newWins / Math.max(1, total)).toFixed(1)}%`,
  byDeck: Object.fromEntries(Object.entries(byDeck).map(([k, v]) => [k, `${v.w}/${v.g}`])) }, null, 1));
