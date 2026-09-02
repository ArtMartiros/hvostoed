/* Метрики уровня. Жёсткие условия обратное построение гарантирует само,
   здесь меряется всё остальное: не срезал ли солвер путь, сколько решений,
   насколько поле прощает ошибку, чем берёт тупая игра. */
import * as G from './generator.mjs';

const stKey = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');

export function solveGoal(lv, target, cap) {
  const br = G.boardOf(lv);
  const seen = new Map();
  let sols = 0, minMoves = Infinity;
  const dfs = (st, d) => {
    if (G.maxLen(st) >= target) { sols++; if (d < minMoves) minMoves = d; return; }
    if (d >= (cap || 14) || sols > 400) return;
    const k = stKey(st) + '#' + d;
    if (seen.has(k)) return;
    seen.set(k, 1);
    for (const m of G.movesOf(st, lv.w, lv.h, br)) dfs(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i), d + 1);
  };
  dfs(G.stateOf(lv), 0);
  return { sols, minMoves: sols ? minMoves : null };
}

// доля тапов из живых состояний, после которых цель ещё достижима
export function safety(lv, target) {
  const br = G.boardOf(lv);
  const memo = new Map();
  const win = (st) => {
    if (G.maxLen(st) >= target) return true;
    const k = stKey(st);
    if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const m of G.movesOf(st, lv.w, lv.h, br)) {
      if (win(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i))) { r = true; break; }
    }
    memo.set(k, r); return r;
  };
  const start = G.stateOf(lv);
  if (!win(start)) return null;
  const seen = new Set([stKey(start)]), stack = [start];
  let taps = 0, safe = 0, worst = 1;
  while (stack.length && seen.size < 120000) {
    const st = stack.pop();
    if (G.maxLen(st) >= target) continue;
    const mv = G.movesOf(st, lv.w, lv.h, br);
    if (!mv.length) continue;
    let s = 0;
    for (const m of mv) {
      const nx = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i);
      taps++;
      if (win(nx)) { safe++; s++; const k = stKey(nx); if (!seen.has(k)) { seen.add(k); stack.push(nx); } }
    }
    worst = Math.min(worst, s / mv.length);
  }
  return { ratio: taps ? safe / taps : 1, worst, live: seen.size };
}

// форма поля + звёзды на тех же случайных партиях (верхнюю отметку нельзя
// отдавать тупой игре, нижнюю — даром)
export function shape(lv, tries, seed) {
  const br = G.boardOf(lv);
  const rnd = G.makeRng(seed || 7);
  const st0 = G.stateOf(lv), starMarks = G.marksOf(lv.len, G.maxLen(st0));
  let far = 0, adj = 0, gaps = 0, steps = 0; const bests = [];
  for (let t = 0; t < tries; t++) {
    let st = G.stateOf(lv);
    let b = G.maxLen(st);
    for (let s = 0; s < 80; s++) {
      const mv = G.movesOf(st, lv.w, lv.h, br).filter((m) => m.eat);
      if (!mv.length) break;
      far += mv.filter((m) => m.gap > 0).length; adj += mv.filter((m) => m.gap === 0).length;
      gaps += mv.reduce((a, m) => a + m.gap, 0); steps++;
      const m = mv[Math.floor(rnd() * mv.length)];
      st = G.applyEat(st, m.i, m.ray); b = Math.max(b, G.maxLen(st));
    }
    bests.push(b);
  }
  bests.sort((a, b) => a - b);
  const starts = G.movesOf(G.stateOf(lv), lv.w, lv.h, br).filter((m) => m.eat);
  return { starts: starts.length, branch: (far + adj) / Math.max(1, steps),
    farShare: far / Math.max(1, far + adj), avgGap: gaps / Math.max(1, far + adj),
    randMed: bests[Math.floor(bests.length / 2)], randTop: bests[bests.length - 1],
    starMarks,
    starLow: starMarks[0] > G.maxLen(st0) ? 1 : 0,       // нижняя отметка выше стартовой длины
    starMiss: bests.filter((b) => b < starMarks[0]).length / Math.max(1, bests.length),
    starTop: bests.filter((b) => b >= starMarks[2]).length / Math.max(1, bests.length) };
}

export function beamBest(lv, width) {
  const br = G.boardOf(lv);
  let layer = [G.stateOf(lv)];
  let best = G.maxLen(layer[0]), moves = 0;
  for (let d = 0; d < 60 && layer.length; d++) {
    const next = [], seen = new Set();
    for (const st of layer) for (const m of G.movesOf(st, lv.w, lv.h, br)) {
      const nx = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i);
      const k = stKey(nx); if (seen.has(k)) continue; seen.add(k);
      if (G.maxLen(nx) > best) { best = G.maxLen(nx); moves = d + 1; }
      next.push(nx);
    }
    next.sort((a, b) => (G.maxLen(b) - G.maxLen(a)) || (G.totalMass(b) - G.totalMass(a)));
    layer = next.slice(0, width);
  }
  return { best, moves };
}

// мемоизированный «достижима ли цель»: змей строго меньше с ходом, граф конечен
export function winner(lv, target) {
  const br = G.boardOf(lv);
  const memo = new Map();
  const win = (st) => {
    if (G.maxLen(st) >= target) return true;
    const k = stKey(st);
    if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const m of G.movesOf(st, lv.w, lv.h, br)) {
      if (win(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i))) { r = true; break; }
    }
    memo.set(k, r); return r;
  };
  return win;
}

// профиль вдоль решения: тапы, доля убивающих, зазор верного — кривая риска
// меряется по факту, построение задаёт только зазоры
const tiltOf = (a) => {
  const s = a.reduce((x, y) => x + y, 0);
  if (!s || a.length < 2) return 0.5;
  return a.reduce((x, y, i) => x + i * y, 0) / ((a.length - 1) * s);
};

// доска на каждом шагу задуманного решения — одно место на всех
export function planBoards(lv) {
  const br = G.boardOf(lv);
  const out = [];
  let st = G.stateOf(lv);
  for (let m = 0; ; m++) {
    out.push(st);
    if (m >= (lv.moves || []).length) break;
    const i = st.findIndex((s) => s.id === lv.moves[m].eater);
    if (i < 0) break;
    const r = G.raycast(st, i, lv.w, lv.h, br);
    if (r.kind !== 'tail') break;
    st = G.applyEat(st, i, r);
  }
  return out;
}

// чьи хвосты достаёт хоть чей-то луч по ходу решения: этим меряются и пометки
// (marks), и съедобность обманок (decoyFood); пометка без луча — краска
export function tailsSeen(lv) {
  const br = G.boardOf(lv);
  const works = new Set();
  // съеденных по плану достают по определению — их хвост и есть цель хода
  for (const m of lv.moves || []) works.add(m.prey);
  for (const st of planBoards(lv)) {
    for (let i = 0; i < st.length; i++) {
      if (st[i].sleep) continue;
      const r = G.raycast(st, i, lv.w, lv.h, br);
      if (r.kind === 'spikyTail' || r.kind === 'tail') works.add(st[r.prey].id);
    }
  }
  return works;
}

export function marks(lv) {
  const marked = lv.snakes.filter((s) => !s.apple && (s.spiky || s.sleep));
  if (!marked.length) return { markUse: 1, spikyUse: 1, sleepUse: 1 };
  const works = tailsSeen(lv);
  const share = (arr) => (arr.length ? arr.filter((s) => works.has(s.id)).length / arr.length : 1);
  return { markUse: share(marked),
           spikyUse: share(lv.snakes.filter((s) => s.spiky)),
           sleepUse: share(lv.snakes.filter((s) => s.sleep && !s.apple)) };
}

// ложная ветка: сколько звеньев съедается подряд НАСТОЯЩЕЙ игрой, на всех шагах
// плана; входить должен кусок решения (обманка плану ничего не портит)
function runFake(lv, after) {
  const br = G.boardOf(lv);
  const links = new Set(lv.snakes.filter((s) => s.fake).map((s) => s.id));
  if (!links.size) return null;
  const plain = new Set(lv.snakes.filter((s) => !s.decoy).map((s) => s.id));
  let best = 0, out = null;
  for (const board of planBoards(lv)) {
    for (let i0 = 0; i0 < board.length; i0++) {
      if (!plain.has(board[i0].id)) continue;
      let st = board, j = i0, n = 0;
      for (;;) {
        if (st[j].sleep || st[j].cells.length < 2) break;
        const r = G.raycast(st, j, lv.w, lv.h, br);
        if (r.kind !== 'tail' || !links.has(st[r.prey].id)) break;
        const eater = st[j].id;
        st = G.applyEat(st, j, r); n++;
        j = st.findIndex((q) => q.id === eater);
      }
      if (n > best) { best = n; out = st; }
      if (n) after(st);
    }
  }
  return { best, out };
}

export function fakeDepth(lv) {
  const got = runFake(lv, () => {});
  return got ? got.best : 0;
}

// наказывает ли ветка: пройти целиком и спросить, жива ли цель; достаточно
// одного входа, кончающегося тупиком
export function fakeTrap(lv) {
  if (!lv.snakes.some((s) => s.fake)) return 1;
  const win = winner(lv, lv.len);
  let trap = 0;
  runFake(lv, (st) => { if (!trap && !win(st)) trap = 1; });
  return trap;
}

// работает ли рельеф: пол, по которому луч решения ни разу не идёт, — украшение
export function terrain(lv) {
  const br = G.boardOf(lv);
  const seen = new Set();
  let state = G.stateOf(lv);
  for (const mv of lv.moves || []) {
    const i = state.findIndex((s) => s.id === mv.eater);
    if (i < 0) break;
    const r = G.raycast(state, i, lv.w, lv.h, br);
    if (r.kind !== 'tail') break;
    for (const c of r.path) seen.add(c[0] + ',' + c[1]);
    state = G.applyEat(state, i, r);
  }
  const share = (arr, key) => (arr.length ? arr.filter((a) => seen.has(key(a))).length / arr.length : 1);
  const k2 = ([x, y]) => x + ',' + y;
  const bridgeUse = share(lv.bridges || [], k2);
  const turnUse = share(lv.turns || [], k2);
  const gateUse = share(lv.portals || [], k2);
  const all = (lv.bridges || []).length + (lv.turns || []).length + (lv.portals || []).length;
  const hit = (lv.bridges || []).filter((c) => seen.has(k2(c))).length
    + (lv.turns || []).filter((c) => seen.has(k2(c))).length
    + (lv.portals || []).filter((c) => seen.has(k2(c))).length;
  return { bridgeUse, turnUse, gateUse, terrainUse: all ? hit / all : 1 };
}

export function curve(lv, target) {
  const br = G.boardOf(lv);
  const win = target ? winner(lv, target) : null;
  let st = G.stateOf(lv);
  const rows = [];
  for (const mv of lv.moves) {
    const i = st.findIndex((s) => s.id === mv.eater);
    if (i < 0) return null;
    const ray = G.raycast(st, i, lv.w, lv.h, br);
    if (ray.kind !== 'tail') return null;
    const opts = G.movesOf(st, lv.w, lv.h, br);
    let dead = 0;
    if (win) for (const m of opts) {
      const nx = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, j) => j !== m.i);
      if (!win(nx)) dead++;
    }
    rows.push({ branch: opts.length, gap: ray.gap, dead: opts.length ? dead / opts.length : 0 });
    st = G.applyEat(st, i, ray);
  }
  const gaps = rows.map((r) => r.gap);
  let run = 0, runMax = 0;
  for (const g of gaps) { if (g > 0) { run++; runMax = Math.max(runMax, run); } else run = 0; }
  const want = lv.want || [];
  return {
    rows, gaps,
    voids: gaps.reduce((a, b) => a + b, 0),
    voidMiss: want.length ? Math.abs(gaps.reduce((a, b) => a + b, 0) - want.reduce((a, b) => a + b, 0)) : 0,
    runMax, restShare: gaps.filter((g) => g === 0).length / Math.max(1, gaps.length),
    tiltWant: want.length ? tiltOf(want) : 0.5,
    tiltGap: tiltOf(gaps),
    tiltRisk: win ? tiltOf(rows.map((r) => r.dead)) : null,
    tiltBranch: tiltOf(rows.map((r) => r.branch)),
  };
}
