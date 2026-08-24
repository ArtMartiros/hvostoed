/* Метрики уровня. Жёсткие условия обратное построение гарантирует само,
   здесь меряется всё остальное: не срезал ли солвер путь, сколько решений,
   насколько поле прощает ошибку, чем берёт тупая игра. */
import * as G from './generator.mjs';

const stKey = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');

export function solveGoal(lv, target, cap) {
  const seen = new Map();
  let sols = 0, minMoves = Infinity;
  const dfs = (st, d) => {
    if (G.maxLen(st) >= target) { sols++; if (d < minMoves) minMoves = d; return; }
    if (d >= (cap || 14) || sols > 400) return;
    const k = stKey(st) + '#' + d;
    if (seen.has(k)) return;
    seen.set(k, 1);
    for (const m of G.movesOf(st, lv.w, lv.h)) dfs(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i), d + 1);
  };
  dfs(lv.snakes.map((s) => ({ cells: s.cells })), 0);
  return { sols, minMoves: sols ? minMoves : null };
}

// доля тапов из живых состояний, после которых цель ещё достижима
export function safety(lv, target) {
  const memo = new Map();
  const win = (st) => {
    if (G.maxLen(st) >= target) return true;
    const k = stKey(st);
    if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const m of G.movesOf(st, lv.w, lv.h)) {
      if (win(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i))) { r = true; break; }
    }
    memo.set(k, r); return r;
  };
  const start = lv.snakes.map((s) => ({ cells: s.cells }));
  if (!win(start)) return null;
  const seen = new Set([stKey(start)]), stack = [start];
  let taps = 0, safe = 0, worst = 1;
  while (stack.length && seen.size < 120000) {
    const st = stack.pop();
    if (G.maxLen(st) >= target) continue;
    const mv = G.movesOf(st, lv.w, lv.h);
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

export function shape(lv, tries, seed) {
  const rnd = G.makeRng(seed || 7);
  let far = 0, adj = 0, gaps = 0, steps = 0; const bests = [];
  for (let t = 0; t < tries; t++) {
    let st = lv.snakes.map((s) => ({ cells: s.cells }));
    let b = G.maxLen(st);
    for (let s = 0; s < 80; s++) {
      const mv = G.movesOf(st, lv.w, lv.h).filter((m) => m.eat);
      if (!mv.length) break;
      far += mv.filter((m) => m.gap > 0).length; adj += mv.filter((m) => m.gap === 0).length;
      gaps += mv.reduce((a, m) => a + m.gap, 0); steps++;
      const m = mv[Math.floor(rnd() * mv.length)];
      st = G.applyEat(st, m.i, m.ray); b = Math.max(b, G.maxLen(st));
    }
    bests.push(b);
  }
  bests.sort((a, b) => a - b);
  const starts = G.movesOf(lv.snakes.map((s) => ({ cells: s.cells })), lv.w, lv.h).filter((m) => m.eat);
  return { starts: starts.length, branch: (far + adj) / Math.max(1, steps),
    farShare: far / Math.max(1, far + adj), avgGap: gaps / Math.max(1, far + adj),
    randMed: bests[Math.floor(bests.length / 2)], randTop: bests[bests.length - 1] };
}

export function beamBest(lv, width) {
  let layer = [lv.snakes.map((s) => ({ cells: s.cells }))];
  let best = G.maxLen(layer[0]), moves = 0;
  for (let d = 0; d < 60 && layer.length; d++) {
    const next = [], seen = new Set();
    for (const st of layer) for (const m of G.movesOf(st, lv.w, lv.h)) {
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
