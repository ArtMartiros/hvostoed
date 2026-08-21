// gen3.mjs — генератор eat-all уровней («съешь всё поле», target = total).
// Обратные разрезы мегазмеи (по мотивам gen2.js) + посев валунов в свободные
// клетки + опциональная колючка (только финальный выживший).
// Семантика raycast/applyEat — та же, что в analyze.mjs (валуны, колючки).
// Запуск: node gen3.mjs <seed0> <seed1>

const ck = (x, y) => x + ',' + y;
const facing = (c) => [c[0][0] - c[1][0], c[0][1] - c[1][1]];
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let seed = 42;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function ri(n) { return Math.floor(rnd() * n); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- игровая семантика (как в analyze.mjs) ----------
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
    out.push(si === i ? { ...s, cells, id: s.id } : s);
  });
  return out;
}
const key = (s) => s.map((x) => (x.spiky ? '!' : '') + x.cells.map((c) => c.join('.')).join(';')).sort().join('|');
const maxLen = (s) => Math.max(0, ...s.map((x) => x.cells.length));
function legalMoves(snakes, W, H, rockSet) {
  const out = [];
  for (let i = 0; i < snakes.length; i++) {
    const r = raycast(snakes, i, W, H, rockSet);
    if (r.kind === 'tail') out.push({ type: 'eat', i, ray: r });
    else if (r.kind === 'edge') out.push({ type: 'launch', i });
  }
  return out;
}
const stepState = (snakes, mv) =>
  mv.type === 'eat' ? applyEat(snakes, mv.i, mv.ray) : snakes.filter((_, si) => si !== mv.i);

// Полное решение eat-all уровня: считает sols, minMoves, множество выживших (id),
// плюс метрики случайного игрока. target=total ⇒ выпуск всегда губителен, но
// как ход существует (ловушка).
function evaluate(lv) {
  const W = lv.w, H = lv.h;
  const rockSet = new Set((lv.rocks || []).map(([x, y]) => ck(x, y)));
  const start = lv.snakes.map((s, i) => ({ cells: s.cells, spiky: !!s.spiky, id: i }));
  const CAP = 500;
  let sols = 0, minMoves = Infinity, bestSeq = null;
  const survivors = new Set();
  const seen = new Set();
  function dfs(snakes, depth, seq) {
    if (maxLen(snakes) >= lv.target) {
      sols++;
      survivors.add(snakes[0].id);
      if (depth < minMoves) { minMoves = depth; bestSeq = seq.slice(); }
      return;
    }
    const k = key(snakes) + '#' + depth;
    if (seen.has(k)) return;
    seen.add(k);
    if (sols >= CAP) return;
    for (const mv of legalMoves(snakes, W, H, rockSet)) {
      if (mv.type === 'launch') continue; // target=total: выпуск не ведёт к победе
      dfs(stepState(snakes, mv), depth + 1,
        seq.concat([`eat ${snakes[mv.i].id}>${snakes[mv.ray.target].id}`]));
      if (sols >= CAP) return;
    }
  }
  dfs(start, 0, []);

  // полное пространство + pMoves/pTaps/ply1/тупики
  let nStates = 0, nWin = 0, nDead = 0;
  const visited = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const st = queue.shift();
    nStates++;
    if (maxLen(st) >= lv.target) { nWin++; continue; }
    const moves = legalMoves(st, W, H, rockSet);
    if (!moves.length) { nDead++; continue; }
    for (const mv of moves) {
      const nx = stepState(st, mv);
      const k = key(nx);
      if (!visited.has(k)) { visited.add(k); queue.push(nx); }
    }
  }
  const memoWin = new Map(), memoP = new Map(), memoT = new Map();
  function canWin(snakes) {
    const k = key(snakes);
    if (memoWin.has(k)) return memoWin.get(k);
    let r;
    if (maxLen(snakes) >= lv.target) r = true;
    else r = legalMoves(snakes, W, H, rockSet).some((mv) => canWin(stepState(snakes, mv)));
    memoWin.set(k, r);
    return r;
  }
  function pWin(snakes) {
    const k = key(snakes);
    if (memoP.has(k)) return memoP.get(k);
    let r;
    if (maxLen(snakes) >= lv.target) r = 1;
    else {
      const moves = legalMoves(snakes, W, H, rockSet);
      r = moves.length ? moves.reduce((a, mv) => a + pWin(stepState(snakes, mv)), 0) / moves.length : 0;
    }
    memoP.set(k, r);
    return r;
  }
  function pTaps(snakes) {
    const k = key(snakes);
    if (memoT.has(k)) return memoT.get(k);
    let r;
    if (maxLen(snakes) >= lv.target) r = 1;
    else if (!snakes.length) r = 0;
    else {
      let acc = 0;
      for (let i = 0; i < snakes.length; i++) {
        const ray = raycast(snakes, i, W, H, rockSet);
        if (ray.kind === 'tail') acc += pTaps(applyEat(snakes, i, ray));
        else if (ray.kind === 'edge') acc += pTaps(snakes.filter((_, si) => si !== i));
      }
      r = acc / snakes.length;
    }
    memoT.set(k, r);
    return r;
  }
  const firstMoves = legalMoves(start, W, H, rockSet);
  const ply1Winning = firstMoves.filter((mv) => canWin(stepState(start, mv))).length;
  return {
    sols, minMoves: sols ? minMoves : null, bestSeq, survivors,
    nStates, nWin, nDead,
    pMoves: pWin(start), pTaps: pTaps(start),
    ply1: `${ply1Winning}/${firstMoves.length}`,
    ply1Winning, ply1Total: firstMoves.length,
  };
}

// ---------- обратная генерация (из gen2.js) ----------
function megaPath(w, h, minLen) {
  for (let a = 0; a < 400; a++) {
    const sx = ri(w), sy = ri(h);
    const cells = [[sx, sy]];
    const used = new Set([ck(sx, sy)]);
    for (;;) {
      const [cx, cy] = cells[cells.length - 1];
      const opts = dirs.map(([dx, dy]) => [cx + dx, cy + dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h && !used.has(ck(x, y)));
      if (!opts.length) break;
      const nxt = opts[ri(opts.length)];
      cells.push(nxt); used.add(ck(nxt[0], nxt[1]));
    }
    if (cells.length >= minLen) return cells;
  }
  return null;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];

function splitOnce(state, W, H) {
  const idxs = state.map((s, i) => i).filter((i) => state[i].cells.length >= 4);
  if (!idxs.length) return null;
  for (const mi of shuffle(idxs)) {
    const M = state[mi].cells;
    const m = M.length;
    const cand = [];
    for (let k = 2; k <= m - 2; k++) {
      const a = m - k;
      const maxG = Math.min(a - 2, 4);
      const d0 = sub(M[k - 1], M[k]);
      for (let g = 0; g <= maxG; g++) {
        let straight = true;
        for (let j = 0; j < g; j++) { if (!eq(sub(M[k + j], M[k + j + 1]), d0)) { straight = false; break; } }
        if (!straight) break;
        if (!eq(sub(M[k + g], M[k + g + 1]), d0)) continue;
        cand.push([k, g]);
      }
    }
    for (const [k, g] of shuffle(cand)) {
      const P = { cells: M.slice(0, k).map((c) => c.slice()) };
      const Evis = M.slice(k + g).map((c) => c.slice());
      const forbid = new Set();
      state.forEach((s, si) => { if (si !== mi) s.cells.forEach(([x, y]) => forbid.add(ck(x, y))); });
      P.cells.forEach(([x, y]) => forbid.add(ck(x, y)));
      Evis.forEach(([x, y]) => forbid.add(ck(x, y)));
      for (let j = 0; j < g; j++) { const c = M[k + j]; forbid.add(ck(c[0], c[1])); }
      const tail = [];
      let ok = true;
      let cur = Evis[Evis.length - 1];
      const local = new Set();
      for (let j = 0; j < g; j++) {
        const opts = dirs.map(([dx, dy]) => [cur[0] + dx, cur[1] + dy])
          .filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !forbid.has(ck(x, y)) && !local.has(ck(x, y)));
        if (!opts.length) { ok = false; break; }
        const nxt = opts[ri(opts.length)];
        tail.push(nxt); local.add(ck(nxt[0], nxt[1])); cur = nxt;
      }
      if (!ok) continue;
      const E = { cells: Evis.concat(tail) };
      const out = state.map((s, si) => (si === mi ? P : s));
      out.push(E);
      return out;
    }
  }
  return null;
}

function generateBase(w, h, nSnakes, minTotal) {
  for (let t = 0; t < 300; t++) {
    const mp = megaPath(w, h, minTotal);
    if (!mp) continue;
    let state = [{ cells: mp }];
    let ok = true;
    for (let s = 0; s < nSnakes - 1; s++) {
      const nx = splitOnce(state, w, h);
      if (!nx) { ok = false; break; }
      state = nx;
    }
    if (!ok) continue;
    if (state.some((s) => s.cells.length < 2)) continue;
    const total = state.reduce((a, s) => a + s.cells.length, 0);
    const snakes = shuffle(state).map((s) => ({ cells: s.cells }));
    return { w, h, target: total, snakes, total };
  }
  return null;
}

// ---------- посев валунов ----------
function freeCells(lv) {
  const occ = new Set();
  lv.snakes.forEach((s) => s.cells.forEach(([x, y]) => occ.add(ck(x, y))));
  const out = [];
  for (let y = 0; y < lv.h; y++) for (let x = 0; x < lv.w; x++) if (!occ.has(ck(x, y))) out.push([x, y]);
  return out;
}

// ---------- главный цикл ----------
const seed0 = Number(process.argv[2] || 1);
const seed1 = Number(process.argv[3] || seed0);
const want = [
  [6, 6, 6, 22],
  [6, 6, 7, 24],
  [7, 7, 6, 26],
  [7, 7, 7, 30],
];

function fmtLv(lv, extra) {
  const parts = [];
  parts.push(`  { name: "GEN", lesson: "-", w: ${lv.w}, h: ${lv.h}, target: ${lv.target},`);
  if (lv.rocks && lv.rocks.length) parts.push(`    rocks: ${JSON.stringify(lv.rocks)},`);
  parts.push(`    snakes: [`);
  lv.snakes.forEach((s) => {
    parts.push(`      { cells: ${JSON.stringify(s.cells)}${s.spiky ? ', spiky: true' : ''} },`);
  });
  parts.push(`    ], }, // ${extra}`);
  return parts.join('\n');
}

function metricLine(m) {
  return `sols=${m.sols} minMoves=${m.minMoves} dead=${m.nDead} states=${m.nStates} pM=${m.pMoves.toFixed(3)} pT=${m.pTaps.toFixed(3)} ply1=${m.ply1}`;
}

// скоринг: чем меньше sols, ниже pMoves, ниже доля верных первых ходов — тем лучше
function score(m) {
  let sc = 0;
  sc += (7 - m.sols); // 1 решение = 6 очков
  sc += (1 - m.pMoves) * 8;
  sc += (1 - m.ply1Winning / Math.max(1, m.ply1Total)) * 6;
  sc += Math.min(m.nDead, 6) * 0.5;
  sc += (1 - m.pTaps) * 3;
  return sc;
}

const found = [];
for (let sd = seed0; sd <= seed1; sd++) {
  for (const [w, h, n, minT] of want) {
    seed = sd * 7919 + w * 131 + n * 17;
    const base = generateBase(w, h, n, minT);
    if (!base) continue;
    const m0 = evaluate(base);
    if (!m0.sols) continue;
    // варианты: без валунов / с валунами (несколько посевов)
    const variants = [{ lv: base, tag: 'plain' }];
    const free = freeCells(base);
    for (let trial = 0; trial < 8; trial++) {
      const kRocks = 1 + ri(Math.min(4, Math.max(1, free.length)));
      const rocks = shuffle(free).slice(0, kRocks);
      variants.push({ lv: { ...base, rocks }, tag: `rocks${kRocks}` });
    }
    let bestVar = null;
    for (const { lv, tag } of variants) {
      const m = evaluate(lv);
      if (!m.sols) continue;
      if (m.sols > 4) continue;
      if (m.minMoves < 5) continue;
      if (m.nDead < 1) continue;
      if (m.pMoves > 0.25) continue;
      if (m.pTaps < 0.02) continue; // совсем минное поле — нечитаемо
      const sc = score(m);
      if (!bestVar || sc > bestVar.sc) bestVar = { lv, m, tag, sc };
    }
    if (!bestVar) continue;
    // колючка: кандидат = выживший в каком-то решении
    let bestSpiky = null;
    for (const sid of bestVar.m.survivors) {
      const lv2 = { ...bestVar.lv, snakes: bestVar.lv.snakes.map((s, i) => (i === sid ? { ...s, spiky: true } : { cells: s.cells })) };
      const m2 = evaluate(lv2);
      if (m2.sols > 0 && m2.sols <= 4 && m2.pMoves <= 0.25 && m2.pTaps >= 0.02) {
        const sc2 = score(m2);
        if (!bestSpiky || sc2 > bestSpiky.sc) bestSpiky = { lv: lv2, m: m2, sid, sc: sc2 };
      }
    }
    found.push({ sd, w, h, n, ...bestVar, spiky: bestSpiky });
  }
}
found.sort((a, b) => b.sc - a.sc);
for (const f of found.slice(0, 14)) {
  console.log(`\n### seed=${f.sd} ${f.w}x${f.h} n=${f.n} ${f.tag} sc=${f.sc.toFixed(1)} | ${metricLine(f.m)}`);
  console.log(fmtLv(f.lv, `seed=${f.sd} ${f.tag} ${metricLine(f.m)}`));
  console.log(`    реш: ${f.m.bestSeq.join(', ')} | выжившие: ${[...f.m.survivors].join(',')}`);
  if (f.spiky) {
    console.log(`  >> SPIKY s${f.spiky.sid} sc=${f.spiky.sc.toFixed(1)} | ${metricLine(f.spiky.m)}`);
  }
}
console.log(`\nвсего прошло фильтр: ${found.length}`);
