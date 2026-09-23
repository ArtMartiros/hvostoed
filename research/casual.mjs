// Замер ветки «Хвостоед-казуал» кодом игры (вырезка по якорю, как ending.mjs).
// 1) Финал: во что сворачивается поле на потолке; может ли финальная змея
//    по правилам игры уползти за край (raycast === 'edge') — вариант «поле пустеет».
// 2) Наивные стратегии на всех уровнях без механик (1★ и 3★).
// 3) Генератор без механик (полосы «Азбуки»): скорость и выход, безопасность 1★.
import fs from 'fs';
import { marksOf } from '../generator.mjs';
import * as PR from '../presets.mjs';
import { BANDS } from '../genintro.mjs';

const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const P = { intro: grab('RAW_LEVELS_INTRO'), void: grab('RAW_LEVELS_VOID'), classic: grab('RAW_LEVELS') };
const MVP = [["void",0],["intro",1],["intro",2],["intro",4],["void",2],["intro",5],["void",3],["intro",8],["void",4],["classic",6],["classic",7],["classic",12],["void",9],["classic",5]];
const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
const plain = (lv) => !((lv.rocks || []).length || (lv.bridges || []).length || (lv.turns || []).length || (lv.portals || []).length || lv.snakes.some((s) => s.spiky || s.sleep || s.apple));
const mass = (st) => st.reduce((a, s) => a + s.cells.length, 0);

// --- 1) финал на потолке: полный граф состояний
function finale(lv, ceiling) {
  const board = boardOf(lv);
  const seen = new Set(), stack = [mk(lv)];
  let ceilStates = 0, oneSnake = 0, exitOk = 0, exitOkOne = 0;
  while (stack.length) {
    const st = stack.pop();
    const k = M.stateKey(st);
    if (seen.has(k)) continue; seen.add(k);
    if (M.maxLen(st) >= ceiling) {
      ceilStates++;
      const champ = st.reduce((a, s) => (s.cells.length > a.cells.length ? s : a));
      const ray = M.raycast(st, champ.id, lv.w, lv.h, board);
      if (st.length === 1) oneSnake++;
      if (ray.kind === 'edge') { exitOk++; if (st.length === 1) exitOkOne++; }
      continue;                     // дальше потолка расти некуда — финал
    }
    for (const m of M.legalMoves(st, lv.w, lv.h, board)) stack.push(m.next);
  }
  return { states: seen.size, ceilStates, oneSnake, exitOk, exitOkOne };
}

// --- 2) наивные стратегии (как в Game: смерть по массе, конец — нет обеда и canGrow=false)
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function play(lv, ceiling, policy) {
  const board = boardOf(lv), marks = marksOf(ceiling, Math.max(...lv.snakes.map((s) => s.cells.length)));
  let sn = mk(lv);
  for (let t = 0; t < 500; t++) {
    const rays = sn.filter((s) => !s.sleep).map((s) => ({ s, r: M.raycast(sn, s.id, lv.w, lv.h, board) }));
    const E = rays.filter((x) => x.r.kind === 'tail'), L = rays.filter((x) => x.r.kind === 'edge');
    let ch;
    if (policy === 'random') ch = (E.length || L.length) ? pick(E.concat(L)) : null; // авария бесплатна — не ход
    else if (policy === 'arrows') ch = L.length ? pick(L) : E.length ? pick(E) : null;
    else ch = E.length ? pick(E) : L.length ? pick(L) : null;
    if (!ch) break;
    sn = ch.r.kind === 'tail' ? M.applyEat(sn, ch.s.id, ch.r) : sn.filter((q) => q.id !== ch.s.id);
    const ml = M.maxLen(sn);
    if (mass(sn) < marks[0]) return { stars: 0, n: sn.length };
    const anyEat = sn.some((s) => !s.sleep && M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'tail');
    if (!anyEat && !M.canGrow({ ...lv, ceiling, marks }, sn, board, ml)) {
      const champ = sn.length ? sn.reduce((a, s) => (s.cells.length > a.cells.length ? s : a)) : null;
      return { stars: marks.filter((m) => ml >= m).length, n: sn.length,
        exit: champ ? M.raycast(sn, champ.id, lv.w, lv.h, board).kind === 'edge' : false };
    }
  }
  const ml = M.maxLen(sn);
  return { stars: marks.filter((m) => ml >= m).length, n: sn.length };
}
function policies(lv, ceiling, N = 400) {
  const out = {};
  for (const pol of ['random', 'arrows', 'eater']) {
    let w = 0, three = 0, one = 0, ex = 0;
    for (let i = 0; i < N; i++) { const r = play(lv, ceiling, pol); if (r.stars > 0) w++; if (r.stars === 3) three++; if (r.stars > 0 && r.n === 1) one++; if (r.stars > 0 && r.exit) ex++; }
    out[pol] = { win: w / N, three: three / N, oneOfWins: w ? one / w : 0, exitOfWins: w ? ex / w : 0 };
  }
  return out;
}

const rows = [];
for (const [pid, pack] of Object.entries(P)) pack.forEach((lv, i) => {
  if (!plain(lv) && MVP.findIndex(([p, j]) => p === pid && j === i) < 0) return;
  const f = finale(lv, lv.ceiling);
  const pol = policies(lv, lv.ceiling);
  rows.push({ pid, i, name: lv.name, plain: plain(lv), w: lv.w, h: lv.h, n: lv.snakes.length, massEq: mass(mk(lv)) === lv.ceiling,
    mvp: MVP.findIndex(([p, j]) => p === pid && j === i), ...f, pol });
});
const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : NaN; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (x) => (100 * x).toFixed(0) + '%';
const report = (label, R) => {
  console.log(`\n== ${label}: уровней ${R.length}`);
  console.log(' потолок = вся масса поля:', R.filter((r) => r.massEq).length + '/' + R.length);
  console.log(' уровней, где на потолке ВСЕГДА одна змея:', R.filter((r) => r.oneSnake === r.ceilStates).length, '; хотя бы в одном финале одна змея:', R.filter((r) => r.oneSnake > 0).length);
  console.log(' финальная змея может уползти по правилам (edge) хотя бы в одном финале-потолке:', R.filter((r) => r.exitOk > 0).length + '/' + R.length,
    '; во всех финалах:', R.filter((r) => r.exitOk === r.ceilStates).length, '; доля финальных состояний с выходом (среднее):', pct(mean(R.map((r) => r.exitOk / r.ceilStates))));
  for (const pol of ['random', 'arrows', 'eater']) {
    const w = R.map((r) => r.pol[pol].win), t = R.map((r) => r.pol[pol].three);
    console.log(` ${pol.padEnd(6)}: P(≥1★) среднее ${pct(mean(w))}, медиана ${pct(med(w))}, уровней с P=1: ${w.filter((x) => x === 1).length}, с P=0: ${w.filter((x) => x === 0).length} | P(3★) среднее ${pct(mean(t))} | среди побед одна змея: ${pct(mean(R.map((r) => r.pol[pol].oneOfWins)))}, чемпион может уползти: ${pct(mean(R.map((r) => r.pol[pol].exitOfWins)))}`);
  }
};
report('Азбука (без механик)', rows.filter((r) => r.pid === 'intro'));
report('Пустота (без механик)', rows.filter((r) => r.pid === 'void'));
report('Кампания, уровни без механик', rows.filter((r) => r.pid === 'classic' && r.plain));
report('Все плоские уровни без механик', rows.filter((r) => r.plain));
report('Поток MVP (14)', rows.filter((r) => r.mvp >= 0));
fs.writeFileSync(new URL('./out/casual.json', import.meta.url), JSON.stringify(rows, null, 1));

// --- 3) генератор без механик: скорость, выход, 1★ у «едока» и случайной игры
const BASE = { peak: 1, breather: 3, straightBias: 0.75, decoys: 0, decoyMax: 0, spiky: 0, sleepy: 0, apples: 0,
  bridges: 0, turns: 0, portals: 0, mechs: 0, fake: 0 };
const SEEDS = +(process.env.SEEDS || 40);
console.log(`\n== Генератор без механик (craftOnce, полосы «Азбуки», ${SEEDS} сидов на полосу)`);
for (const b of BANDS) {
  const cfg = { ...BASE, ...b, min: { starLow: 1 }, max: {} };
  const t0 = Date.now(); const ok = [];
  for (let s = 1; s <= SEEDS; s++) { const r = PR.craftOnce(cfg, s); if (r.level) ok.push(r.level); }
  const ms = Date.now() - t0;
  const pw = [], pr = [], pa = [], pt = [], one = [], ex = [];
  for (const lv of ok) {
    const res = policies({ ...lv, snakes: lv.snakes }, lv.len, 200);
    pw.push(res.eater.win); pr.push(res.random.win); pa.push(res.arrows.win); pt.push(res.random.three);
    one.push(res.eater.oneOfWins); ex.push(res.eater.exitOfWins);
  }
  console.log(` ${b.tag} ${b.w}x${b.h}: принято ${ok.length}/${SEEDS}, ${(ms / SEEDS).toFixed(0)} мс/попытка, ${ok.length ? (ms / ok.length).toFixed(0) : '-'} мс/уровень | P(≥1★): едок ${pct(mean(pw))} (мин ${pct(Math.min(...pw))}), случ ${pct(mean(pr))}, «Arrows» ${pct(mean(pa))} | P(3★) случ ${pct(mean(pt))} | победа едока = одна змея ${pct(mean(one))}, чемпион может уползти ${pct(mean(ex))}`);
}
