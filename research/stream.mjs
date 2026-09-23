// Критик: какая доля уровней генератора без механик проходит фильтр «едок берёт 1★ с P=1»
// (фильтр из required_changes аналитика) и сколько стоит этот фильтр. Логика игры — вырезка по якорю.
import fs from 'fs';
import { marksOf } from '../generator.mjs';
import * as PR from '../presets.mjs';
import { BANDS } from '../genintro.mjs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const boardOf = (lv) => ({ rocks: new Set(), bridges: new Set(), turns: new Map(), gates: new Map() });
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
const mass = (st) => st.reduce((a, s) => a + s.cells.length, 0);
let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function play(lv, ceiling, policy) {
  const board = boardOf(lv), marks = marksOf(ceiling, Math.max(...lv.snakes.map((s) => s.cells.length)));
  let sn = mk(lv), taps = 0;
  for (let t = 0; t < 500; t++) {
    const rays = sn.filter((s) => !s.sleep).map((s) => ({ s, r: M.raycast(sn, s.id, lv.w, lv.h, board) }));
    const E = rays.filter((x) => x.r.kind === 'tail'), L = rays.filter((x) => x.r.kind === 'edge');
    let ch = policy === 'random' ? ((E.length || L.length) ? pick(E.concat(L)) : null) : (E.length ? pick(E) : L.length ? pick(L) : null);
    if (!ch) break;
    taps++;
    sn = ch.r.kind === 'tail' ? M.applyEat(sn, ch.s.id, ch.r) : sn.filter((q) => q.id !== ch.s.id);
    const ml = M.maxLen(sn);
    if (mass(sn) < marks[0]) return { stars: 0, taps };
    const anyEat = sn.some((s) => !s.sleep && M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'tail');
    if (!anyEat && !M.canGrow({ ...lv, ceiling, marks }, sn, board, ml)) return { stars: marks.filter((m) => ml >= m).length, taps };
  }
  return { stars: marks.filter((m) => M.maxLen(sn) >= m).length, taps };
}
const BASE = { peak: 1, breather: 3, straightBias: 0.75, decoys: 0, decoyMax: 0, spiky: 0, sleepy: 0, apples: 0, bridges: 0, turns: 0, portals: 0, mechs: 0, fake: 0 };
const N = 200, SEEDS = +(process.env.SEEDS || 40);
for (const b of BANDS) {
  const cfg = { ...BASE, ...b, min: { starLow: 1 }, max: {} };
  let tGen = 0, tFil = 0, acc = 0, pass = 0; const tapsE = [], snakesN = [], r3 = [];
  for (let s = 1; s <= SEEDS; s++) {
    let t0 = Date.now(); const r = PR.craftOnce(cfg, s); tGen += Date.now() - t0;
    if (!r.level) continue; acc++;
    const lv = r.level; snakesN.push(lv.snakes.length);
    t0 = Date.now();
    let w = 0, tp = 0; for (let i = 0; i < N; i++) { const q = play(lv, lv.len, 'eater'); if (q.stars > 0) w++; tp += q.taps; }
    let th = 0; for (let i = 0; i < N; i++) if (play(lv, lv.len, 'random').stars === 3) th++;
    tFil += Date.now() - t0;
    if (w === N) pass++;
    tapsE.push(tp / N); r3.push(th / N);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  console.log(`${b.tag} ${b.w}x${b.h} ходов=${b.moves}: принято ${acc}/${SEEDS}; едок P=1 у ${pass}/${acc}; ` +
    `итог в поток ${pass}/${SEEDS} попыток; ген ${(tGen/SEEDS).toFixed(0)} мс/попытка, фильтр(2x${N} партий) ${(tFil/Math.max(1,acc)).toFixed(0)} мс/уровень; ` +
    `мс на уровень потока ≈ ${pass ? ((tGen + tFil) / pass).toFixed(0) : '-'}; змей в среднем ${mean(snakesN).toFixed(1)}; тапов у едока ${mean(tapsE).toFixed(1)}; P(3★) случайной ${(100*mean(r3)).toFixed(0)}%`);
}
