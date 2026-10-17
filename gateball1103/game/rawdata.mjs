// ゲームに埋め込むデータ一式（カード・デッキ・エンジン用数値・Luaスクリプト・効果文言）を組み立てる
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

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
    effectStrings: JSON.parse(fs.readFileSync(path.join(HERE, 'effect_strings.json'))),
    scripts,
  };
}
