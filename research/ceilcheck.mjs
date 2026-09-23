// Сколько стоит точный потолок (ceilingOf из solver.js) для уровней генератора без механик
import fs from 'fs';
import * as PR from '../presets.mjs';
const BANDS = [
  { tag: 'A', w: 5, h: 4,  len: 6,  moves: 2, maxGap: 1, voids: 1 },
  { tag: 'C', w: 7, h: 6,  len: 12, moves: 4, maxGap: 3, voids: 4 },
  { tag: 'E', w: 9, h: 10, len: 22, moves: 7, maxGap: 4, voids: 9 },
  { tag: 'F', w: 10, h: 12, len: 30, moves: 9, maxGap: 5, voids: 13 },
];
const BASE = { peak: 1, breather: 3, straightBias: 0.75, decoys: 0, decoyMax: 0, spiky: 0, sleepy: 0, apples: 0, bridges: 0, turns: 0, portals: 0, mechs: 0, fake: 0 };
const solverSrc = fs.readFileSync(new URL('../solver.js', import.meta.url), 'utf8');
const SOLV = eval(solverSrc.slice(solverSrc.indexOf('const ck = (x, y)'), solverSrc.indexOf('function geometry')) + '\n({ ceilingOf, solve })');
for (const b of BANDS) {
  let ok = 0, eq = 0, higher = 0, tms = 0, tmax = 0;
  for (let s = 1; s <= 40; s++) {
    const r = PR.craftOnce({ ...BASE, ...b, min: { starLow: 1 }, max: {} }, s);
    if (!r.level) continue; ok++;
    const t0 = Date.now(); const c = SOLV.ceilingOf(r.level); const dt = Date.now() - t0;
    tms += dt; tmax = Math.max(tmax, dt);
    if (c === r.level.len) eq++; else if (c > r.level.len) higher++;
  }
  console.log(`${b.tag} ${b.w}x${b.h}: принято ${ok}/40; потолок = построенному ${eq}/${ok}, выше ${higher}; ceilingOf среднее ${(tms / ok).toFixed(0)} мс, макс ${tmax} мс`);
}
