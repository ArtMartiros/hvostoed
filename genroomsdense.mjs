/* Полоса G пака «Комнаты»: большие ПЛОТНЫЕ уровни обратным построением.

   Прямой строитель genrooms30 сажает змей по одной, и каждой нужна чистая
   линия луча здесь-и-сейчас — в тесной комнате он захлёбывается (замер:
   25 тысяч отказов посадки на полосе D при perRoom 4–6 против 6–7 отказов
   единственности финала). Поэтому здесь идём от конца, как generator.mjs:

     финал комнаты F = НОВАЯ МАССА ++ ЧЕМПИОН (одна змея, один путь),

   и режем её обратными ходами. Разрез впритык (зазор 0) не сдвигает ничей
   хвост: кусок-жертва просто отделяется, и куски стоят нос-в-хвост вдоль
   пути — потому финал комнаты ЕДИНСТВЕНЕН по построению: любой порядок
   сборки склеивает те же клетки в тот же путь. Разрез с зазором дополняется
   сдвигом хвоста едока назад — хвост дорастает в свободные клетки, ровно как
   в unEat генератора; здесь так режутся куски новой массы (подразрезы), и
   именно подразрез даёт ловушку порядка: хвост недособранного куска висит
   вне пути — а то и в чужом зазоре, — и чемпион бьётся в него, пока кусок
   не соберёт себя сам.

   Сдвиг хвоста ЧЕМПИОНА при разрезе с зазором идёт по его же прежнему телу
   (клетки известны наперёд), поэтому в данные уровня он не попадает вовсе —
   чистая бухгалтерия индексов. Решаемость стадии — по построению с одной
   оговоркой: два хвоста подразрезов могут свеситься в зазоры друг друга и
   взаимно запереться, поэтому startOk всё же подтверждается перебором
   explore из genrooms30 (замер: ~2% попыток в ретрай), а он же меряет
   ловушки, единственность финала и безопасность. */
import fs from 'fs';
import * as G from './generator.mjs';
import { ctxAt, rectsOf, explore, solveStage } from './genrooms30.mjs';

const key = (c) => c[0] + ',' + c[1];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, d) => [a[0] + d[0], a[1] + d[1]];
const eq = (a, b) => a[0] === b[0] && a[1] === b[1];
const inRect = (r, [x, y]) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const RW = 5, RH = 5;

export const BAND_G = {
  tag: 'G', grid: [2, 3], mass: [12, 14], piece: [2, 5],
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
function massWalk(rnd, W, H, len, blocked, start, rect, doorRect) {
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
        const straight = dir && opts.find((o) => eq(o.d, dir));
        if (straight && rnd() < 0.45) chosen = straight;
        else {
          // жаться к занятому: меньше свободных соседей — раньше в списке
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
function straightCut(cells, b, k) {
  if (b < 2 || b + k > cells.length - 2) return false;    // жертве нужен взгляд, едоку — шея
  const first = sub(cells[b + k - 1], cells[b + k]);
  if (Math.abs(first[0]) + Math.abs(first[1]) !== 1) return false;
  for (let t = b + k - 1; t > b; t--)
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
      if (rest <= piece[1] && rest >= piece[0]) { out.push({ start: i, size: rest, gap: 0 }); break; }
      const opts = [];
      for (let s = piece[0]; s <= piece[1]; s++) {
        for (let g = 0; g <= Math.min(budget, 2); g++) {
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
    if (ok) return out;
  }
  return null;
}

/* Подразрез куска B: B2 ест B1 через зазор k, и до этого обеда чемпиону кусок
   не съесть — хвост B2 (доращенный сдвигом назад) висит вне пути, луч чемпиона
   бьётся в его тело. Это и есть ловушка порядка по построению. */
function subCut(rnd, B, k, occ, W, H, cRes) {
  const n = B.length;
  const spots = [];
  for (let b = 2; b + k <= n - 2; b++) if (straightCut(B, b, k)) spots.push(b);
  if (!spots.length) return null;
  const b = spots[Math.floor(rnd() * spots.length)];
  const gap = B.slice(b, b + k);
  const blocked = new Set([...occ, ...cRes]);
  for (const c of B) blocked.add(key(c));
  const anchor = B[n - 1];
  let ext = null;
  for (const d of G.DIRS.slice().sort(() => rnd() - 0.5)) {
    const s0 = add(anchor, d);
    if (s0[0] < 0 || s0[1] < 0 || s0[0] >= W || s0[1] >= H || blocked.has(key(s0))) continue;
    ext = G.walk(rnd, W, H, k, blocked, s0, null, 0.5);
    if (ext) break;
  }
  if (!ext) return null;
  return { prey: B.slice(0, b), eater: B.slice(b + k).concat(ext.map((c) => c.slice())), gap };
}

/* ---------- одна стадия обратным построением ---------- */
function buildStageReverse(rnd, champion, rect, band, ctx, W, H, doorRect, wantSub) {
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
     но partition должен видеть шею. Зазоры — только в комнатах с чемпионом:
     его сдвиг назад идёт по собственному прежнему телу и в данные уровня
     не попадает; в первой комнате сдвигать некого, и она обязана быть
     безопасной — там бюджет ноль. */
  const fullPath = nm.concat(champion ? champion.cells.map((c) => c.slice()) : []);
  const gapBudget = champion ? 1 + Math.floor(rnd() * 3) : 0;
  const parts = partition(rnd, fullPath, nm.length, band.piece, gapBudget);
  if (!parts) return null;

  // куски от головы пути; клетки зазоров пусты на старте — линии обстрела
  const snakes = [];
  const occNow = new Set(occ); for (const c of nm) occNow.add(key(c));
  for (const p of parts)
    for (let g = 0; g < p.gap; g++) occNow.delete(key(nm[p.start + p.size + g]));
  const cRes = champion ? champion.cells.map(key) : [];
  let subs = 0, gaps = 0;
  for (const p of parts) {
    gaps += p.gap;
    const B = nm.slice(p.start, p.start + p.size);
    let done = null;
    if (wantSub && subs < band.subMax && B.length >= 5 && rnd() < 0.6) {
      const k = 1 + Math.floor(rnd() * 2);
      done = subCut(rnd, B, k, occNow, W, H, cRes);
      if (done) {
        subs++;
        for (const c of done.gap) occNow.delete(key(c));
        for (const c of done.eater) occNow.add(key(c));
        snakes.push({ cells: done.prey.map((c) => c.slice()) });
        snakes.push({ cells: done.eater.map((c) => c.slice()) });
      }
    }
    if (!done) snakes.push({ cells: B.map((c) => c.slice()) });
  }
  return { snakes, subs, gaps, head: nm[0], neck: nm[1] };
}

/* ---------- уровень целиком ---------- */
export const WHY = { seed: 0, start: 0, multi: 0, room1: 0, trapcap: 0, brutal: 0, stage: {} };
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
  'Комнаты набиты под завязку. Дорога одна — вдоль цепочки.',
  'Хвост к носу, нос к хвосту: ищи, кто стоит первым в очереди.',
  'Кусок с хвостом не у дел сам соберёт себя — не мешай ему.',
  'Тесно — значит, порядок решает всё. Ошибки по-прежнему бесплатны.',
  'Самые плотные комнаты пака. Съешь дом целиком.',
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
