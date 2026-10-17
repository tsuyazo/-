// CPU同士で全デッキの組み合わせを対戦させ、エンジンが止まらず決着まで進むかを確かめる
import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel } from './src/engine.js';

const raw = loadRaw();
const data = new GameData(raw);
const lib = await loadCore();
const keys = Object.keys(raw.decks);
const rounds = +(process.argv[2] || 1);
let bad = 0, total = 0;
const errs = new Map();
for (let r = 0; r < rounds; r++) for (const a of keys) for (const b of keys) {
  if (a === b) continue;
  const duel = new Duel(lib, data, { decks: [a, b], ai: [true, true], names: ['先攻', '後攻'], seed: [r * 100 + keys.indexOf(a) * 10 + keys.indexOf(b) + 1, 7, 11, 13] });
  duel.start();
  let steps = 0, st;
  while ((st = duel.advance()) === 'ai' && steps++ < 4000) duel.aiAct();
  total++;
  const ok = duel.win && st === 'end';
  if (!ok) { bad++; console.log('NG', a, b, st, 'turn', duel.turn, 'req', duel.req?.type, duel.log.slice(-3).map(x => x.s).join(' / ')); }
  for (const e of duel.errors) errs.set(e.split('\n')[0], (errs.get(e.split('\n')[0]) || 0) + 1);
  if (process.env.V) console.log(a, 'vs', b, 'turns', duel.turn, 'win', duel.win?.player, 'chains', duel.log.filter(x => x.s.startsWith('チェーン')).length);
  duel.destroy();
}
console.log(`duels ${total}, unfinished ${bad}`);
console.log('errors', [...errs.entries()].slice(0, 20));
