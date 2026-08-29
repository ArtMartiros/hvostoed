/* Дизайн-стенд режима «Комнаты»: симулирует секции кодом generator.mjs.
   На нём собран и проверен полным перебором уровень «Четыре комнаты»
   (SECTION_LEVELS в hvostoed.jsx): в каждой комнате при любом порядке сборки
   финальная змея ЕДИНСТВЕННА — иначе выбор в первой комнате мог бы невидимо
   запереть третью. Замер: безопасность обедов по комнатам 1.00 · 0.67 · 0.56
   · 0.38, запертых состояний 0 · 1 · 2 · 2 — кривая внутри одного уровня.
   Секции = квадраты 6×6 на доске 12×12, порядок Q1(0,0) Q2(6,0) Q3(6,6) Q4(0,6). */
import * as G from './generator.mjs';

export const W = 12, H = 12;
export const RECTS = [[0,0],[6,0],[6,6],[0,6]].map(([x,y]) => ({ x, y, w: 6, h: 6 }));

export function closedRocks(open) { // клетки закрытых секций как валуны
  const rocks = [];
  for (let k = open; k < RECTS.length; k++) {
    const r = RECTS[k];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) rocks.push([x, y]);
  }
  return rocks;
}
export const boardAt = (open) => G.boardOf({ rocks: closedRocks(open) });

const sk = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');

/* Полный разбор секции: старт = чемпион (или ничего) + змеи секции.
   Возвращает: все финалы-одиночки (какими бывают чемпионы), делит состояния
   на живые (дойдут до одиночки) и запертые. Только обеды — вылетов в режиме нет. */
export function explore(open, snakes) {
  const board = boardAt(open);
  const finals = new Map(), seen = new Map(); // key -> {лок|жив}
  const stack = [snakes];
  const memo = new Map();
  const canFinish = (st) => {
    if (st.length === 1) return true;
    const k = sk(st); if (memo.has(k)) return memo.get(k);
    memo.set(k, false);
    let r = false;
    for (const m of G.movesOf(st, W, H, board)) if (m.eat && canFinish(G.applyEat(st, m.i, m.ray))) { r = true; break; }
    memo.set(k, r); return r;
  };
  let states = 0, locked = 0, eats = 0, safeEats = 0;
  const visited = new Set([sk(snakes)]);
  while (stack.length) {
    const st = stack.pop(); states++;
    if (st.length === 1) { finals.set(sk(st), st[0]); continue; }
    const mv = G.movesOf(st, W, H, board).filter((m) => m.eat);
    if (!mv.length) { locked++; continue; }
    for (const m of mv) {
      eats++;
      const nx = G.applyEat(st, m.i, m.ray);
      if (canFinish(nx)) safeEats++;
      const k = sk(nx);
      if (!visited.has(k)) { visited.add(k); stack.push(nx); }
    }
  }
  return { finals: [...finals.values()], states, locked, eats, eatSafety: eats ? safeEats / eats : 1,
           startOk: canFinish(snakes) };
}

export const snake = (...cells) => ({ cells: cells.map((c) => c.slice()), spiky: false, sleep: false, len: cells.length });
export const show = (s) => `голова ${s.cells[0]} взгляд ${[s.cells[0][0]-s.cells[1][0], s.cells[0][1]-s.cells[1][1]]} хвост ${s.cells[s.cells.length-1]} длина ${s.cells.length}`;
