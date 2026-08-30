/* Полоса G пака «Комнаты»: большие ПЛОТНЫЕ уровни обратным построением.

   Прямой строитель genrooms30 сажает змей по одной, и каждой нужна чистая
   линия луча здесь-и-сейчас — в тесной комнате он захлёбывается (замер:
   25 тысяч отказов посадки на полосе D при perRoom 4–6 против 6–7 отказов
   единственности финала). Поэтому здесь идём от конца, как generator.mjs:

     финал комнаты F = НОВАЯ МАССА ++ ЧЕМПИОН (одна змея, один путь),

   и режем её обратными ходами. Разрез впритык (зазор 0) не сдвигает ничей
   хвост: куски стоят нос-в-хвост вдоль пути, и финал комнаты ЕДИНСТВЕНЕН по
   построению — любой порядок сборки склеивает те же клетки в тот же путь.
   Разрез с зазором дополняется сдвигом хвоста едока назад: сдвиг ЧЕМПИОНА
   идёт по его же прежнему телу и в данные уровня не попадает вовсе (чистая
   бухгалтерия индексов), сдвиг куска новой массы дорастает хвост в свободные
   клетки, как unEat генератора.

   Сложность полосы НЕ в плотности — в целевых ловушках. Урок, оплаченный
   игрой автора: одни разрезы впритык коммутируют, уровень проходился жадным
   тапом по одной змее; а поскольку съевший перенимает взгляд съеденного,
   почти любой «неправильный» обед бесшовно сходится к тому же финалу, и
   случайные хвосты жадного не ловят. Ловит только замурованная линия — см.
   planTrap. Каждая комната со второй несёт одну такую ловушку, и приёмка
   ТРЕБУЕТ провала жадной пробы (greedyEats) в каждой из них; explore при
   этом подтверждает решаемость, единственность финала и меряет ловушки. */
import fs from 'fs';
import * as G from './generator.mjs';
import { ctxAt, explore, solveStage } from './genrooms30.mjs';

const key = (c) => c[0] + ',' + c[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, d) => [a[0] + d[0], a[1] + d[1]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const inRect = (r, [x, y]) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
/* Комната 6×6, не 5×5, как у полос A–F: целевой ловушке нужны СКЛАДКИ пути
   (клетки, соседние на доске и далёкие по пути) рядом с прямыми границами
   разрезов, а в массе 12–14 клеток на 5×5 — два с половиной ряда серпантина,
   и эти условия не пересекаются (замер: 0 планов на 500 путей). В 6×6 путь
   18–22 клетки, рядов больше — планы находятся. Доска 12×18. */
const RW = 6, RH = 6;
function rectsOf(grid) {
  const [cols, rows] = grid, out = [];
  for (let r = 0; r < rows; r++) {
    const xs = [...Array(cols).keys()];
    if (r % 2) xs.reverse();
    for (const c of xs) out.push({ x: c * RW, y: r * RH, w: RW, h: RH });
  }
  return out;
}

export const BAND_G = {
  tag: 'G', grid: [2, 3], mass: [18, 22], piece: [2, 5],
  trapsMin: 2, trapsMax: 6, subMax: 2,
};

/* ---------- путь новой массы ----------
   Идём ОТ хвоста: первая клетка пути — куда смотрит чемпион (c0 + взгляд),
   дальше тянемся в комнату и вьёмся по ней плотно; голова пути станет головой
   финала, то есть головой чемпиона следующей стадии, — её тянем к двери
   следующей комнаты, а её взгляд обязан упираться не в своё тело и не в чужую
   крышку, иначе следующей стадии не начать. Жмёмся к занятому и краям
   (freeAround меньше — лучше): так путь заполняет комнату серпантином, а не
   бросает дыры посередине. */
export function massWalk(rnd, W, H, len, blocked, start, rect, doorRect) {
  const freeAround = (c, used) => G.DIRS.reduce((n, d) => {
    const t = add(c, d);
    return n + (t[0] >= 0 && t[1] >= 0 && t[0] < W && t[1] < H
      && !blocked.has(key(t)) && !used.has(key(t)) ? 1 : 0);
  }, 0);
  for (let attempt = 0; attempt < 40; attempt++) {
    const cells = [start.slice()], used = new Set([key(start)]);
    let cur = start.slice(), dir = null, dead = false;
    while (cells.length < len) {
      const opts = [];
      for (const d of G.DIRS) {
        const n = add(cur, d);
        if (n[0] < 0 || n[1] < 0 || n[0] >= W || n[1] >= H) continue;
        if (blocked.has(key(n)) || used.has(key(n))) continue;
        if (!inRect(rect, n) && inRect(rect, cur)) continue;  // вошёл в комнату — не выходи
        opts.push({ d, n });
      }
      if (!opts.length) { dead = true; break; }
      let chosen;
      if (!inRect(rect, cur)) {
        // ещё снаружи: шаг, приближающий к комнате
        const dist = (c) => Math.max(rect.x - c[0], c[0] - (rect.x + rect.w - 1), 0)
                          + Math.max(rect.y - c[1], c[1] - (rect.y + rect.h - 1), 0);
        opts.sort((a, b) => dist(a.n) - dist(b.n));
        chosen = opts[0];
      } else {
        /* Прямой шаг в приоритете: длинные прямые складывают путь СЕРПАНТИНОМ
           ряд-за-рядом, и соседние ряды дают складки — клетки, близкие на
           доске и далёкие по пути, — на которых держится целевая ловушка.
           Прижимной шаг (первым — сосед с меньшим числом свободных клеток
           вокруг) заполнял комнату КОЛЬЦОМ по периметру, а у кольца складок
           нет: близко на доске = близко и по пути (замер: 0 кандидатов
           ловушки на 66 путях). Прижим остаётся запасным — он не даёт пути
           бросать дыры, когда прямой шаг упёрся. */
        const straight = dir && opts.find((o) => eq(o.d, dir));
        if (straight && rnd() < 0.75) chosen = straight;
        else {
          opts.sort((a, b) => freeAround(a.n, used) - freeAround(b.n, used));
          chosen = rnd() < 0.7 ? opts[0] : opts[Math.floor(rnd() * opts.length)];
        }
      }
      cur = chosen.n; dir = chosen.d; cells.push(cur.slice()); used.add(key(cur));
    }
    if (dead || cells.length !== len) continue;
    const path = cells.slice().reverse();          // голова — последняя клетка обхода
    /* Взгляд головы — это взгляд чемпиона на старте следующей стадии: он обязан
       упираться в СЛЕДУЮЩУЮ комнату (сейчас она закрыта — потому не смотрим на
       blocked, крышка откроется ровно к нужному моменту). У последней комнаты
       следующей стадии нет — взгляд свободен. */
    if (doorRect) {
      const look = add(path[0], sub(path[0], path[1]));
      if (look[0] < 0 || look[1] < 0 || look[0] >= W || look[1] >= H) continue;
      if (used.has(key(look)) || !inRect(doorRect, look)) continue;
    }
    return path;
  }
  return null;
}

/* Прямой ли разрез пути cells на позиции b с зазором k: едок cells[b+k] обязан
   смотреть сквозь зазор точно в хвост жертвы cells[b-1] — все шаги на одной
   прямой (поворотов в комнатах нет, гнуть луч нечем). */
export function straightCut(cells, b, k) {
  if (b < 2 || b + k > cells.length - 2) return false;    // жертве нужен взгляд, едоку — шея
  const first = sub(cells[b + k - 1], cells[b + k]);
  if (Math.abs(first[0]) + Math.abs(first[1]) !== 1) return false;
  /* t доходит до b ВКЛЮЧИТЕЛЬНО: последний шаг — от зазора к хвосту жертвы —
     тоже обязан лежать на прямой, как в splitOptions генератора (t >= b).
     С «t > b» зазоры садились на изгибы пути, жертва выпадала из линии луча,
     и НИ ОДНА стадия с зазором не игралась вперёд (замер: startOk 0 из 111
     построенных). Ровно такой же off-by-one уже ловили в ending.mjs. */
  for (let t = b + k - 1; t >= b; t--)
    if (!eq(sub(cells[t - 1], cells[t]), first)) return false;
  return eq(sub(cells[b + k], cells[b + k + 1]), first);
}

/* Разбить новую массу на куски 2..5, между кусками — зазоры из бюджета.
   Разрез впритык (зазор 0) ничего не сдвигает; разрез с зазором k — это
   «отрезать кусок и сдвинуть хвост едока назад на k»: чемпион сдвигается
   ровно по СВОЕМУ прежнему телу (клетки известны, ходить некуда — чистая
   бухгалтерия), поэтому в комнатах с чемпионом зазор бесплатен. Зазор же
   оставляет в комнате пустые клетки пути — линии обстрела, в которые могут
   свеситься хвосты подразрезов: так рождаются запирающие порядки.
   Возвращает куски [{start, size, gap}] от головы пути или null. */
function partition(rnd, cells, nmLen, piece, gapBudget) {
  for (let t = 0; t < 30; t++) {
    const out = []; let i = 0, ok = true, budget = gapBudget;
    while (i < nmLen) {
      const rest = nmLen - i;
      if (rest <= piece[1] && rest >= piece[0] && (i > 0 || rest <= 4)) { out.push({ start: i, size: rest, gap: 0 }); break; }
      /* Головной кусок — крупный (5..7): он единственный кандидат в целевую
         ловушку (живёт дольше всех и не бывает законной жертвой поздних
         зазоров), а разрез с зазором требует от него пять клеток минимум.
         Зазоры — только на границах ПОСЛЕ первого куска: зазор первой
         границы стреляется, когда головной кусок — законная жертва, и
         ловушку там не подвесить. */
      const lo = i === 0 ? Math.min(5, rest - piece[0]) : piece[0];
      const hi = i === 0 ? Math.min(7, rest - piece[0]) : piece[1];
      const opts = [];
      for (let s = lo; s <= hi; s++) {
        for (let g = 0; g <= (i === 0 ? 0 : Math.min(budget, 2)); g++) {
          if (rest - s - g < piece[0]) continue;
          if (!straightCut(cells, i + s, g)) continue;
          opts.push({ s, g });
        }
      }
      if (!opts.length) { ok = false; break; }
      // зазор охотнее, пока бюджет не потрачен: ловушки живут вокруг зазоров
      const withGap = opts.filter((o) => o.g > 0);
      const pickFrom = budget > 0 && withGap.length && rnd() < 0.65 ? withGap : opts;
      const c = pickFrom[Math.floor(rnd() * pickFrom.length)];
      out.push({ start: i, size: c.s, gap: c.g });
      i += c.s + c.g; budget -= c.g;
    }
    if (!ok) continue;
    // без зазора на поздней границе целевую ловушку не подвесить вовсе
    if (gapBudget > 0 && !out.some((p, j) => j > 0 && p.gap > 0)) continue;
    return out;
  }
  return null;
}

/* Раскроить участок пути [from..to) на куски 2..5 разрезами впритык. */
function chopStraight(rnd, fullPath, from, to, piece) {
  if (from === to) return [];
  if (to - from < piece[0]) return null;
  for (let t = 0; t < 20; t++) {
    const out = []; let i = from, ok = true;
    while (i < to) {
      const rest = to - i;
      if (rest <= piece[1] && rest >= piece[0]) { out.push({ start: i, size: rest, gap: 0 }); break; }
      const sizes = [];
      for (let s = piece[0]; s <= piece[1]; s++)
        if (rest - s >= piece[0] && straightCut(fullPath, i + s, 0)) sizes.push(s);
      if (!sizes.length) { ok = false; break; }
      const s = sizes[Math.floor(rnd() * sizes.length)];
      out.push({ start: i, size: s, gap: 0 }); i += s;
    }
    if (ok) return out;
  }
  return null;
}

/* План целевой ловушки — ДО раскроя, а не после. Замер убил надежду на
   случай: хвост головного куска оказывался в 2–3 клетках от зазора, впритык —
   ни разу на сотнях попыток. Поэтому ищем в серпантине СКЛАДКУ: пару клеток
   nm[ti] / nm[gj], соседних на доске, но далёких по пути, — и ставим границы
   ровно туда: P1 = nm[0..ti] (пять-семь клеток, будущий висящий кусок E),
   зазор цепочки — на границе gj. Разрез P1 с зазором 1 доращивает хвост E в
   nm[gj]: чемпион, дострелявшись до этой линии, видит хвост E ПЕРВЫМ —
   съесть его можно, но хвост замурует линию навсегда, и жертва за ней
   осиротеет (проверено explore: это честный тупик, не авария). Правильный
   ход — сначала дать E съесть голову своего же куска и сдвигом уползти. */
export function planTrap(rnd, nm, fullPath, occ, W, H, piece) {
  const n = nm.length, cands = [];
  const occPlan = new Set(occ); for (const c of nm) occPlan.add(key(c));
  for (let t = 4; t <= n - 5; t++) {                       // хвост куска-ловушки Q
    if (!straightCut(fullPath, t + 1, 0)) continue;        // граница после Q — прямая
    for (let gj = t + 3; gj <= n - 2; gj++) {
      /* Складка впритык на серпантине редка — складки живут на углах пути, а
         прямые границы разрезов на серединах прямых (замер: 0 совпадений на
         66 путях). Потому дотягиваемся и через свободную клетку ВНЕ пути:
         сдвиг на 2 вместо 1. */
      const d = Math.abs(nm[t][0] - nm[gj][0]) + Math.abs(nm[t][1] - nm[gj][1]);
      let ext = null;
      if (d === 1) ext = [nm[gj].slice()];
      else if (d === 2) {
        const mid2 = G.DIRS.map((v) => add(nm[t], v)).find((m) => m[0] >= 0 && m[1] >= 0
          && m[0] < W && m[1] < H && !occPlan.has(key(m))
          && Math.abs(nm[gj][0] - m[0]) + Math.abs(nm[gj][1] - m[1]) === 1);
        if (mid2) ext = [mid2, nm[gj].slice()];
      }
      if (!ext) continue;
      for (let g = 1; g <= 2 && gj + g <= n; g++) {
        if (!straightCut(fullPath, gj, g)) continue;       // сам зазор — прямой
        for (let a = Math.max(0, t - 6); a <= t - 4 - (ext.length - 1); a++) {
          if (a > 0 && (a < piece[0] || !straightCut(fullPath, a, 0))) continue;
          const q = nm.slice(a, t + 1);
          let spot = false;
          for (let b = 2; b + ext.length <= q.length - 2; b++)
            if (straightCut(q, b, ext.length)) { spot = true; break; }
          if (spot) cands.push({ a, t, gj, g, ext });
        }
      }
    }
  }
  while (cands.length) {
    const { a, t, gj, g, ext } = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
    const pre = chopStraight(rnd, fullPath, 0, a, piece);
    if (!pre) continue;
    const mid = chopStraight(rnd, fullPath, t + 1, gj, piece);
    if (!mid || !mid.length) continue;   // зазору нужен свой кусок-жертва
    const rest = chopStraight(rnd, fullPath, gj + g, n, piece);
    if (!rest) continue;
    mid[mid.length - 1].gap = g;
    const parts = pre.concat([{ start: a, size: t + 1 - a, gap: 0 }], mid, rest);
    return { parts, qIndex: pre.length, gj, g, ext };
  }
  return null;
}

/* Общий обратный ход на куске новой массы: жертва — голова куска, едок —
   остаток с хвостом, ДОРОЩЕННЫМ в свободные клетки. Урок первой сборки,
   оплаченный игрой автора: разрезы впритык вдоль одного пути КОММУТИРУЮТ —
   куски сливаются в тот же финал при любом порядке, жадный тап по самой
   длинной змее проходил комнату насквозь, и выбора не было (ровно об этом
   предупреждает шапка generator.mjs: без доращивания доска — «одна нитка
   пути»). Поэтому зазор здесь правило (80% разрезов), а не приправа: хвост
   едока уходит с пути, повисает в чужих линиях обстрела, и порядок сборки
   перестаёт читаться с доски. Хвосту нельзя в собственный зазор — вперёд-ход
   обязан пройти лучом по зазору, а хвост стоит там до самого сдвига (клетки
   зазора в occNow ещё числятся занятыми куском — walk их не возьмёт). */
function generalCut(rnd, cells, occNow, W, H, magnets) {
  const n = cells.length;
  const opts = [];
  for (let b = 2; b <= n - 2; b++)
    for (let k = 0; k <= 2 && b + k <= n - 2; k++)
      if (straightCut(cells, b, k)) opts.push({ b, k });
  if (!opts.length) return null;
  const withGap = opts.filter((o) => o.k > 0);
  const pool = withGap.length && rnd() < 0.8 ? withGap : opts;
  const { b, k } = pool[Math.floor(rnd() * pool.length)];
  const prey = cells.slice(0, b), gap = cells.slice(b, b + k);
  let ext = [];
  if (k > 0) {
    /* Магнитные клетки — зазоры чемпионской цепочки и уже отложенных пар:
       хвост, ДОРОЩЕННЫЙ в чужую линию обстрела, — единственный известный
       способ дать жадному игроку соблазнительный ФАТАЛЬНЫЙ обед. Съеденный
       раньше времени кусок замуровывает линию навсегда (клетки при обеде не
       исчезают), а правильный ход — дать куску самому съесть свою жертву и
       сдвигом уползти с линии. Поэтому из вариантов доращивания берём тот,
       чей КОНЧИК лёг на магнит, — случайный хвост попадает в линию слишком
       редко (замер: 2028 отказов жадной пробы на 40 сидов без магнитов). */
    const anchor = cells[n - 1];
    let best = null;
    for (const d of G.DIRS.slice().sort(() => rnd() - 0.5)) {
      const s0 = add(anchor, d);
      if (s0[0] < 0 || s0[1] < 0 || s0[0] >= W || s0[1] >= H || occNow.has(key(s0))) continue;
      for (let tr = 0; tr < 3; tr++) {
        const w = G.walk(rnd, W, H, k, occNow, s0, null, 0.4);
        if (!w || w.length !== k) continue;
        const hit = magnets && magnets.has(key(w[k - 1]));
        if (hit) { best = w; break; }
        if (!best) best = w;
      }
      if (best && magnets && magnets.has(key(best[best.length - 1]))) break;
    }
    if (!best) return null;
    ext = best;
  }
  return { prey, gap, eater: cells.slice(b + k).concat(ext.map((c) => c.slice())) };
}

/* ---------- одна стадия обратным построением ---------- */
export function buildStageReverse(rnd, champion, rect, band, ctx, W, H, doorRect, wantSub) {
  const occ = new Set();                        // занято в финале: чемпион и крышки
  if (champion) for (const c of champion.cells) occ.add(key(c));
  for (const k of ctx.closed) occ.add(k);

  let start, mass = band.mass[0] + Math.floor(rnd() * (band.mass[1] - band.mass[0] + 1));
  if (champion) {
    start = add(champion.cells[0], G.facing(champion.cells));
    if (start[0] < 0 || start[1] < 0 || start[0] >= W || start[1] >= H) return null;
    if (occ.has(key(start))) return null;
  } else {
    start = [rect.x + Math.floor(rnd() * rect.w), rect.y + Math.floor(rnd() * rect.h)];
  }
  const nm = massWalk(rnd, W, H, mass, occ, start, rect, doorRect);
  if (!nm) return null;

  /* Прямизну разреза у самой границы с чемпионом проверяет полный путь:
     последняя клетка массы стоит ровно на линии его взгляда по построению,
     но раскрой должен видеть шею. Комната с чемпионом обязана нести целевую
     ловушку — без неё жадный тап проходит её насквозь (замер: 2028 отказов
     жадной пробы на случайных хвостах); сдвиг чемпиона назад при зазоре идёт
     по его собственному прежнему телу и в данные уровня не попадает. Первая
     комната безопасна по правилу пака — там простой раскрой без зазоров. */
  const fullPath = nm.concat(champion ? champion.cells.map((c) => c.slice()) : []);
  const plan = champion ? planTrap(rnd, nm, fullPath, occ, W, H, band.piece) : null;
  if (champion && !plan) return null;
  const parts = plan ? plan.parts : partition(rnd, fullPath, nm.length, band.piece, 0);
  if (!parts) return null;

  // куски от головы пути; клетки зазоров пусты на старте — линии обстрела
  const occNow = new Set(occ); for (const c of nm) occNow.add(key(c));
  for (const p of parts)
    for (let g = 0; g < p.gap; g++) occNow.delete(key(nm[p.start + p.size + g]));

  /* Посадка ловушки по плану: P1 режется с зазором 1, его хвост-едок E
     дорастает ровно в nm[gj] — первую клетку зазора цепочки. Повторный
     разрез E отрастил бы ему новый хвост и превратил бы ловушку в аварию,
     потому E помечен noCut. */
  const pieces = parts.map((p) => ({ cells: nm.slice(p.start, p.start + p.size) }));
  let subs = 0, gaps = 0, planted = 0;
  for (const p of parts) gaps += p.gap;
  const extras = [];
  if (plan) {
    const q = pieces[plan.qIndex].cells, k = plan.ext.length;
    const spots = [];
    for (let b = 2; b + k <= q.length - 2; b++) if (straightCut(q, b, k)) spots.push(b);
    const b = spots[Math.floor(rnd() * spots.length)];
    for (let g = 0; g < k; g++) occNow.delete(key(q[b + g]));
    for (const c of plan.ext) occNow.add(key(c));
    extras.push({ cells: q.slice(0, b) });
    pieces[plan.qIndex] = { cells: q.slice(b + k).concat(plan.ext.map((c) => c.slice())), noCut: true };
    planted = 1; subs++;
  }

  /* Остальное перемешивание — рекурсивные разрезы со свободным доращиванием:
     они прячут порядок сборки и дают текстуру, но сами по себе жадного не
     ловят (замер: 2028 отказов жадной пробы на 40 сидов без целевых ловушек
     при тех же разрезах). Сколько выбора вышло на самом деле, меряет explore
     и жадная проба в приёмке, не построение. */
  const snakes = extras.slice();
  const queue = pieces.map((q) => (q.noCut ? { cells: q.cells, noCut: true } : { cells: q.cells }));
  let cutBudget = wantSub ? 1 + Math.floor(rnd() * 2) : 1;
  const magnets = new Set();
  for (const p of parts)
    for (let g = 0; g < p.gap; g++) magnets.add(key(nm[p.start + p.size + g]));
  while (queue.length) {
    const { cells: B, noCut } = queue.shift();
    if (!noCut && cutBudget > 0 && snakes.length + queue.length < 7 && B.length >= 5 && rnd() < 0.6) {
      const r = generalCut(rnd, B, occNow, W, H, magnets);
      if (r) {
        cutBudget--; subs++;
        for (const c of r.gap) { occNow.delete(key(c)); magnets.add(key(c)); }
        for (const c of r.eater.slice(r.eater.length - (r.gap.length || 0))) occNow.add(key(c));
        queue.push({ cells: r.prey }, { cells: r.eater });
        continue;
      }
    }
    snakes.push({ cells: B.map((c) => c.slice()) });
  }
  return { snakes, subs, gaps, planted, head: nm[0], neck: nm[1] };
}

/* Жадная проба — метрика ровно на жалобу автора «тыкаешь в одну змею, и она
   ест всех подряд»: на каждом шаге ест самая длинная змея, у которой есть
   обед (чемпион почти всегда). Если так комната ПРОХОДИТСЯ — выбора в ней
   нет, и стадия бракуется (кроме первой: та безопасна по правилу пака, а
   в безопасной комнате любой порядок годится по определению). */
function greedyEats(snakes, ctx, W, H) {
  let st = ctx.wall ? snakes.concat([ctx.wall]) : snakes;
  const done = ctx.wall ? 2 : 1;
  for (let guard = 0; guard < 300; guard++) {
    if (st.length === done) return true;
    const mv = G.movesOf(st, W, H, ctx.board).filter((m) => m.eat);
    if (!mv.length) return false;
    let best = mv[0];
    for (const m of mv) if (st[m.i].cells.length > st[best.i].cells.length) best = m;
    st = G.applyEat(st, best.i, best.ray);
  }
  return false;
}

/* ---------- уровень целиком ---------- */
export const WHY = { seed: 0, start: 0, multi: 0, room1: 0, trapcap: 0, brutal: 0, tame: 0, greedy: 0, planted: 0, plantedGreedy: 0, stage: {} };
export function buildLevel(band, seed) {
  const rnd = G.makeRng(seed);
  const rects = rectsOf(band.grid);
  const W = band.grid[0] * RW, H = band.grid[1] * RH;
  const sections = [], safeties = [];
  let champion = null, traps = 0;
  for (let k = 0; k < rects.length; k++) {
    const ctx = ctxAt(rects, k + 1, W, H);
    const doorRect = k + 1 < rects.length ? rects[k + 1] : null;
    let ok = null;
    for (let t = 0; t < 400 && !ok; t++) {
      const wantSub = k > 0;                       // первая комната безопасна всегда
      const got = buildStageReverse(rnd, champion, rects[k], band, ctx, W, H, doorRect, wantSub);
      if (!got) { WHY.seed++; continue; }
      const st = (champion ? [{ cells: champion.cells }] : [])
        .concat(got.snakes.map((s) => ({ cells: s.cells, spiky: false, sleep: false })));
      if (st.length < 2) continue;
      const r = explore(st.map((s) => ({ cells: s.cells.map((c) => c.slice()), spiky: false, sleep: false })), ctx, W, H);
      if (!r.startOk) { WHY.start++; continue; }   // по построению не должно случаться
      if (r.finals.length !== 1) { WHY.multi++; continue; }
      if (k === 0 && (r.locked > 0 || r.eatSafety < 1)) { WHY.room1++; continue; }
      if (r.locked > 0 && traps >= band.trapsMax) { WHY.trapcap++; continue; }
      if (r.eatSafety < 0.3) { WHY.brutal++; continue; }
      if (k > 0) {
        // выбор обязан быть настоящим: ловушка есть, часть обедов ведёт в тупик,
        // и жадный тап по самой длинной змее комнату НЕ проходит
        if (got.planted) WHY.planted++;
        if (r.locked < 1 || r.eatSafety > 0.92) { WHY.tame++; continue; }
        if (greedyEats(st.map((s) => ({ cells: s.cells.map((c) => c.slice()), spiky: false, sleep: false })), ctx, W, H)) {
          if (got.planted) WHY.plantedGreedy++;
          WHY.greedy++; continue;
        }
      }
      ok = { got, r };
    }
    if (!ok) { WHY.stage[k] = (WHY.stage[k] || 0) + 1; return null; }
    sections.push({ ...rects[k], snakes: ok.got.snakes.map((s) => ({ cells: s.cells })) });
    champion = ok.r.finals[0];
    if (ok.r.locked > 0) traps++;
    safeties.push(ok.r.eatSafety);
  }
  if (traps < band.trapsMin) return null;
  // плотность: клетки НОВЫХ змей к клеткам комнаты — то, ради чего полоса живёт
  const dens = sections.map((s) => s.snakes.reduce((n, x) => n + x.cells.length, 0) / (s.w * s.h));
  const score = safeties.reduce((a, s) => a + (1 - s), 0) + 0.35 * traps;
  return { w: W, h: H, sections, traps, safeties, score, dens, len: champion.cells.length, seed };
}

const NAMES = ['Полный дом', 'Плечом к плечу', 'Не протолкнуться', 'Коммуналка', 'Аншлаг'];
const LESSONS = [
  'Комнаты набиты под завязку. Самый вкусный обед — не всегда правильный.',
  'Хвост, повисший у тебя на пути, — приманка: дай его хозяину поесть первым.',
  'Съеденное не исчезает: чужое тело ляжет там, где лежало, — навсегда.',
  'Заперто? «Комнату заново» — и в этот раз посмотри, кто на чьей линии стоит.',
  'Самые тесные комнаты пака. Большая змея ест последней, а не первой.',
];

const MAIN = process.argv[1] && process.argv[1].endsWith('genroomsdense.mjs');
if (MAIN && process.argv.includes('--probe')) {
  for (const k of Object.keys(WHY)) if (typeof WHY[k] === 'number') WHY[k] = 0;
  let ok = 0; const scores = [], densAll = [];
  for (let seed = 1; seed <= 40; seed++) {
    const lv = buildLevel(BAND_G, seed);
    if (lv) { ok++; scores.push(+lv.score.toFixed(2)); densAll.push(...lv.dens); }
  }
  scores.sort((a, b) => a - b); densAll.sort((a, b) => a - b);
  console.log('G вышло', ok + '/40', 'баллы', scores[0], '…', scores[scores.length - 1],
    'плотность', Math.round(densAll[0] * 100) + '…' + Math.round(densAll[densAll.length - 1] * 100) + '%',
    'отказы', JSON.stringify(WHY));
} else if (MAIN) {
  const pool = [];
  for (let seed = 1; seed <= 600 && pool.length < 12; seed++) {
    const lv = buildLevel(BAND_G, seed);
    if (lv) pool.push(lv);
  }
  if (pool.length < 5) { console.error('полоса G: только ' + pool.length); process.exit(1); }
  pool.sort((a, b) => a.score - b.score);
  const pick = [0, 1, 2, 3, 4].map((i) => pool[Math.round(i * (pool.length - 1) / 4)]);
  console.error('полоса G: пул ' + pool.length + ', баллы ' + pick.map((l) => l.score.toFixed(2)).join(' ')
    + ', ловушек ' + pick.map((l) => l.traps).join(' ')
    + ', плотность ' + pick.map((l) => Math.round(100 * l.dens.reduce((x, y) => x + y) / l.dens.length) + '%').join(' '));
  const lines = pick.map((lv, i) => {
    const secs = lv.sections.map((sec) => {
      const sn = sec.snakes.map((s) => `        { cells: ${JSON.stringify(s.cells)} },`).join('\n');
      return `      { x: ${sec.x}, y: ${sec.y}, w: ${sec.w}, h: ${sec.h}, snakes: [\n${sn}\n      ] },`;
    }).join('\n');
    return `  {
    // G${i + 1} · сид ${lv.seed} · ловушек ${lv.traps} · безопасность обедов ${lv.safeties.map((s) => s.toFixed(2)).join(' ')} · плотность ${lv.dens.map((d) => Math.round(d * 100) + '%').join(' ')} · финал ${lv.len}
    name: ${JSON.stringify(NAMES[i])}, lesson: ${JSON.stringify(LESSONS[i])},
    w: ${lv.w}, h: ${lv.h},
    sections: [\n${secs}\n    ],
  },`;
  });
  fs.writeFileSync('rooms-dense.out', lines.join('\n') + '\n');
  console.error('готово: rooms-dense.out, уровней ' + pick.length);
}
