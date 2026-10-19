// 「対戦記録をコピー」で送られた記録（GB1103:{...}）から、同じ対戦を再現してログを出す。
//   node replay.mjs 記録ファイル [ここまでのターン]
// ログの各行に、その時点のCPUの判断（今のCPUならどうするか）も添える。
import fs from 'fs';
import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel, M } from './src/engine.js';
import { aiRespond } from './src/ai.js';

const text = fs.readFileSync(process.argv[2], 'utf8').trim().replace(/^GB1103:/, '');
const upto = +(process.argv[3] || 999);
const save = JSON.parse(text, (k, v) => typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
console.log(`記録の版：${save.build || '不明'} ・ デッキ：${save.opts.decks.join(' vs ')} ・ CPUの強さ：${save.opts.level || 'strong'} ・ 応答数：${save.history.length}`);
const d = new Duel(lib, data, save.opts);
d.chainMode = save.setup?.chainMode || 'auto';
// ゲームの「続きから」と同じ仕組みで記録を再生し、CPUが判断した場面ごとに「今のCPUならどうするか」を比べる
const respond = d.respond.bind(d);
const notes = [];
d.respond = res => {
  const q = d.lastReq;
  if (q && d.ai[q.player] && d.turn <= upto && [M.SELECT_IDLECMD, M.SELECT_BATTLECMD, M.SELECT_CHAIN].includes(q.type)) {
    const memo = JSON.stringify(d.aiMemo);
    const now = aiRespond(d, q);
    d.aiMemo = JSON.parse(memo);
    if (JSON.stringify(now) !== JSON.stringify(res)) notes.push({ at: d.log.length, s: `   ※ 今のCPUなら別の手：記録 ${JSON.stringify(res)} → 今 ${JSON.stringify(now)}` });
  }
  respond(res);
};
d.replay = save.history.slice();
d.start();
d.advance();
let ni = 0;
d.log.forEach((l, i) => {
  if (l.t > upto) return;
  while (ni < notes.length && notes[ni].at <= i) console.log(notes[ni++].s);
  console.log(l.s);
});
console.log(`（記録の最後：ターン${d.turn}、LP ${d.lp.join(' / ')}${d.win ? '、決着' : ''}）`);
