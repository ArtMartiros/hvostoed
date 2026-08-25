/* Код уровня для переписки: доска целиком, а не сид.
   Соблазн кодировать сид с конфигом велик — это сорок символов вместо трёхсот.
   Но уровень однозначен по сиду только при неизменном генераторе, а он меняется
   каждую неделю, и весь присланный архив превращался бы в тыкву. Поэтому доска.

   К доске прикладывается ПАРТИЯ — список ходов игрока. Сам уровень почти ничего
   не говорит: важно, на каком ходу человек застрял и что нажимал. С партией
   уровень воспроизводится клетка в клетку.

   Один модуль на игру и на разбор: расходиться кодировщику с раскодировщиком
   нельзя, а два экземпляра расходятся всегда. */

const MAGIC = 'HV1';
export const REASONS = ['нравится', 'тупик', 'авария', 'не проходится'];
const SIDE_IDX = { n: 0, s: 1, e: 2, w: 3 };
const SIDE_NAME = ['n', 's', 'e', 'w'];
// ручки в фиксированном порядке: их значения и есть ответ на «какие настройки дают плохие уровни»
export const CFG_KEYS = ['w', 'h', 'len', 'moves', 'decoys', 'bridges', 'turns',
  'spiky', 'sleepy', 'voids', 'peak100', 'breather', 'maxGap', 'apples', 'portals', 'mechs'];

const b64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

class W {
  constructor() { this.a = []; }
  u8(v) { this.a.push(Math.max(0, Math.min(255, v | 0))); return this; }
  u16(v) { const x = Math.max(0, Math.min(65535, v | 0)); this.a.push(x >> 8, x & 255); return this; }
  u32(v) { const x = v >>> 0; this.a.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); return this; }
  list(arr, f) { this.u8(arr.length); for (const it of arr) f(this, it); return this; }
}
class R {
  constructor(a) { this.a = a; this.i = 0; }
  u8() { return this.a[this.i++]; }
  u16() { const v = (this.a[this.i] << 8) | this.a[this.i + 1]; this.i += 2; return v; }
  u32() { const v = ((this.a[this.i] << 24) >>> 0) + (this.a[this.i + 1] << 16) + (this.a[this.i + 2] << 8) + this.a[this.i + 3]; this.i += 4; return v; }
  list(f) { const n = this.u8(), out = []; for (let k = 0; k < n; k++) out.push(f(this)); return out; }
}

export function encode(rec) {
  const lv = rec.level, w = new W();
  const rec_ = rec.mode === 'record' || lv.mode === 'record';
  w.u8(1).u8(lv.w).u8(lv.h).u8(rec_ ? 1 : 0).u16(lv.ceiling || lv.target || 0);
  w.list(lv.snakes, (o, s) => {
    o.u8(s.cells.length).u8((s.spiky ? 1 : 0) | (s.sleep ? 2 : 0) | (s.apple ? 4 : 0));
    for (const [x, y] of s.cells) o.u8(x).u8(y);
  });
  w.list(lv.rocks || [], (o, [x, y]) => o.u8(x).u8(y));
  w.list(lv.bridges || [], (o, [x, y]) => o.u8(x).u8(y));
  w.list(lv.turns || [], (o, [x, y, a, b]) => o.u8(x).u8(y).u8((SIDE_IDX[a] << 4) | SIDE_IDX[b]));
  w.list(lv.portals || [], (o, [x, y, u, v]) => o.u8(x).u8(y).u8(u).u8(v));
  const sid = (s) => (typeof s === 'string' ? parseInt(s.slice(1), 10) : s);
  w.list((lv.plan || []).map(sid), (o, v) => o.u8(v));
  w.list((rec.played || []).map(sid), (o, v) => o.u8(v));
  w.u8(rec.lastTry == null ? 255 : sid(rec.lastTry));
  w.u8(rec.reason || 0);
  w.u8(rec.presetIdx == null ? 255 : rec.presetIdx);
  w.u32(rec.seed || 0);
  const cfg = rec.cfg || null;
  w.list(cfg ? CFG_KEYS.map((k) => cfg[k] || 0) : [], (o, v) => o.u16(v));
  return MAGIC + '-' + b64(w.a);
}

export function decode(str) {
  const s = String(str).trim().replace(/\s+/g, '');
  if (s.slice(0, 4) !== MAGIC + '-') throw new Error('не код уровня (нет ' + MAGIC + '-)');
  const r = new R(unb64(s.slice(4)));
  const ver = r.u8();
  if (ver !== 1) throw new Error('версия кода ' + ver + ', эта сборка знает 1');
  const lv = { w: r.u8(), h: r.u8() };
  const fl = r.u8();
  const goal = r.u16();
  lv.mode = fl & 1 ? 'record' : 'goal';
  lv.ceiling = goal;      // одно число на оба режима: верхняя отметка она же потолок поля
  lv.snakes = r.list((o) => {
    const n = o.u8(), f = o.u8(), cells = [];
    for (let k = 0; k < n; k++) cells.push([o.u8(), o.u8()]);
    return { cells, spiky: !!(f & 1), sleep: !!(f & 2), apple: !!(f & 4) };
  });
  lv.rocks = r.list((o) => [o.u8(), o.u8()]);
  lv.bridges = r.list((o) => [o.u8(), o.u8()]);
  lv.turns = r.list((o) => { const x = o.u8(), y = o.u8(), b = o.u8();
    return [x, y, SIDE_NAME[b >> 4], SIDE_NAME[b & 15]]; });
  lv.portals = r.list((o) => [o.u8(), o.u8(), o.u8(), o.u8()]);
  lv.plan = r.list((o) => 's' + o.u8());
  const played = r.list((o) => 's' + o.u8());
  const lastTry = r.u8();
  const reason = r.u8();
  const presetIdx = r.u8();
  const seed = r.u32();
  const raw = r.list((o) => o.u16());
  const cfg = raw.length ? Object.fromEntries(CFG_KEYS.map((k, i) => [k, raw[i]])) : null;
  return { level: lv, played, lastTry: lastTry === 255 ? null : 's' + lastTry,
           reason, presetIdx, seed, cfg };
}
