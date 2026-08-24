/* Проходит ли игра ЗАДУМАННЫЙ план генератора, ход в ход.

   Уровень строится из плана, и приёмка теперь принимает его не «пусть игра
   поищет решение заново», а «пусть игра пройдёт задуманное». Значит расхождение
   механики игры с механикой генератора — на мостах, поворотах, шипах, сне — молча
   превратилось бы в непроходимый уровень у игрока. Этот тест его ловит: механика
   вырезается из .jsx и гоняется по свежесобранным уровням каждого пресета. */
import fs from 'fs';
import { PRESETS, craftOnce } from './presets.mjs';

const src = fs.readFileSync('hvostoed.jsx', 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, walkSids, ckey })');
const WANT = Number(process.argv[2] || 5);

/* Отдельным прогоном — доска, где включено ВСЁ сразу и погуще, чем в пресетах:
   тест обязан хоть раз прогнать луч через портал, мост и поворот на одной доске.
   (Раньше эта оговорка была про другое: потолок механик молча выкидывал виды
   прямо в генераторе, и портал мог не попасть в выборку ни разу. Теперь потолок
   живёт в модалке и ничего не режет — но плотная доска тесту всё равно нужна.) */
const CASES = Object.keys(PRESETS).filter((n) => !PRESETS[n].record).map((n) => [n, PRESETS[n]])
  .concat([['всё сразу', { ...PRESETS['пустоты'], mechs: 0, portals: 2, apples: 2,
    bridges: 2, turns: 3, spiky: 1, sleepy: 2 }]]);

let bad = 0;
for (const [name, preset] of CASES) {
  let ok = 0, tried = 0;
  const fails = [];
  for (let seed = 1; seed <= 900 && ok < WANT; seed++) {
    const r = craftOnce(preset, seed);
    if (!r.level) continue;
    tried++;
    const lv = r.level;
    const board = { rocks: new Set(),
      bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
      turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
      gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])) };
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
