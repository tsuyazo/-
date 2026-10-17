// game/index.html を作る：画面コードとエンジン（wasm）を1本にまとめ、カード・Luaスクリプトを埋め込む
import * as esbuild from 'esbuild';
import fs from 'fs';
import { loadRaw } from './rawdata.mjs';

const stubJspi = {
  name: 'stub-jspi',   // 非同期版（JSPI）のエンジンは使わないので空にする
  setup(b) { b.onResolve({ filter: /ocgcore\.jspi/ }, a => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default null;' })); },
};
const out = await esbuild.build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', platform: 'browser',
  target: 'es2020', minify: true, write: false, plugins: [stubJspi], logLevel: 'warning' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const raw = loadRaw();
const json = JSON.stringify(raw).replace(/</g, '\\u003c');
const tpl = fs.readFileSync('template.html', 'utf8');
const html = tpl.replace('__DATA__', () => json).replace('__APP__', () => js);
fs.writeFileSync('index.html', html);
console.log(`index.html ${(html.length / 1024 / 1024).toFixed(2)} MB (app ${(js.length / 1024).toFixed(0)} KB, data ${(json.length / 1024).toFixed(0)} KB)`);
