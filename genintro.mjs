/* Пак «Азбука»: 30 уровней без механик и без обманок — каждая змея на доске
   входит в решение (decoys: 0, ходов ровно змей−1, финал — одна змея).
   Сложность регулируют только пустоты (зазоры) и порядок обедов: неправильный
   обед запирает доску, вылет теряет массу. Шесть полос от «двух змей вплотную»
   до большого поля с одной-двумя верными линиями.
   Запуск: node genintro.mjs [--probe] — probe печатает распределения метрик,
   без него собирает пак и печатает массив уровней. */
import * as P from './presets.mjs';
import * as G from './generator.mjs';

const BASE = { peak: 1, breather: 3, straightBias: 0.75,
  decoys: 0, decoyMax: 0, spiky: 0, sleepy: 0, apples: 0,
  bridges: 0, turns: 0, portals: 0, mechs: 0, fake: 0 };

export const BANDS = [
  { tag: 'A', w: 5, h: 4,  len: 6,  moves: 2, maxGap: 1, voids: 1 },
  { tag: 'B', w: 6, h: 5,  len: 9,  moves: 3, maxGap: 2, voids: 2 },
  { tag: 'C', w: 7, h: 6,  len: 12, moves: 4, maxGap: 3, voids: 4 },
  { tag: 'D', w: 8, h: 8,  len: 16, moves: 5, maxGap: 4, voids: 6 },
  { tag: 'E', w: 9, h: 10, len: 22, moves: 7, maxGap: 4, voids: 9 },
  { tag: 'F', w: 10, h: 12, len: 30, moves: 9, maxGap: 5, voids: 13 },
];

const cfg = (b) => ({ ...BASE, ...b, min: { starLow: 1, ...(b.min || {}) }, max: { ...(b.max || {}) } });

if (process.argv.includes('--probe')) {
  for (const b of BANDS) {
    const ok = [], why = {};
    for (let seed = 1; seed <= 120; seed++) {
      const r = P.craftOnce(cfg(b), seed);
      if (r.level) ok.push(r); else { const t = r.fail.split(/[,:]/)[0]; why[t] = (why[t] || 0) + 1; }
    }
    const col = (k) => ok.map((r) => +(+r.metrics[k]).toFixed(2)).sort((a, b2) => a - b2);
    const q = (a, p) => a.length ? a[Math.floor(p * (a.length - 1))] : null;
    const show = (k) => `${k} ${q(col(k), 0)}/${q(col(k), .5)}/${q(col(k), 1)}`;
    console.log(b.tag, 'принято', ok.length, '/120', ['safety','sols','starTop','avgGap','farShare','endRisk','voids'].map(show).join('  '));
    console.log('  отказы:', JSON.stringify(why));
  }
}

/* Точный потолок — тем же полным перебором, что и ворота solver.js: режем его
   код строковыми якорями (как plancheck.mjs). Кандидат с потолком выше len
   отбраковывается сразу: объявили бы len — solver завернул бы пак, объявили бы
   замер — сдвинулись бы отметки, замеренные при отборе. Честнее не брать. */
import fs from 'fs';
const solverSrc = fs.readFileSync(new URL('./solver.js', import.meta.url), 'utf8');
const SOLV = eval(solverSrc.slice(solverSrc.indexOf('const ck = (x, y)'),
  solverSrc.indexOf('function geometry')) + '\n({ ceilingOf, solve })');

/* Доля безопасных ОБЕДОВ: по всем достижимым состояниям — какая часть обедов
   (вылеты не в счёт) оставляет потолок достижимым. Уроки пака опираются на это
   число буквально: полоса A обещает «любой порядок доводит до конца» — там она
   обязана быть 1.0; полоса B обещает первый запирающий порядок — там она обязана
   быть МЕНЬШЕ 1. Метрика safety из levelstats для этого не годится: она мешает
   обеды с вылетами, а вылет — не порядок, а потеря массы. */
function eatSafety(lv) {
  const br = G.boardOf(lv);
  const memo = new Map();
  const sk = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');
  const win = (st) => {
    if (G.maxLen(st) >= lv.len) return true;
    const k = sk(st);
    if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const m of G.movesOf(st, lv.w, lv.h, br))
      if (win(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i))) { r = true; break; }
    memo.set(k, r); return r;
  };
  const start = G.stateOf(lv);
  const seen = new Set([sk(start)]), stack = [start];
  let taps = 0, safe = 0;
  while (stack.length && seen.size < 120000) {
    const st = stack.pop();
    if (G.maxLen(st) >= lv.len) continue;
    for (const m of G.movesOf(st, lv.w, lv.h, br)) {
      const nx = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i);
      const ok = win(nx);
      if (m.eat) { taps++; if (ok) safe++; }
      if (ok) { const k = sk(nx); if (!seen.has(k)) { seen.add(k); stack.push(nx); } }
    }
  }
  return taps ? safe / taps : 1;
}

/* Балл сложности — только из замеренного: доля опасных тапов, недоступность
   потолка тупой игре, средний зазор. Веса грубые, порядок внутри полосы ставит
   именно этот балл, между полосами — рост поля и числа змей. */
const score = (m) => (1 - m.eatSafety) + 0.7 * (1 - m.starTop) + 0.3 * Math.min(m.avgGap / 2, 1);

/* Коридоры отбора по полосам — из пробного прогона (--probe, 120 сидов):
   медианы safety ~0.5-0.6 и starTop 1→0.08 от A к F. A обязана прощать всё
   (тупая игра всегда берёт потолок), F — почти ничего. */
const FIT = {
  A: (m) => m.starTop >= 0.99 && m.sols >= 2 && m.eatSafety === 1,
  B: (m) => m.starTop >= 0.4 && m.eatSafety < 1 && m.eatSafety >= 0.6,
  C: (m) => m.starTop >= 0.2 && m.starTop <= 0.7 && m.voids >= 2 && m.eatSafety <= 0.9 && m.eatSafety >= 0.5,
  D: (m) => m.starTop <= 0.4 && m.voids >= 4 && m.eatSafety <= 0.8,
  E: (m) => m.starTop <= 0.25 && m.avgGap >= 0.8 && m.voids >= 6 && m.eatSafety <= 0.7,
  F: (m) => m.starTop <= 0.15 && m.avgGap >= 1 && m.farShare >= 0.4 && m.voids >= 9 && m.eatSafety <= 0.6,
};

const NAMES = {
  A: ['Первый укус', 'Трое в ряд', 'Столовая', 'Как угодно', 'Глаза и шея'],
  B: ['Очередь из двух', 'Кто кого потом', 'Дальний хвост', 'Не в край', 'Два хода вперёд'],
  C: ['Пустая середина', 'Развилка', 'Хвост из ниоткуда', 'Тесный порядок', 'Сквозняк без окон'],
  D: ['Широкое поле', 'Длинная нитка', 'Обманчивая лёгкость', 'Перекрёсток взглядов', 'Узкое горло'],
  E: ['Простор', 'Дальнобой', 'Клубок на девятерых', 'Тихий тупик', 'Восьмёрка'],
  F: ['Большая вода', 'Одна линия', 'Почти правильно', 'Паутина', 'Последний экзамен'],
};
const LESSONS = {
  A: ['Тапни змею — она съест хвост, на который смотрит.',
      'Съев, змея смотрит туда же, куда смотрела съеденная.',
      'Пустые клетки между головой и хвостом съедаются вместе с жертвой.',
      'Здесь любой порядок обедов доводит до конца. Ешь как хочешь.',
      'Направление взгляда — голова минус шея. Ищи, куда смотрят глаза.'],
  B: ['Не всякий порядок доводит до конца: если никто ни на чей хвост не смотрит — доска встала.',
      'Прежде чем тапнуть, найди, кто съест едока потом.',
      'Чем дальше хвост жертвы, тем длиннее станет змея: зазор всасывается.',
      'Змея, глядящая за край, от тапа улетит — вместе со своей длиной.',
      'План на два хода вперёд уже спасает.'],
  C: ['Пустота — не пусто: после обеда тело ляжет там, где ничего не было.',
      'Считай форму змеи ПОСЛЕ обеда: её новый хвост — чья-то еда.',
      'Хвост едока не двигается — растёт голова. Проверь, кто до него достаёт.',
      'Из двух возможных обедов один запирает доску. Найди какой.',
      'Длинный луч через пустоту — это и подсказка, и ловушка.'],
  D: ['Поле шире — линий больше, а верных по-прежнему мало.',
      'Начинай с конца: кто останется последним и откуда он всех соберёт?',
      'Лёгкий первый ход — ещё не правильный первый ход.',
      'Когда взгляды скрещиваются, порядок решает всё.',
      'Один обед открывает дорогу, другой её хоронит.'],
  E: ['Больше змей — длиннее цепочка причин. Веди её с конца.',
      'Дальний хвост виден плохо. Проведи луч пальцем, если сомневаешься.',
      'Девять змей — восемь обедов, и лишнего среди них нет.',
      'Тупик тихий: доска встаёт без аварии. Заметь его заранее.',
      'Порядок здесь почти единственный. Ошибся — отматывай.'],
  F: ['Большое поле прощает меньше, чем маленькое: пустоты длиннее.',
      'Верная линия одна-две на сотни возможных. Не спеши.',
      'Почти правильный порядок рушится на предпоследнем ходу.',
      'Сначала карта: кто на кого смотрит и кто до кого достаёт.',
      'Всё, чему учила «Азбука», — на одной доске. Удачи.'],
};

if (!process.argv.includes('--probe')) {
  const out = [];
  for (const b of BANDS) {
    const pool = [];
    for (let seed = 1; seed <= 500 && pool.length < 40; seed++) {
      const r = P.craftOnce(cfg(b), seed);
      if (!r.level) continue;
      r.metrics.eatSafety = eatSafety(r.level);
      if (!FIT[b.tag](r.metrics)) continue;
      if (SOLV.ceilingOf(r.level) !== b.len) continue;   // потолок обязан равняться построенному
      pool.push(r);
    }
    if (pool.length < 5) { console.error(`полоса ${b.tag}: только ${pool.length} кандидатов`); process.exit(1); }
    pool.sort((x, y) => score(x.metrics) - score(y.metrics));
    // 5 штук веером по всему диапазону полосы, от лёгкого к трудному
    const pick = [0, 1, 2, 3, 4].map((i) => pool[Math.round(i * (pool.length - 1) / 4)]);
    pick.forEach((r, i) => out.push({ band: b.tag, i, r }));
    console.error(`полоса ${b.tag}: пул ${pool.length}, баллы ${pick.map((r) => score(r.metrics).toFixed(2)).join(' ')}`);
  }
  const lines = out.map(({ band, i, r }) => {
    const lv = r.level, m = r.metrics;
    const snakes = lv.snakes.map((s) => `      { cells: ${JSON.stringify(s.cells)} },`).join('\n');
    return `  {
    // ${band}${i + 1} · сид ${r.seed} · обеды безопасны ${m.eatSafety.toFixed(2)} · starTop ${m.starTop.toFixed(2)} · avgGap ${m.avgGap.toFixed(2)} · решений ${m.sols}
    name: ${JSON.stringify(NAMES[band][i])}, lesson: ${JSON.stringify(LESSONS[band][i])},
    w: ${lv.w}, h: ${lv.h}, ceiling: ${lv.len},
    snakes: [
${snakes}
    ],
  },`;
  });
  fs.writeFileSync('intro-pack.out', lines.join('\n') + '\n');
  console.error('готово: intro-pack.out, уровней ' + out.length);
}
