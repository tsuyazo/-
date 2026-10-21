// 回帰テスト：相手の召喚成功・攻撃宣言の後、人間側の罠の発動機会が自動でパスされないか
// （人間側もCPUと同じ思考で応答させ、「相手の召喚・攻撃の後、人間にまだ一度も聞いていない」のに自動パスされた回数を数える）
import { loadRaw } from './rawdata.mjs';
import { loadCore, GameData, Duel, M } from './src/engine.js';
import { aiRespond } from './src/ai.js';

const raw = loadRaw(), data = new GameData(raw), lib = await loadCore();
const TRAP = 0x4, HUMAN = 1;
let prompted = 0, swallowed = 0;
for (let s = 1; s <= 40; s++) {
  for (const [cpuDeck, myDeck] of [['blackwing', 'rabbit'], ['six_samurai', 'agent'], ['debris_plant', 'hero'], ['rabbit', 'quick_plant']]) {
    const d = new Duel(lib, data, { decks: [cpuDeck, myDeck], ai: [true, false], names: ['CPU', 'あなた'], seed: [String(s), '3', '5', '7'] });
    let owed = null;   // 人間がまだ応答していない相手の出来事
    const onMessage = d.onMessage.bind(d);
    d.onMessage = m => {
      onMessage(m);
      if (m.type === M.NEW_TURN) owed = null;   // 前のターンの出来事は持ち越さない（ターンをまたいだ後の確認はエンドフェイズの停止が受け持つ）
      // 相手（CPU）の召喚・攻撃だけを数える（自分の手札誘発などで自分が召喚したものは除く）
      const who = m.type === M.ATTACK ? d.lastAttack?.player : d.lastSummon?.player;
      if ((m.type === M.SUMMONED || m.type === M.SPSUMMONED || m.type === M.ATTACK) && d.turnPlayer !== HUMAN && who !== HUMAN) owed = m.type;
    };
    const auto = d.autoResponse.bind(d);
    d.autoResponse = m => {
      const r = auto(m);
      // 誘発効果（spe_count>0）の確認は、どの設定でも自動でパスしてはいけない
      if (m.type === M.SELECT_CHAIN && m.player === HUMAN && m.spe_count > 0 && r && !m.forced) { swallowed++; console.log('swallowed trigger', m.selects.map(c => data.name(c.code)).join(',')); }
      if (m.type === M.SELECT_CHAIN && m.player === HUMAN && m.selects.some(c => data.eng(c.code).type & TRAP)) {
        if (r && owed) { swallowed++; console.log('swallowed after', owed === M.ATTACK ? '攻撃' : '召喚', m.selects.map(c => data.name(c.code)).join(',')); }
      }
      return r;
    };
    d.start();
    let st, n = 0;
    while ((st = d.advance()) !== 'end' && n++ < 3000) {
      if (d.req.player === HUMAN) { owed = null; if (d.req.type === M.SELECT_CHAIN) prompted++; }
      d.respond(aiRespond(d, d.req));
    }
    d.destroy();
  }
}
console.log({ prompted, swallowed });
if (swallowed > 0) { console.log('NG: 相手の召喚・攻撃の後の発動機会が自動でパスされている'); process.exit(1); }
console.log('OK');
