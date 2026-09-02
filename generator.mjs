/* ГЕНЕРАТОР ОБРАТНЫМ ПОСТРОЕНИЕМ. Финальная змея + отмены обеда:
   M = B(жертва) ++ зазор ++ A(едок); зазор освобождается, едоку дорастает
   проеденный хвост в свободные клетки — доращивание отвязывает доску от одной
   нитки пути. Прямой ход «A ест B» возвращает доску ровно в M, поэтому отмена
   не ломает поздние ходы; обманкам (стоят навсегда) нужен запретный список:
   клетки решения в любой момент плюс клетки зазоров. Подробности — бриф §6d. */

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

// отметки 0.5/0.75/1.0 от измеренного потолка — расстановка замерена (бриф §5);
// нижняя поднимается выше старта, иначе звезда горит до первого тапа
export const marksOf = (ceiling, start) => {
  const m2 = Math.min(ceiling - 1, Math.round(0.75 * ceiling));
  let m1 = Math.max(Math.round(0.5 * ceiling), start + 1);
  if (m1 >= m2) m1 = m2 - 1;
  return [Math.max(2, m1), m2, ceiling];
};

export const SIDES = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const sideName = (v) => (v[0] === 1 ? 'e' : v[0] === -1 ? 'w' : v[1] === 1 ? 's' : 'n');
export const tileKey = (a, b) => [a, b].sort().join('');

export function boardOf(lv) {
  return {
    bridges: new Set((lv.bridges || []).map(ck)),
    turns: new Map((lv.turns || []).map(([x, y, a, b]) => [ck([x, y]), tileKey(a, b)])),
    gates: new Map((lv.portals || []).map(([x, y, u, v]) => [ck([x, y]), [u, v]])),
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
  const gates = board && board.gates;
  const occ = new Map();
  state.forEach((s, si) => s.cells.forEach((c, ci) => occ.set(ck(c), { si, ci, len: s.cells.length })));
  const s = state[i];
  let d = facing(s.cells);
  // голова может лежать на плитке: луч рождается внутри жёлоба, стенка своей
  // клетки читается отдельно (гнуть нечего — у луча нет стороны входа)
  const own = turns && turns.get(ck(s.cells[0]));
  if (own) {
    const out = sideName(d);
    if (own[0] !== out && own[1] !== out) return { kind: 'turnBack', gap: 0, path: [], dir: d };
  }
  let c = add(s.cells[0], d);
  const path = [];
  const cap = 4 * w * h + 8;                        // порталы можно замкнуть в кольцо
  for (let step = 0; ; step++) {
    if (step > cap) return { kind: 'loop', gap: path.length, path, dir: d };
    if (!inside(w, h, c)) return { kind: 'edge', gap: path.length, path, dir: d };
    if (bridges && bridges.has(ck(c))) { path.push(c); c = add(c, d); continue; }   // луч идёт над мостом
    // спина поворота — стена даже под лежащей змеёй: читается РАНЬШЕ занятости
    const t = turns && turns.get(ck(c));
    const from = t ? sideName([-d[0], -d[1]]) : null;
    if (t && t[0] !== from && t[1] !== from) return { kind: 'turnBack', gap: path.length, path, dir: d };
    const hit = occ.get(ck(c));
    if (hit) {
      if (hit.si === i) return { kind: 'self', gap: path.length, path, dir: d };
      if (hit.ci === hit.len - 1)
        return state[hit.si].spiky
          ? { kind: 'spikyTail', prey: hit.si, gap: path.length, path, dir: d }
          : { kind: 'tail', prey: hit.si, gap: path.length, path, dir: d };
      return { kind: 'block', gap: path.length, path, dir: d };
    }
    // портал: направление сохраняется; занятость выше — лёгшая змея перекрывает
    const g = gates && gates.get(ck(c));
    if (g) { path.push(c); c = g.slice(); continue; }
    // клетка пуста и открыта — поворот гнёт луч (спину проверили выше)
    if (t) d = SIDES[t[0] === from ? t[1] : t[0]];
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

// стартовое состояние в одном месте: отдельные сборки молча теряли spiky/sleep,
// и метрики мерили доску, где колючий хвост съедобен
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
      // firstDir задаёт первый шаг ЖЁСТКО: за порталом луч обязан продолжить тем же
      // направлением, каким вошёл, иначе портал в решении не собрать
      const force = cells.length === 1 && firstDir ? firstDir : null;
      const opts = [];
      for (const d of force ? [force] : DIRS) {
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

/* Финальная змея сквозь порталы: строится отрезками, следующий начинает первый
   шаг тем же направлением, каким кончился предыдущий (луч идёт по убыванию
   индексов, портал E→X сохраняет направление сам). Отрезок ≥ 3 клеток — иначе
   у куска нет взгляда. */
function walkGated(rnd, cfg) {
  const n = cfg.portals || 0;
  if (n <= 0) {
    const c = walk(rnd, cfg.w, cfg.h, cfg.len, new Set(), null, null, cfg.straightBias);
    return c ? { cells: c, portals: [] } : null;
  }
  const parts = n + 1;
  if (cfg.len < parts * 3) return null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const runs = new Array(parts).fill(3);
    for (let left = cfg.len - parts * 3; left > 0; left--) runs[Math.floor(rnd() * parts)]++;
    let cells = [], portals = [], blocked = new Set(), dir = null, ok = true;
    for (let r = 0; r < parts && ok; r++) {
      let part = null, entry = null;
      if (r === 0) part = walk(rnd, cfg.w, cfg.h, runs[0], blocked, null, null, cfg.straightBias);
      else {
        const exit = cells[cells.length - 1];
        for (let t = 0; t < 40 && !part; t++) {
          const e = [Math.floor(rnd() * cfg.w), Math.floor(rnd() * cfg.h)];
          // портал должен уносить далеко — иначе это просто кривой шаг
          if (blocked.has(ck(e)) || Math.abs(e[0] - exit[0]) + Math.abs(e[1] - exit[1]) < 4) continue;
          part = walk(rnd, cfg.w, cfg.h, runs[r], blocked, e, dir, cfg.straightBias);
          entry = e;
        }
      }
      if (!part) { ok = false; break; }
      if (r > 0) portals.push([entry[0], entry[1], cells[cells.length - 1][0], cells[cells.length - 1][1]]);
      for (const c of part) blocked.add(ck(c));
      cells = cells.concat(part);
      dir = sub(part[part.length - 1], part[part.length - 2]);
    }
    if (ok && cells.length === cfg.len) return { cells, portals };
  }
  return null;
}

/* ---------- перебор способов отменить обед ----------
   Прямизна нужна только на входе (прицел смотрит в первую клетку зазора), изгибы
   зазора становятся плитками пола. Плитка гнёт ВСЕ лучи навсегда, поэтому вариант
   возвращает список плиток и сквозных клеток — их совместимость проверяется со
   всеми принятыми ходами. minB=1 — добыча в одну клетку, яблоко: всегда спящее
   (нет взгляда), в остальном обычная добыча. */
const unit = (v) => Math.abs(v[0]) + Math.abs(v[1]) === 1;

function splitOptions(M, maxGap, minB, gates) {
  const cells = M.cells, n = cells.length, out = [];
  for (let b = minB || 2; b <= n - 2; b++) {
    for (let k = 0; k <= maxGap && b + k <= n - 1; k++) {
      const aBodyLen = n - b - k;
      const first = sub(cells[b + k - 1] || cells[b - 1], cells[b + k]);
      // первый шаг луча из головы едока — только обычный: портал под головой
      // перекрыт ею же, занятость проверяется раньше портала
      if (!unit(first)) continue;
      const tiles = [], thru = [], gated = [];
      let d = first, ok = true;
      for (let t = b + k - 1; t >= b; t--) {
        // портал в зазоре срабатывает ВСЕГДА (зазор пуст, отменить нечем):
        // либо он уносит луч ровно туда, куда идёт разрез, либо разреза нет
        const g = gates && gates.get(ck(cells[t]));
        if (g) {
          if (g[0] !== cells[t - 1][0] || g[1] !== cells[t - 1][1]) { ok = false; break; }
          thru.push(cells[t]);                     // клетка портала: плитке поворота тут не место
          gated.push(ck(cells[t]));
          continue;                                // направление сохраняется
        }
        const step = sub(cells[t - 1], cells[t]);
        if (!unit(step)) { ok = false; break; }    // разрыв без портала — вариант мёртвый
        if (eq(d, step)) { thru.push(cells[t]); continue; }
        tiles.push({ cell: cells[t], key: tileKey(sideName([-d[0], -d[1]]), sideName(step)) });
        d = step;
      }
      if (!ok) continue;
      if (aBodyLen >= 2) {
        if (!eq(sub(cells[b + k], cells[b + k + 1]), first)) continue;
        out.push({ b, k, dir: first, needFirstExt: null, tiles, thru, gated, stop: cells[b - 1] });
      } else {
        if (k === 0) continue;                     // без зазора хвост не дорастить, A[1] взять неоткуда
        out.push({ b, k, dir: first, needFirstExt: add(cells[b + k], first, -1), tiles, thru, gated,
                   stop: cells[b - 1] });
      }
    }
  }
  return out;
}

/* Совместимость с уже сложившимся полом: на клетке либо плитка, либо сквозной
   проход; плитка и стоп-клетка (хвост жертвы) не совмещаются в обе стороны —
   спина плитки могла бы закрыть чужой обед. Повороты доезжают в 98–100% сборок. */
function floorFits(opt, floor, stops, cap) {
  let fresh = 0;
  for (const t of opt.tiles) {
    const k = ck(t.cell);
    if (floor.thru.has(k) || stops.has(k)) return null;
    const was = floor.tiles.get(k);
    if (was === undefined) fresh++;
    else if (was !== t.key) return null;
  }
  for (const c of opt.thru) if (floor.tiles.has(ck(c))) return null;
  if (floor.tiles.has(ck(opt.stop))) return null;
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
  // клетка, на которой луч ОБЯЗАН остановиться: хвост жертвы. Мост на ней
  // означал бы, что луч над жертвой пролетел, — поэтому её надо знать снаружи
  return { state: next, move: { eater: A.id, prey: B.id, gap: k, apple: b === 1 },
           gapCells, stop: B.cells[b - 1].slice() };
}

/* ---------- раскладка пустот по ходам ----------
   `voids` — суммарная длина зазоров (след решения сверх цели). Огибающая —
   треугольник с вершиной в `peak`; передышки — ходы вплотную каждый
   `breather`-й, независимо от огибающей. */
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
          peak: 1, breather: 3, fake: 0, ...cfg, _nextId: 1 };
  // потолок разнообразия механик держит модалка; контракт генератора простой:
  // что в конфиге, то и на доске (скрытое обнуление — ложь ползунка)
  const MECHS = ['bridges', 'turns', 'apples', 'spiky', 'sleepy', 'portals'];

  const laid = walkGated(rnd, cfg);
  if (!laid) return null;
  const final = laid.cells, portals = laid.portals;
  const gates = new Map(portals.map(([x, y, u, v]) => [ck([x, y]), [u, v]]));

  const M = cfg.moves;
  const want = gapPlan(M, cfg.voids == null ? M : cfg.voids, cfg.peak, cfg.breather, cfg.maxGap);

  let state = [{ id: cfg._nextId++, cells: final }];
  const moves = [];
  const forbidden = new Set(final.map(ck));
  const floor = { tiles: new Map(), thru: new Set() };   // пол: где поворот, а где сквозной проход
  const gateCells = new Set();                  // вход и выход портала: и плитке, и мосту там не место
  for (const [x, y, u, v] of portals) { gateCells.add(ck([x, y])); gateCells.add(ck([u, v])); }
  for (const k of gateCells) floor.thru.add(k);
  let debt = 0;                                 // недобор зазоров, размазываем по оставшимся ходам
  const allGaps = [];                           // клетки, через которые летят лучи решения — кандидаты в мосты
  const stops = new Set();                      // а на этих лучи решения ОСТАНАВЛИВАЮТСЯ: там не место ни мосту, ни плитке
  let applesLeft = cfg.apples || 0;
  const gatesLeft = new Set(portals.map(([x, y]) => ck([x, y])));

  for (let step = 0; step < M; step++) {
    const f = M - 1 - step;                     // строим с конца: шаг 0 — последний ход решения
    const isRest = want[f] === 0 && cfg.breather > 0;
    // яблоко — безрисковый ход, место ему на передышках; если заказано больше,
    // чем передышек, разрешаем и на обычных — иначе бюджет не выбрать
    let restLeft = 0;
    for (let q = 0; q < f; q++) if (want[q] === 0 && cfg.breather > 0) restLeft++;
    const wantApple = applesLeft > 0 && (isRest || applesLeft > restLeft);
    const aim = isRest ? 0
      : Math.max(0, Math.min(cfg.maxGap, Math.round(want[f] + debt / (f + 1))));
    // кого резать: нужный зазор ищется СРЕДИ ВСЕХ змей (иначе бюджет не
    // выбирается), при равном k — по branch: случайная или самая длинная
    const order = rnd() < cfg.branch
      ? shuffled(rnd, state.map((_, i) => i))
      : state.map((_, i) => i).sort((a, b) => state[b].cells.length - state[a].cells.length);
    const rank = new Map(order.map((si, r) => [si, r]));
    const cand = [];
    for (const si of order)
      for (const opt of shuffled(rnd, splitOptions(state[si], cfg.maxGap, wantApple ? 1 : 2, gates)))
        cand.push({ si, opt });
    // пока заказанные повороты не набраны — предпочитаем варианты с плитками,
    // потом наоборот (без этого ручка «Поворотов 3» отдавала в среднем 1.9)
    for (const c of cand) c.fresh = floorFits(c.opt, floor, stops, cfg.turns || 0);
    const needTurns = (cfg.turns || 0) - floor.tiles.size;
    const fit = cand.filter((c) => c.fresh !== null);
    // ходы через незадействованный портал — первыми: иначе портал — декорация
    const fresh = (c) => c.opt.gated.some((g) => gatesLeft.has(g));
    fit.sort((a, b) => ((b.opt.b === 1) - (a.opt.b === 1))
      || (fresh(b) - fresh(a))
      || (Math.abs(a.opt.k - aim) - Math.abs(b.opt.k - aim))
      || (needTurns > 0 ? b.fresh - a.fresh : a.fresh - b.fresh)
      || (rank.get(a.si) - rank.get(b.si)));
    let done = null;
    for (const c of fit) {
      const r = unEat(rnd, cfg, state, c.si, c.opt);
      if (r) {
        floorTake(c.opt, floor); done = r;
        if (c.opt.b === 1) applesLeft--;
        for (const g of c.opt.gated) gatesLeft.delete(g);
        break;
      }
    }
    if (!done) break;
    if (!isRest) debt += want[f] - done.move.gap;
    state = done.state;
    moves.unshift(done.move);
    for (const s of state) for (const c of s.cells) forbidden.add(ck(c));
    for (const c of done.gapCells) { forbidden.add(ck(c)); allGaps.push(c); }
    stops.add(ck(done.stop));
  }
  if (moves.length < cfg.minMoves) return null;

  /* Обманки — только на клетках, которых решение не касается; совмещать пометки
     не даём (колючая соня — валун в форме змеи). Мост снимает запрет тени с одной
     клетки зазора, и обманка садится прямо на него — мост без змеи бессмыслен.
     Мосту запрещены: занятая клетка, плитка, вход/выход портала (отменил бы
     перенос) и стоп-клетка луча (над мостом обед не состоится). */
  const bridges = [];
  const busy = occSet(state);
  const gapPool = shuffled(rnd, allGaps.filter((c) => !busy.has(ck(c)) && !floor.tiles.has(ck(c))
    && !gateCells.has(ck(c)) && !stops.has(ck(c))));
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
  // спящей может быть кусок решения, который в плане ни разу не ест, — «спит»
  // о нём правда; яблоки и мостовые не в счёт (спят/лежат и так, бюджет съедали)
  const eaters = new Set(moves.map((m) => m.eater));
  let sleepLeft = cfg.sleepy || 0;
  for (const s of shuffled(rnd, state.filter((s) => !s.decoy && !s.apple && !s.sleep && !eaters.has(s.id)))) {
    if (sleepLeft <= 0) break;
    s.sleep = true; sleepLeft--;
  }

  const turns = [...floor.tiles].map(([k, v]) => {
    const [x, y] = k.split(',').map(Number);
    return [x, y, v[0], v[1]];
  });
  const lv0 = { bridges, turns, portals };       // пол, каким его увидит луч
  const brd = boardOf(lv0);

  /* Шипы может носить и та, что ест последней, — её хвоста решение не касается
     (мотив «эту не убрать, придётся кормить»). Монета 50/50 против приманки,
     чтобы цвет не выдавал ответ; нехватка приманок монету отменяет. */
  const wantSpiky = cfg.spiky || 0;
  const winner = moves.length ? moves[moves.length - 1].eater : null;
  let spikyLeft = wantSpiky;
  const watchers = [];                          // обманки, посаженные СМОТРЕТЬ в шипы
  const forced = wantSpiky > Math.max(0, cfg.decoys - sleepLeft);
  if (spikyLeft > 0 && winner != null && (forced || rnd() < 0.5)) {
    // шипы работают, только когда в хвост кто-то смотрит: ищем среди стоящих,
    // иначе сажаем наблюдателя-обманку (слот — обманочный)
    const seen = tailSeen(state, moves, cfg, lv0, winner);
    let ok = !!seen;
    if (seen) for (const q of seen.path) forbidden.add(ck(q));   // подлёт не занимать
    else for (const sp of shuffled(rnd, sightSpots(state, moves, cfg, forbidden, lv0, winner))) {
      const block = new Set(forbidden);
      for (const q of sp.path) block.add(ck(q));
      const len = 2 + Math.floor(rnd() * (cfg.decoyMax || 4));
      // голова — в клетку обзора, шея — прочь от хвоста: значит смотрит она в хвост
      const d = walk(rnd, cfg.w, cfg.h, len, block, sp.c, sp.away, 0.4);
      if (!d) continue;
      // последнее слово за настоящим лучом: на клетке хвоста может лежать мост
      // или спина плитки — без проверки шипы выходили краской
      const cand = { id: cfg._nextId, cells: d, decoy: true, trap: true };
      if (!tailSeen(state.concat([cand]), moves, cfg, lv0, winner)) continue;
      cfg._nextId++;
      watchers.push(cand);
      for (const q of d) forbidden.add(ck(q));
      for (const q of sp.path) forbidden.add(ck(q));
      ok = true; break;
    }
    if (ok) {
      state = state.concat(watchers);
      state.find((s) => s.id === winner).spiky = true;
      spikyLeft--;
    }
  }

  const clear = new Set();                     // подлёт к уже поставленной обманке — не занимать
  const markWant = spikyLeft + sleepLeft;      // слоты бюджета, которые держим под пометки

  /* Ложная ветка — цепочка взглядов на несколько ходов (обед доводит до головы
     съеденной и передаёт её взгляд). Вход — обязательно из решения: масса при
     обеде не наказывает никогда (сливается в едока), наказывает только геометрия —
     кусок решения, уехавший не туда. Ветка из одних обманок была бы просто ещё
     одним способом вырасти (замер: safety РОСЛА, 0.80 → 0.87). */
  const fake = [];
  const fakeWant = Math.max(0, cfg.fake || 0);
  if (fakeWant > 0) {
    // звенья короткие: роль звена — взгляд в следующее, не масса
    const linkLen = () => 2 + Math.floor(rnd() * Math.min(3, cfg.decoyMax || 4));
    // цепочка строится начерно и переносится только целиком — огрызок в одно
    // звено портил доску следующим попыткам
    const draft = (door) => {
      const links = [], busy = new Set(), keep = new Set();
      const put = (c, path, last) => {
        if (clear.has(ck(c)) || busy.has(ck(c)) || keep.has(ck(c))) return null;
        if (path.some((q) => clear.has(ck(q)) || busy.has(ck(q)))) return null;
        const block = new Set(forbidden);
        for (const q of clear) block.add(q);
        for (const q of busy) block.add(q);
        for (const q of keep) block.add(q);
        for (const q of path) block.add(ck(q));
        block.delete(ck(c));
        // следующее звено сядет на луч этого: из бросков берём позу с наибольшим
        // простором впереди (это выбор позы, обещание держит симуляция ниже)
        let best = null, room = -1;
        for (let a = 0; a < 8; a++) {
          const cells = walk(rnd, cfg.w, cfg.h, linkLen(), block, c, null, 0.4);
          if (!cells) continue;
          cells.reverse();                     // walk растит от начала — а нам нужен ХВОСТ в клетке
          if (last) return cells;              // последнему звену смотреть уже некуда
          const probe = state.concat(links).concat([{ id: -1, cells, decoy: true }]);
          const r = raycast(probe, probe.length - 1, cfg.w, cfg.h, brd);
          const free = r.path.filter((q) => !forbidden.has(ck(q)) && !clear.has(ck(q)) && !busy.has(ck(q))).length;
          if (free > room) { room = free; best = cells; }
        }
        return best;
      };
      const add = (cells, path) => {
        links.push({ id: cfg._nextId + links.length, cells, decoy: true, fake: true });
        for (const q of cells) busy.add(ck(q));
        for (const q of path) keep.add(ck(q));
      };
      // дверь: хвост первого звена — под луч куска решения, иначе в ветку некому войти
      const first = put(door.c, door.path, fakeWant === 1);
      if (!first) return null;
      add(first, door.path);
      // цепочка растёт симуляцией: после каждого звена ветка доигрывается
      // по-настоящему, следующее садится на луч, который видит доевший
      for (;;) {
        const states = planStates(state.concat(links), moves, cfg, lv0);
        let st = states[door.m];
        if (!st) return null;
        let j = st.findIndex((q) => q.id === door.sid);
        if (j < 0) return null;
        let n = 0;
        for (;;) {
          if (st[j].sleep || st[j].cells.length < 2) break;
          const r0 = raycast(st, j, cfg.w, cfg.h, brd);
          if (r0.kind !== 'tail' || !links.some((l) => l.id === st[r0.prey].id)) break;
          const eater = st[j].id;
          st = applyEat(st, j, r0); n++;
          j = st.findIndex((q) => q.id === eater);
        }
        if (n < links.length) return null;      // собранное не играется — эта дверь не годится
        if (links.length >= fakeWant) return { links, keep };
        const r = raycast(st, j, cfg.w, cfg.h, brd);
        let made = false;
        for (const c of shuffled(rnd, r.path.filter((q) => !forbidden.has(ck(q)) && !clear.has(ck(q)) && !busy.has(ck(q))))) {
          const before = r.path.slice(0, r.path.findIndex((q) => ck(q) === ck(c)));
          const cells = put(c, before, links.length + 1 >= fakeWant);
          if (!cells) continue;
          add(cells, before); made = true; break;
        }
        if (!made) return null;
      }
    };
    // двери (клетки на лучах кусков решения) ищутся на КАЖДОМ шагу плана — со
    // старта их почти нет по свойству построения (0.3 → 6.2 на уровень, ветка
    // собиралась на 25 → 107 из 200)
    const doors = [];
    planStates(state, moves, cfg, lv0).forEach((st, m) => {
      for (let i = 0; i < st.length; i++) {
        if (st[i].decoy || st[i].sleep || st[i].cells.length < 2) continue;
        const r = raycast(st, i, cfg.w, cfg.h, brd);
        const seen = [];
        for (const c of r.path) {
          if (!forbidden.has(ck(c)) && !clear.has(ck(c)))
            doors.push({ c: c.slice(), path: seen.map((q) => q.slice()), m, sid: st[i].id });
          seen.push(c.slice());
        }
      }
    });
    // двери от ранних к поздним: дверь на последнем шагу — развилка без цены
    const byStep = doors.reduce((a, d) => { (a[d.m] = a[d.m] || []).push(d); return a; }, {});
    const ordered = Object.keys(byStep).map(Number).sort((x, y) => x - y)
      .flatMap((m) => shuffled(rnd, byStep[m]));
    for (const door of ordered) {
      const got = draft(door);
      if (!got) continue;
      for (const l of got.links) { fake.push(l); for (const q of l.cells) forbidden.add(ck(q)); }
      for (const q of got.keep) clear.add(q);
      cfg._nextId += got.links.length;
      break;
    }
    state = state.concat(fake);
  }

  /* Приманки: пометка отличается от краски, только когда чей-то луч достаёт до
     хвоста — сажаем хвостом на такую клетку. Лучи считаются по доске с уже
     стоящими обманками, телу приманки нельзя ложиться на подлёт к своему хвосту.
     Приманки ставятся РАНЬШЕ обычных обманок: клеток под лучом мало, а недобор
     пометок бракует уровень целиком. */
  const traps = [];
  for (const sp of shuffled(rnd, trapSpots(state, moves, cfg, forbidden, lv0))) {
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

  /* Обычная обманка тоже играет, а не лежит мебелью (замер: раньше 42–60% смотрели
     в край, тап терял): голова в клетку обзора чужого хвоста (sightSpots) либо
     хвост под чужой луч (trapSpots), роли чередуются. Последнее слово — за
     настоящим raycast по итоговой доске. */
  const decoys = [];
  const see = shuffled(rnd, sightSpots(state, moves, cfg, forbidden, lv0, null));
  const bait = shuffled(rnd, trapSpots(state, moves, cfg, forbidden, lv0));
  const build = (sp, head) => {
    if (clear.has(ck(sp.c)) || sp.path.some((q) => clear.has(ck(q)))) return null;
    const block = new Set(forbidden);
    for (const q of sp.path) block.add(ck(q));
    for (const q of clear) block.add(q);
    block.delete(ck(sp.c));
    const len = 2 + Math.floor(rnd() * (cfg.decoyMax || 4));
    // голова — в клетку обзора, шея — прочь от чужого хвоста: значит смотрит она в него
    const d = walk(rnd, cfg.w, cfg.h, len, block, sp.c, head ? sp.away : null, 0.4);
    if (!d) return null;
    if (!head) d.reverse();                    // walk растит от начала — а нам нужен ХВОСТ в клетке
    return d;
  };
  for (let t = 0; t < Math.max(0, cfg.decoys - markWant - watchers.length - fake.length); t++) {
    let d = null;
    const order = t % 2 === 0 ? [[see, true], [bait, false]] : [[bait, false], [see, true]];
    for (const [pool, head] of order) {
      while (pool.length && !d) {
        const sp = pool.pop();
        const cells = build(sp, head);
        if (!cells) continue;
        // обещание проверяется настоящим лучом: споты считались без соседей,
        // и ранняя обманка запросто перекрывает подлёт следующей
        const test = state.concat(decoys).concat([{ id: cfg._nextId, cells, decoy: true }]);
        if (head) {                            // обещали законный ход — упирается ли луч в хвост
          if (raycast(test, test.length - 1, cfg.w, cfg.h, brd).kind !== 'tail') continue;
        } else {                               // обещали съедобность — достаёт ли кто до её хвоста
          if (!tailSeen(test, moves, cfg, lv0, cfg._nextId)) continue;
        }
        d = cells;
        for (const q of sp.path) clear.add(ck(q));
      }
      if (d) break;
    }
    // роль не нашлась — бросок наугад, но из бросков берём тот, чей луч упирается
    // в чужой хвост; подлёты чужих ловушек обходим (мебель и брак по markUse)
    if (!d) {
      const free = new Set(forbidden);
      for (const q of clear) free.add(q);
      for (let a = 0; a < 24 && !d; a++) {
        const cells = walk(rnd, cfg.w, cfg.h, 2 + Math.floor(rnd() * (cfg.decoyMax || 4)), free, null, null, 0.4);
        if (!cells) continue;
        const test = state.concat(decoys).concat([{ id: cfg._nextId, cells, decoy: true }]);
        if (a < 23 && raycast(test, test.length - 1, cfg.w, cfg.h, brd).kind !== 'tail') continue;
        d = cells;                             // на последней попытке берём что есть: недобор хуже мебели
      }
    }
    if (!d) continue;
    decoys.push({ id: cfg._nextId++, cells: d, decoy: true });
    for (const c of d) forbidden.add(ck(c));
  }
  state = state.concat(decoys);
  return { w: cfg.w, h: cfg.h, snakes: state, moves, len: cfg.len, portals,
           mechs: MECHS.filter((k) => (cfg[k] || 0) > 0),
           apples: moves.filter((m) => m.apple).length,
           decoys: decoys.length + traps.length + bridges.length + watchers.length + fake.length, bridges, turns,
           voids: moves.reduce((a, m) => a + m.gap, 0), want, peak: cfg.peak, breather: cfg.breather };
}

/* Доска на каждом шагу задуманного решения: до первого хода, после первого и так
   далее. Одно место на всех, кто идёт по плану вперёд, — а таких уже трое. */
function planStates(start, moves, cfg, lv) {
  const br = boardOf(lv);
  const out = [];
  let state = start.map((s) => ({ ...s, cells: s.cells.map((c) => c.slice()) }));
  for (let m = 0; ; m++) {
    out.push(state);
    if (m >= moves.length) break;
    const i = state.findIndex((s) => s.id === moves[m].eater);
    if (i < 0) break;
    const r = raycast(state, i, cfg.w, cfg.h, br);
    if (r.kind !== 'tail') break;
    state = applyEat(state, i, r);
  }
  return out;
}

// смотрит ли кто-то в хвост змеи id хоть на одном шагу решения (шипы без такого
// луча — краска, это же меряет markUse)
function tailSeen(start, moves, cfg, lv, id) {
  const br = boardOf(lv);
  for (const state of planStates(start, moves, cfg, lv)) {
    for (let i = 0; i < state.length; i++) {
      if (state[i].sleep) continue;                     // спящая никуда не смотрит
      const r = raycast(state, i, cfg.w, cfg.h, br);
      if ((r.kind === 'tail' || r.kind === 'spikyTail') && state[r.prey].id === id) return r;
    }
  }
  return null;
}

/* Клетки, откуда виден хвост змеи id, с подлётом. Подлёт — только по клеткам вне
   запретного списка (там чистый пол навсегда: весь рельеф лежит на клетках
   решения и зазоров). Клетка хвоста — чужая, пол под ней любой, поэтому здесь
   кандидаты, а судит настоящий raycast на месте. */
function sightSpots(start, moves, cfg, forbidden, lv, id) {
  const out = [], seen = new Set();
  for (const state of planStates(start, moves, cfg, lv)) {
    // id === null — «чей угодно хвост» (обычной обманке нужен факт хода)
    const tgts = id == null ? state : state.filter((s) => s.id === id);
    if (id != null && !tgts.length) break;
    for (const tgt of tgts) {
      const T = tgt.cells[tgt.cells.length - 1];
      for (const d of DIRS) {
        const path = [];                                // клетки МЕЖДУ головой и хвостом
        for (let c = add(T, d); inside(cfg.w, cfg.h, c) && !forbidden.has(ck(c)); c = add(c, d)) {
          const k = ck(c) + sideName(d);
          if (!seen.has(k)) { seen.add(k);
            out.push({ c: c.slice(), away: d, path: path.map((q) => q.slice()) }); }
          path.push(c.slice());
        }
      }
    }
  }
  return out;
}

// клетки, куда чей-нибудь луч долетает по ходу решения: хвост, поставленный
// туда, съедобен (или колюч — тогда соблазн-авария)
function trapSpots(start, moves, cfg, forbidden, lv) {
  const out = [], seen = new Set();
  const br = boardOf(lv);
  for (const state of planStates(start, moves, cfg, lv)) {
    const occ = occSet(state);
    for (const s of state) {
      if (s.cells.length < 2 || s.sleep) continue;      // спящая никуда не смотрит
      let d = [s.cells[0][0] - s.cells[1][0], s.cells[0][1] - s.cells[1][1]];
      const own = br.turns.get(ck(s.cells[0]));         // голова в жёлобе: стенка держит и изнутри,
      if (own) {                                        // такой луч не долетает никуда
        const outSide = sideName(d);
        if (own[0] !== outSide && own[1] !== outSide) continue;
      }
      let c = add(s.cells[0], d);
      const path = [];                                  // клетки ПЕРЕД ловушкой: должны остаться пустыми
      while (inside(cfg.w, cfg.h, c) && !occ.has(ck(c))) {
        if (br.bridges.has(ck(c))) { path.push(c.slice()); c = add(c, d); continue; }
        const t = br.turns.get(ck(c));
        if (t) {
          const from = sideName([-d[0], -d[1]]);
          if (t[0] !== from && t[1] !== from) break;     // в спину поворота луч не пройдёт
          d = SIDES[t[0] === from ? t[1] : t[0]];
        } else if (!forbidden.has(ck(c)) && !seen.has(ck(c))) {
          seen.add(ck(c)); out.push({ c: c.slice(), path: path.map((q) => q.slice()) });
        }
        path.push(c.slice());
        c = add(c, d);
      }
    }
  }
  return out;
}

/* ---------- обязательная проверка вперёд ---------- */
export function verify(lv) {
  const br = boardOf(lv);
  // ЧЕРЕЗ stateOf, а не своей сборкой: та теряла spiky и sleep, и проверка шла
  // по доске, где колючий хвост съедобен, а собственная проверка «спящую
  // заставили ходить» не могла сработать никогда — sleep там всегда undefined.
  let state = stateOf(lv);
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
