// デュエルの演出：召喚・攻撃・ダメージ／回復・魔法罠や効果の発動・場から離れる。
// 盤面の上に重ねたレイヤー（#duel-fx）に一時的な要素を置き、CSS のアニメーション（template.html の fx-*）で動かす。
// 動きの量や向きは CSS 変数（--t：長さ、--dx/--dy：移動量 など）で渡し、終わったら要素とクラスを片付ける。
// 盤面の位置は ui.js が描くゾーン（id "zone-p-loc-seq"）と LP（id "lp-p"）の要素から取る。

const $ = s => document.querySelector(s);
const wait = ms => new Promise(r => setTimeout(r, ms));

// 演出用のレイヤー（最初に使う時に作る）。ページ全体に重ねる
const layer = () => {
  let el = $('#duel-fx');
  if (!el) { el = document.createElement('div'); el.id = 'duel-fx'; document.body.appendChild(el); }
  return el;
};

// 要素のページ上の位置（offsetParent をたどって足し合わせる）
function box(el) {
  let x = 0, y = 0;
  for (let n = el; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
}
// 盤面のゾーン・LPの要素を data 属性の値で探す
const zoneEl = (p, loc, seq) => document.getElementById(['zone', p, loc, seq].join('-'));
const lpEl = p => document.getElementById(['lp', p].join('-'));
const tileIn = z => (z && z.firstElementChild) || null;   // ゾーンに置かれたカード
// 画面の中央（スクロールしていても見えている範囲の中央）
function viewCenter() {
  const d = document.documentElement;
  return { cx: d.scrollLeft + d.clientWidth / 2, cy: d.scrollTop + d.clientHeight * 0.45 };
}

// 要素はすべてDOMの関数で組み立てる（HTMLの文字列は使わない）
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
// 演出の要素を置いて、ms 後に消す
function spawn(cls, x, y, ms, vars = {}, text = null, children = []) {
  const el = node('div', `fx ${cls}`, text);
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.style.setProperty('--t', `${ms}ms`);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  children.forEach(c => el.appendChild(c));
  layer().appendChild(el);
  return wait(ms).then(() => el.remove());
}
// 盤面の要素に、ms の間だけ演出のクラスを付ける
function flash(el, cls, ms, vars = {}) {
  if (!el) return Promise.resolve();
  el.style.setProperty('--t', `${ms}ms`);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.classList.add(cls);
  return wait(ms).then(() => el.classList.remove(cls));
}

/* ---------------- 召喚 ---------------- */
function summon(e, k) {
  const z = zoneEl(e.p, e.loc, e.seq);
  const at = z ? box(z) : viewCenter();
  const T = Math.round(620 * k);
  const jobs = [spawn(`ring ${e.kind}`, at.cx, at.cy, T)];
  if (e.kind === 'special') jobs.push(spawn('pillar', at.cx, at.cy, Math.round(T * 1.1)));   // 特殊召喚：光の柱
  const label = { normal: '召喚', special: '特殊召喚', flip: '反転召喚' }[e.kind];
  jobs.push(spawn(`tag ${e.kind}`, at.cx, (z ? at.y : at.cy) - 4, Math.round(T * 1.3), {}, label));
  jobs.push(flash(tileIn(z), 'fx-drop', Math.round(T * 0.7)));
  return Promise.all(jobs);
}

/* ---------------- 発動（カットイン） ---------------- */
function activate(e, k, info) {
  const c = info(e.code);
  const kind = c.kind;                                   // 'spell' | 'trap' | 'monster'
  const label = { spell: '魔法発動', trap: '罠発動', monster: '効果発動' }[kind];
  const T = Math.round(950 * k);
  const jobs = [];
  const z = zoneEl(e.p, e.loc, e.seq);
  if (z) {
    const b = box(z);
    jobs.push(spawn(`srcglow ${kind}`, b.cx, b.cy, T, { width: `${b.w}px`, height: `${b.h}px` }));
  }
  const band = node('div', 'cut-band', label);
  if (e.n > 1) band.appendChild(node('small', null, `チェーン${e.n}`));
  const face = node('div', 'cut-card');
  if (c.img) {
    const img = node('img');
    img.alt = '';
    img.addEventListener('error', () => img.remove());   // 画像が読めない時は色だけのカードにする
    img.src = c.img;
    face.appendChild(img);
  } else face.appendChild(node('div', 'cut-blank'));
  const at = viewCenter();
  // 自分の発動は右から、相手の発動は左から入る
  jobs.push(spawn(`cutin ${kind}`, at.cx, at.cy, T, { '--from': e.mine ? '1' : '-1' }, null, [band, face, node('div', 'cut-name', c.name)]));
  return Promise.all(jobs);
}

/* ---------------- 攻撃 ---------------- */
async function attack(e, k) {
  const az = zoneEl(e.from.p, e.from.loc, e.from.seq);
  if (!az) return;
  const tz = (e.to && zoneEl(e.to.p, e.to.loc, e.to.seq)) || lpEl(1 - e.p);
  const A = box(az), B = tz ? box(tz) : viewCenter();
  const T = Math.round(560 * k);
  const lunge = flash(tileIn(az), 'fx-lunge', T, { '--dx': `${(B.cx - A.cx) * 0.78}px`, '--dy': `${(B.cy - A.cy) * 0.78}px` });
  await wait(T * 0.52);
  const hit = spawn(`impact ${e.to ? '' : 'direct'}`, B.cx, B.cy, Math.round(420 * k), {}, null, [node('i'), node('i'), node('i')]);
  await Promise.all([lunge, hit]);
}

/* ---------------- ダメージ・回復・コスト ---------------- */
function lifeChange(e, k, mineSide) {
  const lp = lpEl(e.p);
  const at = lp ? box(lp) : viewCenter();
  const d = document.documentElement;
  const x = Math.min(Math.max(at.cx, d.scrollLeft + 100), d.scrollLeft + d.clientWidth - 100);   // 数字が画面の端で切れないように
  const big = e.t === 'damage' && e.amount >= 2000;
  const T = Math.round(900 * k);
  const jobs = [spawn(`lpnum ${e.t} ${big ? 'heavy' : ''}`, x, at.cy, T, {}, `${e.t === 'recover' ? '+' : '−'}${e.amount}`)];
  if (e.t !== 'recover') jobs.push(flash(lp, 'fx-shake', Math.round(360 * k)));
  if (e.t === 'damage') {
    // 画面のふちを赤く光らせる（自分が受けた時は強め）。大ダメージは盤面も揺らす
    jobs.push(vignette(`${mineSide ? 'mine' : ''} ${big ? 'heavy' : ''}`, Math.round(T * 0.8)));
    if (big) jobs.push(flash($('#app'), 'fx-quake', Math.round(380 * k)));
  }
  return Promise.all(jobs);
}
function vignette(cls, ms) {
  const el = node('div', `fx-vignette ${cls}`);
  el.style.setProperty('--t', `${ms}ms`);
  layer().appendChild(el);
  return wait(ms).then(() => el.remove());
}

/* ---------------- 場から離れる ---------------- */
function leave(e, k) {
  const z = zoneEl(e.p, e.loc, e.seq);
  if (!z) return Promise.resolve();
  const at = box(z);
  const T = Math.round(480 * k);
  return Promise.all(Array.from({ length: 8 }, (_, i) => {
    const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.4, dist = 26 + Math.random() * 22;
    return spawn(`shard ${e.to === 0x20 ? 'ban' : ''}`, at.cx, at.cy, T,
      { '--sx': `${Math.cos(ang) * dist}px`, '--sy': `${Math.sin(ang) * dist}px`, '--rot': `${200 + Math.random() * 200}deg` });
  }));
}

// e：エンジンの演出イベント / opts：{ speed（0.6〜1）, view（手前に表示しているプレイヤー）, info(code) }
export function playFx(e, opts) {
  const k = opts.speed;
  switch (e.t) {
    case 'summon': return summon(e, k);
    case 'activate': return activate({ ...e, mine: e.p === opts.view }, k, opts.info);
    case 'attack': return attack(e, k);
    case 'damage': case 'recover': case 'cost': return lifeChange(e, k, e.p === opts.view);
    case 'leave': return leave(e, k);
    default: return Promise.resolve();
  }
}
