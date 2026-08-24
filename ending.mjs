/* Проверка правила конца партии на коде, вырезанном из самой игры.
   Цель — порог, а не финиш: партия обязана продолжаться, пока змея может расти.
   Здесь canGrow из игры сверяется с честным полным перебором на каждом состоянии
   вдоль всей партии, а не только на старте. */
import fs from 'fs';
const src = fs.readFileSync(process.argv[2] || 'hvostoed.jsx', 'utf8');
const logic = src.slice(src.indexOf('const facing = (cells)'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, canGrow, ckey })');
const grab = (n) => { const i = src.indexOf(`const ${n} = [`); const j = src.indexOf('\n];', i);
  return eval(src.slice(i + `const ${n} = `.length, j + 3)); };

const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, spiky: !!s.spiky, cells: s.cells.map((c) => c.slice()) }));

// Независимый ответ: достижима ли где-нибудь длина больше base. Полный обход, без бюджета.
function trueCanGrow(level, snakes, board, base) {
  const seen = new Set([M.stateKey(snakes)]);
  const stack = [snakes];
  while (stack.length) {
    const st = stack.pop();
    for (const mv of M.legalMoves(st, level.w, level.h, board)) {
      if (M.maxLen(mv.next) > base) return true;
      const k = M.stateKey(mv.next);
      if (seen.has(k)) continue;
      seen.add(k); stack.push(mv.next);
    }
  }
  return false;
}

let bad = 0, states = 0, ends = 0, over = 0;
for (const packName of ['RAW_LEVELS', 'RAW_LEVELS_VOID', 'RAW_FIELDS']) {
  const levels = grab(packName);
  console.log(`\n### ${packName}`);
  levels.forEach((lv, li) => {
    const board = { rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
                      bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))) };
    // жадно доигрываем партию до конца, на каждом шаге сверяя canGrow с перебором
    const seen = new Set();
    let sn = mk(lv), steps = 0, endedAt = null;
    for (; steps < 60; steps++) {
      const base = M.maxLen(sn);
      const anyEat = sn.some((s) => M.raycast(sn, s.id, lv.w, lv.h, board).kind === 'tail');
      const mine = M.canGrow(lv, sn, board, base);
      const truth = trueCanGrow(lv, sn, board, base);
      states++;
      if (mine !== truth) { bad++; console.log(`  ! ${lv.name} ход ${steps}: canGrow=${mine}, правда=${truth}`); }
      if (!anyEat && !truth) { endedAt = steps; break; }
      const opts = M.legalMoves(sn, lv.w, lv.h, board)
        .map((m) => ({ m, len: M.maxLen(m.next) }))
        .sort((a, b) => b.len - a.len);
      if (!opts.length) { endedAt = steps; break; }
      const k = M.stateKey(sn); if (seen.has(k)) break; seen.add(k);
      sn = opts[0].m.next;
    }
    ends += endedAt != null ? 1 : 0;
    const fin = M.maxLen(sn);
    const tgt = lv.target || 0;
    if (tgt && fin > tgt) over++;
    console.log(`  ${String(li + 1).padStart(2)}. ${(lv.name || '').padEnd(14)} ` +
      `жадная партия: ${steps} ходов, длина ${fin}${tgt ? '/' + tgt : ''}` +
      `${endedAt != null ? ' — конец по «расти некуда»' : ' — обрыв по лимиту'}` +
      `${tgt && fin > tgt ? '  ЦЕЛЬ ПЕРЕБИТА' : ''}`);
  });
}
console.log(`\nСверено состояний: ${states}, расхождений canGrow с перебором: ${bad}`);
console.log(`Партий, дошедших до честного конца: ${ends}`);
if (bad) { console.log('\nПРАВИЛО КОНЦА СЛОМАНО'); process.exit(1); }
console.log('\nПРАВИЛО КОНЦА КОРРЕКТНО: партия кончается ровно тогда, когда рост невозможен');
