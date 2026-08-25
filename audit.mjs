/* Независимый аудит: меряем то, чего НЕТ в критериях приёмки.
   Смысл — поймать вырождения, о которых я не подумал, когда писал приёмку. */
import * as G from './generator.mjs';
import * as S from './levelstats.mjs';
import { PRESETS, craftOnce } from './presets.mjs';

const key = (st) => st.map((s) => s.cells.map((c) => c.join('.')).join(';')).sort().join('|');

function audit(lv, target) {
  /* Состояние — ЧЕРЕЗ stateOf и с доской, а не своей сборкой. Своя теряла spiky и
     sleep, и аудит шёл по полю, где колючий хвост съедобен, спящая ходит, а мостов,
     поворотов и порталов нет вовсе. С яблоками (змея в одну клетку) эта потеря
     перестала быть тихой: у клетки нет направления взгляда, и facing падал. */
  const br = G.boardOf(lv);
  const start = G.stateOf(lv).map((s, i) => ({ ...s, tag: i }));
  const decoyTags = new Set(lv.snakes.map((s, i) => (s.decoy ? i : -1)).filter((x) => x >= 0));

  // достижимость победы — для «сколько ходов на развилке ведут в тупик»
  const memo = new Map();
  const win = (st) => {
    if (G.maxLen(st) >= target) return true;
    const k = key(st); if (memo.has(k)) return memo.get(k);
    let r = false;
    for (const m of G.movesOf(st, lv.w, lv.h, br)) {
      if (win(m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i))) { r = true; break; }
    }
    memo.set(k, r); return r;
  };

  // 1. вынужденные ходы по задуманной линии
  let forced = 0, lineLen = 0;
  {
    let st = G.stateOf(lv);
    for (const mv of lv.moves) {
      const opts = G.movesOf(st, lv.w, lv.h, br);
      if (opts.length === 1) forced++;
      lineLen++;
      const i = st.findIndex((s) => s.id === mv.eater);
      const r = G.raycast(st, i, lv.w, lv.h, br);
      if (r.kind !== 'tail') break;
      st = G.applyEat(st, i, r);
    }
  }

  // 2/3. обход живых состояний: живые обманки, участие змей, соблазны
  const seen = new Set([key(start)]);
  const stack = [start];
  const touched = new Set();          // кто хоть раз ходил или был съеден
  const decoyLive = new Set();        // обманки, у которых хоть раз есть законный ход
  let taps = 0, safe = 0, firstSafe = 0, firstAll = 0;
  let first = true;
  while (stack.length && seen.size < 60000) {
    const st = stack.pop();
    if (G.maxLen(st) >= target) continue;
    const mv = G.movesOf(st, lv.w, lv.h, br);
    for (const m of mv) {
      const nx = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i);
      const alive = win(nx);
      taps++; if (alive) safe++;
      if (first) { firstAll++; if (alive) firstSafe++; }
      touched.add(st[m.i].tag);
      if (m.eat) touched.add(st[m.prey].tag);
      if (decoyTags.has(st[m.i].tag)) decoyLive.add(st[m.i].tag);
      if (m.eat && decoyTags.has(st[m.prey].tag)) decoyLive.add(st[m.prey].tag);
      if (alive) { const k = key(nx); if (!seen.has(k)) { seen.add(k); stack.push(nx); } }
    }
    first = false;
  }

  // 4. разброс по полю
  const occ = new Set();
  lv.snakes.forEach((s) => s.cells.forEach(([x, y]) => occ.add(y * lv.w + x)));
  let emptyQuad = 0;
  for (const [qx, qy] of [[0,0],[1,0],[0,1],[1,1]]) {
    let n = 0;
    for (let y = Math.floor(qy*lv.h/2); y < Math.floor((qy+1)*lv.h/2); y++)
      for (let x = Math.floor(qx*lv.w/2); x < Math.floor((qx+1)*lv.w/2); x++) if (occ.has(y*lv.w+x)) n++;
    if (n === 0) emptyQuad++;
  }
  const dead = lv.snakes.map((s, i) => i).filter((i) => !touched.has(i));
  // 5. форма решения: сколько разных змей выступают едоками и насколько дерево ветвится
  const eaters = new Set(lv.moves.map((m) => m.eater));
  const preyOf = new Map();
  lv.moves.forEach((m) => preyOf.set(m.eater, (preyOf.get(m.eater) || 0) + 1));
  const maxChain = Math.max(0, ...preyOf.values());

  /* 6. КАК ЛОЖАТСЯ ЗВЁЗДЫ у тупой игры. В приёмке стоит только потолок этой доли
     (starTop) — а здесь смотрим всё распределение: если тупая игра ровно так же
     часто берёт одну звезду, как три, шкала не различает игроков, и «отметки» —
     краска. Игра здесь честнее, чем в shape: разрешены и вылеты, то есть массу
     можно потерять, — а значит видно и нижний хвост распределения. */
  const marks = G.marksOf(target, G.maxLen(G.stateOf(lv)));
  const rnd = G.makeRng(lv.w * 131 + lv.h * 17 + target);
  const hist = [0, 0, 0, 0];
  for (let t = 0; t < 200; t++) {
    let st = G.stateOf(lv);
    for (let k = 0; k < 80; k++) {
      const mv = G.movesOf(st, lv.w, lv.h, br);
      if (!mv.length) break;
      const m = mv[Math.floor(rnd() * mv.length)];
      st = m.eat ? G.applyEat(st, m.i, m.ray) : st.filter((_, i) => i !== m.i);
    }
    hist[marks.filter((x) => G.maxLen(st) >= x).length]++;
  }
  return {
    stars: hist.map((h) => h / 200),
    marks,
    eaters: eaters.size,
    maxChain,
    chainShare: lv.moves.length ? maxChain / lv.moves.length : 1,
    forcedShare: lineLen ? forced / lineLen : 1,
    deadSnakes: dead.length,
    decoys: decoyTags.size,
    decoysLive: decoyLive.size,
    tempt: taps ? 1 - safe / taps : 0,      // доля тапов, ведущих в тупик — это и есть соблазны
    firstOk: firstAll ? firstSafe / firstAll : 0, firstAll,
    emptyQuad,
  };
}

function draw(lv) {
  const g = Array.from({ length: lv.h }, () => Array(lv.w).fill('·'));
  const AB = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh';
  lv.snakes.forEach((s, i) => s.cells.forEach(([x, y], j) => {
    g[y][x] = j === 0 ? (s.decoy ? AB[i % 34].toLowerCase() : AB[i % 34]) : (j === s.cells.length - 1 ? '○' : '▪');
  }));
  return g.map((r) => '   ' + r.join(' ')).join('\n');
}

const which = process.argv[2] || 'средний';
const n = +(process.argv[3] || 8);
const shots = +(process.argv[4] || 0);
const p = PRESETS[which];
console.log(`### ${which} — ${n} уровней\n`);
console.log('  #  едоков  длиннейшая  вынужд  мёртвых  обманок  соблазн  верных    звёзды тупой игры\n              цепь      ходов    змей    живых            1-х ходов    0 / 1 / 2 / 3');
const rows = [];
let seed = 1000, made = 0;
while (made < n && seed < 1000 + 600) {
  const r = craftOnce(which, seed++);
  if (!r.level) continue;
  const target = p.record ? null : r.level.len;
  const a = audit(r.level, target || r.metrics.ceiling);
  rows.push({ r, a });
  made++;
  console.log(`  ${String(made).padStart(2)}  ${String(a.eaters).padStart(6)}  ${String(a.maxChain).padStart(6)} (${(100*a.chainShare).toFixed(0)}%)  ${(100*a.forcedShare).toFixed(0).padStart(5)}%  ${String(a.deadSnakes).padStart(6)}   ${String(a.decoysLive)}/${a.decoys}  ${(100*a.tempt).toFixed(0).padStart(6)}%  ${(String(Math.round(a.firstOk*a.firstAll))+' из '+a.firstAll).padStart(9)}    ${a.stars.map((x)=>(100*x).toFixed(0).padStart(3)+'%').join(' ')}`);
}
const avg = (f) => (rows.reduce((s, x) => s + f(x.a), 0) / rows.length);
console.log(`\n  средние: едоков ${avg(a=>a.eaters).toFixed(1)}, длиннейшая цепь ${(100*avg(a=>a.chainShare)).toFixed(0)}% ходов, вынужденных ${(100*avg(a=>a.forcedShare)).toFixed(0)}%, мёртвых змей ${avg(a=>a.deadSnakes).toFixed(1)}, живых обманок ${(100*avg(a=>a.decoys?a.decoysLive/a.decoys:0)).toFixed(0)}%, соблазн ${(100*avg(a=>a.tempt)).toFixed(0)}%`);
console.log(`  звёзды тупой игры в среднем: ${[0,1,2,3].map((i)=>i+'★ '+(100*avg(a=>a.stars[i])).toFixed(0)+'%').join(', ')}`);
for (let i = 0; i < shots && i < rows.length; i++) {
  const { r, a } = rows[i];
  console.log(`\n--- ${which} #${i+1} (сид ${r.seed}) цель ${r.level.len} за ${r.level.moves.length}, вынужденных ${(100*a.forcedShare).toFixed(0)}%, мёртвых ${a.deadSnakes} ---`);
  console.log(draw(r.level));
}
