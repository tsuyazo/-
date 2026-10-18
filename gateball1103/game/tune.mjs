// CPUの数値の自動調整：デッキごとに、判断に使う数値（src/ai.js の DEFAULTS）を少し変えた案を作り、
// CPU同士の対戦で今の値より勝てるかを比べる。勝ち越した案は別のシードでもう一度確かめてから採用する。
// 相手のデッキもそれぞれの「今いちばん良い値」で戦うので、各デッキが互いに勝率を上げていく。
//   node tune.mjs [周回数=3] [ワーカー数=4]
// 状態は tune_state.json（途中から再開できる）、結果は ai_params.json（rawdata.mjs がゲームに埋め込む）。
import { Worker, isMainThread, parentPort } from 'worker_threads';
import fs from 'fs';
import os from 'os';

const ROUNDS = +(process.argv[2] || 3), W = +(process.argv[3] || Math.min(4, os.cpus().length));
const STATE = new URL('./tune_state.json', import.meta.url), OUT = new URL('./ai_params.json', import.meta.url);

// 調整する数値と、とりうる範囲
const SPACE = {
  handV: [300, 1400], setV: [300, 1500], upV: [100, 1000], fdV: [600, 2500], myLP: [0.1, 1.2], opLP: [0.4, 2],
  risk: [0.8, 1], lockV: [0, 3000], keyV: [0, 2500], extraV: [0, 1500],
  fdAtk: [1500, 2600], wipeDiff: [0, 3000], wipeDiffChain: [0, 3500], onSummonAtk: [1000, 2500], negSumVal: [1500, 3200],
  negSpVal: [1200, 3000], prisonAtk: [1200, 2600], mirrorAtk: [1500, 3200], bookAtk: [1200, 2600],
  warnLP: [2001, 4500], declLP: [1000, 4000], declSpellLP: [2000, 6000], endTrap: [20, 70], chainMin: [30, 60],
  perTurn: [4, 20, 'int'], rollouts: [1, 3, 'int'], eps: [0.1, 0.5], line: [0, 1, 'int'],
  vulnV: [0, 2000], threatW: [0, 1.5],
};

if (isMainThread) {
  const { loadRaw } = await import('./rawdata.mjs');
  const { DEFAULTS } = await import('./src/ai.js');
  const keys = Object.keys(loadRaw().decks);
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE)) : { params: {}, seed: 50000, log: [] };
  const full = d => ({ ...DEFAULTS, ...(state.params[d] || {}) });
  const save = () => {
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
    fs.writeFileSync(OUT, JSON.stringify(state.params, null, 1));
  };

  // ワーカー：1戦ずつ渡して結果を受け取る
  const workers = Array.from({ length: W }, () => new Worker(new URL(import.meta.url)));
  const idle = [...workers];
  const waiting = [];
  const runJob = job => new Promise(res => {
    const go = w => { w.once('message', m => { res(m); const n = waiting.shift(); if (n) n(w); else idle.push(w); }); w.postMessage(job); };
    const w = idle.pop(); if (w) go(w); else waiting.push(go);
  });
  // デッキ d を params で使い、他のデッキは今の値で、先後両方・rounds 周
  async function evaluate(d, params, seeds) {
    const jobs = [];
    for (const s of seeds) for (const o of keys) {
      if (o === d) continue;
      for (const seat of [0, 1]) {
        const decks = seat === 0 ? [d, o] : [o, d];
        const ps = seat === 0 ? [params, full(o)] : [full(o), params];
        jobs.push({ decks, params: ps, seed: [s, 3, 5, 7], seat });
      }
    }
    const res = await Promise.all(jobs.map(runJob));
    return res.reduce((w, r) => w + (r.win === r.seat ? 1 : 0), 0) / res.length;
  }
  function mutate(base) {
    const p = { ...base };
    const names = Object.keys(SPACE);
    const n = 1 + Math.floor(Math.random() * 3);
    const changed = [];
    for (let i = 0; i < n; i++) {
      const k = names[Math.floor(Math.random() * names.length)];
      const [lo, hi, kind] = SPACE[k];
      let v = kind === 'int' ? lo + Math.floor(Math.random() * (hi - lo + 1))
        : Math.min(hi, Math.max(lo, p[k] * (0.7 + Math.random() * 0.6) + (Math.random() - 0.5) * (hi - lo) * 0.1));
      if (kind !== 'int') v = Math.round(v * 1000) / 1000;
      p[k] = v; changed.push(`${k}=${v}`);
    }
    return { p, changed };
  }
  const diff = (p) => Object.fromEntries(Object.entries(p).filter(([k, v]) => DEFAULTS[k] !== v && !k.startsWith('_')));

  for (let r = 0; r < ROUNDS; r++) {
    for (const d of keys) {
      const base = full(d);
      const { p, changed } = mutate(base);
      const seeds1 = [state.seed++, state.seed++, state.seed++, state.seed++];
      const [b1, c1] = [await evaluate(d, base, seeds1), await evaluate(d, p, seeds1)];
      let verdict = 'reject', b2 = null, c2 = null;
      if (c1 - b1 >= 0.04) {
        const seeds2 = [state.seed++, state.seed++, state.seed++, state.seed++];
        [b2, c2] = [await evaluate(d, base, seeds2), await evaluate(d, p, seeds2)];
        if ((c1 + c2) / 2 - (b1 + b2) / 2 >= 0.03 && c2 >= b2) { verdict = 'accept'; state.params[d] = diff(p); }
      }
      const entry = { t: new Date().toISOString(), round: r, deck: d, changed, base: b1, cand: c1, base2: b2, cand2: c2, verdict };
      state.log.push(entry);
      console.log(JSON.stringify(entry));
      save();
    }
  }
  workers.forEach(w => w.terminate());
} else {
  const { loadRaw } = await import('./rawdata.mjs');
  const { loadCore, GameData, Duel, fallback } = await import('./src/engine.js');
  const { aiRespond } = await import('./src/ai.js');
  const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
  parentPort.on('message', job => {
    const d = new Duel(lib, data, { decks: job.decks, ai: [true, true], names: ['先', '後'], seed: job.seed, level: 'strong' });
    d.aiParams = job.params;
    d.start();
    let n = 0;
    try { while (d.advance() === 'ai' && n++ < 6000) d.respond(d.retry > 1 ? fallback(d.req) : aiRespond(d, d.req)); } catch (e) { /* 未決着 */ }
    const out = { win: d.win ? d.win.player : null, seat: job.seat };
    d.destroy();
    parentPort.postMessage(out);
  });
}
