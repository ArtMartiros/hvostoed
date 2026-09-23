// Критик: в скольких победах «поле пустеет», если после подсчёта чемпион уползает (вариант B аналитика):
// нужно И одна змея на поле, И луч чемпиона в край. Стратегии «едок» и случайная, как в casual.mjs.
import fs from 'fs';
import { marksOf } from '../generator.mjs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const M = eval(src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove')) + '\n({ raycast, applyEat, maxLen, canGrow, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i); return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const P = { intro: grab('RAW_LEVELS_INTRO'), void: grab('RAW_LEVELS_VOID'), classic: grab('RAW_LEVELS') };
const MVP = [["void",0],["intro",1],["intro",2],["intro",4],["void",2],["intro",5],["void",3],["intro",8],["void",4],["classic",6],["classic",7],["classic",12],["void",9],["classic",5]];
const boardOf = (lv) => ({ rocks: new Set((lv.rocks||[]).map(([x,y])=>M.ckey(x,y))), bridges: new Set((lv.bridges||[]).map(([x,y])=>M.ckey(x,y))),
  turns: new Map((lv.turns||[]).map(([x,y,a,b])=>[M.ckey(x,y),a+b])), gates: new Map((lv.portals||[]).map(([x,y,u,v])=>[M.ckey(x,y),[u,v]])) });
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
const plain = (lv) => !((lv.rocks||[]).length||(lv.bridges||[]).length||(lv.turns||[]).length||(lv.portals||[]).length||lv.snakes.some((s)=>s.spiky||s.sleep||s.apple));
const mass = (st) => st.reduce((a, s) => a + s.cells.length, 0);
let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = (a) => a[Math.floor(rnd() * a.length)];
function play(lv, pol) {
  const board = boardOf(lv), ceiling = lv.ceiling, marks = marksOf(ceiling, Math.max(...lv.snakes.map((s) => s.cells.length)));
  let sn = mk(lv);
  for (let t = 0; t < 500; t++) {
    const rays = sn.filter((s) => !s.sleep).map((s) => ({ s, r: M.raycast(sn, s.id, lv.w, lv.h, board) }));
    const E = rays.filter((x) => x.r.kind === 'tail'), L = rays.filter((x) => x.r.kind === 'edge');
    const ch = pol === 'random' ? ((E.length||L.length) ? pick(E.concat(L)) : null) : (E.length ? pick(E) : L.length ? pick(L) : null);
    if (!ch) break;
    sn = ch.r.kind === 'tail' ? M.applyEat(sn, ch.s.id, ch.r) : sn.filter((q) => q.id !== ch.s.id);
    if (mass(sn) < marks[0]) return null;
    const ml = M.maxLen(sn);
    const anyEat = sn.some((s) => !s.sleep && M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'tail');
    if (!anyEat && !M.canGrow({ ...lv, ceiling, marks }, sn, board, ml)) break;
  }
  const ml = M.maxLen(sn); const stars = marks.filter((m) => ml >= m).length; if (!stars) return null;
  const champ = sn.reduce((a, s) => (s.cells.length > a.cells.length ? s : a));
  return { one: sn.length === 1, exit: M.raycast(sn, champ.id, lv.w, lv.h, board).kind === 'edge', left: sn.length };
}
const run = (label, levels) => { for (const pol of ['eater', 'random']) {
  let w = 0, empty = 0, leftSum = 0; for (const lv of levels) for (let i = 0; i < 400; i++) { const r = play(lv, pol); if (!r) continue; w++; leftSum += r.left; if (r.one && r.exit) empty++; }
  console.log(`${label} ${pol}: побед ${w}; «одна змея И уползает» ${(100*empty/w).toFixed(0)}% побед; змей на поле в конце победы в среднем ${(leftSum/w).toFixed(2)}`); } };
const plainLv = []; for (const k of Object.keys(P)) P[k].forEach((lv) => { if (plain(lv)) plainLv.push(lv); });
run('63 плоских', plainLv);
run('MVP 14', MVP.map(([p, i]) => P[p][i]));
