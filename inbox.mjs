/* Разбор присланных партий. На вход — текст с кодами HV1-… (файл или stdin),
   на выход — почему уровень не пошёл.

   Разбирается кодом САМОЙ ИГРЫ, вырезанным из .jsx: спор «у меня не проходится»
   решается только тем движком, в который человек играл, а не его пересказом. */
import fs from 'fs';
import { decode, REASONS, CFG_KEYS } from './sharecode.mjs';
import { marksOf } from './generator.mjs';   // формула отметок — одна на всех

const src = fs.readFileSync('hvostoed.jsx', 'utf8');
const logic = src.slice(src.indexOf('const SIDES = { n:'), src.indexOf('function buildEatMove'));
const M = eval(logic + '\n({ raycast, applyEat, maxLen, stateKey, legalMoves, planGoal, planLongest, walkSids, ckey })');


const boardOf = (lv) => ({
  rocks: new Set((lv.rocks || []).map(([x, y]) => M.ckey(x, y))),
  bridges: new Set((lv.bridges || []).map(([x, y]) => M.ckey(x, y))),
  turns: new Map((lv.turns || []).map(([x, y, a, b]) => [M.ckey(x, y), a + b])),
  gates: new Map((lv.portals || []).map(([x, y, u, v]) => [M.ckey(x, y), [u, v]])),
});
const mk = (lv) => lv.snakes.map((s, i) => ({ id: 's' + i, cells: s.cells.map((c) => c.slice()),
  spiky: !!s.spiky, sleep: !!s.sleep || !!s.apple, apple: !!s.apple }));
const mass = (sn) => sn.reduce((a, s) => a + s.cells.length, 0);

function report(rec, n) {
  const lv = rec.level, bd = boardOf(lv), goal = lv.mode !== 'record';
  const target = lv.ceiling;
  const marks = goal ? marksOf(target, Math.max(...lv.snakes.map((s) => s.cells.length))) : (lv.marks || []);
  const start = mk(lv);
  console.log(`\n${'═'.repeat(64)}\n#${n}  «${REASONS[rec.reason]}»  ${lv.w}×${lv.h}  ${goal ? 'отметки ' + marks.join(' · ') : 'рекорд, потолок ' + target}`);
  const mech = [];
  if ((lv.bridges || []).length) mech.push(`мостов ${lv.bridges.length}`);
  if ((lv.turns || []).length) mech.push(`поворотов ${lv.turns.length}`);
  if (lv.snakes.some((s) => s.apple)) mech.push(`яблок ${lv.snakes.filter((s) => s.apple).length}`);
  if ((lv.portals || []).length) mech.push(`порталов ${lv.portals.length}`);
  if (lv.snakes.some((s) => s.spiky)) mech.push(`колючих ${lv.snakes.filter((s) => s.spiky).length}`);
  if (lv.snakes.some((s) => s.sleep)) mech.push(`спящих ${lv.snakes.filter((s) => s.sleep).length}`);
  console.log(`  змей ${lv.snakes.length}, клеток ${mass(start)}, запас ${mass(start) - target}` +
    (mech.length ? ' · ' + mech.join(', ') : ' · без механик'));
  if (rec.cfg) console.log('  ручки: ' + CFG_KEYS.filter((k) => rec.cfg[k]).map((k) => `${k}=${rec.cfg[k]}`).join(' '));

  // 1. был ли уровень проходим вообще
  if (lv.plan && lv.plan.length) {
    const got = M.walkSids(lv, mk(lv), lv.plan, bd);
    console.log(got.bad ? `  ЗАДУМАННЫЙ ПЛАН СЛОМАН: ${got.bad}`
      : `  задуманный план: ${lv.plan.length} ходов → длина ${got.len}${got.len >= target ? ' ✓' : ' ✗ НЕ ДОБИРАЕТ'}`);
  } else console.log('  плана в уровне нет (уровень старше обмена)');

  // 2. что делал игрок
  if (!rec.played.length) { console.log('  ходов не сделано'); return; }
  let sn = start, dead = null, off = null;
  const planMap = new Map();
  if (lv.plan) { const g = M.walkSids(lv, mk(lv), lv.plan, bd); if (!g.bad) g.steps.forEach((s) => planMap.set(s.k, s.sid)); }
  console.log('  партия:');
  for (let i = 0; i < rec.played.length; i++) {
    const sid = rec.played[i];
    const onPlan = planMap.get(M.stateKey(sn));
    if (off === null && onPlan != null && onPlan !== sid) off = i;
    const ray = M.raycast(sn, sid, lv.w, lv.h, bd);
    if (ray.kind === 'tail') sn = M.applyEat(sn, sid, ray);
    else if (ray.kind === 'edge') sn = sn.filter((q) => q.id !== sid);
    else { console.log(`    ${i + 1}. ${sid} — ход невозможен (${ray.kind}), журнал не сходится`); return; }
    const m = mass(sn), best = M.maxLen(sn);
    let mark = '';
    if (goal && dead === null) {
      if (m < marks[0]) { dead = i; mark = ' ← ЗДЕСЬ УРОВЕНЬ УМЕР (клеток меньше нижней отметки)'; }
      else if (!planMap.has(M.stateKey(sn))) {
        const out = {};
        const p = M.planGoal({ ...lv, target }, sn, bd, out);
        if (!p && !out.exhausted) { dead = i; mark = ' ← ЗДЕСЬ ПОТОЛОК СТАЛ НЕДОСТИЖИМ (перебор не нашёл)'; }
        else if (!p) mark = ' (перебор не осилил — не знаю)';
      }
    }
    console.log(`    ${String(i + 1).padStart(2)}. ${ray.kind === 'edge' ? 'выпуск ' : 'ест    '}${sid}` +
      `  длина ${best}  клеток ${m}${onPlan != null ? (onPlan === sid ? '  по плану' : '  ✗ план звал ' + onPlan) : ''}${mark}`);
  }
  if (rec.lastTry) console.log(`  последний тап: ${rec.lastTry}`);
  console.log('  ИТОГ: ' + (dead !== null
    ? `уровень был проходим, партия умерла на ходу ${dead + 1}` + (off !== null ? `; с плана сошёл на ходу ${off + 1}` : '')
    : off !== null ? `с задуманного плана сошёл на ходу ${off + 1}, но цель ещё достижима`
    : 'шёл по задуманному плану'));
}

const text = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
const codes = text.match(/HV1-[A-Za-z0-9_-]+/g) || [];
if (!codes.length) { console.log('кодов HV1- в тексте нет'); process.exit(1); }
console.log(`Найдено ${codes.length} партий`);
codes.forEach((c, i) => {
  try { report(decode(c), i + 1); }
  catch (e) { console.log(`\n#${i + 1} не разобрался: ${e.message}`); }
});
