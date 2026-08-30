/* Генератор пака «Комнаты»: 30 уровней от простого к сложному, как «Азбука».
   Уровень — сетка комнат; открыта первая, сборка всех змей открытой области в
   одну открывает следующую. Строим случайным поиском с полным перебором каждой
   стадии и держим два железных правила прототипа:
     · финал КАЖДОЙ комнаты единственный при любом порядке сборки — иначе выбор
       в первой комнате мог бы невидимо запереть третью;
     · каждая следующая комната решаема из этого финала ПО ПОСТРОЕНИЮ (стадия
       принимается только с startOk от полного перебора).
   Первая комната каждого уровня всегда безопасна (игрок только сел за доску),
   ловушки порядка заказываются полосой через trapsMin.
   Запуск: node genrooms30.mjs [--probe] — probe меряет выход полос. */
import fs from 'fs';
import * as G from './generator.mjs';

const key = (x, y) => x + ',' + y;
const sk = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');

/* Полосы: сетка комнат [колонок, рядов], комната 5×5, змей НОВЫХ на комнату,
   длины змей, сколько стадий обязаны иметь запирающий порядок. */
export const BANDS = [
  { tag: 'A', grid: [1, 2], perRoom: [2, 2], slen: [2, 3], trapsMin: 0, trapsMax: 0 },
  { tag: 'B', grid: [1, 2], perRoom: [2, 3], slen: [2, 3], trapsMin: 1, trapsMax: 2 },
  { tag: 'C', grid: [2, 2], perRoom: [2, 3], slen: [2, 3], trapsMin: 1, trapsMax: 3 },
  { tag: 'D', grid: [2, 2], perRoom: [3, 4], slen: [2, 3], trapsMin: 2, trapsMax: 4 },
  { tag: 'E', grid: [2, 3], perRoom: [2, 3], slen: [2, 3], trapsMin: 2, trapsMax: 5 },
  { tag: 'F', grid: [2, 3], perRoom: [3, 4], slen: [2, 3], trapsMin: 2, trapsMax: 6 },
];
const RW = 5, RH = 5;

// комнаты змейкой по рядам: соседние по порядку — соседние на доске
export function rectsOf(grid) {
  const [cols, rows] = grid, out = [];
  for (let r = 0; r < rows; r++) {
    const xs = [...Array(cols).keys()];
    if (r % 2) xs.reverse();
    for (const c of xs) out.push({ x: c * RW, y: r * RH, w: RW, h: RH });
  }
  return out;
}
/* У generator.mjs в boardOf НЕТ валунов — прототипный стенд молча гонял лучи
   сквозь закрытые комнаты (для «Четырёх комнат» это было безопасно в одну
   сторону: ходов в стенде больше, чем в игре, единственность финала в
   надмножестве влечёт её в подмножестве; но startOk так гарантировать нельзя).
   Здесь крышка — честная стена: колючая спящая змея из всех закрытых клеток.
   Она не ходит (sleep), её не съесть (spiky), луч о её тело бьётся — ровно
   поведение крышки в игре. Живёт последним элементом состояния, индексы
   настоящих змей не плывут. */
export const ctxAt = (rects, open, W, H) => {
  const cells = [], closed = new Set();
  for (let k = open; k < rects.length; k++) {
    const r = rects[k];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      cells.push([x, y]); closed.add(key(x, y));
    }
  }
  return { board: G.boardOf({}), closed,
           wall: cells.length ? { cells, spiky: true, sleep: true } : null };
};
const withWall = (st, ctx) => ctx.wall ? st.concat([ctx.wall]) : st;
const realOnly = (st, ctx) => ctx.wall ? st.slice(0, -1) : st;

/* Полный разбор стадии: только обеды (вылетов в режиме нет). */
export function explore(snakes, ctx, W, H) {
  const done = ctx.wall ? 2 : 1;           // стена всегда остаётся на доске
  const finals = new Map(), memo = new Map();
  const canFinish = (st) => {
    if (st.length === done) return true;
    const k = sk(st); if (memo.has(k)) return memo.get(k);
    memo.set(k, false);
    let r = false;
    for (const m of G.movesOf(st, W, H, ctx.board))
      if (m.eat && canFinish(G.applyEat(st, m.i, m.ray))) { r = true; break; }
    memo.set(k, r); return r;
  };
  const start = withWall(snakes, ctx);
  const visited = new Set([sk(start)]), stack = [start];
  let locked = 0, eats = 0, safe = 0;
  while (stack.length) {
    const st = stack.pop();
    if (st.length === done) { finals.set(sk(st), st[0]); continue; }
    const mv = G.movesOf(st, W, H, ctx.board).filter((m) => m.eat);
    if (!mv.length) { locked++; continue; }
    for (const m of mv) {
      eats++;
      const nx = G.applyEat(st, m.i, m.ray);
      if (canFinish(nx)) safe++;
      const k2 = sk(nx);
      if (!visited.has(k2)) { visited.add(k2); stack.push(nx); }
    }
  }
  return { finals: [...finals.values()], locked, eatSafety: eats ? safe / eats : 1,
           startOk: canFinish(start), states: visited.size };
}

/* Решение стадии — последовательность клеток-голов для тапов (для браузерного теста). */
export function solveStage(snakes, ctx, W, H) {
  const board = ctx.board, done = ctx.wall ? 2 : 1;
  const seen = new Set();
  snakes = withWall(snakes, ctx);
  const dfs = (st, taps) => {
    if (st.length === done) return taps;
    const k = sk(st); if (seen.has(k)) return null;
    seen.add(k);
    for (const m of G.movesOf(st, W, H, board)) {
      if (!m.eat) continue;
      const r = dfs(G.applyEat(st, m.i, m.ray), taps.concat([st[m.i].cells[0].slice()]));
      if (r) return r;
    }
    return null;
  };
  return dfs(snakes, []);
}

/* Направленное построение стадии: случайная посыпка не складывается в цепочку
   (замер: 12 тысяч отказов startOk на 20 сидов полосы D), поэтому строим как
   руками: каждая новая змея садится либо ХВОСТОМ под текущий луч большой змеи
   (та её съест), либо ГОЛОВОЙ на чистую линию к хвосту большой (съест сама).
   Обед тут же применяется к макету — решаемость стадии выходит по построению,
   а полный перебор дальше лишь подтверждает её и меряет ловушки. */
const DIRS4 = [[0, -1], [0, 1], [1, 0], [-1, 0]];
const inRect = (rect, [x, y]) => x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;

function buildStage(rnd, champion, rect, n, slen, ctx, W, H) {
  const placed = [];
  const occ = new Set(champion ? champion.cells.map((c) => key(c[0], c[1])) : []);
  const forbidden = new Set();       // клетки запланированных лучей — не застраивать
  const freeCell = (c) => c[0] >= 0 && c[1] >= 0 && c[0] < W && c[1] < H
    && !ctx.closed.has(key(c[0], c[1])) && !occ.has(key(c[0], c[1]));
  const roomBlocked = () => {
    const b = new Set([...occ, ...forbidden]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (!inRect(rect, [x, y])) b.add(key(x, y));
    return b;
  };
  const rndLen = () => slen[0] + Math.floor(rnd() * (slen[1] - slen[0] + 1));

  /* пришить к змее base новую: base ест новую (её хвост на луче base) или
     новая ест base (её голова на чистой линии к хвосту base). Возвращает
     слитую змею или null. */
  const attach = (base) => {
    const modes = rnd() < 0.5 ? ['eatNew', 'eatCur'] : ['eatCur', 'eatNew'];
    for (const mode of modes) for (let t = 0; t < 20; t++) {
      const len = rndLen();
      if (mode === 'eatNew') {
        const [hx, hy] = base.cells[0];
        const [dx, dy] = [hx - base.cells[1][0], hy - base.cells[1][1]];
        const line = [];
        for (let x = hx + dx, y = hy + dy; freeCell([x, y]); x += dx, y += dy) line.push([x, y]);
        const spots = line.filter((c) => inRect(rect, c) && !forbidden.has(key(c[0], c[1])));
        if (!spots.length) break;
        const tail = spots[Math.floor(rnd() * spots.length)];
        const gap = line.slice(0, line.findIndex((c) => c[0] === tail[0] && c[1] === tail[1]));
        const b = roomBlocked(); b.delete(key(tail[0], tail[1]));
        const path = G.walk(rnd, W, H, len, b, tail.slice(), null, 0.55);
        if (!path || path.length < 2) continue;
        const sn = path.slice().reverse();          // walk шёл от хвоста — голова в конце
        const st2 = withWall([base, { cells: sn, spiky: false, sleep: false }], ctx);
        const ray = G.raycast(st2, 0, W, H, ctx.board);
        if (ray.kind !== 'tail' || ray.prey !== 1) continue;
        placed.push(sn); sn.forEach((c) => occ.add(key(c[0], c[1])));
        gap.forEach((c) => forbidden.add(key(c[0], c[1])));
        return G.applyEat(st2, 0, ray)[0];
      } else {
        const tail = base.cells[base.cells.length - 1];
        const d = DIRS4[Math.floor(rnd() * 4)];
        const line = [];
        for (let x = tail[0] + d[0], y = tail[1] + d[1]; freeCell([x, y]) && line.length < 8; x += d[0], y += d[1]) line.push([x, y]);
        const spots = line.filter((c) => inRect(rect, c) && !forbidden.has(key(c[0], c[1])));
        if (!spots.length) continue;
        const head = spots[Math.floor(rnd() * spots.length)];
        const gap = line.slice(0, line.findIndex((c) => c[0] === head[0] && c[1] === head[1]));
        const b = roomBlocked(); b.delete(key(head[0], head[1]));
        // тело растёт из головы шагом ПРОЧЬ от хвоста base: взгляд = голова минус шея
        const path = G.walk(rnd, W, H, len, b, head.slice(), [d[0], d[1]], 0.55);
        if (!path || path.length < 2) continue;
        const st2 = withWall([{ cells: path, spiky: false, sleep: false }, base], ctx);
        const ray = G.raycast(st2, 0, W, H, ctx.board);
        if (ray.kind !== 'tail' || ray.prey !== 1) continue;
        placed.push(path); path.forEach((c) => occ.add(key(c[0], c[1])));
        gap.forEach((c) => forbidden.add(key(c[0], c[1])));
        return G.applyEat(st2, 0, ray)[0];
      }
    }
    return null;
  };
  // сшить cur и local, если чей-то луч уже достаёт до чужого хвоста
  const join = (a, bSnake) => {
    const st2 = withWall([a, bSnake], ctx);
    let ray = G.raycast(st2, 0, W, H, ctx.board);
    if (ray.kind === 'tail' && ray.prey === 1) {
      ray.path.forEach((c) => forbidden.add(key(c[0], c[1])));
      return G.applyEat(st2, 0, ray)[0];
    }
    ray = G.raycast(st2, 1, W, H, ctx.board);
    if (ray.kind === 'tail' && ray.prey === 0) {
      ray.path.forEach((c) => forbidden.add(key(c[0], c[1])));
      return G.applyEat(st2, 1, ray)[0];
    }
    return null;
  };
  const freshSnake = () => {                    // первая змея локальной цепочки
    for (let t = 0; t < 20; t++) {
      const b = roomBlocked();
      const start2 = [rect.x + Math.floor(rnd() * rect.w), rect.y + Math.floor(rnd() * rect.h)];
      if (b.has(key(start2[0], start2[1]))) continue;
      const path = G.walk(rnd, W, H, rndLen(), b, start2, null, 0.55);
      if (!path || path.length < 2) continue;
      placed.push(path); path.forEach((c) => occ.add(key(c[0], c[1])));
      return { cells: path.map((c) => c.slice()), spiky: false, sleep: false };
    }
    return null;
  };

  /* Чемпион входит в комнату не всегда удачно: его луч и хвост могут не
     дотягиваться. Тогда в комнате растёт СВОЯ цепочка, и сшиваем её с большой,
     как только чьи-то луч и хвост совпадут. В первой комнате большой змеи нет —
     первая же местная и становится будущим чемпионом. */
  let cur = champion, local = null, remaining = n;
  for (let guard = 0; guard < 60; guard++) {
    if (remaining === 0 && !local) return placed.map((cells) => ({ cells, spiky: false, sleep: false }));
    if (!cur) {
      cur = freshSnake();
      if (!cur) return null;
      remaining--;
      continue;
    }
    if (local) {
      const merged = join(cur, local);
      if (merged) { cur = merged; local = null; continue; }
    }
    if (remaining === 0) return null;          // осталось только сшить, а лучи не сходятся
    const acts = local ? ['cur', 'local'] : ['cur', 'cur', 'fresh'];
    const act = acts[Math.floor(rnd() * acts.length)];
    if (act === 'cur') {
      const g = attach(cur);
      if (g) { cur = g; remaining--; }
    } else if (act === 'local') {
      const g = attach(local);
      if (g) { local = g; remaining--; }
    } else {
      const f = freshSnake();
      if (f) { local = f; remaining--; }
    }
  }
  return null;
}

/* Насадить n новых змей в комнату rect, не задевая чемпиона. */
function seedRoom(rnd, rect, n, slen, occupied, W, H) {
  const blocked = new Set(occupied);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) blocked.add(key(x, y));
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = slen[0] + Math.floor(rnd() * (slen[1] - slen[0] + 1));
    const cells = G.walk(rnd, W, H, len, blocked, null, null, 0.6);
    if (!cells || cells.length < 2) return null;
    cells.forEach((c) => blocked.add(key(c[0], c[1])));
    out.push({ cells, spiky: false, sleep: false });
  }
  return out;
}

/* Один уровень: комнаты по очереди, каждая стадия принимается перебором. */
export const WHY = { seed:0, start:0, multi:0, room1:0, trapcap:0, brutal:0, stage:{} };
export function buildLevel(band, seed) {
  const rnd = G.makeRng(seed);
  const rects = rectsOf(band.grid);
  const W = band.grid[0] * RW, H = band.grid[1] * RH;
  const sections = [], solution = [];
  let champion = null, traps = 0;
  const safeties = [];
  for (let k = 0; k < rects.length; k++) {
    const ctx = ctxAt(rects, k + 1, W, H);
    let ok = null;
    for (let t = 0; t < 700 && !ok; t++) {
      const n = Math.max(k === 0 ? 2 : 1, band.perRoom[0] + Math.floor(rnd() * (band.perRoom[1] - band.perRoom[0] + 1)));
      const fresh = buildStage(rnd, champion, rects[k], n, band.slen, ctx, W, H);
      if (!fresh) { WHY.seed++; continue; }
      const st = (champion ? [champion] : []).concat(fresh);
      if (st.length < 2) continue;
      const r = explore(st, ctx, W, H);
      if (!r.startOk) { WHY.start++; continue; }
      if (r.finals.length !== 1) { WHY.multi++; continue; }
      // первая комната всегда безопасна; дальше ловушки — по заказу полосы
      if (k === 0 && (r.locked > 0 || r.eatSafety < 1)) { WHY.room1++; continue; }
      if (r.locked > 0 && traps >= band.trapsMax) { WHY.trapcap++; continue; }
      if (r.eatSafety < 0.3) { WHY.brutal++; continue; }
      ok = { fresh, r };
    }
    if (!ok) { WHY.stage[k]=(WHY.stage[k]||0)+1; return null; }
    sections.push({ ...rects[k], snakes: ok.fresh.map((s) => ({ cells: s.cells })) });
    const st = (champion ? [champion] : []).concat(ok.fresh);
    solution.push(solveStage(st, ctx, W, H));
    champion = ok.r.finals[0];
    if (ok.r.locked > 0) traps++;
    safeties.push(ok.r.eatSafety);
  }
  if (traps < band.trapsMin) return null;
  const score = safeties.reduce((a, s) => a + (1 - s), 0) + 0.35 * traps;
  return { w: W, h: H, sections, solution, traps, safeties, score, len: champion.cells.length, seed };
}

const NAMES = {
  A: ['Первая дверь', 'Двое за стеной', 'Тук-тук', 'Коридорчик', 'Соседи'],
  B: ['Не тем зубом', 'Заминка', 'Вторая мысль', 'Узелок', 'Дверь с секретом'],
  C: ['Четыре угла', 'Обход', 'Кругосветка', 'Анфилада', 'Сквозные двери'],
  D: ['Теснота', 'Клубок за дверью', 'Пере переезд', 'Лабиринтик', 'Гости съехались'],
  E: ['Шесть комнат', 'Длинный дом', 'Этажи', 'Квартира с историей', 'Дальняя дверь'],
  F: ['Особняк', 'Все ключи', 'Комната за комнатой', 'Большая уборка', 'Новоселье'],
};
const LESSONS = {
  A: ['Собери всех змей комнаты в одну — откроется следующая.',
      'Ошибки бесплатны: доска не меняется, растёт только счётчик.',
      'Закрытая комната — стена: луч в неё бьётся, как о валун.',
      'Съев, змея смотрит туда же, куда смотрела съеденная.',
      'Твоя большая змея — тоже еда: новенькие могут съесть её за хвост.'],
  B: ['Здесь уже можно съесть не тем — и комната встанет. «Комнату заново» — и порядок.',
      'Прежде чем тапнуть, найди, кто съест едока потом.',
      'Открытие комнаты — чекпоинт: назад через дверь отмотки нет.',
      'Пустые клетки между головой и хвостом съедаются вместе с жертвой.',
      'Если никто ни на кого не смотрит — комната заперта. Начни её заново.'],
  C: ['Четыре комнаты — три двери. Веди свою змею по дому.',
      'Пустая комната позади — разгон для дальних обедов.',
      'Хвост большой змеи уползает вперёд с каждым съеденным зазором.',
      'Новая комната — новые едоки. Иногда лучший ход — подставить свой хвост.',
      'Смотри, куда встанет голова после обеда: ей жить в следующей комнате.'],
  D: ['Теснее комнаты — важнее порядок.',
      'Один из обедов запирает дверь. Найди его до того, как он найдёт тебя.',
      'Длинное тело — тоже стена: не перегороди себе комнату.',
      'Считай на два обеда вперёд, дальше не надо.',
      'Заперто? Это бесплатно. «Комнату заново» — и другой порядок.'],
  E: ['Шесть комнат подряд. Спокойно, по одной.',
      'В длинном доме змея вырастает через всю доску.',
      'Каждая комната маленькая — но их много, и ошибки копятся в счётчик.',
      'Порядок внутри комнаты — вся игра. Между комнатами бояться нечего.',
      'Дальняя дверь откроется, когда съедена ближняя.'],
  F: ['Большой дом, много жильцов, один финал.',
      'Ловушек тут больше одной. Не спеши тапать очевидное.',
      'Всё, чему учили комнаты, — под одной крышей.',
      'Идеальная партия — ноль ошибок. Счётчик подскажет.',
      'Последний уровень пака. Дальше — только твой рекорд аккуратности.'],
};

const MAIN = process.argv[1] && process.argv[1].endsWith('genrooms30.mjs');
if (MAIN && process.argv.includes('--probe')) {
  for (const b of BANDS) {
    let ok = 0, scores = [];
    for (let seed = 1; seed <= 40; seed++) {
      const lv = buildLevel(b, seed);
      if (lv) { ok++; scores.push(+lv.score.toFixed(2)); }
    }
    scores.sort((a, c) => a - c);
    console.log(b.tag, 'вышло', ok, '/40', 'баллы', scores[0], '…', scores[scores.length - 1]);
  }
} else if (MAIN) {
  const out = [], sols = [];
  for (const b of BANDS) {
    const pool = [];
    for (let seed = 1; seed <= 800 && pool.length < 12; seed++) {
      const lv = buildLevel(b, seed);
      if (lv) pool.push(lv);
    }
    if (pool.length < 5) { console.error('полоса ' + b.tag + ': только ' + pool.length); process.exit(1); }
    pool.sort((x, y) => x.score - y.score);
    const pick = [0, 1, 2, 3, 4].map((i) => pool[Math.round(i * (pool.length - 1) / 4)]);
    console.error('полоса ' + b.tag + ': пул ' + pool.length + ', баллы ' +
      pick.map((l) => l.score.toFixed(2)).join(' ') + ', ловушек ' + pick.map((l) => l.traps).join(' '));
    pick.forEach((lv, i) => { out.push({ band: b.tag, i, lv }); sols.push(lv.solution); });
  }
  const lines = out.map(({ band, i, lv }) => {
    const secs = lv.sections.map((sec) => {
      const sn = sec.snakes.map((s) => `        { cells: ${JSON.stringify(s.cells)} },`).join('\n');
      return `      { x: ${sec.x}, y: ${sec.y}, w: ${sec.w}, h: ${sec.h}, snakes: [\n${sn}\n      ] },`;
    }).join('\n');
    return `  {
    // ${band}${i + 1} · сид ${lv.seed} · ловушек ${lv.traps} · безопасность обедов ${lv.safeties.map((s) => s.toFixed(2)).join(' ')} · финал ${lv.len}
    name: ${JSON.stringify(NAMES[band][i])}, lesson: ${JSON.stringify(LESSONS[band][i])},
    w: ${lv.w}, h: ${lv.h},
    sections: [\n${secs}\n    ],
  },`;
  });
  fs.writeFileSync('rooms-pack.out', lines.join('\n') + '\n');
  fs.writeFileSync('rooms-solutions.json', JSON.stringify(sols));
  console.error('готово: rooms-pack.out, уровней ' + out.length);
}
