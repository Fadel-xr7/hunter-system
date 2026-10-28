// يشغّل docs/js/core.js لحاله داخل vm، بتاريخ ثابت نقدر نغيّره، وبدون متصفح.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const CORE = readFileSync(new URL('../../docs/js/core.js', import.meta.url), 'utf8');
// مفاتيح التخزين من boot.js نفسه (بدون باقي الملف، لأنه يلمس الصفحة)
const BOOT = readFileSync(new URL('../../docs/js/boot.js', import.meta.url), 'utf8');
const STORE_KEYS_SRC = BOOT.match(/const STORE_KEYS = Object\.freeze\(\{[\s\S]*?\}\);/)[0];

export function loadCore({ today = '2026-10-28', lang = 'ar' } = {}) {
  const clock = { today };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(clock.today + 'T12:00:00'); }
    static now() { return new RealDate(clock.today + 'T12:00:00').getTime(); }
  }
  const mem = new Map();
  const flags = { storageFails: false };
  const calls = { toast: [], sound: [] };
  const ctx = vm.createContext({
    Date: FakeDate, console,
    setTimeout: () => 0,
    localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { if (flags.storageFails) throw new Error('QuotaExceededError'); mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) },
    toast: (...a) => calls.toast.push(a), sound: (...a) => calls.sound.push(a), celebrateLevel: () => {}
  });
  const run = (code) => vm.runInContext(code, ctx);
  run(STORE_KEYS_SRC);
  run(`const LANG = ${JSON.stringify(lang)}; const EN = LANG === 'en'; const L = (ar, en) => (EN ? en : ar);`);
  run(CORE);
  run('let state = freshState();');
  return {
    run,
    calls,
    setToday(iso) { clock.today = iso; },
    /** يخلي localStorage يرفض الحفظ (مساحة ممتلئة) */
    failStorage(on = true) { flags.storageFails = on; },
    /** يبني state من كائن عادي (يمر على normalize مثل البيانات المحفوظة) */
    setState(obj) { run('state = normalize(' + JSON.stringify(obj) + ')'); },
    state() { return JSON.parse(run('JSON.stringify(state)')); },
    call(fn, ...args) { return JSON.parse(run(`JSON.stringify(${fn}(...${JSON.stringify(args)}))`) ?? 'null'); }
  };
}

/** أيام متتالية من iso لعدد n */
export function days(from, n) {
  const out = [];
  const d = new Date(from + 'T00:00:00');
  for (let i = 0; i < n; i++) {
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
