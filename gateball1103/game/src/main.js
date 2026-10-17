// ブラウザ版の入口：エンジンを読み込んで画面を起動する
import { loadCore } from './engine.js';
import { boot } from './ui.js';

const hot = window.claude?.hot;
loadCore().then(lib => {
  const start = d => boot(window.GB_DATA, lib, { data: d, snapshot: f => hot?.snapshot?.(f) });
  if (hot?.ready) hot.ready(start); else start(hot?.data);
}).catch(e => {
  document.querySelector('#app').innerHTML = `<p class="note">デュエルエンジンを読み込めませんでした（${String(e.message || e)}）。ページを再読み込みしてください。</p>`;
});
