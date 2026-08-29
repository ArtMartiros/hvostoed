/* Ворота пака «Комнаты»: каждое из 30 решений (rooms-sids) проходится кодом
   САМОЙ игры — raycast/applyEat вырезаются из hvostoed.jsx строковыми якорями,
   крышки закрытых комнат моделируются валунами, как в Game. Решения строит
   scratchpad-скрипт sids.mjs из данных пака; здесь они пересчитываются заново,
   чтобы ворота не зависели от временных файлов. */
import fs from 'fs';
import * as G from './generator.mjs';
const src = fs.readFileSync(new URL('./hvostoed.jsx', import.meta.url), 'utf8');
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
const i0 = src.indexOf('const SECTION_LEVELS = [');
const LEVELS = eval(src.slice(i0 + 'const SECTION_LEVELS = '.length, src.indexOf('\n];', i0) + 2));
const game = eval(cut('const SIDES = { n:', '/* ---------- отрисовка') + '\n({ raycast, applyEat, ckey })');

const sk = (st) => st.map((s) => s.id + ':' + s.cells.map((c) => c.join('.')).join(';')).sort().join('|');
let bad = 0;
LEVELS.forEach((lv, li) => {
  // решение — перебором на механике generator.mjs со стеной-заглушкой
  let ci = 0;
  const secs = lv.sections.map((sec) => sec.snakes.map((sn) => ({ id: 's' + (ci++), cells: sn.cells.map((c) => c.slice()), spiky: false, sleep: false })));
  let cur = null; const sol = [];
  for (let k = 0; k < lv.sections.length; k++) {
    const wallCells = [];
    for (let q = k + 1; q < lv.sections.length; q++) { const r = lv.sections[q];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) wallCells.push([x, y]); }
    const wall = wallCells.length ? { id: 'WALL', cells: wallCells, spiky: true, sleep: true } : null;
    const done = wall ? 2 : 1, board = G.boardOf({});
    let st = (cur ? [cur] : []).concat(secs[k]); if (wall) st = st.concat([wall]);
    const seen = new Set();
    const dfs = (s2, taps) => {
      if (s2.length === done) return { taps, fin: s2.find((x) => x.id !== 'WALL') };
      const kk = sk(s2); if (seen.has(kk)) return null; seen.add(kk);
      for (const m of G.movesOf(s2, lv.w, lv.h, board)) {
        if (!m.eat) continue;
        const r = dfs(G.applyEat(s2, m.i, m.ray), taps.concat([s2[m.i].id]));
        if (r) return r;
      }
      return null;
    };
    const r = dfs(st, []);
    if (!r) { console.log('  ' + (li + 1) + '. ' + lv.name + ' — комната ' + (k + 1) + ' НЕ РЕШАЕТСЯ'); bad++; cur = null; break; }
    sol.push(r.taps); cur = r.fin;
  }
  if (!cur) return;
  // и теперь то же решение — кодом игры, с крышками-валунами
  let ci2 = 0;
  const secs2 = lv.sections.map((sec) => sec.snakes.map((sn) => ({ id: 's' + (ci2++), color: 'green', cells: sn.cells.map((c) => c.slice()), spiky: false, sleep: false, apple: false })));
  let snakes = secs2[0].map((s) => ({ ...s, cells: s.cells.map((c) => c.slice()) }));
  let open = 1;
  const boardNow = () => { const rocks = [];
    for (let q = open; q < lv.sections.length; q++) { const r = lv.sections[q];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rocks.push([x, y]); }
    return { rocks: new Set(rocks.map(([x, y]) => game.ckey(x, y))), bridges: new Set(), turns: new Map(), gates: new Map() }; };
  for (const stage of sol) {
    for (const sid of stage) {
      const ray = game.raycast(snakes, sid, lv.w, lv.h, boardNow());
      if (ray.kind !== 'tail') { console.log('  ' + (li + 1) + '. ' + lv.name + ' — игра отвергла тап ' + sid + ': ' + ray.kind); bad++; return; }
      snakes = game.applyEat(snakes, sid, ray);
    }
    if (snakes.length !== 1) { console.log('  ' + (li + 1) + '. ' + lv.name + ' — комната не собралась'); bad++; return; }
    if (open < lv.sections.length) { snakes = snakes.concat(secs2[open].map((s) => ({ ...s, cells: s.cells.map((c) => c.slice()) }))); open++; }
  }
  console.log('  ' + String(li + 1).padStart(2) + '. ' + lv.name.padEnd(18) + ' комнат ' + lv.sections.length + ' → финал ' + snakes[0].cells.length);
});
if (bad) { console.log('ПАК «КОМНАТЫ» СЛОМАН: ' + bad); process.exit(1); }
console.log('ПАК «КОМНАТЫ» КОРРЕКТЕН: игра проходит решение каждого уровня ход в ход');
