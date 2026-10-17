// ゲームに埋め込むデータ一式（カード・デッキ・エンジン用数値・Luaスクリプト・効果文言）を組み立てる
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

// 効果の選択肢の文言も、カード名・テーマ名を実名にそろえる（tools/build.py が data/name_map.json を書く）
function renameAll(obj) {
  const p = path.join(ROOT, 'data/name_map.json');
  if (!fs.existsSync(p)) return obj;
  const m = JSON.parse(fs.readFileSync(p));
  const keys = Object.keys(m.names).sort((a, b) => b.length - a.length);
  const conv = s => {
    for (const k of keys) s = s.split(`「${k}」`).join(`「${m.names[k]}」`);
    for (const [a, b] of Object.entries(m.archetypes)) s = s.split(a).join(b);
    for (const [a, b] of m.terms) s = s.split(a).join(b);
    return s;
  };
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, conv(v)]));
}

export function loadRaw() {
  const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json')));
  const decks = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decks.json')));
  const idOf = {}; cards.forEach(c => { idOf[c.code] = c.id; });
  const scripts = {};
  const sdir = path.join(HERE, 'scripts');
  for (const f of fs.readdirSync(sdir)) if (f.endsWith('.lua')) scripts[f] = fs.readFileSync(path.join(sdir, f), 'utf8');
  for (const f of fs.readdirSync(path.join(sdir, 'official'))) scripts[`official/${f}`] = fs.readFileSync(path.join(sdir, 'official', f), 'utf8');
  return {
    cards: cards.map(c => ({ id: c.id, code: c.code, name: c.name, category: c.category, subtype: c.subtype, level: c.level,
      attribute: c.attribute, race: c.race, tags: c.tags, atk: c.atk, def_: c.def_, text: c.text, limit: c.limit })),
    decks: Object.fromEntries(Object.entries(decks).map(([k, d]) => [k, { name: d.name, ref: d.ref_archetype,
      main: d.main.map(e => [e.n, idOf[e.code]]), extra: d.extra.map(e => [e.n, idOf[e.code]]) }])),
    cardData: JSON.parse(fs.readFileSync(path.join(HERE, 'card_data.json'))),
    recipes: JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/recipes_meta.json'))),
    images: fs.existsSync(path.join(HERE, 'card_images.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'card_images.json'))) : {},
    effectStrings: renameAll(JSON.parse(fs.readFileSync(path.join(HERE, 'effect_strings.json')))),
    scripts,
  };
}
