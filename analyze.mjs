// Расширенный анализатор уровней «Хвостоеда»
// Использование: node analyze.mjs <файл-с-RAW_LEVELS> [--json] [номер_уровня_с_1]
// Метрики сверх solver.js: полное пространство состояний, тупики,
// вероятность победы случайного игрока, анализ первых ходов, ASCII-карта.
// Логика raycast/applyEat — побайтово та же семантика, что в игре и солвере.
import fs from 'fs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const packFilter = (args.find((a) => a.startsWith('--pack=')) || '').slice(7);
const rest = args.filter((a) => !a.startsWith('--'));
const file = rest[0];
const only = rest[1] ? Number(rest[1]) : null;   // номер внутри пака

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
const facing = (c) => [c[0][0] - c[1][0], c[0][1] - c[1][1]];

function occMap(snakes) {
  const m = new Map();
  snakes.forEach((s, si) => s.cells.forEach(([x, y], ci) => m.set(ck(x, y), { si, ci, len: s.cells.length, spiky: s.spiky })));
  return m;
}

function raycast(snakes, i, W, H, rockSet) {
  const s = snakes[i];
  const [dx, dy] = facing(s.cells);
  const occ = occMap(snakes);
  let [x, y] = s.cells[0];
  const gap = [];
  for (;;) {
    x += dx; y += dy;
    if (x < 0 || y < 0 || x >= W || y >= H) return { kind: 'edge', gap };
    if (rockSet.has(ck(x, y))) return { kind: 'rock' };
    const hit = occ.get(ck(x, y));
    if (hit) {
      if (hit.si === i) return { kind: 'self' };
      if (hit.ci === hit.len - 1) return hit.spiky ? { kind: 'spikyTail' } : { kind: 'tail', target: hit.si, gap };
      return { kind: 'block' };
    }
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

const key = (s) => s.map((x) => (x.spiky ? '!' : '') + x.cells.map((c) => c.join('.')).join(';')).sort().join('|');
const maxLen = (s) => Math.max(0, ...s.map((x) => x.cells.length));

function geometry(lv) {
  const seenC = new Set();
  const rockSet = new Set((lv.rocks || []).map(([x, y]) => ck(x, y)));
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
      if (rockSet.has(k)) return 'змея на валуне: ' + k;
      seenC.add(k);
      if (j > 0) {
        const [px, py] = s.cells[j - 1];
        if (Math.abs(px - x) + Math.abs(py - y) !== 1) return 'разрыв тела';
      }
    }
  }
  return 'ok';
}

// Список продуктивных ходов (съедание или выпуск)
function legalMoves(snakes, W, H, rockSet) {
  const out = [];
  for (let i = 0; i < snakes.length; i++) {
    const r = raycast(snakes, i, W, H, rockSet);
    if (r.kind === 'tail') out.push({ type: 'eat', i, ray: r, label: `eat s${i}>s${r.target}` });
    else if (r.kind === 'edge') out.push({ type: 'launch', i, label: `launch s${i}` });
  }
  return out;
}
const stepState = (snakes, mv) =>
  mv.type === 'eat' ? applyEat(snakes, mv.i, mv.ray) : snakes.filter((_, si) => si !== mv.i);

// Подсчёт решений в семантике solver.js (мемо по состоянию+глубине, cap 500)
function solveCompat(lv, { allowLaunch, moveCap }) {
  const W = lv.w, H = lv.h;
  const rockSet = new Set((lv.rocks || []).map(([x, y]) => ck(x, y)));
  const seen = new Set();
  let best = 0, sols = 0, minMoves = Infinity, bestSeq = null;
  const CAP = 500;
  function dfs(snakes, depth, seq) {
    const ml = maxLen(snakes);
    if (ml > best) best = ml;
    if (ml >= lv.ceiling) {
      sols++;
      if (depth < minMoves) { minMoves = depth; bestSeq = seq.slice(); }
      return;
    }
    if (moveCap != null && depth >= moveCap) return;
    const k = key(snakes) + '#' + depth;
    if (seen.has(k)) return;
    seen.add(k);
    if (sols >= CAP) return;
    for (const mv of legalMoves(snakes, W, H, rockSet)) {
      if (mv.type === 'launch' && !allowLaunch) continue;
      dfs(stepState(snakes, mv), depth + 1, seq.concat([mv.label]));
      if (sols >= CAP) return;
    }
  }
  dfs(lv.snakes.map((s) => ({ cells: s.cells, spiky: !!s.spiky })), 0, []);
  return { best, sols, minMoves: sols ? minMoves : null, bestSeq };
}

// Полное исследование. Каждый ход убирает ровно одну змею,
// поэтому глубина = n0 - число змей: граф — слоёный DAG, лимит ходов
// выражается через само состояние.
function explore(lv) {
  const W = lv.w, H = lv.h, cap = lv.moves != null ? lv.moves : null;
  const rockSet = new Set((lv.rocks || []).map(([x, y]) => ck(x, y)));
  const startSnakes = lv.snakes.map((s) => ({ cells: s.cells, spiky: !!s.spiky }));
  const n0 = startSnakes.length;
  const depthOf = (snakes) => n0 - snakes.length;

  let nStates = 0, nWin = 0, nDead = 0, nCapped = 0, minMoves = null;
  let mineSum = 0, mineStates = 0; // доля заблокированных змей (аварийных тапов) по состояниям
  const visited = new Set();
  const queue = [startSnakes];
  visited.add(key(startSnakes));
  while (queue.length) {
    const st = queue.shift();
    nStates++;
    const d = depthOf(st);
    if (maxLen(st) >= lv.ceiling) {
      nWin++;
      if (minMoves == null || d < minMoves) minMoves = d;
      continue; // победа — поглощающее состояние
    }
    if (cap != null && d >= cap) { nCapped++; continue; }
    const moves = legalMoves(st, W, H, rockSet);
    if (st.length) { mineSum += (st.length - moves.length) / st.length; mineStates++; }
    if (!moves.length) { nDead++; continue; }
    for (const mv of moves) {
      const nx = stepState(st, mv);
      const k = key(nx);
      if (!visited.has(k)) { visited.add(k); queue.push(nx); }
    }
  }

  // canWin и вероятность победы игрока, тапающего случайный доступный ход
  const memoWin = new Map(), memoP = new Map();
  function canWin(snakes) {
    const k = key(snakes);
    if (memoWin.has(k)) return memoWin.get(k);
    let r;
    if (maxLen(snakes) >= lv.ceiling) r = true;
    else if (cap != null && depthOf(snakes) >= cap) r = false;
    else r = legalMoves(snakes, W, H, rockSet).some((mv) => canWin(stepState(snakes, mv)));
    memoWin.set(k, r);
    return r;
  }
  function pWin(snakes) {
    const k = key(snakes);
    if (memoP.has(k)) return memoP.get(k);
    let r;
    if (maxLen(snakes) >= lv.ceiling) r = 1;
    else if (cap != null && depthOf(snakes) >= cap) r = 0;
    else {
      const moves = legalMoves(snakes, W, H, rockSet);
      r = moves.length ? moves.reduce((a, mv) => a + pWin(stepState(snakes, mv)), 0) / moves.length : 0;
    }
    memoP.set(k, r);
    return r;
  }

  // «Обезьяний тест» аварийной модели: игрок тапает СЛУЧАЙНУЮ ЗМЕЮ.
  // Заблокированный луч = авария = проигрыш. Метрика читаемости поля.
  const memoT = new Map();
  function pTaps(snakes) {
    const k = key(snakes);
    if (memoT.has(k)) return memoT.get(k);
    let r;
    if (maxLen(snakes) >= lv.ceiling) r = 1;
    else if (!snakes.length || (cap != null && depthOf(snakes) >= cap)) r = 0;
    else {
      let acc = 0;
      for (let i = 0; i < snakes.length; i++) {
        const ray = raycast(snakes, i, W, H, rockSet);
        if (ray.kind === 'tail') acc += pTaps(applyEat(snakes, i, ray));
        else if (ray.kind === 'edge') acc += pTaps(snakes.filter((_, si) => si !== i));
        // иначе авария: вклад 0
      }
      r = acc / snakes.length;
    }
    memoT.set(k, r);
    return r;
  }

  const firstMoves = legalMoves(startSnakes, W, H, rockSet).map((mv) => ({
    label: mv.label,
    winnable: canWin(stepState(startSnakes, mv)),
  }));

  return {
    nStates, nWin, nDead, nCapped, minMoves,
    randomWinProb: pWin(startSnakes),
    tapWinProb: pTaps(startSnakes),
    minefield: mineStates ? mineSum / mineStates : 0,
    firstMoves,
    ply1Total: firstMoves.length,
    ply1Winning: firstMoves.filter((m) => m.winnable).length,
  };
}

const ARROWS = { '1,0': '>', '-1,0': '<', '0,1': 'v', '0,-1': '^' };
function asciiMap(lv) {
  const grid = Array.from({ length: lv.h }, () => Array.from({ length: lv.w }, () => '. '));
  (lv.rocks || []).forEach(([x, y]) => { grid[y][x] = '##'; });
  lv.snakes.forEach((s, si) => {
    const L = String.fromCharCode(97 + si);
    const [dx, dy] = facing(s.cells);
    s.cells.forEach(([x, y], ci) => {
      if (ci === 0) grid[y][x] = L.toUpperCase() + (ARROWS[dx + ',' + dy] || '?');
      else if (ci === s.cells.length - 1) grid[y][x] = L + '*';
      else grid[y][x] = L + ' ';
    });
  });
  const rows = grid.map((r, y) => String(y).padStart(2) + ' ' + r.join(''));
  const head = '   ' + Array.from({ length: lv.w }, (_, x) => String(x).padEnd(2)).join('');
  const legend = lv.snakes.map((s, si) =>
    `s${si}=${String.fromCharCode(97 + si)} len=${s.cells.length}${s.spiky ? ' КОЛЮЧАЯ' : ''}`).join('; ');
  return head + '\n' + rows.join('\n') + '\n   ' + legend + '\n   (заглавная+стрелка=голова, *=хвост, ##=валун)';
}

const report = [];
let allOk = true;
for (const pack of PACKS) {
if (packFilter && !pack.name.toLowerCase().includes(packFilter.toLowerCase())) continue;
if (!asJson) console.log(`\n### ${pack.name} — ${pack.levels.length} уровней`);
pack.levels.forEach((lv, i) => {
  if (only != null && i + 1 !== only) return;
  const total = lv.snakes.reduce((a, s) => a + s.cells.length, 0);
  const geo = geometry(lv);
  if (geo !== 'ok') {
    allOk = false;
    report.push({ n: i + 1, name: lv.name, geo, solvable: false });
    if (!asJson) console.log(`${i + 1}. ${lv.name} — ГЕОМЕТРИЯ: ${geo}`);
    return;
  }
  const cap = lv.moves != null ? lv.moves : null;
  const inCap = solveCompat(lv, { allowLaunch: true, moveCap: cap });
  const noL = solveCompat(lv, { allowLaunch: false, moveCap: cap });
  const loose = cap != null ? solveCompat(lv, { allowLaunch: true, moveCap: null }) : null;
  const ex = explore(lv);
  const solvable = inCap.sols > 0;
  if (!solvable) allOk = false;
  const launchRequired = noL.sols === 0 && solvable;
  // Эвристика сложности (аварийная модель): длина решения + редкость верных
  // первых ходов + глубина стратегии (pMoves) + опасность поля (pTaps) + размер пространства
  const difficulty = solvable
    ? +(inCap.minMoves
      + 3 * (1 - ex.ply1Winning / Math.max(1, ex.ply1Total))
      + 3 * (1 - ex.randomWinProb)
      + 3 * (1 - ex.tapWinProb)
      + Math.log2(ex.nStates) / 2).toFixed(1)
    : null;

  const row = {
    pack: pack.name, n: i + 1, name: lv.name, w: lv.w, h: lv.h, ceiling: lv.ceiling, total, moves: cap,
    geo, solvable, sols: inCap.sols, minMoves: inCap.minMoves, bestSeq: inCap.bestSeq,
    launchRequired, bestNoLaunch: noL.best,
    solsLoose: loose ? loose.sols : null,
    nStates: ex.nStates, nWin: ex.nWin, nDead: ex.nDead, nCapped: ex.nCapped,
    randomWinProb: +ex.randomWinProb.toFixed(3),
    tapWinProb: +ex.tapWinProb.toFixed(3),
    minefield: +ex.minefield.toFixed(3),
    ply1: `${ex.ply1Winning}/${ex.ply1Total}`,
    firstMoves: ex.firstMoves,
    difficulty,
  };
  report.push(row);
  if (!asJson) {
    console.log(`\n=== ${i + 1}. ${lv.name} ${lv.w}x${lv.h} потолок=${lv.ceiling} total=${total}${cap != null ? ` ходы<=${cap}` : ''} ===`);
    console.log(asciiMap(lv));
    console.log(`решаем=${solvable} решений=${inCap.sols} minMoves=${inCap.minMoves} | выпуск обязателен=${launchRequired} (без выпусков best=${noL.best})` +
      (loose ? ` | без лимита ходов sols=${loose.sols}` : ''));
    console.log(`состояний=${ex.nStates} побед=${ex.nWin} тупиков=${ex.nDead}${cap != null ? ` срезано лимитом=${ex.nCapped}` : ''} | p(случайных ходов)=${row.randomWinProb} p(случайных тапов, аварии)=${row.tapWinProb} мины=${row.minefield} | верных первых ходов ${row.ply1}`);
    console.log(`первые ходы: ` + ex.firstMoves.map((m) => `${m.label}${m.winnable ? '✓' : '✗'}`).join(', '));
    console.log(`сложность≈${difficulty}` + (solvable ? ` | пример: ${inCap.bestSeq.join(', ')}` : ''));
  }
});
}
if (asJson) console.log(JSON.stringify(report, null, 1));
else console.log(allOk ? '\nВСЕ УРОВНИ КОРРЕКТНЫ И РЕШАЕМЫ' : '\n!! ЕСТЬ ПРОБЛЕМЫ');
