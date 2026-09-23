// Замер ветки «Змеиный Arrows» кодом самой игры (вырезка по якорю, как ending.mjs).
// Для каждого уровня трёх плоских паков:
//  A) «чистый выход» (правила Arrows): хвост = препятствие, ход — только вылет в край.
//     Снятие змеи только освобождает клетки → жадный выпуск точен (монотонно).
//  B) «гибрид, цель — пустое поле» на правилах Хвостоеда: обед разрешён, цель — чтобы
//     на поле не осталось ни одной змеи (все вылетели). Полный граф состояний.
//     Мерим: достижимо ли; нужен ли обед (A не чистит, B чистит); вероятность
//     очистки случайной игрой; «сначала вылет» (инстинкт Arrows).
//  C) генератор «чистого выхода» обратным построением на том же raycast:
//     добавляем змею только если её луч до края свободен → удаление в обратном
//     порядке всегда проходит. Мерим достижимую плотность и время.
import fs from 'fs';
const src = fs.readFileSync(new URL('../hvostoed.jsx', import.meta.url), 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const P = { intro: grab('RAW_LEVELS_INTRO'), void: grab('RAW_LEVELS_VOID'), classic: grab('RAW_LEVELS') };
const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, cells: s.cells.map((c) => c.slice()) }));
const MVP = [["void",0],["intro",1],["intro",2],["intro",4],["void",2],["intro",5],["void",3],["intro",8],["void",4],["classic",6],["classic",7],["classic",12],["void",9],["classic",5]];

function pureEscape(lv) {
  const board = boardOf(lv);
  let sn = mk(lv), out = 0;
  const awake0 = sn.filter((s) => !s.sleep).length;
  for (;;) {
    const e = sn.find((s) => !s.sleep && M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'edge');
    if (!e) break;
    sn = sn.filter((q) => q.id !== e.id); out++;
  }
  return { awake0, out, cleared: sn.filter((s) => !s.sleep).length === 0, empty: sn.length === 0 };
}

function hybrid(lv) {
  const board = boardOf(lv);
  const start = mk(lv);
  const memo = new Map();
  // p = вероятность пустого поля при случайном легальном ходе; can = достижимо ли
  // pl = то же для «инстинкта Arrows» (есть вылет — случайный вылет, иначе случайный обед)
  // minEat = минимум обедов на пути к пустому полю
  const node = (st) => {
    const k = M.stateKey(st);
    if (memo.has(k)) return memo.get(k);
    const moves = M.legalMoves(st, lv.w, lv.h, board);
    let r;
    if (st.length === 0) r = { can: true, p: 1, pl: 1, pe: 1, minEat: 0 };
    else if (!moves.length) r = { can: false, p: 0, pl: 0, pe: 0, minEat: Infinity };
    else {
      const kids = moves.map((m) => ({ eat: m.next.length === st.length - 1 && m.next.reduce((a, s) => a + s.cells.length, 0) === st.reduce((a, s) => a + s.cells.length, 0), n: node(m.next) }));
      const L = kids.filter((c) => !c.eat), E = kids.filter((c) => c.eat);
      const avg = (a, f) => a.reduce((x, c) => x + f(c.n), 0) / a.length;
      r = {
        can: kids.some((c) => c.n.can),
        p: avg(kids, (n) => n.p),
        pl: L.length ? avg(L, (n) => n.pl) : avg(E, (n) => n.pl),
        pe: E.length ? avg(E, (n) => n.pe) : avg(L, (n) => n.pe),
        minEat: Math.min(...kids.map((c) => c.n.minEat + (c.eat ? 1 : 0))),
      };
    }
    memo.set(k, r);
    return r;
  };
  const r = node(start);
  return { ...r, states: memo.size };
}

const rows = [];
for (const [pid, pack] of Object.entries(P)) {
  pack.forEach((lv, i) => {
    const a = pureEscape(lv), b = hybrid(lv);
    const occ = lv.snakes.reduce((t, s) => t + s.cells.length, 0) / (lv.w * lv.h - (lv.rocks || []).length);
    rows.push({ pid, i, name: lv.name, w: lv.w, h: lv.h, snakes: lv.snakes.length, occ, ...a, hy: b,
      mvp: MVP.findIndex(([p, j]) => p === pid && j === i) });
  });
}
const pct = (x) => (100 * x).toFixed(0) + '%';
const byPack = (f) => Object.keys(P).map((pid) => { const r = rows.filter((x) => x.pid === pid); return pid + ' ' + f(r); }).join(' · ');
console.log('A) чистый выход (правила Arrows) на досках Хвостоеда');
console.log('   доля выпущенных бодрствующих змей (среднее):', byPack((r) => pct(r.reduce((t, x) => t + x.out / x.awake0, 0) / r.length)));
console.log('   уровней, где поле чистится целиком:', byPack((r) => r.filter((x) => x.cleared).length + '/' + r.length));
console.log('   уровней, где не выходит ни одна змея:', byPack((r) => r.filter((x) => x.out === 0).length + '/' + r.length));
console.log('B) гибрид: правила Хвостоеда, цель — пустое поле');
console.log('   пустое поле достижимо:', byPack((r) => r.filter((x) => x.hy.can).length + '/' + r.length));
console.log('   из них обед НУЖЕН (чистым выходом не чистится):', byPack((r) => r.filter((x) => x.hy.can && !x.cleared).length));
console.log('   медиана P(пустое поле) случайной игрой, по достижимым:', byPack((r) => { const v = r.filter((x) => x.hy.can).map((x) => x.hy.p).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)].toFixed(2) : '-'; }));
console.log('   медиана P «инстинкт Arrows» (вылет первым):', byPack((r) => { const v = r.filter((x) => x.hy.can).map((x) => x.hy.pl).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)].toFixed(2) : '-'; }));
console.log('   медиана P «едок» (обед первым):', byPack((r) => { const v = r.filter((x) => x.hy.can).map((x) => x.hy.pe).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)].toFixed(2) : '-'; }));
console.log('   медиана мин. числа обедов на пути к пустому полю:', byPack((r) => { const v = r.filter((x) => x.hy.can).map((x) => x.hy.minEat).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; }));
console.log('   медиана занятости поля:', byPack((r) => { const v = r.map((x) => x.occ).sort((a, b) => a - b); return v[Math.floor(v.length / 2)].toFixed(2); }));
console.log('\nMVP-поток (14):');
rows.filter((x) => x.mvp >= 0).sort((a, b) => a.mvp - b.mvp).forEach((x) =>
  console.log(String(x.mvp + 1).padStart(2), x.name.padEnd(14), `${x.w}x${x.h}`, 'змей', x.snakes, '| чистый выход:', `${x.out}/${x.awake0}`, x.cleared ? 'ЧИСТО' : '', '| гибрид:', x.hy.can ? `можно, P(случ)=${x.hy.p.toFixed(2)} P(Arrows)=${x.hy.pl.toFixed(2)} мин.обедов=${x.hy.minEat}` : 'нельзя'));
const m = rows.filter((x) => x.mvp >= 0);
console.log('MVP: чистый выход чистит', m.filter((x) => x.cleared).length, '/14; гибрид достижим', m.filter((x) => x.hy.can).length, '/14');
fs.writeFileSync(new URL('./out/escape.json', import.meta.url), JSON.stringify(rows, null, 1));

// C) генератор чистого выхода
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function genEscape(W, H, tries) {
  const board = { rocks: new Set(), bridges: new Set(), turns: new Map(), gates: new Map() };
  let sn = [], id = 0;
  const occ = new Set();
  for (let t = 0; t < tries; t++) {
    const len = 2 + Math.floor(rnd() * 7);
    const hx = Math.floor(rnd() * W), hy = Math.floor(rnd() * H);
    if (occ.has(M.ckey(hx, hy))) continue;
    const cells = [[hx, hy]]; const used = new Set([M.ckey(hx, hy)]);
    let ok = true;
    for (let k = 1; k < len; k++) {
      const [px, py] = cells[cells.length - 1];
      const opts = DIRS.map(([dx, dy]) => [px + dx, py + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && !occ.has(M.ckey(x, y)) && !used.has(M.ckey(x, y)));
      if (!opts.length) { ok = k >= 2; break; }
      const c = opts[Math.floor(rnd() * opts.length)]; cells.push(c); used.add(M.ckey(c[0], c[1]));
    }
    if (!ok || cells.length < 2) continue;
    const cand = { id: 'g' + id, cells };
    const trial = sn.concat([cand]);
    if (M.raycast(trial, cand.id, W, H, board).kind !== 'edge') continue;   // луч до края свободен
    sn = trial; id++; cells.forEach(([x, y]) => occ.add(M.ckey(x, y)));
  }
  // проверка: жадный выпуск чистит поле
  let s2 = sn.map((s) => ({ ...s })), steps = 0;
  for (;;) { const e = s2.find((s) => M.raycast(s2, s.id, W, H, board).kind === 'edge'); if (!e) break; s2 = s2.filter((q) => q !== e); steps++; }
  return { snakes: sn.length, fill: occ.size / (W * H), cleared: s2.length === 0 };
}
for (const [W, H] of [[10, 14], [15, 20]]) {
  const t0 = Date.now(); const res = [];
  for (let k = 0; k < 50; k++) res.push(genEscape(W, H, 4000));
  const ms = (Date.now() - t0) / 50;
  const f = res.map((r) => r.fill).sort((a, b) => a - b);
  console.log(`C) генератор ${W}x${H}: 50 досок, все чистятся: ${res.every((r) => r.cleared)}, медиана змей ${res.map((r) => r.snakes).sort((a, b) => a - b)[25]}, заполнение медиана ${f[25].toFixed(2)} (мин ${f[0].toFixed(2)}, макс ${f[49].toFixed(2)}), ${ms.toFixed(0)} мс/доска`);
}
