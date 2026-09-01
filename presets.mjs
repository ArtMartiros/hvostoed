/* Пресеты (ручки постройки) + коридоры приёмки. Жёсткое (решаемость, длина) даёт
   построение, здесь мягкое. starTop — верхняя отметка не должна доставаться тупой
   игре (пороги по медианам принятых); starLow — нижняя выше старта. Замеры и
   уроки коридоров — бриф §6d. */
import * as G from './generator.mjs';
import * as S from './levelstats.mjs';

export const PRESETS = {
  ученик:   { w: 7,  h: 7,  len: 14, moves: 4,  maxGap: 3, voids: 5,  peak: 1, breather: 3, straightBias: 0.7,
              decoys: 2, spiky: 0, sleepy: 1, apples: 1, portals: 0, mechs: 2, decoyMax: 3,
              min: { decoyLive: 1, safety: 0.75, sols: 2, branch: 2, terrainUse: 1, starLow: 1 },
              max: { branch: 5, voidMiss: 2, runMax: 3, starTop: 0.9 } },
  средний:  { w: 9,  h: 9,  len: 22, moves: 6,  maxGap: 4, voids: 12,  peak: 1, breather: 3, straightBias: 0.7,
              decoys: 3, bridges: 1, turns: 2, spiky: 1, sleepy: 1, apples: 2, portals: 1, mechs: 6, decoyMax: 4,
              min: { decoyLive: 1, safety: 0.65, sols: 3, branch: 2.5, farShare: 0.5, markUse: 1, terrainUse: 1, starLow: 1 },
              max: { branch: 6, voidMiss: 4, runMax: 3, starTop: 0.75 } },
  длинный:  { w: 10, h: 11, len: 34, moves: 9,  maxGap: 5, voids: 19, peak: 1, breather: 3, straightBias: 0.8,
              decoys: 4, bridges: 1, turns: 3, spiky: 1, sleepy: 2, apples: 2, portals: 1, mechs: 6, decoyMax: 5,
              min: { decoyLive: 1, safety: 0.6, sols: 3, branch: 3, farShare: 0.5, markUse: 1, terrainUse: 1, starLow: 1 },
              max: { branch: 7, voidMiss: 5, runMax: 3, starTop: 0.5 } },
  пустоты:  { w: 10, h: 11, len: 30, moves: 8,  maxGap: 5, voids: 22, peak: 1, breather: 3, straightBias: 0.85,
              decoys: 5, bridges: 2, turns: 3, spiky: 1, sleepy: 2, apples: 2, portals: 1, mechs: 6, decoyMax: 4,
              min: { decoyLive: 1, safety: 0.6, sols: 2, branch: 2.5, farShare: 0.7, avgGap: 1.3, markUse: 1, terrainUse: 1, starLow: 1 },
              max: { branch: 7, voidMiss: 5, runMax: 3, starTop: 0.5 } },
  простор:  { w: 12, h: 16, len: 52, moves: 13, maxGap: 5, voids: 33, peak: 1, breather: 3, straightBias: 0.8,
              decoys: 8, bridges: 2, turns: 4, spiky: 2, sleepy: 3, apples: 3, portals: 2, mechs: 6, decoyMax: 5, record: true,
              min: { decoyLive: 1, branch: 3, farShare: 0.6, avgGap: 1.2, alive: 0.2, markUse: 1, terrainUse: 1 },
              max: { branch: 8, alive: 0.65, voidMiss: 7, runMax: 3 } },
};

function check(p, m) { return checkSome(p, m, true).concat(checkSome(p, m, false)); }
const fmt = (x) => (x == null ? '—' : (typeof x === 'number' ? +x.toFixed(2) : x));

/* decoyMove — обманкой можно сходить (обед, вылет не в счёт), decoyFood — её
   можно съесть. Мостовые и приманки в зачёт не идут: их работа — лежать поперёк
   луча и жалить (меряет markUse). История починки метрики — бриф §6d. */
const plainDecoys = (lv) => {
  const idx = [];
  lv.snakes.forEach((s, i) => { if (s.decoy && !s.onBridge && !s.trap) idx.push(i); });
  return idx;
};

function decoyMove(lv) {
  const idx = plainDecoys(lv);
  if (!idx.length) return 1;
  const st = G.stateOf(lv), br = G.boardOf(lv);
  return idx.filter((i) => !st[i].sleep && st[i].cells.length > 1
    && G.raycast(st, i, lv.w, lv.h, br).kind === 'tail').length / idx.length;
}

function decoyFood(lv) {
  const idx = plainDecoys(lv);
  if (!idx.length) return 1;
  const seen = S.tailsSeen(lv);
  return idx.filter((i) => seen.has(lv.snakes[i].id)).length / idx.length;
}

// обманка играет, если можно сходить ИЛИ съесть; «ни того ни другого» — мебель
function decoyLiveness(lv) {
  const idx = plainDecoys(lv);
  if (!idx.length) return 1;
  const st = G.stateOf(lv), br = G.boardOf(lv), seen = S.tailsSeen(lv);
  return idx.filter((i) => seen.has(lv.snakes[i].id)
    || (!st[i].sleep && st[i].cells.length > 1 && G.raycast(st, i, lv.w, lv.h, br).kind === 'tail')
  ).length / idx.length;
}

// метрики в два захода: дешёвые первыми, дорогой обход — только пережившим
export function measureCheap(lv, preset) {
  const sh = S.shape(lv, preset.record ? 120 : 50, lv.len * 7 + 1);
  const cv = S.curve(lv, null) || {};
  const mk = S.marks(lv), tr = S.terrain(lv);
  return { decoyLive: decoyLiveness(lv), decoyMove: decoyMove(lv), decoyFood: decoyFood(lv),
    fake: S.fakeDepth(lv), starts: sh.starts, branch: sh.branch,
    starLow: sh.starLow, starMiss: sh.starMiss, starTop: sh.starTop, starMarks: sh.starMarks,
    markUse: mk.markUse, spikyUse: mk.spikyUse, sleepUse: mk.sleepUse,
    terrainUse: tr.terrainUse, gateUse: tr.gateUse, bridgeUse: tr.bridgeUse, turnUse: tr.turnUse,
    voids: cv.voids, voidMiss: cv.voidMiss, runMax: cv.runMax, restShare: cv.restShare,
    tiltWant: cv.tiltWant, tiltGap: cv.tiltGap, gaps: cv.gaps,
    farShare: sh.farShare, avgGap: sh.avgGap, randMed: sh.randMed, randTop: sh.randTop,
    mass: G.totalMass(lv.snakes), snakes: lv.snakes.length, target: lv.len, moves: lv.moves.length };
}

export function measureDeep(lv, preset, m) {
  // наклон риска и fakeTrap — только на целевых: на рекордных цели нет, и обход
  // всего пространства стоил 24 с за попытку
  if (!preset.record && (preset.fake || 0) > 0) m.fakeTrap = S.fakeTrap(lv);
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
const CHEAP = new Set(['decoyLive', 'decoyMove', 'decoyFood', 'starLow', 'starMiss', 'starTop', 'starts', 'branch', 'farShare', 'avgGap', 'voidMiss', 'runMax', 'tiltGap', 'restShare', 'markUse', 'spikyUse', 'sleepUse', 'terrainUse', 'gateUse', 'bridgeUse', 'turnUse']);
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

// недобор: что ручка заказала, а доска не отдала — брак с именем ручки;
// считается по доске, не по намерению
export const HAVE = {
  portals: (lv) => (lv.portals || []).length,
  bridges: (lv) => (lv.bridges || []).length,
  turns:   (lv) => (lv.turns || []).length,
  apples:  (lv) => lv.snakes.filter((s) => s.apple).length,
  spiky:   (lv) => lv.snakes.filter((s) => s.spiky).length,
  sleepy:  (lv) => lv.snakes.filter((s) => s.sleep && !s.apple).length,
  decoys:  (lv) => lv.snakes.filter((s) => s.decoy).length,
  // ветку меряем ИГРОЙ: сколько ходов подряд она реально выдерживает на этой доске
  fake:    (lv) => S.fakeDepth(lv),
};

export function shortfall(lv, p) {
  const out = [];
  for (const [k, count] of Object.entries(HAVE)) {
    const want = p[k] || 0;
    if (!want) continue;
    const got = count(lv);
    if (got < want) out.push(`${k} ${got}<${want}`);
  }
  return out;
}

/* Надёжный (не абсолютный) предел бюджета пустот: разрез с зазором k требует
   змею ≥ k+3, куски к концу короткие; повороты потолок поднимают (замер на
   «пустотах»: ~16 без них, ~25 при шести, упор ~0.85 цели). */
export function voidCeiling(p) {
  const rest = p.breather > 0 ? Math.max(0, Math.ceil((p.moves - 2) / p.breather)) : 0;
  const slots = Math.max(1, p.moves - rest);
  const flat = Math.min(0.5 * p.len, 1.9 * p.moves, p.maxGap * slots);
  return Math.max(0, Math.round(Math.min(0.85 * p.len, flat + 1.6 * (p.turns || 0))));
}

// одна попытка: имя пресета или конфиг из модалки (коридоры — от пресета)
export function craftOnce(preset, seed) {
  const p = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!p) throw new Error('нет пресета ' + preset);
  const lv = G.generate({ ...p, seed, minMoves: p.moves });
  if (!lv) return { fail: 'не собралось' };
  const v = G.verify(lv);
  if (!v.ok || v.len !== lv.len) return { fail: 'проверка вперёд: ' + (v.why || 'длина') };
  const short = shortfall(lv, p);          // недобор первым: дешёв и очевиден игроку
  if (short.length) return { fail: short.join(', ') };
  const m = measureCheap(lv, p);
  const cheapBad = checkSome(p, m, true);
  if (cheapBad.length) return { fail: cheapBad.join(', ') };
  measureDeep(lv, p, m);
  if (m.shortcut) return { fail: 'есть решение короче задуманного' };
  // ветка, после которой цель жива, — не ловушка (такие safety даже поднимали)
  if ((p.fake || 0) > 0 && !p.record && !m.fakeTrap) return { fail: 'fakeTrap ветка не наказывает' };
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
