/* ================================================================
   ГЕНЕРАТОР УРОВНЕЙ ОБРАТНЫМ ПОСТРОЕНИЕМ
   ----------------------------------------------------------------
   Идём от конца: кладём на поле одну змею нужной длины — это финальное
   состояние — и раз за разом ОТМЕНЯЕМ обед. Отмена обеда над змеёй M:

     M = B ++ реверс(зазор) ++ A_тело
         └жертва┘             └едок без проеденного хвоста┘

   выбираем b — длину жертвы, k — длину зазора, и возвращаем едоку k клеток
   хвоста, которые он проел. Зазор освобождается, хвост дорастает в любую
   свободную сторону — и именно это доращивание отвязывает доску от одной
   нитки пути: у едока появляется тело, которого в исходной змее не было.

   Почему это безопасно: forward-ход «A ест B» съедает и зазор, и доращенный
   хвост, и доска возвращается ровно в M. То есть отмена обеда не может
   сломать более поздние ходы — достаточно проверить, что хвост лёг на
   свободные клетки. Обманки же остаются на поле навсегда, поэтому им нужен
   запретный список: клетки, занятые кем-либо в любой момент решения, плюс
   все клетки зазоров.

   Прямизна: луч летит по прямой, поэтому M[b-1..b+k+1] обязаны лежать на
   одной линии. Но при |A_тело| = 1 последняя клетка линии — это первая
   клетка доращенного хвоста, то есть прямую можно ДОСТРОИТЬ, а не искать.
   ================================================================ */

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const shuffled = (rnd, arr) => { const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, d, t = 1) => [a[0] + d[0] * t, a[1] + d[1] * t];
const inside = (w, h, c) => c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h;

/* ---------- механика (та же, что в игре) ---------- */
const ck = (c) => c[0] + ',' + c[1];

/* Колено: плитка пола, соединяющая две стороны клетки из четырёх. Луч, вошедший
   с открытой стороны, выходит в другую открытую; вошедший с закрытой — авария,
   как о валун. Значит у плитки есть спина, и она заодно работает препятствием.
   Занятость проверяется РАНЬШЕ колена: змея, лёгшая на плитку, её перекрывает. */
export const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const sideName = (v) => (v[0] === 1 ? 'e' : v[0] === -1 ? 'w' : v[1] === 1 ? 's' : 'n');
export const tileKey = (a, b) => [a, b].sort().join('');

export function boardOf(lv) {
  return {
    bridges: new Set((lv.bridges || []).map(ck)),
    turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck([x, y]), tileKey(a, b)])),
  };
}
export const facing = (cells) => sub(cells[0], cells[1]);
export const maxLen = (st) => st.reduce((m, s) => Math.max(m, s.cells.length), 0);
export const totalMass = (st) => st.reduce((m, s) => m + s.cells.length, 0);

export function occSet(state, skip) {
  const o = new Set();
  for (const s of state) { if (s === skip) continue; for (const c of s.cells) o.add(ck(c)); }
  return o;
}

export function raycast(state, i, w, h, board) {
  const bridges = board && board.bridges, turns = board && board.turns;
  const occ = new Map();
  state.forEach((s, si) => s.cells.forEach((c, ci) => occ.set(ck(c), { si, ci, len: s.cells.length })));
  const s = state[i];
  let d = facing(s.cells);
  let c = add(s.cells[0], d);
  const path = [];
  for (;;) {
    if (!inside(w, h, c)) return { kind: 'edge', gap: path.length, path, dir: d };
    if (bridges && bridges.has(ck(c))) { path.push(c); c = add(c, d); continue; }   // луч идёт над мостом
    const hit = occ.get(ck(c));
    if (hit) {
      if (hit.si === i) return { kind: 'self', gap: path.length, path, dir: d };
      if (hit.ci === hit.len - 1)
        return state[hit.si].spiky
          ? { kind: 'spikyTail', prey: hit.si, gap: path.length, path, dir: d }
          : { kind: 'tail', prey: hit.si, gap: path.length, path, dir: d };
      return { kind: 'block', gap: path.length, path, dir: d };
    }
    const t = turns && turns.get(ck(c));
    if (t) {
      const from = sideName([-d[0], -d[1]]);
      if (t[0] !== from && t[1] !== from) return { kind: 'turnBack', gap: path.length, path, dir: d };
      d = SIDES[t[0] === from ? t[1] : t[0]];
    }
    path.push(c); c = add(c, d);
  }
}

export function applyEat(state, i, ray) {
  const eater = state[i], prey = state[ray.prey];
  const path = ray.path.map((c) => c.slice());     // луч может гнуться — идём по его клеткам, а не по прямой
  for (let j = prey.cells.length - 1; j >= 0; j--) path.push(prey.cells[j]);
  const food = new Set(prey.cells.map(ck));
  const cells = eater.cells.map((c) => c.slice());
  for (const p of path) { cells.unshift(p.slice()); if (!food.has(ck(p))) cells.pop(); }
  const out = [];
  state.forEach((s, si) => { if (si === ray.prey) return; out.push(si === i ? { ...s, cells } : s); });
  return out;
}

/* Стартовое состояние из уровня. Одно место на всех: шесть отдельных сборок
   в статистике молча теряли spiky и sleep — то есть решения считались так, будто
   колючий хвост съедобен, а спящая ходит. Яблоко (одна клетка, без взгляда)
   такую потерю уже не прощает — падает сразу, и это к лучшему. */
export const stateOf = (lv) => lv.snakes.map((s) => ({
  id: s.id, cells: s.cells.map((c) => c.slice()),
  spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, apple: !!s.apple,
}));

export function movesOf(state, w, h, board) {
  const out = [];
  for (let i = 0; i < state.length; i++) {
    if (state[i].sleep) continue;          // спящая не ходит, но её едят
    const r = raycast(state, i, w, h, board);
    if (r.kind === 'tail') out.push({ i, eat: true, prey: r.prey, gap: r.gap, ray: r });
    else if (r.kind === 'edge') out.push({ i, eat: false, gap: r.gap, ray: r });
  }
  return out;
}

/* ---------- самонепересекающаяся прогулка ---------- */
export function walk(rnd, w, h, len, blocked, start, firstDir, straightBias) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const cells = [];
    const used = new Set();
    let cur = start ? start.slice() : [Math.floor(rnd() * w), Math.floor(rnd() * h)];
    if (!inside(w, h, cur) || blocked.has(ck(cur))) { if (start) return null; continue; }
    cells.push(cur); used.add(ck(cur));
    let dir = firstDir ? firstDir.slice() : null;
    let dead = false;
    while (cells.length < len) {
      const opts = [];
      for (const d of DIRS) {
        const n = add(cur, d);
        if (!inside(w, h, n) || blocked.has(ck(n)) || used.has(ck(n))) continue;
        opts.push({ d, n, straight: dir && d[0] === dir[0] && d[1] === dir[1] });
      }
      if (!opts.length) { dead = true; break; }
      const str = opts.filter((o) => o.straight);
      const chosen = (str.length && rnd() < straightBias) ? str[0] : pick(rnd, opts);
      cur = chosen.n; dir = chosen.d; cells.push(cur); used.add(ck(cur));
    }
    if (!dead && cells.length === len) return cells;
    if (start && firstDir) return null;      // жёстко заданное начало — второй попытки нет
  }
  return null;
}

/* ---------- перебор способов отменить обед ----------
   Раньше весь участок разреза обязан был лежать на прямой: луч летит прямо.
   С коленями прямизна нужна только НА ВХОДЕ — прицел едока смотрит в первую
   клетку зазора, — а каждый изгиб внутри превращается в плитку пола. Это и
   снимает структурный потолок бюджета пустот: он брался ровно из нужды в
   длинных прямых участках.

   Плата: плитка остаётся на полу навсегда и гнёт ВСЕ лучи через эту клетку.
   Поэтому вместе с вариантом возвращается список нужных плиток и список клеток,
   которые вариант проходит НАСКВОЗЬ, — и то и другое проверяется на совместимость
   со всеми уже принятыми ходами. */
/* minB=1 разрешает добычу в ОДНУ клетку — это и есть яблоко. Никакой отдельной
   механики у яблока нет и не нужно: съесть можно только за хвост, а у односкле-
   точной змеи хвост и есть она сама, и вырастает едок ровно на её длину, то есть
   на единицу. Всё остальное — луч, зазор, проверка, подсказка, солвер — работает
   с ним как с любой другой добычей, потому что это она и есть.
   Одно ограничение неизбежно: у одной клетки нет направления взгляда, значит
   ходить яблоко не может никогда — помечаем спящим. */
function splitOptions(M, maxGap, minB) {
  const cells = M.cells, n = cells.length, out = [];
  for (let b = minB || 2; b <= n - 2; b++) {
    for (let k = 0; k <= maxGap && b + k <= n - 1; k++) {
      const aBodyLen = n - b - k;
      const first = sub(cells[b + k - 1] || cells[b - 1], cells[b + k]);
      const tiles = [], thru = [];
      for (let t = b + k - 1; t >= b; t--) {
        const dIn = sub(cells[t], cells[t + 1]);
        const dOut = sub(cells[t - 1], cells[t]);
        if (eq(dIn, dOut)) { thru.push(cells[t]); continue; }
        tiles.push({ cell: cells[t], key: tileKey(sideName([-dIn[0], -dIn[1]]), sideName(dOut)) });
      }
      if (aBodyLen >= 2) {
        if (!eq(sub(cells[b + k], cells[b + k + 1]), first)) continue;
        out.push({ b, k, dir: first, needFirstExt: null, tiles, thru });
      } else {
        if (k === 0) continue;                     // без зазора хвост не дорастить, A[1] взять неоткуда
        out.push({ b, k, dir: first, needFirstExt: add(cells[b + k], first, -1), tiles, thru });
      }
    }
  }
  return out;
}

// Совместим ли вариант с полом, который уже сложился: на клетке либо плитка, либо
// сквозной проход, третьего не дано, и две разные плитки на одной клетке невозможны.
function floorFits(opt, floor, cap) {
  let fresh = 0;
  for (const t of opt.tiles) {
    const k = ck(t.cell);
    if (floor.thru.has(k)) return null;
    const was = floor.tiles.get(k);
    if (was === undefined) fresh++;
    else if (was !== t.key) return null;
  }
  for (const c of opt.thru) if (floor.tiles.has(ck(c))) return null;
  if (floor.tiles.size + fresh > cap) return null;
  return fresh;
}

function floorTake(opt, floor) {
  for (const t of opt.tiles) floor.tiles.set(ck(t.cell), t.key);
  for (const c of opt.thru) floor.thru.add(ck(c));
}

/* ---------- один обратный ход ---------- */
function unEat(rnd, cfg, state, si, opt) {
  const M = state[si], cells = M.cells, n = cells.length;
  const { b, k, dir, needFirstExt } = opt;
  const B = { id: cfg._nextId++, cells: cells.slice(0, b).map((c) => c.slice()),
              ...(b === 1 ? { apple: true, sleep: true } : {}) };
  const aBody = cells.slice(b + k).map((c) => c.slice());
  const gapCells = cells.slice(b, b + k).map((c) => c.slice());

  // хвост дорастает на k клеток; занято всё, кроме отменяемой змеи, плюс жертва,
  // тело едока и клетки зазора — зазор обязан остаться пустым, иначе луч не долетит
  const blocked = occSet(state, M);
  for (const c of B.cells) blocked.add(ck(c));
  for (const c of aBody) blocked.add(ck(c));
  for (const c of gapCells) blocked.add(ck(c));

  let ext = [];
  if (k > 0) {
    const anchor = aBody[aBody.length - 1];
    if (needFirstExt) {
      if (blocked.has(ck(needFirstExt)) || !inside(cfg.w, cfg.h, needFirstExt)) return null;
      ext.push(needFirstExt);
      blocked.add(ck(needFirstExt));
      if (k > 1) {
        const rest = walk(rnd, cfg.w, cfg.h, k, blocked, needFirstExt, null, cfg.tailStraight);
        if (!rest) return null;
        ext = rest;
      }
    } else {
      const starts = shuffled(rnd, DIRS).map((d) => add(anchor, d))
        .filter((c) => inside(cfg.w, cfg.h, c) && !blocked.has(ck(c)));
      let got = null;
      for (const s0 of starts) { got = walk(rnd, cfg.w, cfg.h, k, blocked, s0, null, cfg.tailStraight); if (got) break; }
      if (!got) return null;
      ext = got;
    }
  }
  const A = { id: M.id, cells: aBody.concat(ext.map((c) => c.slice())) };
  if (A.cells.length !== n - b) return null;
  const next = state.map((s, i) => (i === si ? A : s));
  next.push(B);
  return { state: next, move: { eater: A.id, prey: B.id, gap: k, apple: b === 1 }, gapCells };
}

/* ---------- раскладка пустот по ходам ----------
   Бюджет `voids` — суммарная длина зазоров за всё решение. Он равен тому,
   насколько след решения больше цели: масса на поле обед сохраняет, поэтому
   зазоры двигают не плотность, а разброс.

   Огибающая — треугольник с вершиной в `peak` (1 — разгон до финала, 0.6 —
   перевал в середине, дальше дособирается легко). Передышки — ходы вплотную,
   ставятся каждый `breather`-й НЕЗАВИСИМО от огибающей: очевидный ход нужен
   как выдох, а не как «лёгкий среди лёгких» в начале уровня. */
export function gapPlan(M, budget, peak, breather, maxGap) {
  const rest = new Set();
  if (breather > 0) for (let i = 1; i < M - 1; i += breather) rest.add(i);   // финал не передышка
  const p = Math.min(1, Math.max(0.02, peak == null ? 1 : peak));
  const w = [];
  for (let i = 0; i < M; i++) {
    const x = M === 1 ? p : i / (M - 1);
    w.push(rest.has(i) ? 0 : 0.15 + 0.85 * (x <= p ? x / p : (1 - x) / (1 - p)));
  }
  // делим бюджет пропорционально огибающей, метод наибольшего остатка
  let sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return w.map(() => 0);
  let want = w.map((v) => (budget * v) / sum);
  for (let pass = 0; pass < 4; pass++) {       // излишек сверх maxGap раздаём остальным
    let over = 0, room = 0;
    want.forEach((v, i) => { if (v > maxGap) over += v - maxGap; else if (!rest.has(i)) room += maxGap - v; });
    if (over < 1e-9 || room < 1e-9) break;
    want = want.map((v, i) => (v > maxGap ? maxGap : (rest.has(i) ? v : v + (over * (maxGap - v)) / room)));
  }
  const base = want.map((v) => Math.floor(v));
  let left = Math.round(budget) - base.reduce((a, b) => a + b, 0);
  const order = want.map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter((o) => !rest.has(o.i)).sort((a, b) => b.frac - a.frac);
  for (const o of order) { if (left <= 0) break; if (base[o.i] < maxGap) { base[o.i]++; left--; } }
  return base;
}

/* ---------- сборка уровня ---------- */
export function generate(cfg) {
  const rnd = makeRng(cfg.seed);
  cfg = { maxGap: 3, tailStraight: 0.6, branch: 0.5, straightBias: 0.55, decoys: 0,
          peak: 1, breather: 3, ...cfg, _nextId: 1 };
  /* Сколько РАЗНЫХ механик пускать на доску. Ручка «сколько чего» этого не решает:
     ничто не мешало навалить мосты, колена, яблоки, колючих и спящих на один
     уровень разом — а это пять правил поверх базового, и читать такое нельзя.
     Подача по одной-двум за уровень — то, ради чего ручка и нужна. Выбор случайный
     по сиду: два уровня с одним конфигом окажутся про разное. */
  const MECHS = ['bridges', 'turns', 'apples', 'spiky', 'sleepy'];
  if (cfg.mechs > 0) {
    const kinds = MECHS.filter((k) => (cfg[k] || 0) > 0);
    if (kinds.length > cfg.mechs) {
      const keep = new Set(shuffled(rnd, kinds).slice(0, cfg.mechs));
      const cut = {};
      for (const k of kinds) if (!keep.has(k)) cut[k] = 0;
      cfg = { ...cfg, ...cut };
    }
  }

  const final = walk(rnd, cfg.w, cfg.h, cfg.len, new Set(), null, null, cfg.straightBias);
  if (!final) return null;

  const M = cfg.moves;
  const want = gapPlan(M, cfg.voids == null ? M : cfg.voids, cfg.peak, cfg.breather, cfg.maxGap);

  let state = [{ id: cfg._nextId++, cells: final }];
  const moves = [];
  const forbidden = new Set(final.map(ck));
  const floor = { tiles: new Map(), thru: new Set() };   // пол: где колено, а где сквозной проход
  let debt = 0;                                 // недобор зазоров, размазываем по оставшимся ходам
  const allGaps = [];                           // клетки, через которые летят лучи решения — кандидаты в мосты
  let applesLeft = cfg.apples || 0;

  for (let step = 0; step < M; step++) {
    const f = M - 1 - step;                     // строим с конца: шаг 0 — последний ход решения
    const isRest = want[f] === 0 && cfg.breather > 0;
    /* Яблоко — ход безрисковый: добыча в одну клетку не убегает и ничем не грозит.
       Поэтому его место там же, где передышки. Если яблок заказано больше, чем
       осталось передышек, разрешаем их и на обычных ходах — иначе бюджет не выбрать.
       Побочная выгода структурная: обычный ход тратит целый кусок змеи, а яблочный —
       одну клетку, поэтому куски к концу обратной прогулки остаются длиннее, и
       потолок пустот поднимается. */
    let restLeft = 0;
    for (let q = 0; q < f; q++) if (want[q] === 0 && cfg.breather > 0) restLeft++;
    const wantApple = applesLeft > 0 && (isRest || applesLeft > restLeft);
    const aim = isRest ? 0
      : Math.max(0, Math.min(cfg.maxGap, Math.round(want[f] + debt / (f + 1))));
    // кого резать: с вероятностью branch — случайную змею, иначе самую длинную.
    // Но целевой зазор важнее: сначала ищем ход с нужным k СРЕДИ ВСЕХ ЗМЕЙ,
    // и лишь при равном k предпочитаем змею по порядку. Иначе бюджет не выбирается:
    // у выбранной наугад змеи может просто не оказаться длинной прямой под зазор.
    const order = rnd() < cfg.branch
      ? shuffled(rnd, state.map((_, i) => i))
      : state.map((_, i) => i).sort((a, b) => state[b].cells.length - state[a].cells.length);
    const rank = new Map(order.map((si, r) => [si, r]));
    const cand = [];
    for (const si of order)
      for (const opt of shuffled(rnd, splitOptions(state[si], cfg.maxGap, wantApple ? 1 : 2)))
        cand.push({ si, opt });
    // при равном зазоре предпочитаем вариант, требующий меньше новых колен:
    // прямой луч читается быстрее, колена нужны там, где без них не выйдет
    for (const c of cand) c.fresh = floorFits(c.opt, floor, cfg.turns || 0);
    const fit = cand.filter((c) => c.fresh !== null);
    fit.sort((a, b) => ((b.opt.b === 1) - (a.opt.b === 1))
      || (Math.abs(a.opt.k - aim) - Math.abs(b.opt.k - aim))
      || (a.fresh - b.fresh) || (rank.get(a.si) - rank.get(b.si)));
    let done = null;
    for (const c of fit) {
      const r = unEat(rnd, cfg, state, c.si, c.opt);
      if (r) { floorTake(c.opt, floor); done = r; if (c.opt.b === 1) applesLeft--; break; }
    }
    if (!done) break;
    if (!isRest) debt += want[f] - done.move.gap;
    state = done.state;
    moves.unshift(done.move);
    for (const s of state) for (const c of s.cells) forbidden.add(ck(c));
    for (const c of done.gapCells) { forbidden.add(ck(c)); allGaps.push(c); }
  }
  if (moves.length < cfg.minMoves) return null;

  /* Обманки: только на клетках, которые решению не нужны ни разу. Часть из них
     помечается — колючая ходит, но её хвост не съесть; спящая наоборот, съедобна,
     но сама не ходит. Обе никогда не участвуют в решении, поэтому пометка не может
     его сломать: она лишь меняет, чем обманка соблазняет. Совмещать не даём —
     колючая соня была бы просто валуном в форме змеи. */
  /* Мосты. В обратном построении клетки зазоров обязаны оставаться пустыми — их и
     держит запретный список. Мост снимает этот запрет ровно на одной клетке: луч
     проходит над ней, значит на ней МОЖНО кого-то поселить. Отсюда правило —
     мост без змеи на нём бессмыслен (это просто пол), поэтому обманку сажаем
     прямо на него, а не рядом. Решению это не вредит: клетка была зазором,
     то есть луч через неё и так летел. */
  const bridges = [];
  const busy = occSet(state);
  const gapPool = shuffled(rnd, allGaps.filter((c) => !busy.has(ck(c)) && !floor.tiles.has(ck(c))));
  for (const c of gapPool) {
    if (bridges.length >= (cfg.bridges || 0)) break;
    const free = new Set(forbidden); free.delete(ck(c));
    const len = 2 + Math.floor(rnd() * (cfg.decoyMax || 4));
    const d = walk(rnd, cfg.w, cfg.h, len, free, c, null, 0.4);
    if (!d) continue;
    bridges.push(c.slice());
    state = state.concat([{ id: cfg._nextId++, cells: d, decoy: true, onBridge: true }]);
    for (const q of d) forbidden.add(ck(q));
  }
  /* Спящая — в РЕШЕНИИ, и это не вольность, а точный факт о нём.
     Хода «просто пойти» в игре нет: любой ход — обед или вылет. Значит кусок,
     который в плане ни разу не выступает едоком, вперёд по времени не двигается
     вообще, и пометка «спит» — правда о нём, а не ограничение. Таких кусков
     большинство: едоков не больше числа ходов, а кусков на один больше.
     Игроку это честная опора: спящая еда гарантированно не уползёт. */
  const eaters = new Set(moves.map((m) => m.eater));
  let sleepLeft = cfg.sleepy || 0;
  // только куски РЕШЕНИЯ: мостовая обманка уже стоит в state, а её работа — стоять
  // поперёк луча, и «спит» ей ничего не добавляет
  for (const s of shuffled(rnd, state.filter((s) => !s.decoy && !eaters.has(s.id)))) {
    if (sleepLeft <= 0) break;
    s.sleep = true; sleepLeft--;
  }

  const turns = [...floor.tiles].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return [x, y, v[0], v[1]];
  });

  // обычные обманки — первыми, чтобы приманки ставились уже с их учётом
  const wantSpiky = cfg.spiky || 0;
  const decoys = [];
  for (let t = 0; t < Math.max(0, cfg.decoys - wantSpiky - sleepLeft); t++) {
    const len = 2 + Math.floor(rnd() * (cfg.decoyMax || 4));
    const d = walk(rnd, cfg.w, cfg.h, len, forbidden, null, null, 0.4);
    if (!d) continue;
    decoys.push({ id: cfg._nextId++, cells: d, decoy: true });
    for (const c of d) forbidden.add(ck(c));
  }
  state = state.concat(decoys);

  /* Помеченные обманки — ПРИМАНКИ, а не украшение. И колючая, и спящая отличаются
     от обычной змеи ровно тогда, когда чей-то луч достаёт до их ХВОСТА: у колючей
     это авария вместо обеда, у спящей — обед, который гарантированно не уползёт.
     Если до хвоста никто не дотягивается, обе пометки — краска.

     Поэтому ищем клетки, куда луч какой-нибудь змеи долетает по ходу решения,
     и сажаем помеченную хвостом туда. Клетки самого решения и его зазоров лежат
     в запретном списке, так что подложить свинью решению это не может.

     Три вещи, каждая из которых стоила половины пометок, пока не была сделана:
     ставить ПОСЛЕ обычных обманок (иначе следующая же встанет перед ловушкой),
     считать лучи по доске СО ВСЕМИ обманками, и запрещать телу приманки ложиться
     на подлёт к собственному хвосту — оно же его и заслоняло. */
  const spots = trapSpots(state, moves, cfg, forbidden, { bridges, turns });
  const traps = [];
  const clear = new Set();                     // подлёт к уже поставленной приманке — не занимать
  let spikyLeft = wantSpiky;
  for (const sp of shuffled(rnd, spots)) {
    if (spikyLeft <= 0 && sleepLeft <= 0) break;
    if (clear.has(ck(sp.c)) || sp.path.some((q) => clear.has(ck(q)))) continue;
    const len = 2 + Math.floor(rnd() * (cfg.decoyMax || 4));
    const block = new Set(forbidden);
    for (const q of sp.path) block.add(ck(q));
    for (const q of clear) block.add(q);       // и на чужой подлёт ложиться нельзя
    block.delete(ck(sp.c));
    const d = walk(rnd, cfg.w, cfg.h, len, block, sp.c, null, 0.4);
    if (!d) continue;
    d.reverse();                               // walk растит от начала — а нам нужен ХВОСТ в приманке
    const mark = spikyLeft > 0 ? (spikyLeft--, { spiky: true }) : (sleepLeft--, { sleep: true });
    traps.push({ id: cfg._nextId++, cells: d, decoy: true, trap: true, ...mark });
    for (const q of d) forbidden.add(ck(q));
    for (const q of sp.path) clear.add(ck(q));
  }
  state = state.concat(traps);
  return { w: cfg.w, h: cfg.h, snakes: state, moves, len: cfg.len,
           mechs: MECHS.filter((k) => (cfg[k] || 0) > 0),
           apples: moves.filter((m) => m.apple).length,
           decoys: decoys.length + traps.length + bridges.length, bridges, turns,
           voids: moves.reduce((a, m) => a + m.gap, 0), want, peak: cfg.peak, breather: cfg.breather };
}

/* Клетки, куда чей-нибудь луч долетел бы по ходу решения. Хвост колючей,
   поставленный на такую клетку, превращает её из «пусто» в «авария» — это и есть
   соблазн. Идём по состояниям решения, от головы каждой змеи шагаем в её сторону
   взгляда, пока пусто, и собираем клетки, свободные от решения и его зазоров. */
function trapSpots(start, moves, cfg, forbidden, lv) {
  const out = [], seen = new Set();
  let state = start.map((s) => ({ id: s.id, cells: s.cells.map((c) => c.slice()), sleep: !!s.sleep }));
  const br = boardOf(lv);
  for (let m = 0; m <= moves.length; m++) {
    const occ = occSet(state);
    for (const s of state) {
      if (s.cells.length < 2 || s.sleep) continue;      // спящая никуда не смотрит
      let d = [s.cells[0][0] - s.cells[1][0], s.cells[0][1] - s.cells[1][1]];
      let c = add(s.cells[0], d);
      const path = [];                                  // клетки ПЕРЕД ловушкой: должны остаться пустыми
      while (inside(cfg.w, cfg.h, c) && !occ.has(ck(c))) {
        if (br.bridges.has(ck(c))) { path.push(c.slice()); c = add(c, d); continue; }
        const t = br.turns.get(ck(c));
        if (t) {
          const from = sideName([-d[0], -d[1]]);
          if (t[0] !== from && t[1] !== from) break;     // в спину колена луч не пройдёт
          d = SIDES[t[0] === from ? t[1] : t[0]];
        } else if (!forbidden.has(ck(c)) && !seen.has(ck(c))) {
          seen.add(ck(c)); out.push({ c: c.slice(), path: path.map((q) => q.slice()) });
        }
        path.push(c.slice());
        c = add(c, d);
      }
    }
    if (m === moves.length) break;
    const i = state.findIndex((s) => s.id === moves[m].eater);
    if (i < 0) break;
    const r = raycast(state, i, cfg.w, cfg.h, br);
    if (r.kind !== 'tail') break;
    state = applyEat(state, i, r);
  }
  return out;
}

/* ---------- обязательная проверка вперёд ---------- */
export function verify(lv) {
  const br = boardOf(lv);
  let state = lv.snakes.map((s) => ({ id: s.id, cells: s.cells.map((c) => c.slice()) }));
  for (let m = 0; m < lv.moves.length; m++) {
    const mv = lv.moves[m];
    const i = state.findIndex((s) => s.id === mv.eater);
    if (i < 0) return { ok: false, at: m, why: 'едок пропал' };
    if (state[i].sleep) return { ok: false, at: m, why: 'спящую заставили ходить' };
    const r = raycast(state, i, lv.w, lv.h, br);
    if (r.kind !== 'tail') return { ok: false, at: m, why: 'луч не в хвост, а ' + r.kind };
    if (state[r.prey].id !== mv.prey) return { ok: false, at: m, why: 'луч попал не в ту змею' };
    if (r.gap !== mv.gap) return { ok: false, at: m, why: `зазор ${r.gap} вместо ${mv.gap}` };
    state = applyEat(state, i, r);
  }
  return { ok: true, len: maxLen(state), left: state.length };
}
