// Критик: сколько РАЗНЫХ досок даёт генератор без механик на малых полосах (где 1★ безопасна).
// Каноническая форма: множество змей (клетки в порядке голова→хвост) с учётом 4 поворотов/отражений, где поле позволяет.
import * as PR from '../presets.mjs';
import { BANDS } from '../genintro.mjs';
const BASE = { peak: 1, breather: 3, straightBias: 0.75, decoys: 0, decoyMax: 0, spiky: 0, sleepy: 0, apples: 0, bridges: 0, turns: 0, portals: 0, mechs: 0, fake: 0 };
const T = (w, h) => [ (x,y)=>[x,y], (x,y)=>[w-1-x,y], (x,y)=>[x,h-1-y], (x,y)=>[w-1-x,h-1-y] ]; // симметрии прямоугольника (без транспонирования)
function canon(lv) {
  const keys = T(lv.w, lv.h).map((f) => lv.snakes.map((s) => s.cells.map(([x, y]) => f(x, y).join(',')).join(';')).sort().join('|'));
  return keys.sort()[0];
}
const SEEDS = { A: 3000, B: 3000, C: 1500, D: 1000 };
for (const b of BANDS.filter((b) => SEEDS[b.tag])) {
  const cfg = { ...BASE, ...b, min: { starLow: 1 }, max: {} };
  const set = new Set(); let acc = 0; const curve = [];
  for (let s = 1; s <= SEEDS[b.tag]; s++) {
    const r = PR.craftOnce(cfg, s); if (!r.level) continue; acc++; set.add(canon(r.level));
    if ([100, 250, 500, 1000].includes(acc)) curve.push(`${acc}→${set.size}`);
  }
  console.log(`${b.tag} ${b.w}x${b.h}: сидов ${SEEDS[b.tag]}, принято ${acc}, различных досок (с точностью до симметрий) ${set.size} (${(100*set.size/acc).toFixed(0)}%); кривая принятых→различных: ${curve.join(', ')}`);
}
