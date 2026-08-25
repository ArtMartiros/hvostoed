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

/* Заодно меряем ЗВЁЗДЫ. Отметка — не краска: верхнюю нельзя отдавать тупой игре,
   нижнюю нельзя выдавать даром, иначе три звезды превращаются в одну победу с
   украшениями — ровно та болезнь, от которой ушла прежняя схема. Считаем на тех же
   случайных партиях, что и форму, — лишнего перебора это не стоит. */
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

/* Мемоизированный «достижима ли ещё цель». Граф ациклический: число змей
   строго убывает с каждым ходом, значит рекурсия конечна без счётчика глубины. */
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

/* Профиль сложности ВДОЛЬ ЗАДУМАННОГО решения: на каждом ходу — сколько тапов
   доступно, сколько из них убивают и какой зазор у верного. Построение задаёт
   только зазоры, поэтому кривую риска надо мерить по факту, а не верить плану. */
const tiltOf = (a) => {
  const s = a.reduce((x, y) => x + y, 0);
  if (!s || a.length < 2) return 0.5;
  return a.reduce((x, y, i) => x + i * y, 0) / ((a.length - 1) * s);
};

/* Работает ли пометка. Колючая отличается от обычной змеи ровно тогда, когда
   чей-то луч достаёт до её ХВОСТА, — иначе это тело, в которое врезаешься, как
   в любое другое, и шипы декоративны. Спящая отличается тогда, когда, будь она
   бодрой, ей было бы куда пойти, — иначе «спит» неотличимо от «застряла».
   Ставится это построением, но между постановкой и итоговой доской добавляются
   другие обманки, и они могут заслонить ловушку. Поэтому меряем по факту. */
export function marks(lv) {
  const br = G.boardOf(lv);
  const marked = lv.snakes.filter((s) => !s.apple && (s.spiky || s.sleep));
  if (!marked.length) return { markUse: 1, spikyUse: 1, sleepUse: 1 };
  const works = new Set();
  let state = G.stateOf(lv);
  // спящую из решения съедают по плану — до её хвоста дотягиваются по определению
  for (const m of lv.moves || []) works.add(m.prey);
  for (let m = 0; m <= (lv.moves || []).length; m++) {
    for (let i = 0; i < state.length; i++) {
      if (state[i].sleep) continue;
      const r = G.raycast(state, i, lv.w, lv.h, br);
      if (r.kind === 'spikyTail' || r.kind === 'tail') works.add(state[r.prey].id);
    }
    if (m === (lv.moves || []).length) break;
    const i = state.findIndex((s) => s.id === lv.moves[m].eater);
    if (i < 0) break;
    const r = G.raycast(state, i, lv.w, lv.h, br);
    if (r.kind !== 'tail') break;
    state = G.applyEat(state, i, r);
  }
  const share = (arr) => (arr.length ? arr.filter((s) => works.has(s.id)).length / arr.length : 1);
  return { markUse: share(marked),
           spikyUse: share(lv.snakes.filter((s) => s.spiky)),
           sleepUse: share(lv.snakes.filter((s) => s.sleep && !s.apple)) };
}

/* Работает ли РЕЛЬЕФ. Мост, поворот и портал — клетки пола: если луч решения по ним
   ни разу не идёт, они украшение, а не механика. Портал вдобавок коварен — змея
   может просто лежать сквозь него от начала до конца, и ни один ход его не тронет. */
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
