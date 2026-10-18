// CPUの強さの比較（並列版）：新しいCPU（src/ai.js）と、固定した前の版（src/ref/ai.js）を、
// 同じデッキ・同じシードで先後を入れ替えて対戦させる。ワーカーを複数使う。
//   node bench2.mjs [各組み合わせの対戦数=2] [ワーカー数=4] [デッキを絞る（例 dark_world）]
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';

if (isMainThread) {
  const per = +(process.argv[2] || 2), W = +(process.argv[3] || Math.min(4, os.cpus().length)), only = process.argv[4] || null;
  const { loadRaw } = await import('./rawdata.mjs');
  const keys = Object.keys(loadRaw().decks);
  const jobs = [];
  for (let r = 0; r < per; r++) for (const a of keys) for (const b of keys) for (const newFirst of [true, false]) {
    if (only && a !== only && b !== only) continue;
    jobs.push({ a, b, newFirst, seed: [1000 + r * 97 + keys.indexOf(a) * 10 + keys.indexOf(b), 3, 5, 7], only });
  }
  const res = [];
  let next = 0;
  await Promise.all(Array.from({ length: W }, () => new Promise(done => {
    const w = new Worker(new URL(import.meta.url), { workerData: { env: process.env.BENCH_ENV || '' } });
    const feed = () => { if (next < jobs.length) w.postMessage(jobs[next++]); else { w.terminate(); done(); } };
    w.on('message', m => { res.push(m); feed(); });
    w.on('error', e => { console.error(e); done(); });
    feed();
  })));
  let nw = 0, ow = 0, dr = 0, un = 0;
  const byDeck = Object.fromEntries(keys.map(k => [k, { w: 0, g: 0 }]));
  for (const r of res) {
    if (r.win == null) { un++; continue; }
    if (r.win === 2) { dr++; continue; }
    const deck = r.newSeat === 0 ? r.a : r.b;
    if (only && deck !== only) continue;
    byDeck[deck].g++;
    if (r.win === r.newSeat) { nw++; byDeck[deck].w++; } else ow++;
  }
  console.log(JSON.stringify({ games: res.length, newWins: nw, oldWins: ow, draws: dr, unfinished: un,
    newWinRate: `${(100 * nw / Math.max(1, nw + ow)).toFixed(1)}%`,
    byDeck: Object.fromEntries(Object.entries(byDeck).filter(([, v]) => v.g).map(([k, v]) => [k, `${v.w}/${v.g}`])) }, null, 1));
} else {
  const { loadRaw } = await import('./rawdata.mjs');
  const { loadCore, GameData, Duel, fallback } = await import('./src/engine.js');
  const { aiRespond: aiNew, DEFAULTS } = await import('./src/ai.js');
  // BENCH_PARAMS='{"vulnV":800}' で、新しい側の数値だけを差し替えて比べる
  const over = process.env.BENCH_PARAMS ? JSON.parse(process.env.BENCH_PARAMS) : null;
  const { aiRespond: aiOld } = await import('./src/ref/ai.js');
  const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
  parentPort.on('message', job => {
    const d = new Duel(lib, data, { decks: [job.a, job.b], ai: [true, true], names: ['先', '後'], seed: job.seed, level: 'strong' });
    const newSeat = job.newFirst ? 0 : 1;
    if (over) { d.aiParams = []; d.aiParams[newSeat] = { ...DEFAULTS, ...over }; }
    d.start();
    let st, n = 0;
    try {
      while ((st = d.advance()) === 'ai' && n++ < 6000) {
        const fn = d.req.player === newSeat ? aiNew : aiOld;
        d.respond(d.retry > 1 ? fallback(d.req) : fn(d, d.req));
      }
    } catch (e) { /* 例外は未決着として数える */ }
    const out = { a: job.a, b: job.b, newSeat, win: d.win ? d.win.player : null, turns: d.turn };
    d.destroy();
    parentPort.postMessage(out);
  });
}
