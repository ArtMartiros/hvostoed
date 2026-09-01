/* Проходит ли игра ЗАДУМАННЫЙ план генератора, ход в ход.

   Уровень строится из плана, и приёмка теперь принимает его не «пусть игра
   поищет решение заново», а «пусть игра пройдёт задуманное». Значит расхождение
   механики игры с механикой генератора — на мостах, поворотах, шипах, сне — молча
   превратилось бы в непроходимый уровень у игрока. Этот тест его ловит: механика
   вырезается из .jsx и гоняется по свежесобранным уровням каждого пресета. */
import fs from 'fs';
import { PRESETS, craftOnce } from './presets.mjs';
import * as G from './generator.mjs';
import * as LS from './levelstats.mjs';   // S уже занято вырезкой солвера

const src = fs.readFileSync('hvostoed.jsx', 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, walkSids, ckey })');
const solverSrc = fs.readFileSync('solver.js', 'utf8');
const S = eval(solverSrc.slice(solverSrc.indexOf('const ck = (x, y)'),
  solverSrc.indexOf('function applyEat')) + '\n({ raycast })');
const WANT = Number(process.argv[2] || 5);

/* Стенка поворота — регрессией (оба раза ломал порядок чтения клетки, жалоба
   «обед сквозь стену»): доска руками, проверяется ход, который обязан НЕ
   удаться, во всех трёх копиях механики. Правило: стенки держат с обеих сторон,
   изгиб работает только на пустой клетке. */
function turnWallCase() {
  const bd = { rocks: new Set(), bridges: new Set(), gates: new Map(),
    turns: new Map([['2,1', 'nw']]) };            // открыты север и запад, стенки на юге и востоке
  const cases = [
    ['голова лежит в жёлобе и смотрит в стенку — за стенкой хвост',
      [[[2, 1], [1, 1]], [[4, 1], [3, 1]]], 'turnBack'],
    ['голова лежит в жёлобе и смотрит в открытую сторону — луч выходит как обычно',
      [[[2, 1], [2, 2]], [[3, 0], [2, 0]]], 'tail'],
    ['луч снаружи бьёт плитке в спину, а на плитке лежит хвост',
      [[[2, 2], [2, 3]], [[3, 1], [2, 1]]], 'turnBack'],
  ];
  const fails = [];
  for (const [nom, cells, want] of cases) {
    const mk = () => cells.map((c, i) => ({ id: 's' + i, cells: c.map((q) => q.slice()) }));
    const got = { игра: M.raycast(mk(), 's0', 5, 4, bd).kind,
      генератор: G.raycast(mk(), 0, 5, 4, bd).kind,
      солвер: S.raycast(mk(), 0, 5, 4, bd).kind };
    for (const who of Object.keys(got))
      if (got[who] !== want) fails.push(`${nom}: ${who} отвечает «${got[who]}», а надо «${want}»`);
  }
  return fails;
}

/* Отдельным прогоном — доска, где включено ВСЁ сразу и погуще, чем в пресетах:
   тест обязан хоть раз прогнать луч через портал, мост и поворот на одной доске.
   (Раньше эта оговорка была про другое: потолок механик молча выкидывал виды
   прямо в генераторе, и портал мог не попасть в выборку ни разу. Теперь потолок
   живёт в модалке и ничего не режет — но плотная доска тесту всё равно нужна.) */
const CASES = Object.keys(PRESETS).filter((n) => !PRESETS[n].record).map((n) => [n, PRESETS[n]])
  .concat([['всё сразу', { ...PRESETS['пустоты'], mechs: 0, portals: 2, apples: 2,
    bridges: 2, turns: 3, spiky: 1, sleepy: 2 }]])
  /* И отдельно — доска, где колючая не приманка, а та, что ест ПОСЛЕДНЕЙ. Колючих
     больше, чем обманок, поэтому шипы победительнице генератор надевает не по монете,
     а обязательно: значит каждый собранный здесь уровень проверяет именно этот случай.
     Проверять его надо ровно так же, ходом игры: шипы на участнице решения — это
     чужие лучи, упирающиеся в её хвост, и разойдись игра с генератором хоть на одном,
     уровень встанет колом там, где план считал ход состоявшимся. */
  .concat([['колючая ест последней', { ...PRESETS['средний'], decoys: 2, spiky: 3, sleepy: 1 }, true]])
  /* И отдельно — ЛОЖНАЯ ВЕТКА. Её обещание держится на одном свойстве обеда: голова
     едока доезжает до головы съеденной и перенимает её направление, поэтому цепочка
     лучей работает как цепочка ходов. Свойство это живёт в applyEat, копий у applyEat
     две — в игре и в генераторе, — и разойдись они хоть на клетку, ветка развалилась
     бы на втором ходу: генератор считал бы её собранной, а игрок упирался в аварию.
     Поэтому здесь ветку проходит ИГРА, тем же тапом и по тому же входу. */
  .concat([['ложная ветка', { ...PRESETS['средний'], decoys: 4, spiky: 0, sleepy: 1, apples: 1, fake: 2 }, false, 2]]);

let bad = 0;
const wall = turnWallCase();
if (wall.length) bad++;
console.log(`  ${'стенка поворота'.padEnd(9)} проверок 9, ` +
  (wall.length ? 'РАСХОЖДЕНИЕ' : 'все три копии механики держат стенку'));
wall.forEach((f) => console.log('      ' + f));

for (const [name, preset, lead, fakeWant] of CASES) {
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
    // случай, ради которого случай и заведён: шипы носит участница решения
    if (lead && !lv.snakes.find((s) => s.id === lv.moves[lv.moves.length - 1].eater).spiky) {
      fails.push(`сид ${seed}: та, что ест последней, без шипов`); continue; }
    if (fakeWant) {
      /* Ветка открывается не обязательно на старте: дверь ищется на любом шагу плана.
         Поэтому игре даём ровно тот путь, который прошёл бы игрок, — задуманные ходы
         до нужного шага, а дальше тапы по ветке одной и той же змеёй. */
      const links = new Set(lv.snakes.filter((s) => s.fake).map((s) => s.id));
      const plain = new Set(lv.snakes.filter((s) => !s.decoy).map((s) => s.id));
      const br = G.boardOf(lv);
      const boards = LS.planBoards(lv);
      let at = -1, who = null;
      for (let m = 0; m < boards.length && at < 0; m++) {
        for (let i0 = 0; i0 < boards[m].length; i0++) {
          if (!plain.has(boards[m][i0].id)) continue;
          let st = boards[m], j = i0, n = 0;
          for (;;) {
            if (st[j].sleep || st[j].cells.length < 2) break;
            const r = G.raycast(st, j, lv.w, lv.h, br);
            if (r.kind !== 'tail' || !links.has(st[r.prey].id)) break;
            const eater = st[j].id;
            st = G.applyEat(st, j, r); n++;
            j = st.findIndex((q) => q.id === eater);
          }
          if (n >= fakeWant) {
            at = m; who = 's' + lv.snakes.findIndex((q) => q.id === boards[m][i0].id); break;
          }
        }
      }
      if (at < 0) { fails.push(`сид ${seed}: ветки на ${fakeWant} ходов нет`); continue; }
      const fresh = lv.snakes.map((s, i) => ({ id: 's' + i, cells: s.cells.map((c) => c.slice()),
        spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple }));
      const ran = M.walkSids({ w: lv.w, h: lv.h }, fresh,
        sids.slice(0, at).concat(Array(fakeWant).fill(who)), board);
      if (ran.bad) { fails.push(`сид ${seed}: игра не прошла ложную ветку — ${ran.bad}`); continue; }
    }
    ok++;
  }
  if (fails.length || ok < WANT) bad++;
  console.log(`  ${name.padEnd(9)} собрано ${tried}, план игры прошёл ${ok}` +
    (fails.length ? ' — РАСХОЖДЕНИЕ' : ok < WANT ? ' — МАЛО УРОВНЕЙ' : ' — сходится'));
  fails.slice(0, 3).forEach((f) => console.log('      ' + f));
}
console.log(bad ? '\n!! МЕХАНИКА ИГРЫ РАСХОДИТСЯ С ГЕНЕРАТОРОМ' : '\nИГРА ПРОХОДИТ ЗАДУМАННЫЙ ПЛАН НА ВСЕХ ПРЕСЕТАХ');
process.exit(bad ? 1 : 0);
