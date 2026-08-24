/* Конфиги уровней. Ручки постройки + коридоры приёмки.
   Жёсткое (решаемость, длина решения) даёт обратное построение; здесь только мягкое.
   Правила, оплаченные временем: критерии — это СЧЁТЧИКИ и живучесть, а не доли
   (долю дальних ходов легко довести до 100%, сделав поле неиграбельным); очевидные
   ходы нельзя гнать в ноль — один-два на ход нужны как передышка; и наклон сложности
   надо ПЕРЕМЕРИВАТЬ по факту, потому что построение задаёт только зазоры.

   voids — суммарная длина пустот за решение, равна тому, насколько след решения
   больше цели. Потолок структурный: разрез с зазором k требует змеи длиной ≥ k+3,
   а к концу обратной прогулки куски короткие. Практически Σ ≲ 0.5·len. */
import * as G from './generator.mjs';
import * as S from './levelstats.mjs';

export const PRESETS = {
  ученик:   { w: 7,  h: 7,  len: 14, moves: 4,  maxGap: 3, voids: 5,  peak: 1, breather: 3, straightBias: 0.7,
              decoys: 2, spiky: 0, sleepy: 0, decoyMax: 3,
              min: { decoyLive: 1, safety: 0.75, sols: 2, branch: 2 },
              max: { branch: 5, voidMiss: 2, runMax: 3 } },
  средний:  { w: 9,  h: 9,  len: 22, moves: 6,  maxGap: 4, voids: 12,  peak: 1, breather: 3, straightBias: 0.7,
              decoys: 3, bridges: 1, turns: 2, spiky: 1, sleepy: 0, decoyMax: 4,
              min: { decoyLive: 1, safety: 0.65, sols: 3, branch: 2.5, farShare: 0.5 },
              max: { branch: 6, voidMiss: 4, runMax: 3 } },
  длинный:  { w: 10, h: 11, len: 34, moves: 9,  maxGap: 5, voids: 19, peak: 1, breather: 3, straightBias: 0.8,
              decoys: 4, bridges: 1, turns: 3, spiky: 1, sleepy: 1, decoyMax: 5,
              min: { decoyLive: 0.75, safety: 0.6, sols: 3, branch: 3, farShare: 0.5 },
              max: { branch: 7, voidMiss: 5, runMax: 3 } },
  пустоты:  { w: 10, h: 11, len: 30, moves: 8,  maxGap: 5, voids: 22, peak: 1, breather: 3, straightBias: 0.85,
              decoys: 5, bridges: 2, turns: 3, spiky: 1, sleepy: 1, decoyMax: 4,
              min: { decoyLive: 0.75, safety: 0.6, sols: 2, branch: 2.5, farShare: 0.7, avgGap: 1.3 },
              max: { branch: 7, voidMiss: 5, runMax: 3 } },
  простор:  { w: 12, h: 16, len: 52, moves: 13, maxGap: 5, voids: 33, peak: 1, breather: 3, straightBias: 0.8,
              decoys: 8, bridges: 2, turns: 4, spiky: 2, sleepy: 2, decoyMax: 5, record: true,
              min: { decoyLive: 0.6, branch: 3, farShare: 0.6, avgGap: 1.2, alive: 0.2 },
              max: { branch: 8, alive: 0.65, voidMiss: 7, runMax: 3 } },
};

function check(p, m) { return checkSome(p, m, true).concat(checkSome(p, m, false)); }
const fmt = (x) => (x == null ? '—' : (typeof x === 'number' ? +x.toFixed(2) : x));

/* Обманка обязана быть соблазном, а не декорацией: её либо можно съесть прямо
   сейчас, либо она сама может пойти. Аудит показал, что иначе на мелких досках
   часть обманок оседает в углах и не участвует ни в чём. */
function decoyLiveness(lv) {
  // Мостовая обманка исключена намеренно: её работа — стоять поперёк луча и врать,
  // что путь закрыт. Она соблазняет собой самим фактом, а не съедобностью, и то,
  // что решение через неё проходит, гарантировано построением.
  const decoys = lv.snakes.filter((s) => s.decoy && !s.onBridge);
  if (!decoys.length) return 1;
  const st = lv.snakes.map((s) => ({ cells: s.cells }));
  const mv = G.movesOf(st, lv.w, lv.h, G.boardOf(lv));
  const live = new Set();
  lv.snakes.forEach((s, i) => {
    if (!s.decoy) return;
    for (const m of mv) if (m.i === i || (m.eat && m.prey === i)) { live.add(i); break; }
  });
  return live.size / decoys.length;
}

/* Метрики считаются в два захода: сначала дешёвые (форма поля, живость обманок),
   и только пережившие их кандидаты идут на дорогую проверку — полный обход
   достижимости и подсчёт решений. Без этого разрежённые пресеты, где отсев идёт
   в основном по форме, обходились в секунды на уровень. */
export function measureCheap(lv, preset) {
  const sh = S.shape(lv, preset.record ? 120 : 50, lv.len * 7 + 1);
  const cv = S.curve(lv, null) || {};
  return { decoyLive: decoyLiveness(lv), starts: sh.starts, branch: sh.branch,
    voids: cv.voids, voidMiss: cv.voidMiss, runMax: cv.runMax, restShare: cv.restShare,
    tiltWant: cv.tiltWant, tiltGap: cv.tiltGap, gaps: cv.gaps,
    farShare: sh.farShare, avgGap: sh.avgGap, randMed: sh.randMed, randTop: sh.randTop,
    mass: G.totalMass(lv.snakes), snakes: lv.snakes.length, target: lv.len, moves: lv.moves.length };
}

export function measureDeep(lv, preset, m) {
  /* Наклон риска меряем отдельно: построение задаёт зазоры, а не число способов
     ошибиться. Но ТОЛЬКО на целевых уровнях: на поле рекорда цели нет, и вопрос
     «достижима ли ещё длина lv.len» заставляет обойти всё пространство состояний
     целиком, когда ответ «нет». На «просторе» это стоило 24 секунд за попытку
     против 450 мс на всё остальное. */
  if (!preset.record) {
    const cv = S.curve(lv, lv.len);
    if (cv) { m.tiltRisk = cv.tiltRisk; m.endRisk = cv.rows[cv.rows.length - 1].dead;
              m.risks = cv.rows.map((r) => r.dead); }
  }
  if (preset.record) {
    const bm = S.beamBest(lv, 160);
    m.ceiling = bm.best; m.bestMoves = bm.moves;
    m.alive = m.randMed / Math.max(1, bm.best);
  } else {
    const sg = S.solveGoal(lv, lv.len, lv.moves.length + 2);
    m.sols = sg.sols; m.minMoves = sg.minMoves;
    m.shortcut = sg.minMoves != null && sg.minMoves < lv.moves.length;
    const sf = S.safety(lv, lv.len);
    m.safety = sf ? sf.ratio : 0; m.worst = sf ? sf.worst : 0;
  }
  return m;
}

export function measure(lv, preset) {
  return measureDeep(lv, preset, measureCheap(lv, preset));
}

// какие поля проверяются на дешёвом заходе — остальные ждут дорогого
const CHEAP = new Set(['decoyLive', 'starts', 'branch', 'farShare', 'avgGap', 'voidMiss', 'runMax', 'tiltGap', 'restShare']);
function checkSome(p, m, cheapOnly) {
  const fail = [];
  for (const [k, v] of Object.entries(p.min || {})) {
    if (cheapOnly !== CHEAP.has(k)) continue;
    if (!(m[k] >= v)) fail.push(`${k} ${fmt(m[k])}<${v}`);
  }
  for (const [k, v] of Object.entries(p.max || {})) {
    if (cheapOnly !== CHEAP.has(k)) continue;
    if (!(m[k] <= v)) fail.push(`${k} ${fmt(m[k])}>${v}`);
  }
  return fail;
}

/* Надёжный предел бюджета пустот для данной пары «цель + ходов».
   Разрез с зазором k требует змеи длиной ≥ k+3, а к концу обратной прогулки куски
   короткие — отсюда потолок. Формула откалибрована по замерам: ученик 7, средний 11,
   длинный 17, пустоты 15, простор 25 против реально достижимых 7/12/18/21/32.
   Это НАДЁЖНЫЙ предел, а не абсолютный: выше него выход резко падает, но не ноль. */
export function voidCeiling(p) {
  const rest = p.breather > 0 ? Math.max(0, Math.ceil((p.moves - 2) / p.breather)) : 0;
  const slots = Math.max(1, p.moves - rest);
  const flat = Math.min(0.5 * p.len, 1.9 * p.moves, p.maxGap * slots);
  // Колена снимают требование длинных ПРЯМЫХ участков, из которого потолок и брался.
  // Замер на «пустотах» (цель 30): без колен доступно ~16, при трёх ~22, при шести ~25,
  // дальше упирается примерно в 0.85 цели.
  return Math.max(0, Math.round(Math.min(0.85 * p.len, flat + 1.6 * (p.turns || 0))));
}

/* Одна попытка. Первым аргументом либо имя пресета, либо готовый конфиг из модалки
   (пресет тогда служит заготовкой — от него достаются коридоры приёмки).
   Кнопка на телефоне крутит попытки по одной, отдавая управление интерфейсу
   между ними, — иначе экран замирает на секунды. */
export function craftOnce(preset, seed) {
  const p = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!p) throw new Error('нет пресета ' + preset);
  const lv = G.generate({ ...p, seed, minMoves: p.moves });
  if (!lv) return { fail: 'не собралось' };
  const v = G.verify(lv);
  if (!v.ok || v.len !== lv.len) return { fail: 'проверка вперёд: ' + (v.why || 'длина') };
  const m = measureCheap(lv, p);
  const cheapBad = checkSome(p, m, true);
  if (cheapBad.length) return { fail: cheapBad.join(', ') };
  measureDeep(lv, p, m);
  if (m.shortcut) return { fail: 'есть решение короче задуманного' };
  const bad = checkSome(p, m, false);
  if (bad.length) return { fail: bad.join(', ') };
  return { level: lv, metrics: m, preset, seed, record: !!p.record };
}

export function craft(preset, seed0, budget) {
  const why = {};
  for (let t = 0; t < (budget || 60); t++) {
    const r = craftOnce(preset, (seed0 || 1) + t);
    if (r.level) return { ...r, attempts: t + 1, why };
    const tag = r.fail.split(/[,:]/)[0];
    why[tag] = (why[tag] || 0) + 1;
  }
  return { level: null, why };
}
