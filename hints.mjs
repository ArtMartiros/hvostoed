// Тест подсказки на коде, вырезанном из самой игры.
import fs from 'fs';
const src = fs.readFileSync(process.argv[2] || 'hvostoed.jsx','utf8');
const from = src.indexOf('const SIDES = { n:');
const to = src.indexOf('function buildEatMove');
const logic = src.slice(from, to);
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const PACKS = [['ПУСТОТА', grab('RAW_LEVELS_VOID')], ['КАМПАНИЯ', grab('RAW_LEVELS')]];
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, planGoal, planLongest, ckey })');

const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});

const mkSnakes = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, cells: s.cells.map((c) => c.slice()) }));

// Проходим по плану так же, как это делает кнопка: смотрим текущее состояние в карте плана.
function walk(level, plan, limit) {
  const map = new Map(plan.map((st) => [st.k, st.sid]));
  let sn = mkSnakes(level), steps = 0;
  const board = boardOf(level);
  while (steps < limit) {
    const sid = map.get(M.stateKey(sn));
    if (sid == null) break;
    const ray = M.raycast(sn, sid, level.w, level.h, board);
    if (ray.kind === 'tail') sn = M.applyEat(sn, sid, ray);
    else if (ray.kind === 'edge') sn = sn.filter((q) => q.id !== sid);
    else return { bad: 'подсказка ведёт в аварию: ' + ray.kind, steps };
    steps++;
  }
  return { len: M.maxLen(sn), steps, left: sn.length };
}

/* Подсказка обязана доводить до ПОТОЛКА поля, а не до нижней отметки: звёзды — это
   отметки длины, и совет, обрывающийся на первой звезде, бросает игрока там, где
   игра только начинается. Проверяем оба пака: раньше проверялись одни пустоты. */
let ok = true;
for (const [nom, levels] of PACKS) {
  console.log(`${nom} — подсказка обязана вести к потолку кратчайшим путём`);
  levels.forEach((lv, i) => {
    const t = Date.now();
    const plan = M.planGoal(lv, mkSnakes(lv), boardOf(lv));
    const ms = Date.now() - t;
    if (!plan) { console.log(`  ${i + 1}. ${lv.name} — ПЛАН НЕ НАЙДЕН`); ok = false; return; }
    const r = walk(lv, plan, 40);
    const hit = !r.bad && r.len >= lv.ceiling;
    if (!hit) ok = false;
    console.log(`  ${String(i + 1).padStart(2)}. ${lv.name.padEnd(16)} план ${String(plan.length).padStart(2)} ходов → длина ${r.len}/${lv.ceiling} ${hit ? 'ПОТОЛОК ВЗЯТ' : 'НЕ ДОТЯНУЛ ' + (r.bad || '')} (${ms} мс)`);
  });
  console.log('');
}
console.log(ok ? 'ПОДСКАЗКА КОРРЕКТНА НА ВСЕХ УРОВНЯХ' : '!! ПОДСКАЗКА ГДЕ-ТО ВРЁТ');
process.exit(ok ? 0 : 1);
