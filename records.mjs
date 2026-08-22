// Проверка полей режима рекорда: геометрия, достижимость потолка, разрыв между
// тупой игрой и лучшей известной линией. Данные берутся из самого файла игры.
// node records.mjs hvostoed.jsx
import fs from 'fs';

const file = process.argv[2] || 'hvostoed.jsx';
const src = fs.readFileSync(file, 'utf8');
const m = src.match(/const RAW_FIELDS = \[/);
if (!m) { console.error('RAW_FIELDS не найден'); process.exit(1); }
const end = src.indexOf('\n];', m.index);
const FIELDS = eval(src.slice(m.index + 'const RAW_FIELDS = '.length, end + 3));

const ck = (x, y) => x + ',' + y;
const facing = (c) => [c[0][0] - c[1][0], c[0][1] - c[1][1]];
const maxLen = (s) => Math.max(0, ...s.map((x) => x.cells.length));
const mass = (s) => s.reduce((a, x) => a + x.cells.length, 0);
const skey = (s) => s.map((x) => x.cells.map((c) => c.join('.')).join(';')).sort().join('|');

function occMap(sn) { const o = new Map();
  sn.forEach((s, si) => s.cells.forEach(([x, y], ci) => o.set(ck(x, y), { si, ci, len: s.cells.length }))); return o; }
function movesOf(sn, W, H) {
  const occ = occMap(sn), out = [];
  for (let i = 0; i < sn.length; i++) {
    const c = sn[i].cells, [dx, dy] = facing(c);
    let x = c[0][0] + dx, y = c[0][1] + dy, g = 0;
    for (;;) {
      if (x < 0 || y < 0 || x >= W || y >= H) { out.push({ i, eat: false, gap: g }); break; }
      const h = occ.get(ck(x, y));
      if (h) { if (h.si !== i && h.ci === h.len - 1) out.push({ i, eat: true, prey: h.si, gap: g }); break; }
      g++; x += dx; y += dy;
    }
  }
  return out;
}
function applyMove(sn, mv) {
  if (!mv.eat) return sn.filter((_, i) => i !== mv.i);
  const c = sn[mv.i].cells, [dx, dy] = facing(c), prey = sn[mv.prey];
  const path = [];
  for (let t = 1; t <= mv.gap; t++) path.push([c[0][0] + dx * t, c[0][1] + dy * t]);
  const food = new Set(prey.cells.map(([x, y]) => ck(x, y)));
  let cells = c.map((p) => p.slice());
  for (const p of path.concat(prey.cells.slice().reverse())) {
    cells.unshift([p[0], p[1]]); if (!food.has(ck(p[0], p[1]))) cells.pop();
  }
  const out = []; sn.forEach((s, i) => { if (i === mv.prey) return; out.push(i === mv.i ? { cells } : s); });
  return out;
}
function geometry(lv) {
  const seen = new Set();
  for (const s of lv.snakes) {
    if (s.cells.length < 2) return 'змея короче 2';
    for (let j = 0; j < s.cells.length; j++) {
      const [x, y] = s.cells[j];
      if (x < 0 || y < 0 || x >= lv.w || y >= lv.h) return 'клетка вне поля ' + ck(x, y);
      if (seen.has(ck(x, y))) return 'пересечение ' + ck(x, y);
      seen.add(ck(x, y));
      if (j > 0) { const [px, py] = s.cells[j - 1];
        if (Math.abs(px - x) + Math.abs(py - y) !== 1) return 'разрыв тела'; }
    }
  }
  return 'ok';
}
function chain(lv) {                        // порядок змей = порядок кусков пути
  let sn = lv.snakes.map((s) => ({ cells: s.cells }));
  const seq = [];
  for (let step = sn.length - 1; step > 0; step--) {
    const e = sn.length - 1, mv = movesOf(sn, lv.w, lv.h).find((x) => x.i === e);
    if (!mv || !mv.eat || mv.prey !== e - 1) return { ok: false, at: step };
    seq.push(mv.gap); sn = applyMove(sn, mv);
  }
  return { ok: sn.length === 1, len: maxLen(sn), moves: seq.length, voids: seq.filter((g) => g > 0).length };
}
let RS = 987654321;
const rnd = () => (RS = (RS * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function playout(lv, pick, adjOnly) {
  let sn = lv.snakes.map((s) => ({ cells: s.cells })), best = maxLen(sn), t = 0;
  for (; t < 400; t++) {
    let o = movesOf(sn, lv.w, lv.h).filter((x) => x.eat);
    if (adjOnly) o = o.filter((x) => x.gap === 0);
    if (!o.length) break;
    sn = applyMove(sn, pick(o, sn)); best = Math.max(best, maxLen(sn));
  }
  return best;
}
function beam(lv, width) {
  let layer = [{ sn: lv.snakes.map((s) => ({ cells: s.cells })), v: 0, d: 0 }];
  let best = maxLen(layer[0].sn), bn = layer[0];
  for (let d = 0; d < 80 && layer.length; d++) {
    const next = [], seen = new Set();
    for (const nd of layer) for (const mv of movesOf(nd.sn, lv.w, lv.h)) {
      const ns = applyMove(nd.sn, mv), k = skey(ns); if (seen.has(k)) continue; seen.add(k);
      const node = { sn: ns, v: nd.v + (mv.eat && mv.gap > 0 ? 1 : 0), d: nd.d + 1 };
      if (maxLen(ns) > best) { best = maxLen(ns); bn = node; }
      next.push(node);
    }
    next.sort((a, b) => (maxLen(b.sn) - maxLen(a.sn)) || (mass(b.sn) - mass(a.sn)));
    layer = next.slice(0, width);
  }
  return { best, moves: bn.d, voidShare: bn.d ? bn.v / bn.d : 0 };
}

let ok = true;
for (const lv of FIELDS) {
  const total = mass(lv.snakes.map((s) => ({ cells: s.cells })));
  const geo = geometry(lv);
  const ch = chain(lv);
  const bm = beam(lv, 400);
  const bigPrey = (o, sn) => o.reduce((a, b) => sn[b.prey].cells.length > sn[a.prey].cells.length ? b : a);
  const bigEater = (o, sn) => o.reduce((a, b) => sn[b.i].cells.length > sn[a.i].cells.length ? b : a);
  const dumb = Math.max(
    playout(lv, bigPrey), playout(lv, bigEater), playout(lv, (o) => o[0]),
    playout(lv, (o) => o[0], true), playout(lv, bigPrey, true));
  const rs = []; for (let t = 0; t < 2000; t++) rs.push(playout(lv, (o) => o[Math.floor(rnd() * o.length)]));
  rs.sort((a, b) => a - b);
  const q = (p) => rs[Math.floor(p * (rs.length - 1))];
  const byChain = lv.proof !== 'beam';
  const ceilOk = byChain
    ? (ch.ok && ch.len === total && total === lv.ceiling)      // потолок доказан цепью «съесть всё»
    : (bm.best >= lv.ceiling && total === (lv.mass || total)); // потолок = лучшая найденная линия
  if (geo !== 'ok' || !ceilOk) ok = false;
  console.log(`\n### ${lv.name} ${lv.w}×${lv.h} — ${lv.snakes.length} змей, ${total} клеток (${(100 * total / (lv.w * lv.h)).toFixed(0)}% поля)`);
  console.log(`  геометрия: ${geo}`);
  console.log(byChain
    ? `  потолок ${lv.ceiling} доказан цепью: ${ch.ok ? 'сходится за ' + ch.moves + ' ходов (' + ch.voids + ' через зазор)' : 'НЕ СХОДИТСЯ на шаге ' + ch.at} → ${ceilOk ? 'ПОДТВЕРЖДЁН' : 'НЕ ПОДТВЕРЖДЁН'}`
    : `  потолок ${lv.ceiling} — лучшая известная линия: beam нашёл ${bm.best} за ${bm.moves} ходов → ${ceilOk ? 'ПОДТВЕРЖДЁН' : 'НЕ ПОДТВЕРЖДЁН'} (всего на поле ${total} клеток, съесть их все никто не умеет)`);
  console.log(`  случайная игра: медиана ${q(.5)}, p95 ${q(.95)}, лучшая из 2000 ${rs[rs.length - 1]}`);
  console.log(`  тупые стратегии: ${dumb} (${(100 * dumb / lv.ceiling).toFixed(0)}% потолка)`);
  console.log(`  доля еды через пустоту в лучшей линии: ${(100 * bm.voidShare).toFixed(0)}%`);
  console.log(`  метки звёзд ${JSON.stringify(lv.marks)} → случайной игре светит ${lv.marks.filter((x) => q(.95) >= x).length} из ${lv.marks.length}`);
}
console.log(ok ? '\nПОЛЕ КОРРЕКТНО, ПОТОЛОК ДОСТИЖИМ' : '\n!! ПРОБЛЕМА С ПОЛЕМ');
process.exit(ok ? 0 : 1);
