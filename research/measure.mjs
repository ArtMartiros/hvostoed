// Замер паков «Хвостоеда» кодом самой игры (вырезка по якорю, как ending.mjs).
// Для каждого уровня: полный граф состояний (каждый ход убирает одну змею — DAG),
// безопасность ходов, обязательный вылет, точные вероятности звёзд для трёх
// «тупых» политик (случайный легальный ход / сначала случайный обед / жадный).
import fs from 'fs';
import { marksOf } from '../generator.mjs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});
const mass = (st) => st.reduce((a, s) => a + s.cells.length, 0);

function measure(lv) {
  const board = boardOf(lv);
  const start = lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
  const marks = marksOf(lv.ceiling, M.maxLen(start));
  const ceil = lv.ceiling;
  // граф
  const nodes = new Map();
  const node = (st) => {
    const k = M.stateKey(st);
    let n = nodes.get(k);
    if (n) return n;
    const moves = M.legalMoves(st, lv.w, lv.h, board).map((m) => ({ ...m, eat: m.next.length === st.length - 1 && M.maxLen(m.next) >= 0 && mass(m.next) === mass(st) }));
    n = { st, k, ml: M.maxLen(st), mass: mass(st), moves, kids: null };
    nodes.set(k, n);
    n.kids = moves.map((m) => node(m.next));
    // best: максимум длины на любом достижимом состоянии; bestEat — только обедами
    n.best = Math.max(n.ml, ...n.kids.map((c) => c.best));
    n.bestEat = Math.max(n.ml, ...n.kids.filter((_, i) => moves[i].eat).map((c) => c.bestEat));
    n.anyEat = moves.some((m) => m.eat);
    return n;
  };
  const root = node(start);
  const tappable = start.filter((s) => !s.sleep).length;
  const legal0 = root.moves.length, eats0 = root.moves.filter((m) => m.eat).length;
  const safe0 = root.kids.filter((c) => c.best >= ceil).length;
  const safeLow0 = root.kids.filter((c) => c.best >= marks[0]).length;
  const eatSafe0 = root.kids.filter((c, i) => root.moves[i].eat && c.best >= ceil).length;
  const launches0 = legal0 - eats0;
  const launchSafe0 = root.kids.filter((c, i) => !root.moves[i].eat && c.best >= ceil).length;
  // безопасность по живым состояниям (как levelstats.safety): тапы из состояний, где
  // потолок ещё достижим и ещё не взят
  let taps = 0, safe = 0, liveStates = 0, trapStates = 0, worst = 1, eTaps = 0, eSafe = 0, eTrapStates = 0, lTaps = 0, lSafe = 0;
  for (const n of nodes.values()) {
    if (n.best < ceil || n.ml >= ceil || !n.moves.length) continue;
    liveStates++;
    const s = n.kids.filter((c) => c.best >= ceil).length;
    taps += n.moves.length; safe += s;
    if (s < n.moves.length) trapStates++;
    let es = 0, en = 0;
    n.moves.forEach((m, i) => { if (m.eat) { en++; if (n.kids[i].best >= ceil) es++; } else { lTaps++; if (n.kids[i].best >= ceil) lSafe++; } });
    eTaps += en; eSafe += es; if (es < en) eTrapStates++;
    worst = Math.min(worst, s / n.moves.length);
  }
  const deadStates = [...nodes.values()].filter((n) => n.best < ceil).length;
  // запаздывание обратной связи: после гибельного обеда сколько ещё обедов можно сделать
  // (самая длинная цепочка обедов из мёртвого состояния)
  const dm = new Map();
  const eatDepth = (n) => { if (dm.has(n.k)) return dm.get(n.k); let d = 0; n.moves.forEach((m, i) => { if (m.eat) d = Math.max(d, 1 + eatDepth(n.kids[i])); }); dm.set(n.k, d); return d; };
  const lags = [];
  for (const n of nodes.values()) {
    if (n.best < ceil || n.ml >= ceil) continue;
    n.moves.forEach((m, i) => { if (m.eat && n.kids[i].best < ceil) lags.push(eatDepth(n.kids[i])); });
  }
  // точные распределения звёзд для политик
  const starsOf = (ml) => marks.filter((m) => ml >= m).length;
  const policies = {
    random: (n) => n.moves.map((_, i) => i),
    eatFirst: (n) => { const e = n.moves.map((m, i) => (m.eat ? i : -1)).filter((i) => i >= 0); return e.length ? e : n.moves.map((_, i) => i); },
    greedy: (n) => { const v = n.kids.map((c) => c.ml); const mx = Math.max(...v); return v.map((x, i) => (x === mx ? i : -1)).filter((i) => i >= 0); },
  };
  const out = {};
  for (const [pn, pick] of Object.entries(policies)) {
    const memo = new Map();
    const dist = (n) => {
      if (memo.has(n.k)) return memo.get(n.k);
      let d;
      if (n.mass < marks[0]) d = [1, 0, 0, 0];                              // смерть по массе
      else if (!n.anyEat && !(n.best > n.ml)) { d = [0, 0, 0, 0]; d[starsOf(n.ml)] = 1; } // конец партии
      else if (!n.moves.length) { d = [0, 0, 0, 0]; d[starsOf(n.ml)] = 1; }
      else {
        const idx = pick(n); d = [0, 0, 0, 0];
        for (const i of idx) { const c = dist(n.kids[i]); for (let q = 0; q < 4; q++) d[q] += c[q] / idx.length; }
      }
      memo.set(n.k, d); return d;
    };
    const d = dist(root);
    out[pn] = { win: 1 - d[0], top: d[3], d };
  }
  return {
    name: lv.name, w: lv.w, h: lv.h, snakes: start.length, cells: mass(start), ceil, marks,
    states: nodes.size, tappable, legal0, eats0, crash0: tappable - legal0, safe0, safeLow0,
    safeFrac0: legal0 ? safe0 / legal0 : 1,
    eatSafety: taps ? safe / taps : 1, eatOnlySafety: eTaps ? eSafe / eTaps : 1, launchSafety: lTaps ? lSafe / lTaps : null, lTaps, eTaps, eTrapStates,
    eats0, launches0, eatSafe0, launchSafe0, worst, liveStates, trapStates, deadStates,
    lags, launchRequired: root.bestEat < ceil, bestOk: root.best === ceil,
    sleepers: start.filter((s) => s.sleep).length, spiky: start.filter((s) => s.spiky).length,
    rocks: (lv.rocks || []).length, bridges: (lv.bridges || []).length, turns: (lv.turns || []).length, portals: (lv.portals || []).length,
    ...Object.fromEntries(Object.entries(out).flatMap(([k, v]) => [[k + 'Win', v.win], [k + 'Top', v.top]])),
  };
}

const all = {};
for (const [pack, label] of [['RAW_LEVELS_INTRO', 'Азбука'], ['RAW_LEVELS_VOID', 'Пустота'], ['RAW_LEVELS', 'Кампания']]) {
  const levels = grab(pack);
  all[label] = [];
  levels.forEach((lv, i) => {
    const t0 = Date.now();
    const r = measure(lv);
    r.ms = Date.now() - t0; r.n = i + 1;
    all[label].push(r);
  });
}
fs.writeFileSync(new URL('./out/measure.json', import.meta.url), JSON.stringify(all, null, 1));
const f2 = (x) => x.toFixed(2);
for (const [label, rows] of Object.entries(all)) {
  console.log(`\n### ${label} (${rows.length})`);
  console.log('  # name               WxH   sn cel ceil marks      states tap leg crash safe0  eSafe worst launch? | rndWin rndTop | eatFWin eatFTop | grdWin grdTop');
  for (const r of rows) console.log(`     ${r.name.slice(0,18).padEnd(18)} eats0 ${r.eatSafe0}/${r.eats0} launches0 ${r.launchSafe0}/${r.launches0} eatOnlySafety ${f2(r.eatOnlySafety)} launchSafety ${r.launchSafety==null?'-':f2(r.launchSafety)} liveStates ${r.liveStates} trapStates(eat) ${r.eTrapStates} dead ${r.deadStates}`);
  for (const r of rows) console.log(`  ${String(r.n).padStart(2)} ${r.name.padEnd(18).slice(0, 18)} ${(r.w + 'x' + r.h).padEnd(5)} ${String(r.snakes).padStart(2)} ${String(r.cells).padStart(3)} ${String(r.ceil).padStart(4)} ${r.marks.join('/').padEnd(10)} ${String(r.states).padStart(6)} ${String(r.tappable).padStart(3)} ${String(r.legal0).padStart(3)} ${String(r.crash0).padStart(5)} ${r.safe0}/${r.legal0}`.padEnd(95) + ` ${f2(r.eatSafety)} ${f2(r.worst)} ${r.launchRequired ? 'YES' : ' - '} | ${f2(r.randomWin)} ${f2(r.randomTop)} | ${f2(r.eatFirstWin)} ${f2(r.eatFirstTop)} | ${f2(r.greedyWin)} ${f2(r.greedyTop)}${r.bestOk ? '' : ' !best=' + r.best}`);
}
