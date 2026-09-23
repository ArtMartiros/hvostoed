// Замер ветки «ежедневный пазл»: можно ли по дате (сид = YYYYMMDD) детерминированно
// получить уровень пресетом генератора, сколько это стоит по времени, совпадает ли
// построенная цель с точным потолком (ceilingOf из solver.js, полный DFS), и как
// распределяется итоговая длина у «случайного» и «жадного» игрока (для карточки
// «моя длина / максимум»).
import fs from 'fs';
import * as PR from '../presets.mjs';
import { marksOf } from '../generator.mjs';

const solverSrc = fs.readFileSync(new URL('../solver.js', import.meta.url), 'utf8');
const SOLV = eval(solverSrc.slice(solverSrc.indexOf('const ck = (x, y)'), solverSrc.indexOf('function geometry'))
  + '\n({ ceilingOf, raycast, applyEat, maxLen })');

const presetName = process.argv[2] || 'ученик';
const days = +(process.argv[3] || 30);
const budget = +(process.argv[4] || 60);
const seedMode = process.argv[5] || 'date'; // date | spaced

function boardOf(lv) {
  const ck = (x, y) => x + ',' + y;
  return { rocks: new Set((lv.rocks || []).map(([x, y]) => ck(x, y))),
    bridges: new Set((lv.bridges || []).map(([x, y]) => ck(x, y))),
    turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck(x, y), a + b])),
    gates: new Map((lv.portals || []).map(([x, y, u, v]) => [ck(x, y), [u, v]])) };
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// игрок: policy 'random' — случайный легальный тап (обед или вылет, аварии не считаем: они бесплатны);
// 'eatfirst' — случайный обед, вылет только если обедов нет; 'eatonly' — только обеды
function play(lv, policy, r) {
  const W = lv.w, H = lv.h, board = boardOf(lv);
  let sn = lv.snakes.map((s) => ({ cells: s.cells, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, apple: !!s.apple }));
  for (let step = 0; step < 500; step++) {
    const eats = [], launches = [];
    for (let i = 0; i < sn.length; i++) {
      if (sn[i].sleep) continue;
      const ray = SOLV.raycast(sn, i, W, H, board);
      if (ray.kind === 'tail') eats.push([i, ray]); else if (ray.kind === 'edge') launches.push(i);
    }
    let pick = null;
    if (policy === 'random') {
      const all = eats.map((e) => ['e', e]).concat(launches.map((l) => ['l', l]));
      if (!all.length) break;
      pick = all[Math.floor(r() * all.length)];
    } else if (policy === 'eatfirst') {
      if (eats.length) pick = ['e', eats[Math.floor(r() * eats.length)]];
      else if (launches.length) pick = ['l', launches[Math.floor(r() * launches.length)]];
      else break;
    } else {
      if (!eats.length) break;
      pick = ['e', eats[Math.floor(r() * eats.length)]];
    }
    // «Забрать»: игрок может остановиться, но берём лучшую длину за партию
    if (pick[0] === 'e') sn = SOLV.applyEat(sn, pick[1][0], pick[1][1]);
    else sn = sn.filter((_, si) => si !== pick[1]);
    play.best = Math.max(play.best, SOLV.maxLen(sn));
  }
  return SOLV.maxLen(sn);
}

const rows = [];
const start = new Date('2026-10-01T00:00:00Z');
for (let d = 0; d < days; d++) {
  const dt = new Date(start.getTime() + d * 86400000);
  const dseed = +dt.toISOString().slice(0, 10).replace(/-/g, '');
  const seed = seedMode === 'date' ? dseed : ((dseed * 2654435761) >>> 0) % 2000000000 + 1;
  const t0 = Date.now();
  const r = PR.craft(presetName, seed, budget);
  const ms = Date.now() - t0;
  if (!r.level) { rows.push({ seed, ok: false, ms, why: r.why }); continue; }
  const lv = r.level;
  const t1 = Date.now();
  const ceil = SOLV.ceilingOf(lv);
  const msCeil = Date.now() - t1;
  const start0 = Math.max(...lv.snakes.map((s) => s.cells.length));
  const marks = marksOf(ceil, start0);
  const res = {};
  for (const pol of ['random', 'eatfirst', 'eatonly']) {
    const rr = rng(seed * 7 + pol.length);
    let top = 0, low = 0; const lens = [];
    for (let k = 0; k < 400; k++) {
      play.best = 0;
      play(lv, pol, rr);
      const L = play.best || start0;
      lens.push(L);
      if (L >= ceil) top++;
      if (L >= marks[0]) low++;
    }
    lens.sort((a, b) => a - b);
    res[pol] = { pTop: top / 400, pWin: low / 400, med: lens[200] };
  }
  rows.push({ seed, sig: JSON.stringify(lv.snakes.map((s) => s.cells)), ok: true, attempts: r.attempts, ms, msCeil, w: lv.w, h: lv.h, snakes: lv.snakes.length,
    target: lv.len, ceil, marks, taps: lv.moves.length, sols: r.metrics.sols, ...res });
}
const ok = rows.filter((x) => x.ok);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(JSON.stringify({ preset: presetName, days, budget,
  accepted: ok.length,
  attemptsMed: med(ok.map((x) => x.attempts)), attemptsMax: Math.max(...ok.map((x) => x.attempts)),
  msMed: med(ok.map((x) => x.ms)), msMax: Math.max(...rows.map((x) => x.ms)),
  msCeilMed: med(ok.map((x) => x.msCeil)), msCeilMax: Math.max(...ok.map((x) => x.msCeil)),
  ceilEqTarget: ok.filter((x) => x.ceil === x.target).length, ceilAbove: ok.filter((x) => x.ceil > x.target).length,
  randomPTopMed: med(ok.map((x) => x.random.pTop)), randomPWinMed: med(ok.map((x) => x.random.pWin)),
  eatfirstPTopMed: med(ok.map((x) => x.eatfirst.pTop)), eatfirstPWinMed: med(ok.map((x) => x.eatfirst.pWin)),
  eatonlyPTopMed: med(ok.map((x) => x.eatonly.pTop)),
  randomPTopZero: ok.filter((x) => x.random.pTop === 0).length,
  distinctRandomMedRatio: med(ok.map((x) => x.random.med / x.ceil)),
  distinctBoards: new Set(ok.map((x) => x.sig)).size,
  sizes: [...new Set(ok.map((x) => x.w + 'x' + x.h))], tapsMed: med(ok.map((x) => x.taps)),
}, null, 1));
fs.writeFileSync(new URL(`./out/daily_probe_${presetName}_${seedMode}.json`, import.meta.url), JSON.stringify(rows, null, 1));
