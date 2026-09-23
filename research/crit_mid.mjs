// Критик: если поднять порог победы до 2-й отметки (0.75 потолка), сколько поражений даст игра
// «случайный обед, иначе случайный вылет» и «случайный легальный ход» (точные вероятности по DAG).
import fs from 'fs';
import { marksOf } from '../generator.mjs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i); return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const boardOf = (lv) => ({ rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))), bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])), gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])) });
const mass = (st) => st.reduce((a, s) => a + s.cells.length, 0);
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
for (const pack of ['RAW_LEVELS_INTRO', 'RAW_LEVELS_VOID', 'RAW_LEVELS']) {
  const L = grab(pack); const r1 = [], r2 = [], e1 = [], e2 = [];
  for (const lv of L) {
    const board = boardOf(lv);
    const start = lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
    const marks = marksOf(lv.ceiling, M.maxLen(start));
    const memo = new Map();
    // возвращает [P_rand(best>=m0), P_rand(>=m1), P_eat(>=m0), P_eat(>=m1)], где best — макс. длина за партию (игрок может «Забрать» на пике)
    const P = (st, peak) => { const pk = Math.max(peak, M.maxLen(st)); const k = M.stateKey(st) + '|' + pk; if (memo.has(k)) return memo.get(k);
      const mv = M.legalMoves(st, lv.w, lv.h, board).map((m) => ({ ...m, eat: mass(m.next) === mass(st) }));
      let res;
      if (!mv.length) res = [+(pk >= marks[0]), +(pk >= marks[1]), +(pk >= marks[0]), +(pk >= marks[1])];
      else { const kids = mv.map((m) => P(m.next, pk)); const eats = kids.filter((_, i) => mv[i].eat); const pool = eats.length ? eats : kids;
        res = [0, 1].map((j) => kids.reduce((a, c) => a + c[j], 0) / kids.length).concat([2, 3].map((j) => pool.reduce((a, c) => a + c[j], 0) / pool.length)); }
      memo.set(k, res); return res; };
    const [a, b, c, d] = P(start, 0); r1.push(a); r2.push(b); e1.push(c); e2.push(d);
  }
  const f = (x) => x.toFixed(2);
  console.log(pack, 'n', L.length, '| random legal: P(>=1★) med', f(med(r1)), 'P(>=2★) med', f(med(r2)),
    '| eat-first: P(>=1★) med', f(med(e1)), 'levels P=1:', e1.filter((x) => x > 0.999).length, '; P(>=2★) med', f(med(e2)), 'levels P=1:', e2.filter((x) => x > 0.999).length, 'levels P<0.5:', e2.filter((x) => x < 0.5).length);
}
