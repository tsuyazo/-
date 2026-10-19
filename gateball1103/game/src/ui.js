// 画面層：エンジンの状態を描画し、人間の入力をエンジンへの応答に変換する。
import { cardMatchesOpcode } from 'ocgcore-wasm';
import { Duel, GameData, PHASE_NAME, L, POS, M, R, locName, sumSolve } from './engine.js';
import { aiRespond } from './ai.js';
import { playFx } from './fx.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const SAVE_KEY = 'gb1103-engine-duel-v2';   // v1 はデッキ未シャッフル時代の記録なので再生しない
const TIER = { rabbit: 'S', agent: 'S', hero: 'A', tg_gadget: 'A', debris_plant: 'A', quick_plant: 'A', six_samurai: 'A', dark_world: 'B', karakuri: 'B', blackwing: 'B〜A' };
// データ上の種類名 → 画面での表記（遊戯王の用語）
const SUBTYPE_LABEL = { 同調: 'シンクロ', 重ね: 'エクシーズ', 調律: 'チューナー' };
const TYPE_COLOR = { 通常: 'normal', 効果: 'effect', 融合: 'fusion', 同調: 'synchro', 重ね: 'xyz' };

let lib, data, duel = null;
let setup = { mode: 'cpu', deck: ['rabbit', 'agent'], first: 'rand', curtain: true, chainMode: 'auto', speed: 'normal', level: 'strong', fx: 'on' };
let view = 0;              // 画面の持ち主（下側に表示するプレイヤー）
let curtain = false;
let busy = false;          // CPUが考え中
let F = null;              // 最新の盤面
let sel = [];              // 選択中のインデックス（複数選択の要求）
let pend = null;           // 開いている要求
let SAVED = null;

export async function boot(raw, coreLib, hot) {
  lib = coreLib; data = new GameData(raw);
  document.addEventListener('click', onClick);
  const snap = hot?.data;
  if (snap?.save) restore(snap.save); else render();
  hot?.snapshot?.(() => ({ save: currentSave() }));
}

/* ---------------- 保存と再開（応答の記録を再生して復元） ---------------- */
function currentSave() { return duel ? { opts: { ...duel.opts }, seats: duel.seatsInfo, history: duel.history.slice(), setup: { ...setup } } : null; }
function persist() { try { const s = currentSave(); if (s) localStorage.setItem(SAVE_KEY, JSON.stringify(s, (k, v) => typeof v === 'bigint' ? `${v}n` : v)); } catch (e) { /* 保存できなくても遊べる */ } }
function loadSaved() { try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s, (k, v) => typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v) : null; } catch (e) { return null; } }
function clearSaved() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ } }
function restore(save) {
  setup = { ...setup, ...save.setup };
  setup.chainMode = { events: 'auto', always: 'on' }[setup.chainMode] || setup.chainMode;   // 以前の設定名
  newDuel(save.opts, save.seats, save.history);
}

/* ---------------- デュエル開始 ---------------- */
function startFromSetup() {
  const humanFirst = setup.first === 'rand' ? Math.random() < 0.5 : setup.first === 'me';
  // チーム0が先攻。setup.deck[0] は「あなた（P1）」のデッキ
  const seatOfTeam = humanFirst ? [0, 1] : [1, 0];
  const names = setup.mode === 'cpu' ? ['あなた', 'CPU'] : ['P1', 'P2'];
  const opts = {
    decks: seatOfTeam.map(s => setup.deck[s]),
    ai: seatOfTeam.map(s => setup.mode === 'cpu' && s === 1),
    names: seatOfTeam.map(s => names[s]),
    seed: [1, 2, 3, 4].map(() => String(1 + Math.floor(Math.random() * 2 ** 31))),
    level: setup.level,
  };
  newDuel(opts, { seatOfTeam }, []);
}
function newDuel(opts, seats, history) {
  if (duel) duel.destroy();
  duel = new Duel(lib, data, opts);
  duel.seatsInfo = seats;
  duel.chainMode = setup.chainMode;
  duel.replay = history.slice();
  duel.start();
  view = setup.mode === 'cpu' ? opts.ai.indexOf(false) : seats.seatOfTeam.indexOf(0);
  curtain = setup.mode === 'pvp' && setup.curtain;
  loop();
}

/* ---------------- 進行ループ ---------------- */
async function loop() {
  const replaying = duel.replay.length > 0;
  busy = true;
  const st = duel.advance();
  F = duel.field();
  const evs = duel.takeUiEvents();
  if (!replaying) await playEvents(evs);
  if (st === 'end') { busy = false; pend = null; clearSaved(); render(); return; }
  if (st === 'ai') {
    render();
    const visible = [M.SELECT_IDLECMD, M.SELECT_BATTLECMD, M.SELECT_CHAIN].includes(duel.req.type);
    const delay = replaying ? 0 : setup.speed === 'fast' ? (visible ? 150 : 0) : (visible ? 700 : 60);
    setTimeout(() => { duel.aiAct(); loop(); }, delay);
    return;
  }
  busy = false;
  const req = duel.req;
  if (setup.mode === 'pvp' && req.player !== view) { view = req.player; if (setup.curtain) curtain = true; }
  pend = req; sel = [];
  persist();
  render();
}

/* ---------------- 演出：ターン交代の帯、フェイズ、相手の行動の字幕 ---------------- */
const wait = ms => new Promise(r => setTimeout(r, ms));
let capCount = 0;   // このターンに出したCPUの字幕の数
const capWorthy = e => e && e.k === 'log' && e.p != null && setup.mode === 'cpu' && e.p !== view && /召喚|セット|チェーン|攻撃/.test(e.s);
// 演出で出すカードの情報（種類・名前・画像）
function fxInfo(code) {
  const c = data.card(code);
  const kind = c?.category === '魔法' ? 'spell' : c?.category === '罠' ? 'trap' : 'monster';
  return { kind, name: data.name(code), img: imageOf(code) };
}
async function playEvents(evs) {
  const fast = setup.speed === 'fast';
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.k === 'fx') {
      if (setup.fx === 'off') continue;
      render();
      // CPUの行動なら、直後の字幕を演出と同時に出す（待ち時間を増やさない）
      let cap = null;
      if (capWorthy(evs[i + 1])) { i++; capCount++; cap = caption(evs[i].s, (fast ? 450 : 1100) * (capCount > 6 ? 0.5 : 1), e.t === 'activate'); }
      await Promise.all([playFx(e, { speed: fast ? 0.6 : 1, view, info: fxInfo }), cap]);
      continue;
    }
    if (e.k === 'turn') {
      capCount = 0;
      render();
      await banner(e.p, e.t, fast ? 700 : 1500);
    } else if (e.k === 'phase') {
      if (e.p !== view || setup.mode === 'pvp') { render(); await wait(fast ? 120 : 380); }
    } else if (capWorthy(e)) {
      render();
      // 展開の長いターンは、7つ目以降の字幕を短くして待ち時間を減らす
      const long = ++capCount > 6;
      await caption(e.s, (fast ? 450 : 1100) * (long ? 0.5 : 1));
    }
  }
}
function banner(p, t, ms) {
  const mine = p === view;
  const el = $('#banner');
  el.className = `banner ${mine ? 'mine' : 'theirs'}`;
  el.innerHTML = `<div class="band"><small>ターン${t}</small>${esc(duel.names[p])}のターン</div>`;
  el.hidden = false;
  return wait(ms).then(() => { el.hidden = true; });
}
function caption(text, ms, low = false) {
  const el = $('#caption');
  el.textContent = text; el.hidden = false;
  el.classList.toggle('low', low);   // 演出（カットイン）と重ならないよう下に出す
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  return wait(ms).then(() => { el.hidden = true; });
}
function answer(res) {
  pend = null; sel = [];
  closeSheet();
  duel.respond(res);
  loop();
}

/* ---------------- 描画 ---------------- */
function render() {
  const app = $('#app');
  renderSideLog();
  if (!duel) { app.innerHTML = setupHTML(); closeSheet(); return; }
  const me = view, op = 1 - me;
  const lastLog = duel.log[duel.log.length - 1]?.s || '';
  app.innerHTML = `
    ${duel.win ? winHTML() : ''}
    <div class="side ${duel.turnPlayer === op ? 'turnside theirs' : ''}">${pilesHTML(op)}${zonesHTML(op, 'sz')}${zonesHTML(op, 'mz')}</div>
    <div class="mid">
      <div class="lp ${duel.turnPlayer === op ? 'cur' : ''}" id="lp-${op}"><small>${esc(duel.names[op])}${duel.turnPlayer === op ? '（ターン中）' : ''}</small>${duel.lp[op]}</div>
      <div class="phase"><span class="t">ターン${duel.turn}</span><span class="who ${duel.turnPlayer === me ? 'mine' : 'theirs'}">${esc(duel.names[duel.turnPlayer])}のターン</span><span class="t ns">通常召喚：${duel.nsUsed ? '済' : '未'}</span></div>
      <div class="lp r ${duel.turnPlayer === me ? 'cur' : ''}" id="lp-${me}"><small>${esc(duel.names[me])}${duel.turnPlayer === me ? '（ターン中）' : ''}</small>${duel.lp[me]}</div>
    </div>
    ${phaseStrip()}
    ${duel.chain.length ? `<div class="chain">${duel.chain.map((c, i) => `<span>C${i + 1} ${esc(data.name(c.code))}</span>`).join('')}</div>` : ''}
    <button class="logline" data-a="log">${esc(lastLog)}</button>
    <div class="side ${duel.turnPlayer === me ? 'turnside mine' : ''}">${zonesHTML(me, 'mz')}${zonesHTML(me, 'sz')}${pilesHTML(me)}</div>
    <div class="hand">${F[me].hand.map((q, i) => tileHTML(q, me, L.HAND, i)).join('') || '<span class="note">手札なし</span>'}</div>
    <div class="tools">${toolsHTML()}</div>`;
  if (curtain) showCurtain();
  else if (pend && !isCommand(pend) && !$('#layer').innerHTML) openPrompt();
}
// PC幅で盤面の右に出す記録（スマホ幅ではCSSで隠れる。今まで通り「ログ」から見られる）
function renderSideLog() {
  const sl = $('#sidelog'); if (!sl) return;
  if (!duel || curtain) { sl.hidden = true; return; }
  sl.hidden = false;
  const cls = l => /^―/.test(l.s) ? 'sl-turn' : l.p == null ? '' : l.p === view ? '' : 'sl-op';
  sl.innerHTML = `<h4>デュエルの記録</h4>${duel.log.slice(-250).map(l => `<div class="${cls(l)}">${esc(l.s)}</div>`).join('')}`;
  sl.scrollTop = sl.scrollHeight;
}
const PHASES = [[1, 'ドロー'], [2, 'スタンバイ'], [4, 'メイン1'], [248, 'バトル'], [256, 'メイン2'], [512, 'エンド']];
function phaseStrip() {
  const cls = duel.turnPlayer === view ? 'mine' : 'theirs';
  return `<div class="phases ${cls}">${PHASES.map(([m, l]) => `<span class="${duel.phase & m ? 'on' : ''}">${l}</span>`).join('')}</div>`;
}
const isCommand = r => r.type === M.SELECT_IDLECMD || r.type === M.SELECT_BATTLECMD;
function toolsHTML() {
  if (duel.win) return `<button class="go" data-a="rematch">もう一度</button><button data-a="quit">デッキ選択へ</button><button data-a="export">記録を送る</button><button data-a="more">その他</button>`;
  if (busy) {
    // 相手の番に人間がいる時だけ「ここで止める」を出す（マスターデュエルの長押しにあたる）
    const human = duel.ai.some(a => !a);
    return `<div class="think ${human ? 'narrow' : ''}">${esc(duel.names[duel.req?.player ?? 1])}が考え中…</div>${human ? `<button data-a="stop" class="${duel.stopRequest ? 'on' : ''}">${duel.stopRequest ? '止める予約中' : 'ここで止める'}</button>` : ''}<button data-a="more">その他</button>`;
  }
  const r = pend;
  if (!r) return `<button data-a="more">その他</button>`;
  if (r.type === M.SELECT_IDLECMD) return `
    <button class="go" data-a="acts">行動一覧（${countActs(r)}）</button>
    <button data-a="tobp" ${r.to_bp ? '' : 'disabled'}>バトルへ</button>
    <button data-a="toep" ${r.to_ep ? '' : 'disabled'}>ターン終了</button>
    <button data-a="more">その他</button>`;
  if (r.type === M.SELECT_BATTLECMD) return `
    <button class="go" data-a="acts">攻撃・発動（${r.attacks.length + r.chains.length}）</button>
    <button data-a="tom2" ${r.to_m2 ? '' : 'disabled'}>メイン2へ</button>
    <button data-a="toep2" ${r.to_ep ? '' : 'disabled'}>ターン終了</button>
    <button data-a="more">その他</button>`;
  return `<button class="go" data-a="prompt">選択に戻る</button><button data-a="log">ログ</button><button data-a="more">その他</button>`;
}
function countActs(r) { return r.summons.length + r.special_summons.length + r.pos_changes.length + r.monster_sets.length + r.spell_sets.length + r.activates.length; }
function winHTML() {
  const w = duel.win.player;
  const msg = w === 2 ? '引き分け' : `${duel.names[w]}の勝利`;
  // 決着の理由（エンジンの番号：1＝ライフが0、2＝デッキ切れ、0＝降参など）
  const why = { 1: 'ライフポイントが0になった', 2: 'デッキからカードを引けなかった' }[duel.win.reason] || '';
  const loser = w === 2 ? null : 1 - w;
  const deck = p => data.raw.decks[duel.opts.decks[p]]?.name || '';
  const row = p => `<span>${esc(duel.names[p])}（${esc(deck(p))}）</span><b>LP ${duel.lp[p]}</b>`;
  return `<div class="win"><div class="wt">${esc(msg)}</div>
    <p class="wsub">${loser != null && why ? `${esc(duel.names[loser])}の${esc(why)}・` : ''}${duel.turn}ターン</p>
    <div class="wrows"><div>${row(0)}</div><div>${row(1)}</div></div></div>`;
}
function pilesHTML(p) {
  const P = F[p];
  const fz = P.fz ? `<button class="pile fz" data-card="${p}:${L.SZONE}:5"><span>F</span><b>${esc(data.name(P.fz.code))}</b></button>` : `<span class="pile fz"><span>フィールド</span><b>—</b></span>`;
  const hot = loc => pend && actionsFor(p, loc).length ? 'hot' : '';
  return `<div class="piles">${fz}
    <span class="pile"><span>デッキ</span><b>${P.deck}</b></span>
    <button class="pile ${hot(L.EXTRA)}" data-pile="${p}:extra"><span>EX</span><b>${P.extra.length}</b></button>
    <button class="pile ${hot(L.GRAVE)}" data-pile="${p}:gy"><span>墓地</span><b>${P.gy.length}</b></button>
    <button class="pile" data-pile="${p}:ban"><span>除外</span><b>${P.ban.length}</b></button>
    <span class="pile"><span>手札</span><b>${P.hand.length}</b></span></div>`;
}
function zonesHTML(p, zone) {
  const arr = F[p][zone];
  const loc = zone === 'mz' ? L.MZONE : L.SZONE;
  return `<div class="zones">${arr.map((q, i) => `<div class="cell ${zone === 'sz' ? 'st' : ''}" id="zone-${p}-${loc}-${i}">${q ? tileHTML(q, p, loc, i) : ''}</div>`).join('')}</div>`;
}
function hiddenFor(q, p, loc) {
  if (loc === L.HAND) return p !== view && !q.isPublic;
  if (loc === L.MZONE || loc === L.SZONE) return (q.position & POS.FACEDOWN) && p !== view;
  if (loc === L.EXTRA || loc === L.DECK) return p !== view;
  return false;
}
function tileHTML(q, p, loc, i) {
  const def = loc === L.MZONE && (q.position & POS.DEFENSE);
  const can = pend && actionsFor(p, loc, i).length ? 'can' : '';
  if (hiddenFor(q, p, loc)) return `<button class="tile back ${def ? 'def' : ''} ${can}" data-card="${p}:${loc}:${i}" aria-label="裏側のカード"></button>`;
  const c = data.card(q.code);
  const t = c ? (c.category === 'モンスター' ? c.subtype : c.category) : 'トークン';
  let st = '';
  if (!c || c.category === 'モンスター') {
    const lv = c?.subtype === '重ね' ? `R${q.rank ?? c.level}` : `★${q.level ?? c?.level ?? ''}`;
    const atk = loc === L.MZONE ? q.attack : c?.atk, df = loc === L.MZONE ? q.defense : c?.def_;
    st = `${lv}<br>${atk}/${df}`;
  } else st = c.subtype;
  const b = [];
  if (q.overlayCards?.length) b.push(`<span class="bdg">素${q.overlayCards.length}</span>`);
  const ctr = q.counters ? Object.values(q.counters).reduce((s, v) => s + v, 0) : 0;
  if (ctr) b.push(`<span class="bdg">C${ctr}</span>`);
  if (loc === L.MZONE && c && (q.attack !== c.atk || q.defense !== c.def_) && typeof c.atk === 'number') b.push(`<span class="bdg mod">${q.attack > c.atk ? '↑' : '↓'}</span>`);
  const down = (q.position & POS.FACEDOWN) && loc !== L.HAND ? 'down' : '';
  const img = imageOf(q.code);
  return `<button class="tile t-${t} ${def ? 'def' : ''} ${down} ${can} ${img ? 'img' : ''}" data-card="${p}:${loc}:${i}" aria-label="${esc(data.name(q.code))}"${img ? ` style="background-image:url('${img}')"` : ''}>
    ${b.length ? `<span class="badges">${b.join('')}</span>` : ''}<span class="nm">${esc(data.name(q.code))}</span><span class="st">${st}</span></button>`;
}

/* ---------------- 行動（IDLE/BATTLE）の取り出し ---------------- */
const IDLE_KINDS = [['summons', 0, '通常召喚'], ['special_summons', 1, '特殊召喚'], ['pos_changes', 2, '表示形式の変更'], ['monster_sets', 3, 'セット'], ['spell_sets', 4, 'セット'], ['activates', 5, '発動']];
function actionsFor(p, loc, seq) {
  const r = pend; if (!r || r.player !== view) return [];
  const out = [];
  const match = c => c.controller === p && c.location === loc && (seq == null || c.sequence === seq);
  if (r.type === M.SELECT_IDLECMD) {
    for (const [k, action, label] of IDLE_KINDS) r[k].forEach((c, index) => {
      if (!match(c)) return;
      let lab = label;
      if (k === 'activates') lab = `発動：${data.desc(c.description)}`;
      if (k === 'pos_changes') lab = (F[p].mz[c.sequence]?.position & POS.FACEDOWN) ? '反転召喚' : '表示形式の変更';
      if (k === 'special_summons' && c.location === L.EXTRA) lab = `${exKind(c.code)}`;
      out.push({ label: lab, res: { type: R.SELECT_IDLECMD, action, index }, c, pri: action <= 1 || action === 5 });
    });
  } else if (r.type === M.SELECT_BATTLECMD) {
    r.attacks.forEach((c, index) => { if (match(c)) out.push({ label: c.can_direct ? '攻撃（直接攻撃可）' : '攻撃する', res: { type: R.SELECT_BATTLECMD, action: 1, index }, c, pri: true }); });
    r.chains.forEach((c, index) => { if (match(c)) out.push({ label: `発動：${data.desc(c.description)}`, res: { type: R.SELECT_BATTLECMD, action: 0, index }, c }); });
  }
  return out;
}
function exKind(code) { const s = data.card(code)?.subtype; return s === '同調' ? 'シンクロ召喚' : s === '重ね' ? 'エクシーズ召喚' : s === '融合' ? '融合召喚' : '特殊召喚'; }
function allActions() {
  const r = pend; const out = [];
  if (r.type === M.SELECT_IDLECMD) for (const [k, action, label] of IDLE_KINDS) r[k].forEach((c, index) => out.push({ c, label: k === 'activates' ? `発動：${data.desc(c.description)}` : k === 'special_summons' && c.location === L.EXTRA ? exKind(c.code) : label, res: { type: R.SELECT_IDLECMD, action, index } }));
  else { r.attacks.forEach((c, index) => out.push({ c, label: '攻撃する', res: { type: R.SELECT_BATTLECMD, action: 1, index } }));
    r.chains.forEach((c, index) => out.push({ c, label: `発動：${data.desc(c.description)}`, res: { type: R.SELECT_BATTLECMD, action: 0, index } })); }
  return out;
}

/* ---------------- シート ---------------- */
let ACTS = [];
let SHEET_STILL = false;   // 同じシートの描き直し（出てくる動きとスクロールの巻き戻しをしない）
function sheet(html) {
  const y = SHEET_STILL ? $('#layer .sheet')?.scrollTop : 0;
  $('#layer').innerHTML = `<div class="scrim ${SHEET_STILL ? 'still' : ''}" data-a="close"><div class="sheet" role="dialog">${html}</div></div>`;
  if (SHEET_STILL && y) $('#layer .sheet').scrollTop = y;
  SHEET_STILL = false;
}
function closeSheet() { $('#layer').innerHTML = ''; }
function btns(list) {
  ACTS = list;
  return `<div class="acts">${list.map((a, k) => `<button class="${a.pri ? 'pri' : ''}" data-act="${k}" ${a.dis ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}</div>`;
}
function metaLine(c) {
  if (!c) return 'トークン';
  if (c.category !== 'モンスター') return `${c.subtype}${c.category}`;
  const t = [SUBTYPE_LABEL[c.subtype] || c.subtype, ...(c.tags || []).map(x => SUBTYPE_LABEL[x] || x)].join('・');
  return `${c.attribute}属性／${c.race}／${t}／${c.subtype === '重ね' ? 'ランク' : 'レベル'}${c.level}／攻${c.atk} 守${c.def_}`;
}
// カード画像（gateball1103/game/card_images.json があれば、アーティファクトのアセットURLを使う）
function imageOf(code) { const e = data.raw.images?.[code]; return e && e.url ? e.url : null; }
function cardSheet(code, extraHTML, list, hidden) {
  const c = data.card(code);
  if (hidden || !code) { sheet(`<h3>裏側のカード</h3>${extraHTML || ''}${btns(list || [])}`); return; }
  const img = imageOf(code);
  sheet(`<div class="cardhead">${img ? `<img class="cardimg" src="${img}" alt="">` : ''}<div class="cardinfo"><h3>${esc(data.name(code))}${c?.limit && c.limit !== '無制限' ? ` <span class="tier">【${esc(c.limit)}】</span>` : ''}</h3>
    <p class="meta">${esc(metaLine(c))}</p></div></div>${c ? `<p class="ctext">${esc(c.text)}</p>` : ''}${extraHTML || ''}${btns(list || [])}`);
}
function openFieldCard(p, loc, i) {
  const arr = loc === L.HAND ? F[p].hand : loc === L.MZONE ? F[p].mz : loc === L.SZONE && i === 5 ? [, , , , , F[p].fz] : F[p].sz;
  const q = arr[i]; if (!q) return;
  const acts = actionsFor(p, loc, i).map(a => ({ label: a.label, pri: a.pri, fn: () => answer(a.res) }));
  let extra = '';
  if (loc === L.MZONE && !hiddenFor(q, p, loc)) extra += `<p class="meta">現在：攻${q.attack} 守${q.defense}${q.level ? ` ★${q.level}` : ''}${q.position & POS.DEFENSE ? '（守備表示）' : '（攻撃表示）'}</p>`;
  if (q.overlayCards?.length) extra += `<p class="meta">エクシーズ素材：${q.overlayCards.map(x => esc(data.name(x))).join('、')}</p>`;
  if (!acts.length && !hiddenFor(q, p, loc)) extra += whyNot(q, p, loc);
  cardSheet(q.code, extra, acts, hiddenFor(q, p, loc));
}
// 操作できない理由を説明する
function whyNot(q, p, loc) {
  let why = '';
  const c = data.card(q.code);
  if (busy) why = '相手が処理中です。';
  else if (!pend) why = '';
  else if (!isCommand(pend)) why = '選択の途中です。下の「選択に戻る」から答えてください。';
  else if (p !== view) why = '';
  else if (loc === L.HAND && c?.category === 'モンスター' && pend.type === M.SELECT_IDLECMD) {
    if (duel.nsUsed) why = 'このターンはすでに通常召喚（またはモンスターのセット）をしています。通常召喚は1ターンに1回です。';
    else if (c.level >= 5) why = `レベル${c.level}なのでリリースが${c.level >= 7 ? 2 : 1}体必要ですが、足りません。`;
    else if (EXTRA_ONLY.has(c.subtype)) why = 'エクストラデッキのモンスターは手札から召喚できません。';
    else why = '今は召喚できません（カードの効果による制限など）。';
  } else if (pend.type === M.SELECT_BATTLECMD && loc === L.HAND) why = 'バトルフェイズ中は召喚できません。メイン2へ進んでください。';
  return why ? `<p class="why">${esc(why)}</p>` : '';
}
const EXTRA_ONLY = new Set(['融合', '同調', '重ね']);
function openPile(p, kind) {
  const loc = { gy: L.GRAVE, ban: L.REMOVED, extra: L.EXTRA }[kind];
  if (kind === 'extra' && p !== view) { toast('相手のエクストラデッキは見られません'); return; }
  const arr = F[p][kind];
  const title = { gy: '墓地', ban: '除外', extra: 'エクストラデッキ' }[kind];
  sheet(`<h3>${esc(duel.names[p])}の${title}（${arr.length}）</h3><div class="list">${arr.map((q, i) => {
    const a = actionsFor(p, loc, i);
    return `<button class="li ${a.length ? 'on' : ''}" data-pilecard="${p}:${loc}:${i}">${swatch(q.code)}<span class="tx"><b>${esc(data.name(q.code))}</b><span>${esc(metaLine(data.card(q.code)))}${a.length ? ' ・ 使える' : ''}</span></span></button>`; }).join('') || '<p class="note">カードがありません</p>'}</div>`);
}
function openPileCard(p, loc, i) {
  const arr = { [L.GRAVE]: F[p].gy, [L.REMOVED]: F[p].ban, [L.EXTRA]: F[p].extra }[loc];
  const q = arr[i];
  cardSheet(q.code, '', actionsFor(p, loc, i).map(a => ({ label: a.label, pri: true, fn: () => answer(a.res) })));
}
function swatch(code) {
  const c = data.card(code);
  const col = !c ? 'var(--c-token)' : c.category === '魔法' ? 'var(--c-spell)' : c.category === '罠' ? 'var(--c-trap)' : `var(--c-${TYPE_COLOR[c.subtype] || 'effect'})`;
  return `<span class="sw" style="background:${col}"></span>`;
}
function selLabel(c) {
  const hidden = !c.code || ((c.position & POS.FACEDOWN) && c.controller !== view && c.location !== L.GRAVE) || (c.location === L.HAND && c.controller !== view);
  const where = `${c.controller === view ? '自分' : '相手'}の${locName(c.location)}`;
  return { hidden, name: hidden ? '裏側のカード' : data.name(c.code), where };
}
// ヒント：CPU（強さ「強い」と同じ考え方）なら今どうするか。CPUの記憶は汚さないよう元に戻す
let HINT = null;   // { req, res }
function aiHint() {
  if (HINT && HINT.req === pend) return HINT.res;
  const memo = JSON.parse(JSON.stringify(duel.aiMemo)), level = duel.opts.level;
  let res = null;
  try { duel.opts.level = 'strong'; res = aiRespond(duel, pend); } catch (e) { res = null; }
  finally { duel.aiMemo = memo; duel.opts.level = level; }
  HINT = { req: pend, res };
  return res;
}
const sameRes = (a, b) => a && b && a.type === b.type && a.action === b.action && (a.index ?? null) === (b.index ?? null);
function hintNote(res) {
  if (!res) return '';
  const words = { 6: 'バトルフェイズへ進む', 7: 'ターンを終了する' };
  if (res.type === R.SELECT_IDLECMD && words[res.action]) return words[res.action];
  if (res.type === R.SELECT_BATTLECMD && res.action === 2) return 'メインフェイズ2へ進む';
  if (res.type === R.SELECT_BATTLECMD && res.action === 3) return 'ターンを終了する';
  if (res.type === R.SELECT_CHAIN && res.index == null) return '発動しない';
  return '';
}
const hintBtn = () => `<button class="chipbtn hintbtn" data-a="hint">ヒント：CPUならどうする？</button>`;
function openActs(showHint = false) {
  REDRAW = () => openActs(showHint);
  const list = allActions();
  const rec = showHint ? aiHint() : null;
  const note = showHint ? hintNote(rec) : '';
  sheet(`<h3>${pend.type === M.SELECT_IDLECMD ? '行動一覧' : '攻撃・発動'}</h3><p class="note">盤面のカードをタップしても選べます（光っているカード）。</p>
    ${showHint ? `<p class="hintline">${note ? `おすすめ：${esc(note)}` : list.some(a => sameRes(a.res, rec)) ? 'おすすめの行動に印を付けました' : 'おすすめは特にありません'}</p>` : hintBtn()}
    <div class="list">${list.map((a, k) => infoRow(`<button class="li ${sameRes(a.res, rec) ? 'rec' : ''}" data-actpick="${k}">${swatch(a.c.code)}<span class="tx"><b>${sameRes(a.res, rec) ? '<i class="recmark">おすすめ</i>' : ''}${esc(a.label)}</b><span>「${esc(data.name(a.c.code))}」・${esc(locName(a.c.location))}</span></span></button>`, a.c.code, false, `a${k}`)).join('') || '<p class="note">できる行動はありません</p>'}</div>`);
  ACTS = list.map(a => ({ fn: () => answer(a.res) }));
}

/* ---------------- 要求ごとのプロンプト ---------------- */
function openPrompt(showHint = false) {
  const r = pend; if (!r) return;
  const hint = data.hint(duel.hintMsg[r.player]);
  const yes = (label, res) => ({ label, pri: true, fn: () => answer(res) });
  switch (r.type) {
    case M.SELECT_IDLECMD: case M.SELECT_BATTLECMD: openActs(showHint); return;
    case M.SELECT_CHAIN: {
      REDRAW = () => openPrompt(showHint);
      const last = duel.chain[duel.chain.length - 1];
      const ctx = last ? `相手の行動：チェーン${duel.chain.length}「${data.name(last.code)}」` : (duel.log[duel.log.length - 1]?.s || '');
      const rec = showHint ? aiHint() : null;
      const isRec = k => rec && rec.type === R.SELECT_CHAIN && rec.index === k;
      sheet(`<h3>${r.forced ? '発動する効果を選んでください' : 'チェーンして発動しますか？'}</h3><p class="meta">${esc(ctx)}</p>
        ${r.forced ? '' : showHint ? `<p class="hintline">${rec && rec.index == null ? 'おすすめ：発動しない' : 'おすすめの発動に印を付けました'}</p>` : hintBtn()}
        <div class="list">${r.selects.map((c, k) => infoRow(`<button class="li ${isRec(k) ? 'rec' : ''}" data-actpick="${k}">${swatch(c.code)}<span class="tx"><b>${isRec(k) ? '<i class="recmark">おすすめ</i>' : ''}「${esc(data.name(c.code))}」</b><span>${esc(data.desc(c.description))}・${esc(locName(c.location))}</span></span></button>`, c.code, false, `c${k}`)).join('')}</div>
        ${r.forced ? '' : btns([{ label: '発動しない', fn: () => answer({ type: R.SELECT_CHAIN, index: null }) },
          { label: `チェーン確認：${chainLabel()}`, keep: true, fn: () => { nextChainMode(); openPrompt(); } }])}`);
      const pick = r.selects.map((c, k) => ({ fn: () => answer({ type: R.SELECT_CHAIN, index: k }) }));
      ACTS_PICK = pick; return;
    }
    case M.SELECT_EFFECTYN: {
      cardSheet(r.code, `<p class="ask">${esc(data.desc(r.description).replace('「」', `「${data.name(r.code)}」`) || 'この効果を発動しますか？')}</p>`,
        [yes('はい', { type: R.SELECT_EFFECTYN, yes: true }), { label: 'いいえ', fn: () => answer({ type: R.SELECT_EFFECTYN, yes: false }) }]);
      return;
    }
    case M.SELECT_YESNO:
      sheet(`<h3>${esc(data.desc(r.description) || '確認')}</h3>${btns([yes('はい', { type: R.SELECT_YESNO, yes: true }), { label: 'いいえ', fn: () => answer({ type: R.SELECT_YESNO, yes: false }) }])}`); return;
    case M.SELECT_OPTION:
      sheet(`<h3>${esc(hint || '効果を選択')}</h3>${btns(r.options.map((o, k) => ({ label: data.desc(o), pri: k === 0, fn: () => answer({ type: R.SELECT_OPTION, index: k }) })))}`); return;
    case M.SELECT_POSITION: {
      const P = [[POS.FACEUP_ATTACK, '表側攻撃表示'], [POS.FACEUP_DEFENSE, '表側守備表示'], [POS.FACEDOWN_DEFENSE, '裏側守備表示'], [POS.FACEDOWN_ATTACK, '裏側攻撃表示']];
      cardSheet(r.code, '<p class="ask">表示形式を選んでください</p>', P.filter(([v]) => r.positions & v).map(([v, l], k) => ({ label: l, pri: k === 0, fn: () => answer({ type: R.SELECT_POSITION, position: v }) })));
      return;
    }
    case M.SELECT_CARD: case M.SELECT_TRIBUTE: case M.SELECT_SUM: drawPicker(); return;
    case M.SELECT_UNSELECT_CARD: drawUnselect(); return;
    case M.ANNOUNCE_NUMBER:
      sheet(`<h3>${esc(hint || '数字を宣言')}</h3>${btns(r.options.map((o, k) => ({ label: String(o), fn: () => answer({ type: R.ANNOUNCE_NUMBER, value: k }) })))}`); return;
    case M.ANNOUNCE_RACE: case M.ANNOUNCE_ATTRIB: {
      const isRace = r.type === M.ANNOUNCE_RACE;
      const names = isRace ? ['戦士族', '魔法使い族', '天使族', '悪魔族', 'アンデット族', '機械族', '水族', '炎族', '岩石族', '鳥獣族', '植物族', '昆虫族', '雷族', 'ドラゴン族', '獣族', '獣戦士族', '恐竜族', '魚族', '海竜族', '爬虫類族', 'サイキック族'] : ['地', '水', '炎', '風', '光', '闇', '神'];
      const avail = BigInt(r.available);
      const opts = names.map((nm, b) => ({ nm, v: 1n << BigInt(b) })).filter(o => avail & o.v);
      sheet(`<h3>${isRace ? '種族' : '属性'}を${r.count}つ宣言</h3>${btns(opts.map(o => ({ label: o.nm, fn: () => answer(isRace ? { type: R.ANNOUNCE_RACE, races: [o.v] } : { type: R.ANNOUNCE_ATTRIB, attributes: [Number(o.v)] }) })))}`);
      return;
    }
    case M.ANNOUNCE_CARD: {
      const ids = Object.keys(data.byId).map(Number).filter(id => { try { return cardMatchesOpcode(data.eng(id), r.opcodes); } catch (e) { return true; } });
      sheet(`<h3>カード名を宣言</h3><div class="list">${ids.map((id, k) => `<button class="li" data-actpick="${k}">${swatch(id)}<span class="tx"><b>${esc(data.name(id))}</b></span></button>`).join('')}</div>`);
      ACTS_PICK = ids.map(id => ({ fn: () => answer({ type: R.ANNOUNCE_CARD, card: id }) }));
      return;
    }
    default: sheet(`<h3>処理中</h3>`);
  }
}
let ACTS_PICK = [];
// 選択肢の行に「効果」ボタンを付け、押すとその行の下にカードの画像と効果文を開く（選択中の状態はそのまま）
let INFO_OPEN = new Set(), INFO_REQ = null, REDRAW = null;
function infoRow(rowHTML, code, hidden, key) {
  if (INFO_REQ !== pend) { INFO_OPEN = new Set(); INFO_REQ = pend; }
  if (hidden || !code || !data.card(code)) return rowHTML;
  const open = INFO_OPEN.has(key);
  const c = data.card(code), img = imageOf(code);
  return `<div class="lirow">${rowHTML}<button class="infobtn ${open ? 'on' : ''}" data-info="${key}" aria-expanded="${open}">効果</button></div>
    ${open ? `<div class="liinfo">${img ? `<img src="${img}" alt="">` : ''}<div><p class="meta">${esc(metaLine(c))}</p><p class="ctext">${esc(c.text)}</p></div></div>` : ''}`;
}
function toggleInfo(key) {
  if (INFO_OPEN.has(key)) INFO_OPEN.delete(key); else INFO_OPEN.add(key);
  SHEET_STILL = true;
  REDRAW?.();
}
function drawPicker() {
  REDRAW = drawPicker;
  const r = pend;
  const items = r.type === M.SELECT_SUM ? [...r.selects_must.map(c => ({ ...c, must: true })), ...r.selects] : r.selects;
  const hint = data.hint(duel.hintMsg[r.player]) || (r.type === M.SELECT_TRIBUTE ? 'リリースするモンスターを選択' : 'カードを選択');
  const offset = r.type === M.SELECT_SUM ? r.selects_must.length : 0;
  let rule = `${r.min === r.max ? r.min : `${r.min}〜${r.max}`}枚`;
  if (r.type === M.SELECT_SUM) rule = `合計${r.amount}${r.select_max ? '以上' : 'ちょうど'}（レベル等）`;
  const ok = r.type === M.SELECT_SUM ? true : sel.length >= r.min && sel.length <= r.max;
  sheet(`<h3>${esc(hint)}</h3><p class="meta">${esc(rule)} ・ 選択中 ${sel.length}</p>
    <div class="list">${items.map((c, k) => { const L2 = selLabel(c); const on = c.must || sel.includes(k - offset);
      const amt = r.type === M.SELECT_SUM ? ` ・ 値${c.amount & 0xffff}` : '';
      return infoRow(`<button class="li ${on ? 'on' : ''}" data-pick="${c.must ? -1 : k - offset}">${L2.hidden ? '<span class="sw" style="background:var(--c-back)"></span>' : swatch(c.code)}<span class="tx"><b>${esc(L2.name)}</b><span>${esc(L2.where)}${amt}</span></span></button>`, c.code, L2.hidden, `p${k}`); }).join('')}</div>
    ${btns([{ label: '決定', pri: true, dis: !ok, fn: () => submitPicker() },
      ...(r.can_cancel ? [{ label: 'キャンセル', fn: () => answer(r.type === M.SELECT_CARD ? { type: R.SELECT_CARD, indicies: null } : { type: R.SELECT_TRIBUTE, indicies: null }) }] : []),
      ...(r.type === M.SELECT_SUM ? [{ label: 'おまかせ', fn: () => answer({ type: R.SELECT_SUM, indicies: sumSolve(r) || [0] }) }] : [])])}`);
}
function submitPicker() {
  const r = pend;
  if (r.type === M.SELECT_CARD) answer({ type: R.SELECT_CARD, indicies: sel.slice() });
  else if (r.type === M.SELECT_TRIBUTE) answer({ type: R.SELECT_TRIBUTE, indicies: sel.slice() });
  else answer({ type: R.SELECT_SUM, indicies: sel.slice() });
}
function drawUnselect() {
  REDRAW = drawUnselect;
  const r = pend;
  const hint = data.hint(duel.hintMsg[r.player]) || 'カードを選択';
  const row = (c, k, on) => { const L2 = selLabel(c); return infoRow(`<button class="li ${on ? 'on' : ''}" data-us="${k}">${L2.hidden ? '<span class="sw" style="background:var(--c-back)"></span>' : swatch(c.code)}<span class="tx"><b>${esc(L2.name)}</b><span>${esc(L2.where)}${on ? ' ・ 選択済み（タップで外す）' : ''}</span></span></button>`, c.code, L2.hidden, `u${k}`); };
  sheet(`<h3>${esc(hint)}</h3><p class="meta">${r.min === r.max ? r.min : `${r.min}〜${r.max}`}枚 ・ 選択済み ${r.unselect_cards.length}</p>
    <div class="list">${r.unselect_cards.map((c, k) => row(c, r.select_cards.length + k, true)).join('')}${r.select_cards.map((c, k) => row(c, k, false)).join('')}</div>
    ${btns([...(r.can_finish ? [{ label: '決定', pri: true, fn: () => answer({ type: R.SELECT_UNSELECT_CARD, index: null }) }] : []),
      ...(r.can_cancel && !r.can_finish ? [{ label: 'キャンセル', fn: () => answer({ type: R.SELECT_UNSELECT_CARD, index: null }) }] : [])])}`);
}

/* ---------------- チェーン確認（マスターデュエルと同じ オート／ON／OFF） ---------------- */
const CHAIN_MODES = [
  ['auto', 'オート', '相手が発動・召喚・攻撃した時だけ止まります。'],
  ['on', 'ON', '発動できるカードがある場面では毎回止まります（エンドフェイズなども）。'],
  ['off', 'OFF', '強制効果以外では止まりません。使いたい時は相手のターン中に「ここで止める」を押してください。'],
];
const chainLabel = () => CHAIN_MODES.find(x => x[0] === setup.chainMode)?.[1] || 'オート';
function nextChainMode() {
  const i = CHAIN_MODES.findIndex(x => x[0] === setup.chainMode);
  setup.chainMode = CHAIN_MODES[(i + 1) % CHAIN_MODES.length][0];
  if (duel) duel.chainMode = setup.chainMode;
  const m = CHAIN_MODES.find(x => x[0] === setup.chainMode);
  toast(`チェーン確認：${m[1]}　${m[2]}`);
}
// 「ここで止める」：次に自分が発動できる場面で、モードに関係なく1回止まる
function requestStop() {
  if (!duel) return;
  duel.stopRequest = !duel.stopRequest;
  toast(duel.stopRequest ? '次に発動できる場面で止めます' : '止める予約を取り消しました');
  render();
}

/* ---------------- その他 ---------------- */
function logSheet() { sheet(`<h3>ログ</h3><div class="logbox">${duel.log.map(l => `<div>${esc(l.s)}</div>`).join('')}</div>`); }
function moreSheet() {
  sheet(`<h3>その他</h3>${btns([
    { label: 'ログを見る', pri: true, fn: () => setTimeout(logSheet) },
    { label: `チェーン確認：${chainLabel()}（タップで切り替え）`, fn: nextChainMode },
    { label: `CPUの速さ：${setup.speed === 'fast' ? '速い' : 'ゆっくり'}`, fn: () => { setup.speed = setup.speed === 'fast' ? 'normal' : 'fast'; } },
    { label: `演出：${setup.fx === 'off' ? 'なし' : 'あり'}`, fn: () => { setup.fx = setup.fx === 'off' ? 'on' : 'off'; toast(`演出を「${setup.fx === 'off' ? 'なし' : 'あり'}」にしました`); } },
    { label: '対戦記録をコピー（報告用）', fn: () => setTimeout(exportSheet) },
    { label: '降参する', fn: () => setTimeout(() => sheet(`<h3>降参しますか？</h3><p class="note">このデュエルは負けになり、デッキ選択に戻ります。</p>${btns([{ label: '降参する', fn: quit }, { label: '続ける', pri: true, fn: () => {} }])}`)) },
  ])}`);
}
// 対戦記録の書き出し（不具合やCPUの判断の報告用）。全手順を含むので、開発側で同じ対戦をそのまま再現できる
function exportSheet() {
  const save = currentSave(); if (!save) return;
  const text = 'GB1103:' + JSON.stringify({ build: data.raw.build || '', ...save }, (k, v) => typeof v === 'bigint' ? `${v}n` : v);
  try { navigator.clipboard?.writeText(text).then(() => toast('対戦記録をコピーしました')).catch(() => {}); } catch (e) { /* 手でコピーしてもらう */ }
  sheet(`<h3>対戦記録</h3><p class="note">気になった場面の直後にこの記録を貼り付けて送ってください。どの場面かを一言（例：「ターン5でCPUが攻撃しなかった」）添えてもらえると、同じ対戦を再現して原因を調べます。自動でコピーされない時は、下の枠を長押し（またはクリック）して全部コピーしてください。</p>
    <textarea class="export" readonly>${esc(text)}</textarea>${btns([{ label: '閉じる', pri: true, fn: () => {} }])}`);
  const ta = $('#layer textarea.export');
  if (ta) { ta.addEventListener('focus', () => ta.select()); ta.addEventListener('click', () => ta.select()); }
}
function quit() { if (duel) duel.destroy(); duel = null; pend = null; clearSaved(); render(); }
function showCurtain() {
  $('#layer').innerHTML = `<div class="curtain"><div class="brand">${esc(duel.names[view])}</div>
    <p class="note">${esc(duel.names[view])}の操作です。相手に見えないようにしてからタップしてください。</p>
    <button class="big" style="max-width:320px" data-a="uncurtain">表示する</button></div>`;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }

/* ---------------- セットアップ ---------------- */
// CPUの強さ
const LEVELS = [
  ['weak', 'CPU：弱い', '基本的な判断だけで動きます。'],
  ['normal', 'CPU：普通', '罠の使いどころ・攻撃対象・デッキ別のサーチ先（大会参加者の記事より）を考えて動きます。'],
  ['strong', 'CPU：強い', '「普通」に加えて、メインフェイズの行動をいくつか先読みして、ターンの終わりに一番良い盤面になる手を選びます。'],
];
function setupHTML() {
  SAVED = loadSaved();
  const decks = Object.entries(data.raw.decks);
  const seat = (p, title) => `<section class="seat"><h2>${title}</h2><div class="decks">
    ${decks.map(([k, d]) => `<button class="deckbtn ${setup.deck[p] === k ? 'on' : ''}" data-a="pick" data-p="${p}" data-k="${k}"><span class="tier">Tier ${TIER[k]}</span><b>${esc(d.name)}</b><span>参照：${esc(d.ref)}</span><span>${esc(recipeLabel(k))}</span></button>`).join('')}
    </div><button class="chipbtn" data-a="recipe" data-k="${setup.deck[p]}">レシピを見る</button></section>`;
  const cpu = setup.mode === 'cpu';
  return `<div class="setup">
    <h1 class="brand">ゲートボール1103<small>DUEL — 2011.03 REGULATION</small></h1>
    ${SAVED ? `<button class="big" data-a="resume">続きから（${esc(SAVED.opts.names.join(' vs '))}）</button>` : ''}
    <section class="seat"><h2>対戦モード</h2><div class="row">
      <button class="chipbtn ${cpu ? 'on' : ''}" data-a="mode" data-k="cpu">CPUと対戦</button>
      <button class="chipbtn ${!cpu ? 'on' : ''}" data-a="mode" data-k="pvp">2人で対戦（1台を交互に）</button></div>
      ${cpu ? `<div class="row">${LEVELS.map(([k, l]) => `<button class="chipbtn ${setup.level === k ? 'on' : ''}" data-a="level" data-k="${k}">${l}</button>`).join('')}</div>
      <p class="note">${esc(LEVELS.find(x => x[0] === setup.level)?.[2] || '')}</p>` : ''}</section>
    ${seat(0, cpu ? 'あなたのデッキ' : 'P1のデッキ')}${seat(1, cpu ? 'CPUのデッキ' : 'P2のデッキ')}
    <section class="seat"><h2>先攻</h2><div class="row">
      ${[['rand', 'ランダム'], ['me', cpu ? 'あなた' : 'P1'], ['opp', cpu ? 'CPU' : 'P2']].map(([k, l]) => `<button class="chipbtn ${setup.first === k ? 'on' : ''}" data-a="first" data-k="${k}">${l}</button>`).join('')}</div>
      ${!cpu ? `<div class="row"><button class="chipbtn ${setup.curtain ? 'on' : ''}" data-a="curtain">交代時に画面を隠す</button></div>` : ''}
      <p class="note">カードの効果・チェーン・フェイズ進行・ダメージ計算はすべて自動で処理されます（マスタールール2、先攻もドロー）。発動できる場面になると選択肢が出ます。</p></section>
    <button class="big" data-a="start">デュエル開始</button></div>`;
}
// 大会レシピの出典（例：寒波亭 第46回 個人戦 優勝）
function recipeLabel(k) {
  const m = data.raw.recipes?.[k]; if (!m) return '';
  if (!m.placing_confirmed) return '寒波亭 登録レシピ';
  return `${m.event || ''} ${m.placing || ''}`.trim();
}
function recipeSheet(k) {
  const d = data.raw.decks[k];
  const part = arr => arr.map(([n, id]) => `<button class="li" data-show="${id}">${swatch(id)}<span class="tx"><b>${esc(data.name(id))} ×${n}</b><span>${esc(metaLine(data.card(id)))}</span></span></button>`).join('');
  const m = data.raw.recipes?.[k] || {};
  sheet(`<h3>【${esc(d.name)}】</h3><p class="meta">${esc(recipeLabel(k))}${m.player ? ` ・ 使用者：${esc(m.player)}` : ''}</p><p class="meta">参照：${esc(d.ref)} ・ メイン${d.main.reduce((s, x) => s + x[0], 0)} ／ EX${d.extra.reduce((s, x) => s + x[0], 0)}</p>
    ${guideHTML(k)}<div class="list">${part(d.main)}</div><p class="meta">エクストラデッキ</p><div class="list">${part(d.extra)}</div>`);
}
// 記事から集めたこのデッキの戦い方（knowhow）。CPUもこの方針の一部（サーチ先・止めるべきカード）で動く
function guideHTML(k) {
  const g = data.raw.aiRules?.[k]?.guide; if (!g || !g.plan) return '';
  const deckName = key => data.raw.decks[key]?.name || key;
  const p = (label, text) => text ? `<p class="gline"><b>${label}</b>${esc(text)}</p>` : '';
  return `<details class="guide"><summary>戦い方（大会参加者の記事より${g.sources ? `・${g.sources}件` : ''}）</summary>
    ${p('方針', g.plan)}${p('先攻', g.first)}${p('後攻', g.second)}${p('罠の読み', g.setPolicy)}
    ${g.combos.length ? `<p class="gline"><b>主な動き</b></p><ol class="gcombo">${g.combos.map(c => `<li><b>${esc(c.name)}</b>${c.steps.length ? `<ul>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>` : ''}
    ${Object.keys(g.matchups).length ? `<p class="gline"><b>相性</b></p><ul class="gmatch">${Object.entries(g.matchups).map(([o, t]) => `<li><b>対${esc(deckName(o))}</b> ${esc(t)}</li>`).join('')}</ul>` : ''}
  </details>`;
}

/* ---------------- 入力 ---------------- */
function onClick(e) {
  const t = e.target;
  if (t.classList?.contains('scrim')) { closeSheet(); return; }
  const ab = t.closest('[data-act]');
  if (ab) { const a = ACTS[+ab.dataset.act]; if (!a || a.dis) return; const before = $('#layer').innerHTML; a.fn(); if ($('#layer').innerHTML === before && !a.keep) closeSheet(); if (!duel || !pend) render(); return; }
  const inf = t.closest('[data-info]');
  if (inf) { toggleInfo(inf.dataset.info); return; }
  const ap = t.closest('[data-actpick]');
  if (ap) { const list = (pend && (pend.type === M.SELECT_CHAIN || pend.type === M.ANNOUNCE_CARD)) ? ACTS_PICK : ACTS; list[+ap.dataset.actpick]?.fn(); return; }
  const pk = t.closest('[data-pick]');
  if (pk) { const k = +pk.dataset.pick; if (k < 0) return; const i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else if (pend.type === M.SELECT_SUM || sel.length < pend.max) sel.push(k); else if (pend.max === 1) sel = [k]; SHEET_STILL = true; drawPicker(); return; }
  const us = t.closest('[data-us]');
  if (us) { answer({ type: R.SELECT_UNSELECT_CARD, index: +us.dataset.us }); return; }
  const sh = t.closest('[data-show]'); if (sh) { cardSheet(+sh.dataset.show); return; }
  const pc = t.closest('[data-pilecard]'); if (pc) { const [p, l, i] = pc.dataset.pilecard.split(':').map(Number); openPileCard(p, l, i); return; }
  const cd = t.closest('[data-card]'); if (cd && duel) { const [p, l, i] = cd.dataset.card.split(':').map(Number); openFieldCard(p, l, i); return; }
  const pl = t.closest('[data-pile]'); if (pl) { const [p, k] = pl.dataset.pile.split(':'); openPile(+p, k); return; }
  const b = t.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'close') return;
  if (!duel) {
    if (a === 'pick') setup.deck[+b.dataset.p] = b.dataset.k;
    if (a === 'mode') setup.mode = b.dataset.k;
    if (a === 'first') setup.first = b.dataset.k;
    if (a === 'level') setup.level = b.dataset.k;
    if (a === 'curtain') setup.curtain = !setup.curtain;
    if (a === 'recipe') { recipeSheet(b.dataset.k); return; }
    if (a === 'resume' && SAVED) { restore(SAVED); return; }
    if (a === 'start') { startFromSetup(); return; }
    render(); return;
  }
  if (a === 'uncurtain') { curtain = false; closeSheet(); render(); return; }
  if (a === 'log') logSheet();
  else if (a === 'more') moreSheet();
  else if (a === 'stop') requestStop();
  else if (a === 'export') exportSheet();
  else if (a === 'acts' || a === 'prompt') openPrompt();
  else if (a === 'hint' && pend) openPrompt(true);
  else if (a === 'tobp') answer({ type: R.SELECT_IDLECMD, action: 6, index: null });
  else if (a === 'toep') answer({ type: R.SELECT_IDLECMD, action: 7, index: null });
  else if (a === 'tom2') answer({ type: R.SELECT_BATTLECMD, action: 2, index: null });
  else if (a === 'toep2') answer({ type: R.SELECT_BATTLECMD, action: 3, index: null });
  else if (a === 'rematch') { const o = duel.opts; newDuel({ ...o, seed: o.seed.map(() => String(1 + Math.floor(Math.random() * 2 ** 31))) }, duel.seatsInfo, []); }
  else if (a === 'quit') quit();
}
