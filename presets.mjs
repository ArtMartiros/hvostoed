/* Конфиги уровней. Ручки постройки + коридоры приёмки.
   Жёсткое (решаемость, длина решения) даёт обратное построение; здесь только мягкое.
   Два правила, оплаченные временем: критерии — это СЧЁТЧИКИ и живучесть, а не доли
   (долю дальних ходов легко довести до 100%, сделав поле неиграбельным), и очевидные
   ходы нельзя гнать в ноль — один-два на ход нужны как передышка. */
import * as G from './generator.mjs';
import * as S from './levelstats.mjs';

export const PRESETS = {
  ученик:   { w: 7,  h: 7,  len: 14, moves: 4,  maxGap: 2, gapPull: 0.5, decoys: 2, decoyMax: 3,
              min: { decoyLive: 1, safety: 0.75, sols: 2, branch: 2 }, max: { branch: 5 } },
  средний:  { w: 9,  h: 9,  len: 22, moves: 6,  maxGap: 3, gapPull: 0.7, decoys: 3, decoyMax: 4,
              min: { decoyLive: 1, safety: 0.65, sols: 3, branch: 2.5, farShare: 0.5 }, max: { branch: 6 } },
  длинный:  { w: 10, h: 11, len: 34, moves: 9,  maxGap: 3, gapPull: 0.7, decoys: 4, decoyMax: 5,
              min: { decoyLive: 0.75, safety: 0.6, sols: 3, branch: 3, farShare: 0.5 }, max: { branch: 7 } },
  пустоты:  { w: 10, h: 11, len: 30, moves: 8,  maxGap: 4, gapPull: 0.95, decoys: 5, decoyMax: 4,
              min: { decoyLive: 0.75, safety: 0.6, sols: 2, branch: 2.5, farShare: 0.7, avgGap: 1.3 }, max: { branch: 7 } },
  простор:  { w: 12, h: 16, len: 52, moves: 13, maxGap: 4, gapPull: 0.9, decoys: 8, decoyMax: 5,
              record: true,
              min: { decoyLive: 0.6, branch: 3, farShare: 0.6, avgGap: 1.2, alive: 0.2 }, max: { branch: 8, alive: 0.65 } },
};

function check(p, m) { return checkSome(p, m, true).concat(checkSome(p, m, false)); }
const fmt = (x) => (x == null ? '—' : (typeof x === 'number' ? +x.toFixed(2) : x));

/* Обманка обязана быть соблазном, а не декорацией: её либо можно съесть прямо
   сейчас, либо она сама может пойти. Аудит показал, что иначе на мелких досках
   часть обманок оседает в углах и не участвует ни в чём. */
function decoyLiveness(lv) {
  const decoys = lv.snakes.filter((s) => s.decoy);
  if (!decoys.length) return 1;
  const st = lv.snakes.map((s) => ({ cells: s.cells }));
  const mv = G.movesOf(st, lv.w, lv.h);
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
  return { decoyLive: decoyLiveness(lv), starts: sh.starts, branch: sh.branch,
    farShare: sh.farShare, avgGap: sh.avgGap, randMed: sh.randMed, randTop: sh.randTop,
    mass: G.totalMass(lv.snakes), snakes: lv.snakes.length, target: lv.len, moves: lv.moves.length };
}

export function measureDeep(lv, preset, m) {
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
const CHEAP = new Set(['decoyLive', 'starts', 'branch', 'farShare', 'avgGap']);
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

/* Одна попытка. Кнопка на телефоне крутит их по одной, отдавая управление
   интерфейсу между попытками, — иначе экран замирает на секунды. */
export function craftOnce(name, seed) {
  const p = PRESETS[name];
  if (!p) throw new Error('нет пресета ' + name);
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
  return { level: lv, metrics: m, preset: name, seed, record: !!p.record };
}

export function craft(name, seed0, budget) {
  const why = {};
  for (let t = 0; t < (budget || 60); t++) {
    const r = craftOnce(name, (seed0 || 1) + t);
    if (r.level) return { ...r, attempts: t + 1, why };
    const tag = r.fail.split(/[,:]/)[0];
    why[tag] = (why[tag] || 0) + 1;
  }
  return { level: null, why };
}
