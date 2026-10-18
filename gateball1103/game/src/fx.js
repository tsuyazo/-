// デュエルの演出：召喚・攻撃・ダメージ／回復・魔法罠や効果の発動・場から離れる。
// 盤面の上に重ねた #fx レイヤーに一時的な要素を置き、Web Animations で動かす（終わったら消す）。
// 盤面の位置は ui.js が描く data-zone（"p:loc:seq"）と data-lp（"p"）から取る。

const $ = s => document.querySelector(s);
const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const layer = () => $('#fx');

function rectOf(p, loc, seq) {
  const el = document.querySelector(`[data-zone="${p}:${loc}:${seq}"]`);
  return el ? el.getBoundingClientRect() : null;
}
const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const screenCenter = () => ({ x: innerWidth / 2, y: innerHeight * 0.45 });
function spawn(cls, x, y, html = '') {
  const el = document.createElement('div');
  el.className = `fx ${cls}`;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.innerHTML = html;
  layer().appendChild(el);
  return el;
}
const done = (el, a) => a.finished.catch(() => {}).then(() => el.remove());
const wait = ms => new Promise(r => setTimeout(r, ms));

// 盤面上のカード（タイル）を動かす。無ければ何もしない
function animateTile(p, loc, seq, frames, opts) {
  const tile = document.querySelector(`[data-zone="${p}:${loc}:${seq}"] .tile`);
  return tile ? tile.animate(frames, opts).finished.catch(() => {}) : Promise.resolve();
}

/* ---------------- 召喚 ---------------- */
function summon(e, k) {
  const r = rectOf(e.p, e.loc, e.seq);
  const at = r ? center(r) : screenCenter();
  const T = 620 * k;
  const jobs = [];
  const ring = spawn(`ring ${e.kind}`, at.x, at.y);
  jobs.push(done(ring, ring.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.9)', opacity: 0 }], { duration: T, easing: 'cubic-bezier(.2,.7,.3,1)' })));
  if (e.kind === 'special') {
    // 特殊召喚：光の柱
    const pillar = spawn('pillar', at.x, at.y);
    jobs.push(done(pillar, pillar.animate([{ transform: 'translate(-50%,-100%) scaleY(0)', opacity: 0 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: .9, offset: .35 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 0 }], { duration: T * 1.1, easing: 'ease-out' })));
  }
  const tag = spawn(`tag ${e.kind}`, at.x, (r ? r.top : at.y) - 4, { normal: '召喚', special: '特殊召喚', flip: '反転召喚' }[e.kind]);
  jobs.push(done(tag, tag.animate([{ transform: 'translate(-50%,-30%)', opacity: 0 }, { transform: 'translate(-50%,-100%)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-140%)', opacity: 0 }], { duration: T * 1.3, easing: 'ease-out' })));
  jobs.push(animateTile(e.p, e.loc, e.seq, [{ transform: 'scale(1.35)', opacity: 0, filter: 'brightness(2.2)' }, { transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' }], { duration: T * .7, easing: 'cubic-bezier(.2,.8,.3,1.2)' }));
  return Promise.all(jobs);
}

/* ---------------- 発動（カットイン） ---------------- */
function activate(e, k, info) {
  const c = info(e.code);
  const kind = c.kind;                                   // 'spell' | 'trap' | 'monster'
  const label = { spell: '魔法発動', trap: '罠発動', monster: '効果発動' }[kind];
  const r = rectOf(e.p, e.loc, e.seq);
  const T = 950 * k;
  const jobs = [];
  if (r) {
    const glow = spawn(`srcglow ${kind}`, r.left + r.width / 2, r.top + r.height / 2);
    glow.style.width = `${r.width}px`; glow.style.height = `${r.height}px`;
    jobs.push(done(glow, glow.animate([{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: T })));
  }
  const at = screenCenter();
  const from = e.mine ? 1 : -1;                          // 自分の発動は右から、相手の発動は左から
  const card = spawn(`cutin ${kind}`, at.x, at.y, `
    <div class="ci-band">${label}${e.n > 1 ? `<small>チェーン${e.n}</small>` : ''}</div>
    <div class="ci-card">${c.img ? `<img src="${c.img}" alt="" onerror="this.remove()">` : `<div class="ci-blank"></div>`}</div>
    <div class="ci-name">${c.name}</div>`);
  jobs.push(done(card, card.animate([
    { transform: `translate(calc(-50% + ${from * 60}vw),-50%) skewX(${-from * 12}deg)`, opacity: 0 },
    { transform: 'translate(-50%,-50%) skewX(0)', opacity: 1, offset: .22 },
    { transform: 'translate(-50%,-50%) scale(1.02)', opacity: 1, offset: .78 },
    { transform: `translate(calc(-50% - ${from * 40}vw),-50%)`, opacity: 0 },
  ], { duration: T, easing: 'cubic-bezier(.2,.7,.2,1)' })));
  return Promise.all(jobs);
}

/* ---------------- 攻撃 ---------------- */
async function attack(e, k) {
  const a = rectOf(e.from.p, e.from.loc, e.from.seq);
  if (!a) return;
  let t = e.to ? rectOf(e.to.p, e.to.loc, e.to.seq) : null;
  if (!t) { const lp = document.querySelector(`[data-lp="${1 - e.p}"]`); t = lp ? lp.getBoundingClientRect() : null; }
  const A = center(a), B = t ? center(t) : screenCenter();
  const dx = (B.x - A.x) * .78, dy = (B.y - A.y) * .78;
  const T = 560 * k;
  const lunge = animateTile(e.from.p, e.from.loc, e.from.seq, [
    { transform: 'translate(0,0) scale(1)', zIndex: 5 },
    { transform: 'translate(0,0) scale(1.12)', offset: .25 },
    { transform: `translate(${dx}px,${dy}px) scale(1.12)`, offset: .55 },
    { transform: 'translate(0,0) scale(1)' },
  ], { duration: T, easing: 'cubic-bezier(.5,0,.3,1)' });
  await wait(T * .52);
  const hit = spawn(`impact ${e.to ? '' : 'direct'}`, B.x, B.y, '<i></i><i></i><i></i>');
  const ha = hit.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(-20deg)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.4) rotate(0)', opacity: 0 }], { duration: 420 * k, easing: 'ease-out' });
  await Promise.all([lunge, done(hit, ha)]);
}

/* ---------------- ダメージ・回復・コスト ---------------- */
function lifeChange(e, k, mineSide) {
  const lp = document.querySelector(`[data-lp="${e.p}"]`);
  const r = lp ? lp.getBoundingClientRect() : null;
  const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : screenCenter();
  at.x = Math.min(Math.max(at.x, 100), innerWidth - 100);   // 数字が画面の端で切れないように
  const sign = e.t === 'recover' ? '+' : '−';
  const big = e.t === 'damage' && e.amount >= 2000;
  const T = 900 * k;
  const jobs = [];
  const num = spawn(`lpnum ${e.t} ${big ? 'heavy' : ''}`, at.x, at.y, `${sign}${e.amount}`);
  jobs.push(done(num, num.animate([
    { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: .2 },
    { transform: 'translate(-50%,-110%) scale(1)', opacity: 1, offset: .7 },
    { transform: 'translate(-50%,-160%) scale(1)', opacity: 0 },
  ], { duration: T, easing: 'ease-out' })));
  if (lp && e.t !== 'recover') jobs.push(lp.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360 * k }).finished.catch(() => {}));
  if (e.t === 'damage') {
    // 画面のふちを赤く光らせる（自分が受けた時は強め）。大ダメージは盤面も揺らす
    const v = spawn(`vignette ${mineSide ? 'mine' : ''}`, 0, 0);
    jobs.push(done(v, v.animate([{ opacity: 0 }, { opacity: big ? 1 : .6, offset: .15 }, { opacity: 0 }], { duration: T * .8 })));
    if (big) { const app = $('#app'); if (app) jobs.push(app.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(5px,-3px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }], { duration: 380 * k }).finished.catch(() => {})); }
  }
  return Promise.all(jobs);
}

/* ---------------- 場から離れる ---------------- */
function leave(e, k) {
  const r = rectOf(e.p, e.loc, e.seq);
  if (!r) return Promise.resolve();
  const at = center(r);
  const bits = Array.from({ length: 8 }, (_, i) => {
    const ang = (i / 8) * Math.PI * 2 + Math.random() * .4, d = 26 + Math.random() * 22;
    const el = spawn(`shard ${e.to === 0x20 ? 'ban' : ''}`, at.x, at.y);
    return done(el, el.animate([{ transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * d}px),calc(-50% + ${Math.sin(ang) * d}px)) rotate(${200 + Math.random() * 200}deg)`, opacity: 0 }], { duration: 480 * k, easing: 'cubic-bezier(.2,.6,.4,1)' }));
  });
  return Promise.all(bits);
}

// e：エンジンの演出イベント / opts：{ speed（0.5〜1）, view（手前に表示しているプレイヤー）, info(code) }
export function playFx(e, opts) {
  if (!layer()) return Promise.resolve();
  const k = (reduce() ? 0.45 : 1) * opts.speed;
  switch (e.t) {
    case 'summon': return summon(e, k);
    case 'activate': return activate({ ...e, mine: e.p === opts.view }, k, opts.info);
    case 'attack': return attack(e, k);
    case 'damage': case 'recover': case 'cost': return lifeChange(e, k, e.p === opts.view);
    case 'leave': return leave(e, k);
    default: return Promise.resolve();
  }
}
