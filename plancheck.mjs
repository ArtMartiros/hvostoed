/* Проходит ли игра ЗАДУМАННЫЙ план генератора, ход в ход.

   Уровень строится из плана, и приёмка теперь принимает его не «пусть игра
   поищет решение заново», а «пусть игра пройдёт задуманное». Значит расхождение
   механики игры с механикой генератора — на мостах, коленах, шипах, сне — молча
   превратилось бы в непроходимый уровень у игрока. Этот тест его ловит: механика
   вырезается из .jsx и гоняется по свежесобранным уровням каждого пресета. */
import fs from 'fs';
import { PRESETS, craftOnce } from './presets.mjs';

const src = fs.readFileSync('hvostoed.jsx', 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, walkSids, ckey })');
const WANT = Number(process.argv[2] || 5);

let bad = 0;
for (const name of Object.keys(PRESETS)) {
  if (PRESETS[name].record) continue;          // на поле рекорда цели нет, плана тоже
  let ok = 0, tried = 0;
  const fails = [];
  for (let seed = 1; seed <= 600 && ok < WANT; seed++) {
    const r = craftOnce(name, seed);
    if (!r.level) continue;
    tried++;
    const lv = r.level;
    const board = { rocks: new Set(),
      bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
      turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])) };
    const snakes = lv.snakes.map((s, i) => ({ id: 's' + i, cells: s.cells.map((c) => c.slice()),
      spiky: !!s.spiky, sleep: !!s.sleep }));
    const sids = lv.moves.map((mv) => 's' + lv.snakes.findIndex((s) => s.id === mv.eater));
    const got = M.walkSids({ w: lv.w, h: lv.h }, snakes, sids, board);
    if (got.bad) { fails.push(`сид ${seed}: ${got.bad}`); continue; }
    if (got.len < lv.len) { fails.push(`сид ${seed}: длина ${got.len}/${lv.len}`); continue; }
    ok++;
  }
  if (fails.length || ok < WANT) bad++;
  console.log(`  ${name.padEnd(9)} собрано ${tried}, план игры прошёл ${ok}` +
    (fails.length ? ' — РАСХОЖДЕНИЕ' : ok < WANT ? ' — МАЛО УРОВНЕЙ' : ' — сходится'));
  fails.slice(0, 3).forEach((f) => console.log('      ' + f));
}
console.log(bad ? '\n!! МЕХАНИКА ИГРЫ РАСХОДИТСЯ С ГЕНЕРАТОРОМ' : '\nИГРА ПРОХОДИТ ЗАДУМАННЫЙ ПЛАН НА ВСЕХ ПРЕСЕТАХ');
process.exit(bad ? 1 : 0);
