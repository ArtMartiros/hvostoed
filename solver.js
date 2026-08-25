// Солвер «Хвостоеда» v4: валуны (rocks), колючие (spiky), спящие (sleep), лимит ходов (moves)
// и ОТМЕТКИ: у уровня объявлен потолок (ceiling), от него считаются три звезды.
// Ворота проверяют не «дошёл ли кто-то до цели», а что объявленный потолок —
// ровно тот, до которого доска даёт дорасти: ни ниже (звезда была бы даром),
// ни выше (верхняя звезда была бы недостижима, как прежняя «осталась одна змея»).
// Использование: node solver.js /путь/к/hvostoed.jsx
import fs from 'fs';
// Формула отметок общая на игру, генератор и метрики — берём её оттуда, а не переписываем.
import { marksOf } from './generator.mjs';

const argv = process.argv.slice(2);
const packFilter = (argv.find((a) => a.startsWith('--pack=')) || '').slice(7);
const file = argv.find((a) => !a.startsWith('--')) || '/mnt/user-data/outputs/hvostoed.jsx';
const src = fs.readFileSync(file, 'utf8');
// В файле игры может быть несколько паков: RAW_LEVELS, RAW_LEVELS_VOID, ...
const PACKS = [];
for (const m of src.matchAll(/const (RAW_LEVELS\w*) = \[/g)) {
  const end = src.indexOf('\n];', m.index);
  if (end < 0) continue;
  PACKS.push({ name: m[1], levels: eval(src.slice(m.index + `const ${m[1]} = `.length, end + 3)) });
}
if (!PACKS.length) { console.error('RAW_LEVELS не найден'); process.exit(1); }


const ck = (x, y) => x + ',' + y;
const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const facing = (c) => [c[0][0] - c[1][0], c[0][1] - c[1][1]];

function occMap(snakes) {
  const m = new Map();
  snakes.forEach((s, si) => s.cells.forEach(([x, y], ci) => m.set(ck(x, y), { si, ci, len: s.cells.length, spiky: s.spiky })));
  return m;
}

function raycast(snakes, i, W, H, board) {
  const s = snakes[i];
  let [dx, dy] = facing(s.cells);          // поворот гнёт луч, поэтому не const
  const occ = occMap(snakes);
  let [x, y] = s.cells[0];
  const gap = [];
  /* Голова САМА может лежать на плитке поворота, и тогда луч рождается ВНУТРИ
     жёлоба. Клетку головы цикл не читает — он начинает с шага, — поэтому свою
     плитку проверяем отдельно, иначе стенка держала луч только снаружи, а
     изнутри он уходил сквозь неё и съедал хвост за стеной.
     Гнуть тут нечего: выход поворота выбирается по стороне ВХОДА, а у луча,
     родившегося внутри плитки, её нет. Открытая сторона выпускает, закрытая
     останавливает — та же стенка, что и снаружи. */
  const own = board.turns.get(ck(x, y));
  if (own) {
    const out = dx === 1 ? 'e' : dx === -1 ? 'w' : dy === 1 ? 's' : 'n';
    if (own[0] !== out && own[1] !== out) return { kind: 'turnBack' };
  }
  const cap = 4 * W * H + 8;               // порталы можно замкнуть в кольцо
  for (let step = 0; ; step++) {
    if (step > cap) return { kind: 'loop' };
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= W || y >= H) return { kind: 'edge', gap };
    if (board.rocks.has(ck(x, y))) return { kind: 'rock' };
    if (board.bridges.has(ck(x, y))) { gap.push([x, y]); continue; }   // луч идёт над мостом
    // спина поворота — СТЕНА, и стена не исчезает оттого, что на плитке
    // кто-то лежит: проверяем закрытую сторону РАНЬШЕ занятости. Иначе змея,
    // легшая на плитку, подставляла свой хвост под луч, который упирался повороту
    // в спину, — и обед проходил сквозь стену.
    const t = board.turns.get(ck(x, y));
    const from = t ? (dx === 1 ? 'w' : dx === -1 ? 'e' : dy === 1 ? 'n' : 's') : null;
    if (t && t[0] !== from && t[1] !== from) return { kind: 'turnBack' };
    const hit = occ.get(ck(x, y));
    if (hit) {
      if (hit.si === i) return { kind: 'self' };
      if (hit.ci === hit.len - 1) return hit.spiky ? { kind: 'spikyTail' } : { kind: 'tail', target: hit.si, gap };
      return { kind: 'block' };
    }
    const g = board.gates.get(ck(x, y));            // портал: вход, выход, направление то же
    if (g) { gap.push([x, y]); x = g[0] - dx; y = g[1] - dy; continue; }   // шаг прибавляется сверху
    if (t) [dx, dy] = SIDES[t[0] === from ? t[1] : t[0]];   // открытая сторона — гнём (спину проверили выше)
    gap.push([x, y]);
  }
}

function applyEat(snakes, i, ray) {
  const prey = snakes[ray.target];
  const food = new Set(prey.cells.map(([x, y]) => ck(x, y)));
  const path = ray.gap.concat(prey.cells.slice().reverse());
  let cells = snakes[i].cells.map((c) => c.slice());
  for (const p of path) {
    cells.unshift([p[0], p[1]]);
    if (!food.has(ck(p[0], p[1]))) cells.pop();
  }
  const out = [];
  snakes.forEach((s, si) => {
    if (si === ray.target) return;
    out.push(si === i ? { ...s, cells } : s);
  });
  return out;
}

const key = (s) => s.map((x) => (x.spiky ? '!' : '') + (x.sleep ? 'z' : '') + (x.apple ? 'a' : '') + x.cells.map((c) => c.join('.')).join(';')).sort().join('|');
const maxLen = (s) => Math.max(0, ...s.map((x) => x.cells.length));

// Полный перебор с метриками. moveCap: ограничение длины решения (null = без лимита)
function solve(lv, { allowLaunch, moveCap, goal }) {
  const W = lv.w, H = lv.h;
  const board = { rocks: new Set((lv.rocks || []).map(([x, y]) => ck(x, y))),
                  bridges: new Set((lv.bridges || []).map(([x, y]) => ck(x, y))),
                  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck(x, y), a + b])),
                  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [ck(x, y), [u, v]])) };
  const seen = new Set();
  let best = 0, sols = 0, minMoves = Infinity, bestSeq = null;
  const CAP = 500;
  function dfs(snakes, depth, seq) {
    const ml = maxLen(snakes);
    if (ml > best) best = ml;
    if (ml >= goal) {
      sols++;
      if (depth < minMoves) { minMoves = depth; bestSeq = seq.slice(); }
      return;
    }
    if (moveCap != null && depth >= moveCap) return;
    const k = key(snakes) + '#' + depth;
    if (seen.has(k)) return;
    seen.add(k);
    if (sols >= CAP) return;
    for (let i = 0; i < snakes.length; i++) {
      if (snakes[i].sleep) continue;          // спящая не ходит, но её едят
      const r = raycast(snakes, i, W, H, board);
      if (r.kind === 'tail') dfs(applyEat(snakes, i, r), depth + 1, seq.concat(['eat s' + i + '>s' + r.target]));
      else if (r.kind === 'edge' && allowLaunch) dfs(snakes.filter((_, si) => si !== i), depth + 1, seq.concat(['launch s' + i]));
      if (sols >= CAP) return;
    }
  }
  dfs(lv.snakes.map((s) => ({ cells: s.cells, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, apple: !!s.apple })), 0, []);
  return { best, sols, minMoves: sols ? minMoves : null, bestSeq };
}

function ceilingOf(lv) {
  const W = lv.w, H = lv.h;
  const board = { rocks: new Set((lv.rocks || []).map(([x, y]) => ck(x, y))),
                  bridges: new Set((lv.bridges || []).map(([x, y]) => ck(x, y))),
                  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck(x, y), a + b])),
                  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [ck(x, y), [u, v]])) };
  const seen = new Set();
  let best = 0;
  const dfs = (snakes) => {
    const k = key(snakes);
    if (seen.has(k)) return;
    seen.add(k);
    best = Math.max(best, maxLen(snakes));
    for (let i = 0; i < snakes.length; i++) {
      if (snakes[i].sleep) continue;
      const r = raycast(snakes, i, W, H, board);
      if (r.kind === 'tail') dfs(applyEat(snakes, i, r));
      else if (r.kind === 'edge') dfs(snakes.filter((_, si) => si !== i));
    }
  };
  dfs(lv.snakes.map((s) => ({ cells: s.cells, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, apple: !!s.apple })));
  return best;
}

function geometry(lv) {
  const seenC = new Set();
  const board = { rocks: new Set((lv.rocks || []).map(([x, y]) => ck(x, y))),
                  bridges: new Set((lv.bridges || []).map(([x, y]) => ck(x, y))),
                  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck(x, y), a + b])),
                  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [ck(x, y), [u, v]])) };
  for (const [x, y] of lv.rocks || []) {
    if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return 'валун вне поля';
  }
  for (const s of lv.snakes) {
    if (s.cells.length < 2) return 'змея короче 2';
    for (let j = 0; j < s.cells.length; j++) {
      const [x, y] = s.cells[j];
      if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return 'клетка вне поля';
      const k = ck(x, y);
      if (seenC.has(k)) return 'пересечение змей: ' + k;
      if (board.rocks.has(k)) return 'змея на валуне: ' + k;
      seenC.add(k);
      if (j > 0) {
        const [px, py] = s.cells[j - 1];
        if (Math.abs(px - x) + Math.abs(py - y) !== 1) return 'разрыв тела';
      }
    }
  }
  return 'ok';
}

let allOk = true;
for (const pack of PACKS) {
if (packFilter && !pack.name.toLowerCase().includes(packFilter.toLowerCase())) continue;
console.log(`\n### ${pack.name} — ${pack.levels.length} уровней`);
pack.levels.forEach((lv, i) => {
  const total = lv.snakes.reduce((a, s) => a + s.cells.length, 0);
  const geo = geometry(lv);
  const cap = lv.moves != null ? lv.moves : null;
  const goal = lv.ceiling;
  const inCap = solve(lv, { allowLaunch: true, moveCap: cap, goal });
  const noL = solve(lv, { allowLaunch: false, moveCap: cap, goal });
  const solvable = inCap.sols > 0;
  const start = Math.max(...lv.snakes.map((s) => s.cells.length));
  const marks = marksOf(goal, start);
  const реально = ceilingOf(lv);
  const беды = [];
  if (geo !== 'ok') беды.push('гео: ' + geo);
  if (!solvable) беды.push('верхняя отметка недостижима');
  if (реально !== goal) беды.push(`объявлен потолок ${goal}, доска даёт ${реально}`);
  if (!(marks[0] < marks[1] && marks[1] < marks[2])) беды.push('отметки слиплись: ' + marks.join('/'));
  /* Нижнюю отметку формула поднимает выше стартовой длины — иначе звезда горит до
     первого тапа. Но если весь рост уровня меньше трёх клеток (стартовая змея почти
     дотягивает до потолка), трём отметкам разойтись негде, и это свойство доски, а
     не ошибка: ругаемся только когда место БЫЛО. */
  if (marks[0] <= start && goal - start >= 3) беды.push(`нижняя отметка ${marks[0]} не выше стартовой длины ${start}`);
  const узко = marks[0] <= start;
  if (беды.length) allOk = false;
  console.log(
    `${String(i + 1).padStart(2)}. ${lv.name.padEnd(10)} ${lv.w}x${lv.h} отметки=${marks.join('/')} total=${total}` +
    (cap != null ? ` ходы<=${cap}` : '') +
    ` | гео=${geo} | линий до потолка=${inCap.sols} minMoves=${inCap.minMoves}` +
    ` | без выпусков: best=${noL.best} sols=${noL.sols}` +
    ` | выпуск обязателен=${noL.sols === 0 && solvable}` +
    (беды.length ? ` | !! ${беды.join('; ')}` : узко ? ' | ОК (шкала узкая: часть звёзд горит со старта)' : ' | ОК')
  );
  if (solvable) console.log('     пример: ' + inCap.bestSeq.join(', '));
});
}
console.log(allOk ? '\nВСЕ УРОВНИ КОРРЕКТНЫ: геометрия цела, потолок объявлен верно, отметки берутся' : '\n!! ЕСТЬ ПРОБЛЕМЫ');
process.exit(allOk ? 0 : 1);
