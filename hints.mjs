// Тест подсказки на коде, вырезанном из самой игры.
import fs from 'fs';
const src = fs.readFileSync(process.argv[2] || 'hvostoed.jsx','utf8');
const from = src.indexOf('const facing = (cells)');
const to = src.indexOf('function buildEatMove');
const logic = src.slice(from, to);
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };
const VOID = grab('RAW_LEVELS_VOID'), FIELDS = grab('RAW_FIELDS');
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, planGoal, planLongest, ckey })');

const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
});

const mkSnakes = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, cells: s.cells.map((c) => c.slice()) }));

// Проходим по плану так же, как это делает кнопка: смотрим текущее состояние в карте плана.
function walk(level, plan, limit) {
  const map = new Map(plan.map((st) => [st.k, st.sid]));
  let sn = mkSnakes(level), steps = 0;
  const board = { rocks: new Set((level.rocks || []).map(([x, y]) => M.ckey(x, y))),
                    bridges: new Set((level.bridges || []).map(([x, y]) => M.ckey(x, y))) };
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

let ok = true;
console.log('ЦЕЛЕВЫЕ УРОВНИ — подсказка обязана вести к кратчайшей победе');
VOID.forEach((lv, i) => {
  const t = Date.now();
  const plan = M.planGoal(lv, mkSnakes(lv), boardOf(lv));
  const ms = Date.now() - t;
  if (!plan) { console.log(`  ${i + 1}. ${lv.name} — ПЛАН НЕ НАЙДЕН`); ok = false; return; }
  const r = walk(lv, plan, 40);
  const win = !r.bad && r.len >= lv.target;
  if (!win) ok = false;
  console.log(`  ${String(i + 1).padStart(2)}. ${lv.name.padEnd(12)} план ${String(plan.length).padStart(2)} ходов → длина ${r.len}/${lv.target} ${win ? 'ПОБЕДА' : 'ПРОВАЛ ' + (r.bad || '')} (${ms} мс)`);
});
console.log('\nПОЛЯ РЕКОРДА — подсказка обязана довести до заявленного потолка');
FIELDS.forEach((lv) => {
  const t = Date.now();
  const plan = M.planLongest(lv, mkSnakes(lv), boardOf(lv));
  const ms = Date.now() - t;
  const r = walk(lv, plan, 60);
  const hit = !r.bad && r.len >= lv.ceiling;
  if (!hit) ok = false;
  console.log(`  ${lv.name.padEnd(16)} план ${String(plan.length).padStart(2)} ходов → длина ${r.len}/${lv.ceiling} ${hit ? 'ПОТОЛОК ВЗЯТ' : 'НЕ ДОТЯНУЛ ' + (r.bad || '')} (${ms} мс)`);
});
console.log(ok ? '\nПОДСКАЗКА КОРРЕКТНА НА ВСЕХ УРОВНЯХ И ПОЛЯХ' : '\n!! ПОДСКАЗКА ГДЕ-ТО ВРЁТ');
process.exit(ok ? 0 : 1);
