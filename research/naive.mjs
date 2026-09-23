// Замер: как исходы уровней MVP-потока зависят от стратегии «наивного» игрока.
import fs from 'fs';
import { marksOf } from '../generator.mjs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url),'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const P = { intro: grab('RAW_LEVELS_INTRO'), void: grab('RAW_LEVELS_VOID'), classic: grab('RAW_LEVELS') };
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const SEQ = [["void",0],["intro",1],["intro",2],["intro",4],["void",2],["intro",5],["void",3],["intro",8],["void",4],["classic",6],["classic",7],["classic",12],["void",9],["classic",5]];
const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's'+i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map(c=>c.slice()) }));
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd()*a.length)];
function play(lv, policy) {
  const board = boardOf(lv), marks = marksOf(lv.ceiling, Math.max(...lv.snakes.map(s=>s.cells.length)));
  let sn = mk(lv), crashes = 0, launches = 0, eats = 0, crashBeforeEat = 0, launchBeforeEat = 0;
  for (let t = 0; t < 500; t++) {
    const awake = sn.filter(s => !s.sleep);
    const rays = awake.map(s => ({ s, r: M.raycast(sn, s.id, lv.w, lv.h, board) }));
    const E = rays.filter(x => x.r.kind === 'tail'), L = rays.filter(x => x.r.kind === 'edge');
    let ch;
    if (policy === 'random') ch = pick(rays);
    else if (policy === 'arrows') ch = L.length ? pick(L) : E.length ? pick(E) : null;
    else if (policy === 'eater') ch = E.length ? pick(E) : L.length ? pick(L) : null;
    if (!ch) break;
    if (ch.r.kind === 'tail') { sn = M.applyEat(sn, ch.s.id, ch.r); eats++; }
    else if (ch.r.kind === 'edge') { sn = sn.filter(q => q.id !== ch.s.id); launches++; if (!eats) launchBeforeEat++; }
    else { crashes++; if (!eats) crashBeforeEat++; continue; }
    const mass = sn.reduce((a, s) => a + s.cells.length, 0);
    const ml = M.maxLen(sn);
    if (mass < marks[0]) return { stars: 0, lost: true, crashes, launches, eats, crashBeforeEat, launchBeforeEat };
    const anyEat = sn.some(s => !s.sleep && M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'tail');
    if (!anyEat && !M.canGrow(lv, sn, board, ml)) return { stars: marks.filter(m => ml >= m).length, crashes, launches, eats, crashBeforeEat, launchBeforeEat };
    if (sn.filter(s=>!s.sleep).length === 0) break;
  }
  const ml = M.maxLen(sn);
  return { stars: marks.filter(m => ml >= m).length, crashes, launches, eats, crashBeforeEat, launchBeforeEat };
}
const N = 1000;
console.log('#  уровень          змей  1-й случ.тап: обед/вылет/авария | победа(≥1★): случ / "Arrows" / "едок" | 3★: случ/Arrows/едок | аварий до 1-го обеда (случ, среднее)');
let tot = { r: 0, a: 0, e: 0 };
SEQ.forEach(([p, i], k) => {
  const lv = P[p][i], board = boardOf(lv), sn = mk(lv);
  const awake = sn.filter(s => !s.sleep);
  const kinds = awake.map(s => M.raycast(sn, s.id, lv.w, lv.h, board).kind);
  const f = (k) => kinds.filter(x => x === k).length;
  const res = {};
  for (const pol of ['random','arrows','eater']) {
    let win = 0, three = 0, cbe = 0;
    for (let n = 0; n < N; n++) { const r = play(lv, pol); if (r.stars > 0) win++; if (r.stars === 3) three++; cbe += r.crashBeforeEat; }
    res[pol] = { win: win / N, three: three / N, cbe: cbe / N };
  }
  tot.r += res.random.win; tot.a += res.arrows.win; tot.e += res.eater.win;
  const pct = (x) => (100*x).toFixed(0).padStart(3) + '%';
  console.log(`${String(k+1).padStart(2)} ${lv.name.padEnd(16)} ${String(awake.length).padStart(3)}   ${f('tail')}/${f('edge')}/${awake.length - f('tail') - f('edge')}   | ${pct(res.random.win)} / ${pct(res.arrows.win)} / ${pct(res.eater.win)} | ${pct(res.random.three)} / ${pct(res.arrows.three)} / ${pct(res.eater.three)} | ${res.random.cbe.toFixed(2)}`);
});
console.log(`средняя доля побед по 14 уровням: случ ${(100*tot.r/14).toFixed(0)}%, "Arrows" ${(100*tot.a/14).toFixed(0)}%, "едок" ${(100*tot.e/14).toFixed(0)}%`);
