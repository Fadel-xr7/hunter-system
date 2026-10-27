'use strict';
/* =====================================================================
   نظام الصياد — app.js
   الأقسام بالترتيب:
   1. أدوات عامة        2. البيانات والحفظ      3. نقل البيانات القديمة
   4. المكافآت والمستوى  5. الأيام والسلسلة       6. المهام
   7. الإضافة السريعة    8. مؤقت التركيز         9. الإنجازات
   10. النسخ الاحتياطي   11. الصوت والتأثيرات    12. الرسم (render)
   13. التشغيل          14. الإضافات: المهمة الأهم، الألقاب، البطاقات، تقرير النظام
   15. إضافات 26 أكتوبر: التراجع، خطوات البوابة، تفاصيل اليوم، وضع الغمر
   16. الشكل الجديد: النظام الحي (أنمي) ودفتر القمر (حبر الليل)
   ===================================================================== */

/* ============ 1. أدوات عامة ============ */
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayIso = () => isoOf(new Date());
const dateOf = (iso) => new Date(iso + 'T00:00:00');
const addDays = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const clampNum = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// إنشاء عناصر بأمان: النص يدخل كنص، فما يقدر أحد يحقن HTML
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kids) {
  const n = document.createElementNS(SVGNS, tag);
  // style عن طريق CSSOM، لأن سياسة الأمان (CSP) تمنع خاصية style المكتوبة كنص
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v); }
  for (const c of kids.flat()) if (c) n.append(c);
  return n;
}

const STATS = ['STR', 'VIT', 'AGI', 'INT', 'SENSE'];
const STAT_AR = EN ? { STR: 'Strength', VIT: 'Vitality', AGI: 'Agility', INT: 'Intellect', SENSE: 'Discipline' }
  : { STR: 'قوة', VIT: 'حيوية', AGI: 'رشاقة', INT: 'ذكاء', SENSE: 'انضباط' };
const RANK_XP = { E: 25, D: 45, C: 75, B: 120, A: 200, S: 350 };
const DAY_BONUS_XP = 150;
const MIT_XP = 50; // مكافأة مهمة اليوم الأهم
const GRACE_DAYS = 3; // السلسلة تنكسر في رابع يوم فائت متتالي
const DAILY_XP = 30; // خبرة المهمة اليومية الجديدة (الإضافة السريعة والقيمة الافتراضية)
// خبرة كل دقيقة تركيز. دقائق التركيز في الإحصائيات تنحسب منها (focusMinutes)،
// فلو تغيّرت، الدقائق المسجلة قبل التغيير تنحسب غلط.
const FOCUS_XP_PER_MIN = 3;
// خيارات مدة المؤقت بالدقائق (نفسها في قائمة timerMinutes داخل index.html)
const TIMER_OPTS = [15, 25, 45, 60, 120, 180, 240];
const WEEKDAYS = EN ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAYS_SHORT = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
// أيام الأسبوع من الجمعة (للسجل وتقرير الجمعة)
const WD_FROM_FRI = EN ? ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'] : ['جمع', 'سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي'];
// الأسبوع يبدأ يوم الجمعة
const WEEK_ORDER = [5, 6, 0, 1, 2, 3, 4];
const weekStart = (iso) => addDays(iso, -((dateOf(iso).getDay() + 2) % 7));
const MONTHS = EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
// الرتبة ترتفع لما توصل المستوى المطلوب والسلسلة المطلوبة مع بعض
const RANKS = [
  { l: 'E', lv: 1, streak: 0 }, { l: 'D', lv: 5, streak: 3 }, { l: 'C', lv: 10, streak: 7 },
  { l: 'B', lv: 15, streak: 14 }, { l: 'A', lv: 20, streak: 30 }, { l: 'S', lv: 30, streak: 60 },
  { l: 'SS', lv: 40, streak: 90 }
];
const daysAr = (n) => EN ? n + (n === 1 ? ' day' : ' days') : n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? n + ' أيام' : n + ' يوماً';
const APP_NAME = L('نظام الصياد', 'Hunter System');

// 20:00 تصير 8:00 م
function fmt12(t) {
  if (!isTime(t)) return String(t || '');
  let [h, m] = t.split(':').map(Number);
  const suf = h < 12 ? L('ص', 'AM') : L('م', 'PM');
  h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + suf;
}
function timeNode(t, cls) {
  const [hm, suf] = fmt12(t).split(' ');
  return el('span', { class: cls }, hm, el('small', { text: ' ' + (suf || '') }));
}

/* ============ 2. البيانات والحفظ ============ */
const KEY = 'hunterSystem_v6';
const THEME_KEY = 'hunterTheme_v6';
const OLD_KEYS = ['soloLevelingState_v5_0', 'soloLevelingState_v4_1', 'soloLevelingStateV4_0', 'soloLevelingStateV3_1'];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } }
};

function freshState() {
  return {
    version: 6,
    name: '',
    totalXp: 0,
    stats: { STR: 10, VIT: 10, AGI: 10, INT: 10, SENSE: 10 },
    fixed: [
      { id: 'f_train', title: L('تمرين 30 دقيقة', 'Workout, 30 min'), stat: 'STR', xp: 30, time: '18:00', days: [] },
      { id: 'f_study', title: L('مذاكرة بتركيز ساعة', 'Deep study, 1 hour'), stat: 'INT', xp: 35, time: '20:00', days: [] },
      { id: 'f_sleep', title: L('النوم قبل 12', 'Sleep before midnight'), stat: 'VIT', xp: 25, time: '23:30', days: [] }
    ],
    gates: [],
    log: {},            // 'YYYY-MM-DD': [ids of fixed tasks done that day]
    completedDates: [], // أيام اكتملت فيها كل المهام الثابتة
    restDays: [],
    rewards: {},        // key -> { xp, stat, date }
    xpByDate: {},       // 'YYYY-MM-DD' -> xp earned that day
    bestStreak: 0,
    focus: { minutes: 0, sessions: 0 },
    achievements: [
      { id: 'a30', name: L('المستيقظ', 'The Awakened'), days: 30 },
      { id: 'a60', name: L('قائد الظلال', 'Shadow Commander'), days: 60 },
      { id: 'a90', name: L('العاهل', 'The Monarch'), days: 90 }
    ],
    unlocked: [],
    title: '',                  // id الإنجاز اللي صار لقبك
    mit: { date: '', key: '' }, // مهمة اليوم الأهم: 'fixed:id' أو 'gate:id'
    timer: { minutes: 25, phase: 0, status: 'idle', endAt: 0, remaining: 1500, link: '', auto: true },
    sound: true,
    lastBackup: 0,
    startDate: todayIso()
  };
}

// تنظيف أي بيانات (محفوظة أو مستوردة) بحيث ما يدخل إلا الشكل الصحيح
function normalize(raw) {
  const s = freshState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  s.name = typeof raw.name === 'string' ? raw.name.slice(0, 18) : '';
  s.totalXp = clampNum(raw.totalXp, 0, 1e9, 0);
  if (raw.stats && typeof raw.stats === 'object') STATS.forEach((k) => { s.stats[k] = clampNum(raw.stats[k], 0, 1e6, 10); });
  if (Array.isArray(raw.fixed)) {
    s.fixed = raw.fixed.filter((q) => q && q.id && q.title).slice(0, 100).map((q) => ({
      id: String(q.id).slice(0, 40), title: String(q.title).slice(0, 120),
      stat: STATS.includes(q.stat) ? q.stat : 'SENSE', xp: clampNum(q.xp, 1, 1000, DAILY_XP),
      time: isTime(q.time) ? q.time : '09:00', days: normDays(q.days)
    }));
  }
  if (Array.isArray(raw.gates)) {
    s.gates = raw.gates.filter((q) => q && q.id && q.title && isIso(q.date)).slice(0, 2000).map((q) => ({
      id: String(q.id).slice(0, 40), title: String(q.title).slice(0, 120), date: q.date,
      rank: RANK_XP[q.rank] ? q.rank : 'E', xp: clampNum(q.xp, 1, 5000, RANK_XP[q.rank] || 25),
      time: isTime(q.time) ? q.time : '17:00', stat: STATS.includes(q.stat) ? q.stat : 'SENSE', done: Boolean(q.done),
      subs: normSubs(q.subs)
    }));
  }
  if (raw.log && typeof raw.log === 'object') {
    for (const [d, ids] of Object.entries(raw.log)) if (isIso(d) && Array.isArray(ids)) s.log[d] = [...new Set(ids.map(String))];
  }
  s.completedDates = Array.isArray(raw.completedDates) ? [...new Set(raw.completedDates.filter(isIso))].sort() : [];
  s.restDays = Array.isArray(raw.restDays) ? [...new Set(raw.restDays.filter(isIso))].sort() : [];
  if (raw.rewards && typeof raw.rewards === 'object') {
    for (const [k, r] of Object.entries(raw.rewards)) {
      if (r && typeof r === 'object') s.rewards[String(k).slice(0, 80)] = { xp: clampNum(r.xp, 0, 1e6, 0), stat: STATS.includes(r.stat) ? r.stat : null, date: isIso(r.date) ? r.date : todayIso() };
    }
  }
  if (raw.xpByDate && typeof raw.xpByDate === 'object') {
    for (const [d, v] of Object.entries(raw.xpByDate)) if (isIso(d)) s.xpByDate[d] = clampNum(v, 0, 1e7, 0);
  }
  s.bestStreak = clampNum(raw.bestStreak, 0, 100000, 0);
  if (raw.focus && typeof raw.focus === 'object') {
    s.focus.minutes = clampNum(raw.focus.minutes, 0, 1e7, 0);
    s.focus.sessions = clampNum(raw.focus.sessions, 0, 1e6, 0);
  }
  if (Array.isArray(raw.achievements)) {
    s.achievements = raw.achievements.filter((a) => a && a.name).slice(0, 50).map((a) => ({
      id: String(a.id || uid('a')).slice(0, 40), name: String(a.name).slice(0, 30), days: Math.round(clampNum(a.days, 1, 3650, 30))
    }));
  }
  s.unlocked = Array.isArray(raw.unlocked) ? raw.unlocked.map(String).slice(0, 100) : [];
  s.title = typeof raw.title === 'string' ? raw.title.slice(0, 40) : '';
  if (raw.mit && typeof raw.mit === 'object' && isIso(raw.mit.date) && typeof raw.mit.key === 'string' && /^(fixed|gate):/.test(raw.mit.key)) {
    s.mit = { date: raw.mit.date, key: raw.mit.key.slice(0, 60) };
  }
  if (raw.timer && typeof raw.timer === 'object') {
    const t = raw.timer;
    s.timer.minutes = TIMER_OPTS.includes(Number(t.minutes)) ? Number(t.minutes) : 25;
    s.timer.phase = Math.round(clampNum(t.phase, 0, 6, 0));
    s.timer.status = ['idle', 'running', 'paused'].includes(t.status) ? t.status : 'idle';
    s.timer.endAt = clampNum(t.endAt, 0, 1e14, 0);
    s.timer.remaining = clampNum(t.remaining, 0, 3600, s.timer.minutes * 60);
    s.timer.link = typeof t.link === 'string' ? t.link.slice(0, 60) : '';
    s.timer.auto = t.auto !== false;
  }
  s.sound = raw.sound !== false;
  s.lastBackup = clampNum(raw.lastBackup, 0, 1e14, 0);
  s.startDate = isIso(raw.startDate) ? raw.startDate : (s.completedDates[0] || todayIso());
  return s;
}

// خطوات البوابة: [{ id, title, done }] بحد أقصى 20
function normSubs(a) {
  if (!Array.isArray(a)) return [];
  return a.filter((x) => x && typeof x.title === 'string' && x.title.trim()).slice(0, 20).map((x) => ({
    id: String(x.id || uid('s')).slice(0, 40), title: String(x.title).trim().slice(0, 100), done: Boolean(x.done)
  }));
}

function normDays(a) {
  if (!Array.isArray(a)) return [];
  const u = [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((x, y) => x - y);
  return u.length === 7 ? [] : u;
}

function loadState() {
  const raw = store.get(KEY);
  if (raw) { try { return normalize(JSON.parse(raw)); } catch (e) { /* يكمل للقديم */ } }
  for (const k of OLD_KEYS) {
    const old = store.get(k);
    if (old) {
      try { const s = migrateOld(JSON.parse(old)); s.migratedFrom = k; return s; } catch (e) { /* يجرب اللي بعده */ }
    }
  }
  return freshState();
}

function save() {
  const { migratedFrom, ...clean } = state;
  store.set(KEY, JSON.stringify(clean));
  // لو مسجل دخول: يرفع التغيير للسحابة (cloud.js)
  try { if (typeof Cloud !== 'undefined') Cloud.changed(); } catch (e) { /* cloud.js لسا ما جهز */ }
}

/* ============ 3. نقل البيانات من النسخة القديمة (v5) ============ */
// النسخة القديمة كانت تعدّ الأيام من 1 إلى 30 بدءاً من monthStartDate، هنا نحولها لتواريخ حقيقية
function migrateOld(o) {
  const s = freshState();
  if (!o || typeof o !== 'object') return s;
  const start = isIso(o.monthStartDate) ? o.monthStartDate : todayIso();
  const dayIso = (n) => addDays(start, (Number(n) || 1) - 1);
  const today = todayIso();

  s.name = typeof o.hunterName === 'string' ? o.hunterName.slice(0, 18) : '';
  let total = Number(o.totalXp);
  if (!Number.isFinite(total) || total <= 0) {
    total = 0; const lv = Number(o.level) || 1;
    for (let l = 1; l < lv; l++) total += l * 100;
    total += Number(o.xp) || 0;
  }
  s.totalXp = Math.max(0, Math.round(total));
  if (o.stats && typeof o.stats === 'object') STATS.forEach((k) => { s.stats[k] = clampNum(o.stats[k], 0, 1e6, 10); });

  if (Array.isArray(o.fixedQuests) && o.fixedQuests.length) {
    s.fixed = o.fixedQuests.filter((q) => q && q.id && q.title).map((q) => ({
      id: String(q.id), title: String(q.title).slice(0, 120), stat: STATS.includes(q.stat) ? q.stat : 'SENSE',
      xp: clampNum(q.xp, 1, 1000, DAILY_XP), time: isTime(q.time) ? q.time : '09:00', days: normDays(q.days)
    }));
  }
  if (Array.isArray(o.customQuests)) {
    s.gates = o.customQuests.filter((q) => q && q.id && q.title).map((q) => ({
      id: String(q.id), title: String(q.title).slice(0, 120), date: dayIso(q.day),
      rank: RANK_XP[q.rank] ? q.rank : 'E', xp: clampNum(q.xp, 1, 5000, 25),
      time: isTime(q.time) ? q.time : '17:00', stat: STATS.includes(q.stat) ? q.stat : 'SENSE', done: Boolean(q.done)
    }));
  }
  if (o.progress && typeof o.progress === 'object') {
    for (const [day, p] of Object.entries(o.progress)) {
      const d = dayIso(day);
      if (d <= today && p && Array.isArray(p.completedFixed) && p.completedFixed.length) s.log[d] = [...new Set(p.completedFixed.map(String))];
    }
  }
  s.completedDates = Array.isArray(o.completedDates) ? [...new Set(o.completedDates.filter(isIso))].sort() : [];
  s.restDays = Array.isArray(o.restDays) ? [...new Set(o.restDays.filter(isIso))].sort() : [];
  if (o.streak && Array.isArray(o.streak.protectedDates)) s.restDays = [...new Set(s.restDays.concat(o.streak.protectedDates.filter(isIso)))].sort();
  s.bestStreak = Math.max(0, Number(o.streak && o.streak.best) || 0, typeof o.streak === 'number' ? o.streak : 0);

  // سجل المكافآت: نحول المفاتيح للتواريخ عشان إلغاء الإنجاز يرجّع الخبرة صح، ونبني سجل الخبرة اليومي
  if (o.rewardLedger && typeof o.rewardLedger === 'object') {
    for (const [k, r] of Object.entries(o.rewardLedger)) {
      if (!r || typeof r !== 'object') continue;
      const at = Number(r.at);
      const d = Number.isFinite(at) && at > 0 ? isoOf(new Date(at)) : today;
      const xp = clampNum(r.xp, 0, 1e6, 0);
      s.xpByDate[d] = (s.xpByDate[d] || 0) + xp;
      const stat = r.stats ? Object.keys(r.stats)[0] : null;
      const mf = /^fixed:(\d+):(.+)$/.exec(k);
      const mc = /^custom:(.+)$/.exec(k);
      if (mf) s.rewards['fixed:' + dayIso(mf[1]) + ':' + mf[2]] = { xp, stat: STATS.includes(stat) ? stat : null, date: d };
      else if (mc) s.rewards['gate:' + mc[1]] = { xp, stat: STATS.includes(stat) ? stat : null, date: d };
    }
  }
  s.focus.minutes = clampNum(o.totalFocusMinutes, 0, 1e7, 0);
  s.focus.sessions = clampNum(o.raidClears, 0, 1e6, 0);
  s.startDate = s.completedDates[0] || Object.keys(s.log).sort()[0] || start;
  return s;
}

/* ============ 4. المكافآت والمستوى ============ */
function levelInfo(total) {
  let level = 1, xp = Math.max(0, total), need = 100;
  while (xp >= need) { xp -= need; level++; need = level * 100; }
  return { level, xp, need };
}

function grant(key, xp, stat) {
  if (state.rewards[key]) return false;
  const before = levelInfo(state.totalXp).level;
  const d = todayIso();
  state.rewards[key] = { xp, stat: stat || null, date: d };
  state.totalXp += xp;
  state.xpByDate[d] = (state.xpByDate[d] || 0) + xp;
  if (stat) state.stats[stat] = (state.stats[stat] || 0) + 1;
  const after = levelInfo(state.totalXp).level;
  if (after > before) setTimeout(() => celebrateLevel(after, before), 400);
  return true;
}

function revoke(key) {
  const r = state.rewards[key];
  if (!r) return false;
  state.totalXp = Math.max(0, state.totalXp - r.xp);
  if (state.xpByDate[r.date]) state.xpByDate[r.date] = Math.max(0, state.xpByDate[r.date] - r.xp);
  if (r.stat) state.stats[r.stat] = Math.max(0, (state.stats[r.stat] || 0) - 1);
  delete state.rewards[key];
  return true;
}

// دقائق التركيز من يوم from إلى يوم to (بدون to = يوم واحد)، من مكافآت التركيز المسجلة
function focusMinutes(from, to) {
  const end = to || from;
  return Object.entries(state.rewards)
    .filter(([k, r]) => k.startsWith('focus:') && r.date >= from && r.date <= end)
    .reduce((a, [, r]) => a + r.xp / FOCUS_XP_PER_MIN, 0);
}

function rankFor(level, streak) {
  let cur = RANKS[0], next = RANKS[1];
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].lv && streak >= RANKS[i].streak) { cur = RANKS[i]; next = RANKS[i + 1] || null; } else break;
  }
  return { cur, next };
}

/* ============ 5. الأيام والسلسلة ============ */
const appliesOn = (q, iso) => !q.days.length || q.days.includes(dateOf(iso).getDay());
const fixedFor = (iso) => state.fixed.filter((q) => appliesOn(q, iso));
const isRest = (iso) => state.restDays.includes(iso);
const isOff = (iso) => fixedFor(iso).length === 0;
const doneIds = (iso) => state.log[iso] || [];

function isComplete(iso) {
  const app = fixedFor(iso);
  if (!app.length) return false;
  const d = doneIds(iso);
  return app.every((q) => d.includes(q.id));
}

// يحدّث حالة اليوم: هل اكتمل؟ ويعطي أو يسحب مكافأة إكمال اليوم
function syncDay(iso) {
  const done = isComplete(iso);
  const has = state.completedDates.includes(iso);
  if (done && !has) {
    state.completedDates.push(iso); state.completedDates.sort();
    if (grant('bonus:' + iso, DAY_BONUS_XP, null)) {
      toast(L('اكتملت مهام اليوم', 'All daily quests complete'), '+' + DAY_BONUS_XP + ' XP', 'gold');
      sound('level');
    }
  } else if (!done && has) {
    state.completedDates = state.completedDates.filter((d) => d !== iso);
    revoke('bonus:' + iso);
  }
}

// السلسلة: كل يوم مكتمل يزيدها 1. أيام الراحة والأيام بدون مهام محايدة.
// الأيام الفائتة ما تزيدها، وتنكسر في رابع يوم فائت متتالي (3 أيام سماح).
function streakInfo() {
  const today = todayIso();
  const done = new Set(state.completedDates);
  const first = state.completedDates[0];
  if (!first) return { streak: 0, graceLeft: GRACE_DAYS, tailMiss: 0 };
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0, run = 0, tailMiss = 0, seenDone = false;
  for (let i = 0; i < 4000 && cursor >= first; i++) {
    if (done.has(cursor)) { streak++; run = 0; seenDone = true; }
    else if (isRest(cursor) || isOff(cursor)) { /* محايد */ }
    else {
      run++;
      if (!seenDone) tailMiss = run;
      if (run > GRACE_DAYS) break;
    }
    cursor = addDays(cursor, -1);
  }
  if (tailMiss > GRACE_DAYS) return { streak: 0, graceLeft: 0, tailMiss };
  return { streak, graceLeft: GRACE_DAYS - tailMiss, tailMiss };
}

/* ============ 6. المهام ============ */
function todayTasks() {
  const t = todayIso();
  const d = doneIds(t);
  const fixed = fixedFor(t).map((q) => ({ kind: 'fixed', ref: q, id: q.id, title: q.title, time: q.time, xp: q.xp, stat: q.stat, done: d.includes(q.id) }));
  const gates = state.gates
    .filter((g) => g.date === t || (g.date < t && !g.done))
    .map((g) => ({ kind: 'gate', ref: g, id: g.id, title: g.title, time: g.time, xp: g.xp, stat: g.stat, rank: g.rank, done: g.done, late: g.date < t }));
  return { fixed, gates };
}

function toggleTask(kind, id) {
  const t = todayIso();
  if (kind === 'fixed') {
    const q = state.fixed.find((x) => x.id === id);
    if (!q) return;
    const arr = state.log[t] = state.log[t] || [];
    const key = 'fixed:' + t + ':' + id;
    if (arr.includes(id)) {
      state.log[t] = arr.filter((x) => x !== id);
      revoke(key); sound('undo');
    } else {
      arr.push(id);
      grant(key, q.xp, q.stat);
      toast(L('اكتملت المهمة: ', 'Quest complete: ') + q.title, '+' + q.xp + ' XP', '', undoToggle(kind, id)); sound('done');
    }
    syncDay(t);
  } else {
    const g = state.gates.find((x) => x.id === id);
    if (!g) return;
    g.done = !g.done;
    if (g.done) { grant('gate:' + id, g.xp, g.stat); toast(L('تم تطهير بوابة ' + g.rank, 'Gate ' + g.rank + ' cleared') + ': ' + g.title, '+' + g.xp + ' XP', '', undoToggle(kind, id)); sound('done'); }
    else { revoke('gate:' + id); sound('undo'); }
  }
  syncMit();
  justToggled = kind + ':' + id;
  commit();
}

async function deleteTask(kind, id) {
  const t = todayIso();
  if (kind === 'fixed') {
    const q = state.fixed.find((x) => x.id === id);
    if (!q || !(await confirmBox(L('تحذف المهمة اليومية «' + q.title + '»؟ خبرتك من الأيام السابقة تبقى.', 'Delete the daily quest "' + q.title + '"? XP from earlier days stays.')))) return;
    if (doneIds(t).includes(id)) { state.log[t] = doneIds(t).filter((x) => x !== id); revoke('fixed:' + t + ':' + id); }
    state.fixed = state.fixed.filter((x) => x.id !== id);
    syncDay(t);
  } else {
    const g = state.gates.find((x) => x.id === id);
    if (!g || !(await confirmBox(L('تحذف البوابة «' + g.title + '»؟', 'Delete the gate "' + g.title + '"?')))) return;
    if (g.done) revoke('gate:' + id);
    state.gates = state.gates.filter((x) => x.id !== id);
  }
  if (state.timer.link === kind + ':' + id) state.timer.link = '';
  if (state.mit.key === kind + ':' + id) state.mit = { date: '', key: '' };
  syncMit();
  commit();
}

function openEdit(kind, id) {
  const q = kind === 'fixed' ? state.fixed.find((x) => x.id === id) : state.gates.find((x) => x.id === id);
  if (!q) return;
  $('editTitle').textContent = kind === 'fixed' ? L('تعديل المهمة اليومية', 'Edit daily quest') : L('تعديل البوابة', 'Edit gate');
  $('eTitle').value = q.title;
  $('eTime').value = q.time;
  $('eStat').value = q.stat;
  $('eDaysBox').hidden = kind !== 'fixed';
  $('eGateBox').hidden = kind !== 'gate';
  const box = $('eDays');
  box.replaceChildren();
  WEEK_ORDER.forEach((i) => {
    const name = WEEKDAYS_SHORT[i];
    const on = kind === 'fixed' && (!q.days.length || q.days.includes(i));
    box.append(el('label', { class: 'day' }, el('input', { type: 'checkbox', value: i, checked: on }), el('span', { text: name })));
  });
  if (kind === 'gate') { $('eDate').value = q.date; $('eRank').value = q.rank; $('eSubs').value = (q.subs || []).map((x) => x.title).join('\n'); }
  $('eSubsBox').hidden = kind !== 'gate';
  const dlg = $('editDialog');
  dlg.onclose = () => {
    if (dlg.returnValue !== 'save') return;
    const title = $('eTitle').value.trim().slice(0, 120);
    if (!title || !isTime($('eTime').value)) return;
    q.title = title; q.time = $('eTime').value; q.stat = $('eStat').value;
    if (kind === 'fixed') {
      const days = [...box.querySelectorAll('input:checked')].map((i) => Number(i.value));
      q.days = normDays(days.length ? days : [0, 1, 2, 3, 4, 5, 6]);
      syncDay(todayIso());
    } else {
      if (isIso($('eDate').value)) q.date = $('eDate').value;
      const r = $('eRank').value;
      if (RANK_XP[r] && r !== q.rank) { q.rank = r; if (!q.done) q.xp = RANK_XP[r]; }
      // الخطوات: سطر لكل خطوة، والخطوة اللي ما تغيّر اسمها تحتفظ بحالتها
      const old = q.subs || [];
      q.subs = normSubs($('eSubs').value.split('\n').map((x) => x.trim()).filter(Boolean).map((title) => {
        const o = old.find((x) => x.title === title);
        return o ? o : { id: uid('s'), title, done: false };
      }));
    }
    commit();
  };
  dlg.returnValue = '';
  dlg.showModal();
}

function toggleRest() {
  const t = todayIso();
  if (isRest(t)) state.restDays = state.restDays.filter((d) => d !== t);
  else { state.restDays.push(t); toast(L('اليوم يوم راحة', 'Rest day'), L('سلسلتك محفوظة', 'Your streak is safe'), 'gold'); }
  commit();
}

/* ============ 7. الإضافة السريعة (نفس صيغة بوت تيليجرام) ============ */
const QUICK_STATS = {
  STR: 'STR', 'قوة': 'STR', 'القوة': 'STR', 'رياضة': 'STR',
  VIT: 'VIT', 'حيوية': 'VIT', 'الحيوية': 'VIT', 'صحة': 'VIT',
  AGI: 'AGI', 'رشاقة': 'AGI', 'الرشاقة': 'AGI',
  INT: 'INT', 'ذكاء': 'INT', 'الذكاء': 'INT', 'دراسة': 'INT',
  SENSE: 'SENSE', 'انضباط': 'SENSE', 'الانضباط': 'SENSE',
  strength: 'STR', fitness: 'STR', sport: 'STR', vitality: 'VIT', health: 'VIT', agility: 'AGI',
  intellect: 'INT', intelligence: 'INT', study: 'INT', discipline: 'SENSE', sense: 'SENSE'
};
const END = '(?=$|[\\s!#،,.؛])';

function parseQuick(raw) {
  let s = String(raw || '').replace(/[٠-٩]/g, (c) => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const out = { kind: 'gate', rank: 'E', stat: 'SENSE', time: '', date: todayIso(), dateLabel: L('اليوم', 'today') };
  let forceGate = false;

  const pre = s.match(/^(مهمة|مهمه|بوابة|بوابه|task|quest|gate)\s*[:：]\s*/i);
  if (pre) { if (/^(بواب|gate)/i.test(pre[1])) forceGate = true; s = s.slice(pre[0].length); }

  let m = s.match(new RegExp('(?:الساعة|الساعه|@|\\bat)\\s*(\\d{1,2})(?:[:.٫](\\d{2}))?\\s*(صباحًا|صباحاً|صباحا|ص|مساءً|مساءا|مساء|م|ليلًا|ليلاً|ليلا|الليل|ظهرًا|ظهراً|ظهرا|الظهر|عصرًا|عصراً|عصرا|العصر|فجرًا|فجراً|فجرا|الفجر|a\\.?m\\.?|p\\.?m\\.?)?' + END, 'i'));
  // 9pm أو 9:30 am بدون «at»
  if (!m) m = s.match(new RegExp('(?:^|\\s)(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)' + END, 'i'));
  if (!m) m = s.match(new RegExp('(?:^|\\s)(\\d{1,2}):(\\d{2})()' + END));
  if (m) {
    let h = parseInt(m[1], 10); const min = m[2] ? parseInt(m[2], 10) : 0; const suf = (m[3] || '').toLowerCase();
    const pm = /^(مساء|م$|ليل|الليل|عصر|العصر|p)/.test(suf) || (/^(ظهر|الظهر)/.test(suf) && h < 11);
    const am = /^(صباح|ص$|فجر|الفجر|a)/.test(suf);
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) { out.time = pad(h) + ':' + pad(min); s = s.replace(m[0], ' '); }
  }

  m = s.match(new RegExp('(?:!|رتبة\\s*|\\brank\\s+)([EDCBAS])' + END, 'i'));
  if (m) { out.rank = m[1].toUpperCase(); forceGate = true; s = s.replace(m[0], ' '); }

  m = s.match(/#([^\s#!]+)/);
  if (m) { const k = QUICK_STATS[m[1]] || QUICK_STATS[m[1].toUpperCase()] || QUICK_STATS[m[1].toLowerCase()]; if (k) { out.stat = k; s = s.replace(m[0], ' '); } }

  m = s.match(new RegExp('(?:^|\\s)(بعد بكرة|بعد بكره|بعد غد|day after tomorrow)' + END, 'i'));
  if (m) { out.date = addDays(todayIso(), 2); out.dateLabel = L('بعد بكرة', 'day after tomorrow'); s = s.replace(m[0], ' '); }
  else if ((m = s.match(new RegExp('(?:^|\\s)(بكرة|بكره|غدًا|غداً|غدا|الغد|tomorrow|tmrw)' + END, 'i')))) { out.date = addDays(todayIso(), 1); out.dateLabel = L('بكرة', 'tomorrow'); s = s.replace(m[0], ' '); }
  else if ((m = s.match(new RegExp('(?:^|\\s)(?:يوم|day)\\s*(\\d{1,2})(?:st|nd|rd|th)?' + END, 'i')))) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 31) {
      const now = new Date();
      let d = new Date(now.getFullYear(), now.getMonth(), n);
      if (isoOf(d) < todayIso()) d = new Date(now.getFullYear(), now.getMonth() + 1, n);
      out.date = isoOf(d); out.dateLabel = d.getDate() + ' ' + MONTHS[d.getMonth()];
    }
    s = s.replace(m[0], ' ');
  } else if ((m = s.match(new RegExp('(?:^|\\s)(?:اليوم|today)' + END, 'i')))) s = s.replace(m[0], ' ');

  m = s.match(new RegExp('(?:^|\\s)(يوميًا|يومياً|يوميا|يومي|كل يوم|daily|every ?day)' + END, 'i'));
  if (m && !forceGate) { out.kind = 'fixed'; s = s.replace(m[0], ' '); }

  out.title = s.replace(/\s+/g, ' ').replace(/^[\s،,.:؛-]+|[\s،,.:؛-]+$/g, '').trim().slice(0, 120);
  if (!out.title) return null;
  if (!out.time) out.time = out.kind === 'fixed' ? '09:00' : '17:00';
  out.xp = out.kind === 'fixed' ? DAILY_XP : RANK_XP[out.rank];
  return out;
}

function describeQuick(p) {
  if (!p) return '';
  if (EN) return (p.kind === 'fixed' ? 'Daily quest' : 'Gate ' + p.rank + ', ' + p.dateLabel) + ', at ' + fmt12(p.time) + ', +' + p.xp + ' XP, ' + STAT_AR[p.stat] + ': ' + p.title;
  return (p.kind === 'fixed' ? 'مهمة يومية' : 'بوابة ' + p.rank + '، ' + p.dateLabel) + '، الساعة ' + fmt12(p.time) + '، +' + p.xp + ' XP، ' + STAT_AR[p.stat] + ': ' + p.title;
}

// الاختيار الظاهر [مرة وحدة / كل يوم] يغلب على الكلمات المكتوبة
function readQuick() {
  const p = parseQuick($('quickInput').value);
  if (!p) return null;
  const daily = document.querySelector('input[name="repeat"]:checked').value === 'daily';
  if (daily && p.kind !== 'fixed') { p.kind = 'fixed'; p.xp = DAILY_XP; }
  return p;
}

function addParsed(p) {
  const id = uid(p.kind === 'fixed' ? 'f_' : 'g_');
  if (p.kind === 'fixed') state.fixed.push({ id, title: p.title, stat: p.stat, xp: DAILY_XP, time: p.time, days: [] });
  else state.gates.push({ id, title: p.title, date: p.date, rank: p.rank, xp: p.xp, time: p.time, stat: p.stat, done: false, subs: [] });
  if (p.kind === 'fixed') syncDay(todayIso());
  toast(p.kind === 'fixed' ? L('أضيفت مهمة يومية', 'Daily quest added') : L('فُتحت بوابة جديدة', 'A new gate opened'), p.title, '', undoAdd(p.kind, id));
  sound('done');
  commit();
}

// روابط البوت: index.html#add=<نص المهمة>
async function importFromHash() {
  const h = location.hash || '';
  if (!h.startsWith('#add=')) return;
  let text = '';
  try { text = decodeURIComponent(h.slice(5).replace(/\+/g, ' ')).slice(0, 300); } catch (e) { text = ''; }
  history.replaceState(null, '', location.pathname + location.search);
  const p = parseQuick(text);
  if (!p) { toast(L('رابط المهمة غير صالح', 'Invalid quest link'), L('ما قدرت أقرأ اسم المهمة', "Couldn't read the quest name"), 'warn'); return; }
  if (await confirmBox(L('مهمة واردة من تيليجرام:\n', 'Quest from Telegram:\n') + describeQuick(p) + L('\n\nتضيفها؟', '\n\nAdd it?'), L('أضفها', 'Add it'))) addParsed(p);
}

/* ============ 8. مؤقت التركيز ============ */
// الجلسة مقسومة لمراحل: شغل وراحة.
// ساعة = بومودورو (25 شغل، 5 راحة، مرتين). ساعتين فأكثر = ساعة شغل ثم 12 دقيقة راحة، والراحة تنضاف على الوقت.
let timerTick = null;
function timerPlan(min) {
  if (min === 60) return [{ type: 'work', min: 25 }, { type: 'break', min: 5 }, { type: 'work', min: 25 }, { type: 'break', min: 5 }];
  if (min >= 120) {
    const out = [];
    for (let i = 0; i < min / 60; i++) { if (i) out.push({ type: 'break', min: 12 }); out.push({ type: 'work', min: 60 }); }
    return out;
  }
  return [{ type: 'work', min }];
}
const curPhase = () => timerPlan(state.timer.minutes)[state.timer.phase] || timerPlan(state.timer.minutes)[0];
const timerTotal = () => curPhase().min * 60;
const timerLeft = () => state.timer.status === 'running' ? Math.max(0, Math.round((state.timer.endAt - Date.now()) / 1000)) : state.timer.remaining;

function timerToggle() {
  const t = state.timer;
  if (t.status === 'running') { t.remaining = timerLeft(); t.status = 'paused'; }
  else { t.endAt = Date.now() + (t.status === 'paused' ? t.remaining : timerTotal()) * 1000; t.status = 'running'; sound('start'); }
  commit(); runTimer();
}
function timerReset() {
  const t = state.timer;
  t.status = 'idle'; t.phase = 0; t.remaining = timerTotal(); t.endAt = 0;
  commit(); runTimer();
}
function runTimer() {
  clearInterval(timerTick);
  renderTimer();
  if (state.timer.status === 'running') timerTick = setInterval(() => { if (timerLeft() <= 0) phaseDone(); else renderTimer(); }, 500);
}

function phaseDone() {
  clearInterval(timerTick);
  const t = state.timer;
  const plan = timerPlan(t.minutes);
  const ph = plan[t.phase] || plan[0];
  const lastWork = plan.map((p) => p.type).lastIndexOf('work');
  const next = plan[t.phase + 1];
  let completeLinked = false;

  if (ph.type === 'work') {
    // كل مقطع شغل يُحسب لحاله، فلو وقفت بالنص ما يضيع اللي خلصته
    state.focus.minutes += ph.min;
    grant('focus:' + t.endAt + ':' + t.phase, ph.min * FOCUS_XP_PER_MIN, 'SENSE');
    if (t.phase === lastWork) {
      state.focus.sessions += 1;
      const workMin = plan.filter((p) => p.type === 'work').reduce((a, p) => a + p.min, 0);
      toast(L('أُغلقت بوابة التركيز', 'Focus gate closed'), '+' + workMin * FOCUS_XP_PER_MIN + ' XP' + L('، ' + workMin + ' دقيقة شغل', ', ' + workMin + ' min of work'), 'gold');
      sound('level');
      completeLinked = t.auto && Boolean(t.link);
    } else {
      toast(L('خلص مقطع الشغل', 'Work block done'), L('استراحة ' + next.min + ' دقيقة، قم وتحرك', next.min + '-min break. Get up and move'), 'gold');
      sound('start');
    }
  } else if (next) {
    toast(L('خلصت الاستراحة', 'Break over'), L('رجعنا للشغل: ' + next.min + ' دقيقة', 'Back to work: ' + next.min + ' min'));
    sound('start');
  }

  if (next) {
    // المرحلة الجاية تبدأ من نهاية اللي قبلها، فلو كانت الصفحة مقفلة يلحق الوقت صح
    t.phase += 1; t.endAt = t.endAt + next.min * 60000; t.status = 'running';
  } else {
    t.status = 'idle'; t.phase = 0; t.endAt = 0; t.remaining = timerTotal();
  }

  if (completeLinked) {
    const [kind, id] = t.link.split(':');
    const { fixed, gates } = todayTasks();
    const task = fixed.concat(gates).find((x) => x.kind === kind && x.id === id);
    if (task && !task.done) { toggleTask(kind, id); runTimer(); return; }
  }
  commit(); runTimer();
}

/* ============ 9. الإنجازات ============ */
function checkAchievements(streakNow) {
  const reach = Math.max(streakNow, state.bestStreak);
  state.achievements.forEach((a) => {
    if (reach >= a.days && !state.unlocked.includes(a.id)) {
      state.unlocked.push(a.id);
      setTimeout(() => { toast(L('إنجاز جديد: ', 'New achievement: ') + a.name, L(a.days + ' يوماً بلا انقطاع', a.days + ' days without a break'), 'gold'); sound('level'); burst(); }, 600);
    }
  });
}

function addAchievement(name, days) {
  name = String(name || '').trim().slice(0, 30);
  days = Math.round(Number(days));
  if (!name || !(days >= 1 && days <= 3650)) return false;
  state.achievements.push({ id: uid('a'), name, days });
  state.achievements.sort((a, b) => a.days - b.days);
  commit();
  return true;
}
async function deleteAchievement(id) {
  const a = state.achievements.find((x) => x.id === id);
  if (!a || !(await confirmBox(L('تحذف الإنجاز «' + a.name + '»؟', 'Delete the achievement "' + a.name + '"?')))) return;
  state.achievements = state.achievements.filter((x) => x.id !== id);
  state.unlocked = state.unlocked.filter((x) => x !== id);
  commit();
}

/* ============ 10. النسخ الاحتياطي ============ */
function exportBackup(quiet) {
  const { migratedFrom, ...clean } = state;
  clean.lastBackup = Date.now();
  const blob = new Blob([JSON.stringify({ app: 'hunter-system', version: 6, exportedAt: new Date().toISOString(), state: clean }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'hunter-backup-' + todayIso() + '.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  state.lastBackup = Date.now();
  commit();
  if (!quiet) toast(L('حُفظت النسخة الاحتياطية', 'Backup saved'), L('احفظ الملف في مكان آمن', 'Keep the file somewhere safe'), 'gold');
}

// يمسح كل شي ويبدأ من جديد، وقبلها ينزّل نسخة احتياطية تلقائياً
async function resetAll() {
  if (!(await confirmBox(L('بيمسح كل بياناتك: المستوى والمهام والسلسلة والإنجازات، ويبدأ النظام كأنك توك بادي.\n\nقبل المسح بنزّل لك نسخة احتياطية تلقائياً، عشان لو غيرت رأيك تستعيدها.', 'This erases all your data: level, quests, streak and achievements, and the System starts fresh.\n\nA backup downloads automatically first, so you can restore it if you change your mind.'), L('امسح وابدأ من جديد', 'Erase and start over')))) return;
  exportBackup(true);
  clearInterval(timerTick);
  state = freshState();
  store.del('hunterNameAsked_v6');
  editing = false;
  commit(); runTimer(); setView('today');
  toast(L('بدأت من الصفر', 'Started from zero'), L('نزّلنا نسخة من بياناتك القديمة', 'A copy of your old data was downloaded'), 'gold');
  setTimeout(() => { store.set('hunterNameAsked_v6', '1'); openNameDialog(true); }, 900);
}

function importBackup(file) {
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast(L('الملف كبير جداً', 'File too large'), L('الحد 3 ميجا', 'Max 3 MB'), 'warn'); return; }
  const r = new FileReader();
  r.onload = async () => {
    let data;
    try { data = JSON.parse(String(r.result)); } catch (e) { toast(L('الملف غير صالح', 'Invalid file'), L('لازم يكون ملف JSON من النظام', 'It must be a JSON file from the System'), 'warn'); return; }
    let next = null;
    if (data && data.app === 'hunter-system' && data.state) next = normalize(data.state);
    else if (data && (data.fixedQuests || data.progress)) next = migrateOld(data);
    if (!next) { toast(L('ما تعرفت على الملف', 'Unrecognized file'), L('استخدم ملف نسخة احتياطية من النظام', 'Use a backup file from the System'), 'warn'); return; }
    if (!(await confirmBox(L('تستبدل بياناتك الحالية بالنسخة من الملف؟ ما تقدر تتراجع إلا بنسخة احتياطية.', 'Replace your current data with the file? You can only undo this with a backup.'), L('استبدل', 'Replace')))) return;
    state = next; state.lastBackup = Date.now();
    commit(); runTimer();
    toast(L('رجعت بياناتك', 'Your data is back'), L('المستوى ', 'Level ') + levelInfo(state.totalXp).level, 'gold');
  };
  r.readAsText(file);
}

const backupDue = () => Object.keys(state.rewards).length > 0 && Date.now() - state.lastBackup > 7 * 86400000;

/* ============ 11. الصوت والتأثيرات ============ */
let actx = null;
function sound(type) {
  if (!state.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const notes = { done: [660, 990], undo: [520, 330], start: [440, 660], level: [523, 659, 784, 1047] }[type] || [600];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + i * 0.08;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.25);
    });
  } catch (e) { /* بدون صوت */ }
}

// action اختياري: { label, run } يطلع زر (مثل «تراجع») ويطوّل مدة الإشعار
function toast(title, sub, tone, action) {
  const box = $('toasts');
  const t = el('div', { class: 'toast ' + (tone || '') + (action ? ' has-action' : '') },
    el('span', { class: 'toast-mark', 'aria-hidden': 'true', text: '!' }),
    el('span', { class: 'toast-title', text: title }),
    sub ? el('span', { class: 'toast-sub', text: sub }) : null);
  if (action) {
    t.append(el('button', { type: 'button', class: 'toast-btn', onclick: () => { t.remove(); action.run(); }, text: action.label }));
  }
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  const life = action ? 5200 : 2600;
  setTimeout(() => t.classList.add('out'), life);
  setTimeout(() => t.remove(), life + 500);
}

function celebrateLevel(lv, from) {
  sound('level');
  burst();
  const dlg = $('lvDialog');
  if (!dlg || typeof dlg.showModal !== 'function') { toast(L('ارتقيت إلى المستوى ' + lv, 'Level up! You reached level ' + lv), L('استمر يا صياد', 'Keep going, Hunter'), 'gold'); return; }
  const prev = dlg.open ? Number($('lvFrom').textContent) || from : (from || lv - 1);
  $('lvFrom').textContent = String(prev);
  $('lvTo').textContent = String(lv);
  const nr = RANKS.find((x) => x.lv > lv);
  $('lvNote').textContent = L('المستوى ' + lv + ' يحتاج ' + lv * 100 + ' XP.', 'Level ' + lv + ' needs ' + lv * 100 + ' XP.')
    + (nr ? L(' تبقّى ' + Math.max(0, nr.lv - lv) + ' مستوى على اختبار الرتبة ' + nr.l + '.', ' ' + Math.max(0, nr.lv - lv) + ' more levels to the rank ' + nr.l + ' trial.') : '');
  // نعيد تشغيل الحركات
  dlg.classList.remove('play'); void dlg.offsetWidth; dlg.classList.add('play');
  if (!dlg.open) dlg.showModal();
}

function burst() {
  if (reducedMotion()) return;
  const fx = $('fx');
  for (let i = 0; i < 26; i++) {
    const p = el('span', { class: 'spark', style: '--x:' + (Math.random() * 360 - 180) + 'px;--y:' + (Math.random() * -260 - 40) + 'px;left:' + (40 + Math.random() * 20) + '%;animation-delay:' + Math.random() * 0.15 + 's' });
    fx.append(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function buildEmbers() {
  const fx = $('fx');
  fx.querySelectorAll('.ember').forEach((e) => e.remove());
  if (reducedMotion() || document.documentElement.dataset.theme !== 'anime') return;
  for (let i = 0; i < 22; i++) {
    fx.append(el('span', { class: 'ember', style: 'left:' + Math.random() * 100 + '%;width:' + (2 + Math.random() * 3) + 'px;height:' + (2 + Math.random() * 3) + 'px;animation-duration:' + (9 + Math.random() * 12) + 's;animation-delay:' + (-Math.random() * 20) + 's;--dx:' + (Math.random() * 80 - 40) + 'px' }));
  }
}

function confirmBox(text, okLabel) {
  return new Promise((resolve) => {
    const dlg = $('confirmDialog');
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel || L('تأكيد', 'Confirm');
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok');
    dlg.showModal();
  });
}

/* ============ 12. الرسم ============ */
let state = loadState();
let editing = false;
let justToggled = '';
let view = 'today';
const theme = () => document.documentElement.dataset.theme;

function commit() {
  const si = streakInfo();
  state.bestStreak = Math.max(state.bestStreak, si.streak);
  checkAchievements(si.streak);
  save();
  render();
}

function render() {
  const si = streakInfo();
  renderTop();
  if (view === 'today') { renderHero(si); renderStatCards(si); renderTasks(); renderTimer(); renderLinkOptions(); renderAchMini(si); renderHeat(); }
  if (view === 'stats') renderStats(si);
  if (view === 'ach') renderAchList(si);
  justToggled = '';
}

function renderTop() {
  document.querySelectorAll('.tab').forEach((b) => { if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ['today', 'stats', 'ach'].forEach((v) => { $('view-' + v).hidden = v !== view; });
  $('soundBtn').setAttribute('aria-pressed', String(state.sound));
  $('soundBtn').classList.toggle('off', !state.sound);
  $('themeBtn').setAttribute('aria-label', theme() === 'anime' ? L('التبديل للواجهة الداكنة', 'Switch to the Night Ink theme') : L('التبديل لواجهة الأنمي', 'Switch to the Anime theme'));
  $('backupBtn').classList.toggle('due', backupDue());
  $('backupBtn').dataset.tip = backupDue() ? L('نسخة احتياطية: مر أسبوع بدون نسخة', 'Backup: a week without one') : L('نسخة احتياطية', 'Backup');
  $('soundBtn').dataset.tip = state.sound ? L('الصوت شغال', 'Sound on') : L('الصوت مطفي', 'Sound off');
  $('themeBtn').dataset.tip = theme() === 'anime' ? L('الواجهة الداكنة', 'Night Ink theme') : L('واجهة الأنمي', 'Anime theme');
  $('backupNote').textContent = state.lastBackup ? L('آخر نسخة: ', 'Last backup: ') + new Date(state.lastBackup).toLocaleDateString(L('ar', 'en-GB')) : L('ما أخذت نسخة احتياطية للحين.', 'No backup yet.');
}

function displayName() { return state.name || L('صياد', 'Hunter'); }

function nameButton(cls) {
  return el('button', { class: cls + (state.name ? '' : ' unnamed'), 'aria-label': state.name ? L('اسمك ' + state.name + '، اضغط لتغييره', 'Your name is ' + state.name + ', click to change it') : L('اكتب اسمك', 'Enter your name'), onclick: openNameDialog },
    state.name || L('اكتب اسمك', 'Enter your name'),
    sv('svg', { viewBox: '0 0 24 24', class: 'pen', 'aria-hidden': 'true' }, sv('path', { d: 'M12 20h9' }), sv('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' })));
}

function renderHero(si) {
  const hero = $('hero');
  const lv = levelInfo(state.totalXp);
  const reach = Math.max(si.streak, state.bestStreak);
  const { cur, next } = rankFor(lv.level, reach);
  const anime = theme() === 'anime';
  const ttl = activeTitle();
  const need = lv.need - lv.xp;

  // الخبرة: أنمي = 20 مقطع، حبر الليل = خط رفيع بنقطة
  const filled = Math.floor(lv.xp / lv.need * 20);
  const xpBar = anime
    ? el('div', { class: 'xpseg', role: 'img', 'aria-label': L('الخبرة ', 'XP ') + lv.xp + L(' من ', ' of ') + lv.need },
      ...Array.from({ length: 20 }, (_, i) => el('i', { class: i < filled ? 'on' : '' })))
    : el('div', { class: 'xpbar', role: 'img', 'aria-label': L('الخبرة ', 'XP ') + lv.xp + L(' من ', ' of ') + lv.need }, el('span', { style: 'width:' + Math.round(lv.xp / lv.need * 1000) / 10 + '%' }));

  const lvlBlock = el('div', { class: 'lvl-block' },
    el('div', { class: 'lvl-row' },
      el('span', { class: 'lvl-num' }, String(lv.level)),
      el('div', { class: 'who' },
        el('span', { class: 'muted', text: L('المستوى', 'Level') }),
        nameButton('hname'),
        el('div', { class: 'chips' },
          el('span', { class: 'rank-chip', text: L('صياد رتبة ' + cur.l, cur.l + '-Rank Hunter') }),
          ttl ? el('span', { class: 'title-chip', title: L('لقبك الحالي', 'Your current title') }, crownIcon(), ttl.name) : null))),
    xpBar,
    el('div', { class: 'xp-meta' },
      el('span', { text: L('تبقّى ' + need + ' XP على المستوى ' + (lv.level + 1), need + ' XP to level ' + (lv.level + 1)) }),
      el('span', { dir: 'ltr', text: lv.xp + ' / ' + lv.need + ' XP' })),
    next ? rankTrial(next, lv.level, reach) : el('p', { class: 'rank-max', text: L('وصلت أعلى رتبة في النظام.', 'You reached the highest rank in the System.') }));

  const graceDots = el('span', { class: 'grace', 'aria-label': L('أيام السماح المتبقية: ' + si.graceLeft + ' من ', 'Grace days left: ' + si.graceLeft + ' of ') + GRACE_DAYS },
    ...Array.from({ length: GRACE_DAYS }, (_, i) => el('i', { class: i < si.graceLeft ? 'left' : '' })));
  const streakLbl = si.streak === 1 ? L('يوم متتالي', 'day in a row') : L('يوماً متتالياً', 'days in a row');

  hero.className = anime ? 'hero-anime' : 'hero-ink';
  if (anime) {
    // نافذة [الحالة]: السلسلة وأيام السماح والقدرات
    const maxStat = Math.max(30, ...STATS.map((k) => state.stats[k] || 0));
    const status = el('section', { class: 'status-win panel', 'aria-label': L('الحالة', 'Status') },
      el('p', { class: 'win-tab', text: L('[ الحالة ]', '[ STATUS ]') }),
      el('div', { class: 'st-streak' },
        el('span', { class: 'flame', 'aria-hidden': 'true' }),
        el('span', { class: 'streak-num', text: String(si.streak) }),
        el('div', { class: 'st-side' },
          el('span', { class: 'streak-lbl', text: streakLbl }),
          el('div', { class: 'grace-row' }, el('span', { text: L('أيام السماح', 'Grace days') }), graceDots))),
      el('div', { class: 'st-abil' }, STATS.map((k) => el('div', { class: 'ab s-' + k },
        el('div', { class: 'ab-top' }, el('span', { class: 'ab-name', text: STAT_AR[k] }), el('span', { class: 'ab-val', text: String(state.stats[k] || 0) })),
        el('div', { class: 'ab-bar' }, el('span', { style: 'width:' + Math.min(100, Math.round((state.stats[k] || 0) / maxStat * 100)) + '%' }))))));
    hero.replaceChildren(
      el('div', { class: 'motes', 'aria-hidden': 'true' }, ...Array.from({ length: 16 }, (_, i) => el('i', { style: 'right:' + (3 + i * 6.2) + '%;animation-duration:' + (8 + (i * 7) % 7) + 's;animation-delay:-' + ((i * 3) % 11) + 's' }))),
      el('div', { class: 'avatar', 'aria-hidden': 'true' }, el('img', { src: 'assets/hunter-avatar.webp', alt: '' })),
      el('div', { class: 'hero-body' }, lvlBlock, status),
      el('p', { class: 'subtitle', id: 'subtitle' }));
  } else {
    const { counted, full, best } = commitStats();
    const streakBlock = el('div', { class: 'streak-block' },
      el('div', { class: 'ink-streak-row' },
        el('div', { class: 'ink-streak-side' },
          el('span', { class: 'streak-lbl', text: streakLbl }),
          el('div', { class: 'grace-row' }, el('span', { text: L('أيام السماح', 'Grace days') }), graceDots)),
        el('span', { class: 'streak-num', text: String(si.streak) })),
      el('span', { class: 'ink-meta-line' },
        L('أطول سلسلة ', 'Longest streak '), el('b', { text: String(best) }), '  ·  ',
        L('الالتزام ', 'Commitment '), el('b', { dir: 'ltr', text: counted ? Math.round(full / counted * 100) + '%' : '—' })));
    hero.replaceChildren(
      el('div', { class: 'hero-body ink-grid' }, lvlBlock, moonBlock(), streakBlock),
      el('p', { class: 'subtitle', id: 'subtitle' }));
  }
  updateSubtitle();
}

// اختبار الرتبة الجاية: شرط المستوى وشرط السلسلة
function rankTrial(next, level, reach) {
  const row = (label, v, need) => el('div', { class: 'rt-row' + (v >= need ? ' met' : '') },
    el('span', { class: 'rt-top' }, el('span', { text: label }), el('span', { class: 'rt-val', dir: 'ltr', text: v + ' / ' + need })),
    el('span', { class: 'rt-bar' }, el('span', { style: 'width:' + Math.min(100, Math.round(v / need * 100)) + '%' })));
  return el('div', { class: 'rank-trial' },
    el('span', { class: 'rt-title', text: L('اختبار الرتبة ', 'Rank ') + next.l + L('', ' trial') }),
    el('div', { class: 'rt-rows' }, row(L('المستوى', 'Level'), level, next.lv), row(L('السلسلة', 'Streak'), reach, next.streak)));
}

// القمر: يكتمل مع المهام اليومية، ونقطة لكل مهمة حوله
function moonBlock() {
  const t = todayIso();
  const fx = fixedFor(t);
  const doneN = fx.filter((q) => doneIds(t).includes(q.id)).length;
  const rest = isRest(t);
  const f = fx.length ? doneN / fx.length : 0;
  const R = 104, C = 140;
  const rx = R * Math.abs(1 - 2 * f);
  const d = 'M' + C + ' ' + (C - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + C + ' ' + (C + R) + ' A' + rx.toFixed(2) + ' ' + R + ' 0 0 ' + (f > 0.5 ? 1 : 0) + ' ' + C + ' ' + (C - R) + ' Z';
  const name = rest ? L('قمر نائم', 'Sleeping moon') : f <= 0 ? L('محاق', 'New moon') : f < 0.45 ? L('هلال', 'Crescent') : f <= 0.55 ? L('تربيع', 'Half moon') : f < 1 ? L('أحدب', 'Gibbous') : L('اكتمل البدر', 'Full moon');
  const svg = sv('svg', { viewBox: '0 0 280 280', class: 'moon-svg', role: 'img', 'aria-label': L('قمر اليوم: ', "Today's moon: ") + name + L('، أنجزت ', ', ') + doneN + L(' من ', ' of ') + fx.length + L(' مهام يومية', ' daily quests done') },
    sv('defs', {}, sv('clipPath', { id: 'moonLit' }, sv('path', { d }))),
    sv('circle', { cx: C, cy: C, r: 130, class: 'm-orbit' }),
    sv('circle', { cx: C, cy: C, r: R, class: 'm-disc' }),
    sv('path', { d, class: 'm-lit' + (rest ? ' dim' : '') }),
    sv('g', { 'clip-path': 'url(#moonLit)', class: 'm-craters' },
      sv('circle', { cx: 108, cy: 104, r: 15 }), sv('circle', { cx: 168, cy: 156, r: 21 }), sv('circle', { cx: 128, cy: 180, r: 9 }),
      sv('circle', { cx: 178, cy: 98, r: 7 }), sv('circle', { cx: 92, cy: 154, r: 11 })),
    ...fx.slice(0, 12).map((q, i, arr) => {
      const a = (-90 + i * 360 / arr.length) * Math.PI / 180;
      return sv('circle', { cx: (C + 130 * Math.cos(a)).toFixed(1), cy: (C + 130 * Math.sin(a)).toFixed(1), r: 5.5, class: 'm-dot' + (doneIds(t).includes(q.id) ? ' on' : '') });
    }));
  return el('div', { class: 'moon-block' + (f >= 1 && !rest ? ' full' : '') },
    el('div', { class: 'moon-wrap', style: '--halo:' + (0.05 + f * 0.16).toFixed(3) }, svg),
    el('span', { class: 'moon-name', text: name }),
    el('span', { class: 'moon-sub', text: rest ? L('يوم راحة: القمر يرتاح الليلة', 'Rest day: the moon rests tonight') : L('المهام اليومية: ' + doneN + ' من ' + fx.length, 'Daily quests: ' + doneN + ' of ' + fx.length) }));
}

function updateSubtitle() {
  const sub = $('subtitle');
  if (!sub) return;
  const { fixed, gates } = todayTasks();
  const left = fixed.concat(gates).filter((t) => !t.done).length;
  const n = new Date();
  const toMid = 86400 - (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds());
  const clock = pad(Math.floor(toMid / 3600)) + ':' + pad(Math.floor(toMid % 3600 / 60)) + ':' + pad(toMid % 60);
  const datePart = theme() === 'ink' ? WEEKDAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()] + ' ' + n.getFullYear() + '  ·  ' : '';
  sub.textContent = datePart + (isRest(todayIso()) ? L('يوم راحة. استرح، وسلسلتك محفوظة.', 'Rest day. Recharge, your streak is safe.')
    : left === 0 ? L('أكملت كل مهام اليوم. يبدأ يوم جديد بعد ', 'All quests done. A new day starts in ') + clock
    : L('تبقّت ' + left + (left === 1 ? ' مهمة' : ' مهام') + '، ويُعاد ضبط اليوم بعد ', left + (left === 1 ? ' quest' : ' quests') + ' left. The day resets in ') + clock);
}

function taskRow(t) {
  const key = t.kind + ':' + t.id;
  const isMit = mitKey() === key;
  const label = (t.done ? L('إلغاء إنجاز ', 'Undo ') : L('إنجاز ', 'Complete ')) + t.title + L('، ', ', ') + STAT_AR[t.stat] + (isMit ? L('، مهمة اليوم الأهم', ", today's top quest") : '');
  const btn = el('button', { class: 'task' + (t.done ? ' done' : '') + (justToggled === key ? ' pop' : ''), 'aria-pressed': String(t.done), 'aria-label': label, onclick: () => toggleTask(t.kind, t.id) });
  const statTag = el('span', { class: 'stag s-' + t.stat, 'aria-hidden': 'true', text: '#' + STAT_AR[t.stat] });
  const mitTag = isMit ? el('span', { class: 'mit-tag', 'aria-hidden': 'true', text: L('الأهم اليوم', 'Top quest') }) : null;
  if (theme() === 'anime') {
    btn.append(...[
      el('span', { class: 'dia ' + t.kind, 'aria-hidden': 'true' }),
      t.kind === 'gate' ? el('span', { class: 'rank r-' + t.rank, text: t.rank }) : null,
      el('span', { class: 'title', text: t.title }),
      statTag, mitTag,
      t.late ? el('span', { class: 'late', text: L('متأخرة', 'Overdue') }) : null,
      el('span', { class: 'lead', 'aria-hidden': 'true' }),
      timeNode(t.time, 'time'),
      el('span', { class: 'ctr', dir: 'ltr', text: '[' + (t.done ? 1 : 0) + '/1]' })].filter(Boolean));
  } else {
    btn.append(
      timeNode(t.time, 'time'),
      el('span', { class: 'node ' + t.kind, 'aria-hidden': 'true' }),
      el('span', { class: 'body' },
        el('span', { class: 'title strk' + (t.done ? ' on' : ''), text: t.title }),
        t.kind === 'gate' ? el('span', { class: 'rank', text: L('بوابة ', 'Gate ') + t.rank }) : null,
        statTag, mitTag,
        t.late ? el('span', { class: 'late', text: L('متأخرة', 'Overdue') }) : null),
      el('span', { class: 'xp', dir: 'ltr', text: '+' + t.xp }));
  }
  const star = el('button', {
    class: 'mit-btn' + (isMit ? ' on' : ''), 'aria-pressed': String(isMit),
    'aria-label': isMit ? L('إلغاء «' + t.title + '» كمهمة اليوم الأهم', 'Remove "' + t.title + '" as today\'s top quest') : L('اجعل «' + t.title + '» مهمة اليوم الأهم (+' + MIT_XP + ' XP)', 'Make "' + t.title + '" today\'s top quest (+' + MIT_XP + ' XP)'),
    title: isMit ? L('مهمة اليوم الأهم', "Today's top quest") : L('اجعلها مهمة اليوم الأهم', "Make it today's top quest"), onclick: () => setMit(key)
  }, starIcon());
  const li = el('li', { class: 'task-li' + (isMit ? ' is-mit' : '') }, star, btn);
  if (t.kind === 'gate' && t.ref.subs && t.ref.subs.length) { li.classList.add('has-subs'); li.append(subsBlock(t.ref)); }
  if (justToggled === key && t.done) {
    li.classList.add('swept');
    li.append(el('span', { class: 'xpf', 'aria-hidden': 'true', dir: 'ltr', text: '+' + (t.xp + (isMit ? MIT_XP : 0)) }));
  }
  if (editing) {
    li.append(el('span', { class: 'row-tools' },
      el('button', { class: 'mini', onclick: () => openEdit(t.kind, t.id), 'aria-label': L('تعديل ', 'Edit ') + t.title, text: L('تعديل', 'Edit') }),
      el('button', { class: 'mini danger', onclick: () => deleteTask(t.kind, t.id), 'aria-label': L('حذف ', 'Delete ') + t.title, text: L('حذف', 'Delete') })));
  }
  return li;
}

function renderTasks() {
  const list = $('taskList');
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates);
  const doneN = all.filter((t) => t.done).length;
  const t = todayIso();
  $('taskCount').textContent = all.length ? L('أنجزت ' + doneN + ' من ' + all.length, doneN + ' of ' + all.length + ' done') : '';
  $('restBtn').setAttribute('aria-pressed', String(isRest(t)));
  $('restBtn').textContent = isRest(t) ? L('إلغاء يوم الراحة', 'Cancel rest day') : L('خذ يوم راحة', 'Take a rest day');
  $('editBtn').setAttribute('aria-pressed', String(editing));
  $('editLabel').textContent = editing ? L('خلصت التعديل', 'Done editing') : L('تعديل المهام', 'Edit quests');
  list.replaceChildren();
  const byTime = (a, b) => a.time.localeCompare(b.time);

  if (isRest(t)) {
    list.append(restCard());
  } else if (!all.length) {
    list.append(el('p', { class: 'empty', text: L('ما عندك مهام اليوم. اكتب أول مهمة فوق، وأضف «يومي» لو تبيها تتكرر.', 'No quests today. Type your first one above, and add "daily" if it repeats.') }));
  } else if (theme() === 'anime') {
    if (fixed.length) list.append(el('h3', { class: 'grp', text: L('كل يوم', 'Daily') }), el('ul', { class: 'tasks' }, fixed.sort(byTime).map(taskRow)));
    if (gates.length) list.append(el('h3', { class: 'grp gates', text: L('بوابات اليوم', "Today's gates") }), el('ul', { class: 'tasks' }, gates.sort(byTime).map(taskRow)));
  } else {
    const n = new Date();
    const nowStr = pad(n.getHours()) + ':' + pad(n.getMinutes());
    const ol = el('ol', { class: 'timeline' }, el('span', { class: 'rail', 'aria-hidden': 'true' }));
    let placed = false;
    all.sort(byTime).forEach((task) => {
      if (!placed && task.time > nowStr) { ol.append(nowRow(nowStr)); placed = true; }
      ol.append(taskRow(task));
    });
    if (!placed) ol.append(nowRow(nowStr));
    list.append(ol);
  }

  // البوابات القادمة (الأيام الجاية)
  const up = $('upcoming');
  up.replaceChildren();
  const future = state.gates.filter((g) => g.date > t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
  if (future.length) {
    up.append(el('h3', { class: 'grp', text: L('القادمة', 'Upcoming') }), el('ul', { class: 'upcoming' }, future.map((g) => {
      const d = dateOf(g.date);
      return el('li', {},
        el('span', { class: 'up-date', text: WEEKDAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] }),
        el('span', { class: 'up-title', text: g.title }),
        el('span', { class: 'up-rank', text: L('رتبة ' + g.rank + '، الساعة ', 'Rank ' + g.rank + ', at ') + fmt12(g.time) }),
        editing ? el('span', { class: 'row-tools' },
          el('button', { class: 'mini', onclick: () => openEdit('gate', g.id), 'aria-label': L('تعديل ', 'Edit ') + g.title, text: L('تعديل', 'Edit') }),
          el('button', { class: 'mini danger', onclick: () => deleteTask('gate', g.id), 'aria-label': L('حذف ', 'Delete ') + g.title, text: L('حذف', 'Delete') })) : null);
    })));
  }
  renderBonusLine(t);
}

function nowRow(nowStr) {
  return el('li', { class: 'now-row', 'aria-label': L('الوقت الآن ', 'Current time ') + fmt12(nowStr) },
    el('span', { 'aria-hidden': 'true' }),
    timeNode(nowStr, 'time'), el('span', { class: 'nowdot', 'aria-hidden': 'true' }),
    el('span', { class: 'nowline', 'aria-hidden': 'true' }, el('i'), el('b', { text: L('الآن', 'Now') })));
}

function renderTimer() {
  const left = timerLeft(), total = timerTotal();
  const plan = timerPlan(state.timer.minutes), ph = curPhase();
  const works = plan.filter((p) => p.type === 'work').length;
  const workNo = plan.slice(0, state.timer.phase + 1).filter((p) => p.type === 'work').length;
  const st = state.timer.status;
  $('timerPhase').textContent = st === 'idle' ? L('جاهز', 'Ready') : (ph.type === 'break' ? L('استراحة', 'Break') : L('تركيز', 'Focus')) + (st === 'paused' ? L(' · متوقف', ' · paused') : '');
  $('timerSub').textContent = plan.length < 2 ? ph.min + L(' دقيقة', ' min') : ph.type === 'break' ? L('راحة ' + ph.min + ' د، بعدها نرجع للشغل', ph.min + '-min break, then back to work') : L('مقطع ' + workNo + ' من ' + works, 'Block ' + workNo + ' of ' + works);
  $('focusPanel').classList.toggle('on-break', ph.type === 'break' && state.timer.status !== 'idle');
  const steps = $('timerSteps');
  steps.hidden = plan.length < 2;
  steps.replaceChildren(...plan.map((p, i) => el('span', {
    class: 'step ' + p.type + (i < state.timer.phase ? ' done' : i === state.timer.phase && state.timer.status !== 'idle' ? ' cur' : ''),
    style: 'flex-grow:' + p.min, title: (p.type === 'work' ? L('شغل ', 'Work ') : L('راحة ', 'Break ')) + p.min + L(' دقيقة', ' min')
  })));
  $('timerDisplay').textContent = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
  $('timerDisplay').classList.toggle('running', state.timer.status === 'running');
  // الحلقة تنقص مع الوقت (pathLength = 1000)
  $('timerRing').style.strokeDashoffset = String(Math.round((1 - (total ? left / total : 1)) * 1000));
  placeOrbit('timerOrbit', total ? left / total : 1);
  $('timerStart').textContent = state.timer.status === 'running' ? L('إيقاف مؤقت', 'Pause') : state.timer.status === 'paused' ? L('كمّل', 'Resume') : L('ادخل البوابة', 'Enter the gate');
  renderImmersive(left, total, ph, plan);
  $('timerMinutes').value = String(state.timer.minutes);
  $('timerMinutes').disabled = state.timer.status !== 'idle';
  $('timerAuto').checked = state.timer.auto;
  if (state.timer.status === 'running') document.title = pad(Math.floor(left / 60)) + ':' + pad(left % 60) + ' | ' + APP_NAME;
  else document.title = APP_NAME;
}

function renderLinkOptions() {
  const sel = $('timerLink');
  const { fixed, gates } = todayTasks();
  sel.replaceChildren(el('option', { value: '', text: L('بدون ربط', 'No link') }),
    ...fixed.concat(gates).filter((t) => !t.done).map((t) => el('option', { value: t.kind + ':' + t.id, text: t.title })));
  sel.value = [...sel.options].some((o) => o.value === state.timer.link) ? state.timer.link : '';
}

function achRow(a, reach, withTools) {
  const got = reach >= a.days || state.unlocked.includes(a.id);
  const isTitle = got && state.title === a.id;
  const side = got
    ? el('button', { class: 'title-btn' + (isTitle ? ' on' : ''), 'aria-pressed': String(isTitle), 'aria-label': isTitle ? L('إزالة لقب ', 'Remove the title ') + a.name : L('اتخذ ' + a.name + ' لقباً', 'Use ' + a.name + ' as your title'), onclick: () => setTitle(a.id) }, isTitle ? L('لقبك الحالي', 'Current title') : L('اتخذه لقباً', 'Use as title'))
    : el('span', { class: 'muted', text: Math.min(reach, a.days) + ' / ' + a.days });
  return el('li', { class: 'ach' + (got ? ' got' : '') + (isTitle ? ' is-title' : '') },
    el('span', { class: 'ach-badge', 'aria-hidden': 'true' }, el('span', { text: String(a.days) })),
    el('div', { class: 'ach-body' },
      el('div', { class: 'ach-top' }, el('span', { class: 'ach-name', text: a.name }), side),
      el('div', { class: 'bar' }, el('span', { style: 'width:' + Math.min(100, Math.round(reach / a.days * 100)) + '%' }))),
    withTools ? el('button', { class: 'mini danger', onclick: () => deleteAchievement(a.id), 'aria-label': L('حذف ', 'Delete ') + a.name, text: L('حذف', 'Delete') }) : null);
}

function renderAchMini(si) {
  const reach = Math.max(si.streak, state.bestStreak);
  const list = state.achievements.slice().sort((a, b) => a.days - b.days);
  const isGot = (a) => reach >= a.days || state.unlocked.includes(a.id);
  // المفتوحة (عشان تختار لقبك منها) وبعدها الجاية
  let got = list.filter(isGot).slice(-2);
  const ttl = activeTitle();
  if (ttl && !got.includes(ttl)) got = [ttl].concat(got.slice(-1));
  const show = got.concat(list.filter((a) => !isGot(a))).slice(0, 4);
  $('achMiniList').replaceChildren(show.length ? el('ul', { class: 'ach-list' }, show.map((a) => achRow(a, reach, false))) : el('p', { class: 'empty', text: L('ما عندك إنجازات. أضف واحد من صفحة الإنجازات.', 'No achievements. Add one from the Achievements page.') }));
}

function renderAchList(si) {
  const reach = Math.max(si.streak, state.bestStreak);
  const list = state.achievements.slice().sort((a, b) => a.days - b.days);
  $('achList').replaceChildren(...(list.length ? list.map((a) => achRow(a, reach, true)) : [el('li', { class: 'empty', text: L('ما عندك إنجازات للحين. أضف أول واحد تحت.', 'No achievements yet. Add your first one below.') })]));
}

function dayRatio(iso) {
  const app = fixedFor(iso);
  const g = state.gates.filter((x) => x.date === iso);
  const total = app.length + g.length;
  if (!total) return -1;
  const d = doneIds(iso);
  return (app.filter((q) => d.includes(q.id)).length + g.filter((x) => x.done).length) / total;
}

function renderHeat() {
  const box = $('heat');
  box.replaceChildren();
  const today = todayIso();
  // مثل التقويم: كل صف أسبوع يبدأ بالجمعة من اليمين.
  // أول صف = أسبوع بدايتك، وبعد ما تعدّي 12 أسبوع يصير يعرض آخر 12.
  const thisWeek = weekStart(today);
  const startWeek = weekStart(state.startDate);
  const slideStart = addDays(thisWeek, -7 * 11);
  const fromStart = startWeek >= slideStart;
  const start = fromStart ? startWeek : slideStart;
  $('heatTitle').textContent = fromStart ? L('سجلّك من أول يوم', 'Your record since day one') : L('آخر 12 أسبوعاً', 'Last 12 weeks');
  WD_FROM_FRI.forEach((d) => box.append(el('span', { class: 'wd', 'aria-hidden': 'true', text: d })));
  let total = 0, active = 0;
  for (let i = 0; i < 84; i++) {
    const iso = addDays(start, i);
    if (iso > today) { box.append(el('span', { class: 'cell future', title: iso }, el('i'))); continue; }
    if (iso < state.startDate) { box.append(el('span', { class: 'cell before', title: iso + L('، قبل ما تبدأ', ', before you started') }, el('i'))); continue; }
    const pick = () => { heatSel = iso; renderHeat(); };
    const r = dayRatio(iso);
    const lvl = isRest(iso) ? 'rest' : r < 0 ? 'l0' : r === 0 ? 'l0' : r < 0.5 ? 'l1' : r < 1 ? 'l2' : 'l3';
    if (r > 0) active++;
    total++;
    const linked = state.completedDates.includes(iso) && i % 7 !== 6 && addDays(iso, 1) <= today && state.completedDates.includes(addDays(iso, 1));
    box.append(el('button', { type: 'button', class: 'cell ' + lvl + (iso === today ? ' today' : '') + (iso === heatSel ? ' sel' : '') + (linked ? ' link' : ''), 'aria-pressed': String(iso === heatSel), 'aria-label': dayLabel(iso), onclick: pick }, el('i')));
  }
  renderHeatDay();
  box.setAttribute('aria-label', L('خريطة الالتزام: نشطت في ' + active + ' من ' + total + ' يوماً' + (fromStart ? ' منذ بدايتك' : ''), 'Commitment map: active on ' + active + ' of ' + total + ' days' + (fromStart ? ' since you started' : '')));
  renderHeatStats();
}

// جنب السجل: أطول سلسلة، والأيام المكتملة من البداية، ونسبة الالتزام
function commitStats() {
  const today = todayIso();
  const done = new Set(state.completedDates);
  let counted = 0, full = 0;
  for (let d = state.startDate, i = 0; d <= today && i < 5000; d = addDays(d, 1), i++) {
    if (isRest(d) || isOff(d)) continue;
    if (d === today && !done.has(d)) continue; // اليوم ما ينحسب عليك قبل ما يخلص
    counted++;
    if (done.has(d)) full++;
  }
  return { counted, full, best: Math.max(state.bestStreak, streakInfo().streak) };
}
function renderHeatStats() {
  const { counted, full, best } = commitStats();
  const items = [
    ['hs-streak', L('أطول سلسلة', 'Longest streak'), best ? daysAr(best) : '0'],
    ['hs-days', L('أيام مكتملة من البداية', 'Days completed since start'), full + L(' من ', ' of ') + counted],
    ['hs-rate', L('نسبة الالتزام', 'Commitment rate'), counted ? Math.round(full / counted * 100) + '%' : '—']
  ];
  $('heatStats').replaceChildren(...items.map(([c, l, v]) => el('div', { class: c }, el('dt', { text: l }), el('dd', { text: v }))));
}

function renderStats(si) {
  const doneCount = Object.keys(state.rewards).filter((k) => k.startsWith('fixed:') || k.startsWith('gate:')).length;
  const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(todayIso(), -i));
  const rated = days.map(dayRatio).filter((r) => r >= 0);
  const rate = rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length * 100) : 0;
  const nums = [
    [doneCount.toLocaleString('en'), L('مهمة أنجزتها', 'quests completed')],
    [state.focus.minutes.toLocaleString('en'), L('دقيقة تركيز', 'focus minutes')],
    [String(Math.max(state.bestStreak, si.streak)), L('أطول سلسلة', 'longest streak')],
    [rate + '%', L('إنجازك في آخر 30 يوماً', 'completion, last 30 days')]
  ];
  $('numbers').replaceChildren(...nums.map(([n, l]) => el('div', { class: 'num' }, el('b', { text: n }), el('span', { text: l }))));
  const range = []; for (let i = chartRange - 1; i >= 0; i--) range.push(addDays(todayIso(), -i));
  renderXpChart(range);
  renderRadar();
  renderWeek();
}

function renderXpChart(days) {
  // العرض حسب مكان الرسم، عشان يبقى حجم الخط ثابت
  const W = Math.max(300, Math.min(1400, Math.round($('xpChart').clientWidth) || 600)), H = W < 500 ? 200 : 240, P = 28;
  const A0 = EN ? 'start' : 'end', A1 = EN ? 'end' : 'start';
  const vals = days.map((d) => state.xpByDate[d] || 0);
  const max = Math.max(50, ...vals);
  const x = (i) => P + i * (W - 2 * P) / (days.length - 1);
  const y = (v) => H - P - v / max * (H - 2 * P);
  const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const sum = vals.reduce((a, v) => a + v, 0);
  $('xpSum').textContent = L('المجموع ', 'Total ') + sum.toLocaleString('en') + ' XP · ' + L('المتوسط اليومي ', 'Daily average ') + Math.round(sum / days.length);
  document.querySelectorAll('.range [data-range]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.range) === days.length)));
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': L('الخبرة اليومية لآخر ' + days.length + ' يوم، أعلى يوم ', 'Daily XP for the last ' + days.length + ' days, best day ') + Math.max(...vals) + ' XP', class: 'xp-svg' },
    sv('line', { x1: P, y1: H - P, x2: W - P, y2: H - P, class: 'axis' }),
    sv('line', { x1: P, y1: P, x2: W - P, y2: P, class: 'grid' }),
    sv('text', { x: W - P, y: P - 8, class: 'lbl', 'text-anchor': A1 }, document.createTextNode(max + ' XP')),
    sv('polygon', { points: x(0) + ',' + (H - P) + ' ' + pts + ' ' + x(days.length - 1) + ',' + (H - P), class: 'area' }),
    sv('polyline', { points: pts, class: 'line' }),
    ...vals.map((v, i) => sv('circle', { cx: x(i), cy: y(v), r: i === days.length - 1 ? 5 : (days.length > 10 ? 2.5 : 3.5), class: 'dot' + (i === days.length - 1 ? ' last' : '') },
      sv('title', {}, document.createTextNode(days[i] + ': ' + v + ' XP')))),
    sv('text', { x: x(0), y: H - 8, class: 'lbl', 'text-anchor': A0 }, document.createTextNode(dateOf(days[0]).getDate() + ' ' + MONTHS[dateOf(days[0]).getMonth()])),
    sv('text', { x: x(days.length - 1), y: H - 8, class: 'lbl', 'text-anchor': A1 }, document.createTextNode(L('اليوم', 'Today'))));
  $('xpChart').replaceChildren(svg);
}

function renderRadar() {
  const S = 300, C = S / 2, R = 105;
  const vals = STATS.map((k) => state.stats[k] || 0);
  // القدرات قبل أسبوع = الحالية ناقص اللي انكسب في آخر 7 أيام
  const since = addDays(todayIso(), -6);
  const gain = {}; STATS.forEach((k) => { gain[k] = 0; });
  Object.values(state.rewards).forEach((r) => { if (r.stat && r.date >= since) gain[r.stat] = (gain[r.stat] || 0) + 1; });
  const prev = STATS.map((k) => Math.max(0, (state.stats[k] || 0) - gain[k]));
  const max = Math.max(20, ...vals);
  const top = STATS.slice().sort((a, b) => gain[b] - gain[a])[0];
  $('radarNote').textContent = gain[top] > 0 ? L('أكثر قدرة نمت هالأسبوع: ', 'Most grown this week: ') + STAT_AR[top] + ' +' + gain[top] : L('ما نمت أي قدرة هالأسبوع للحين. أنجز مهمة وتنمو قدرتها.', 'No ability has grown this week yet. Finish a quest to grow its ability.');
  const ang = (i) => -Math.PI / 2 + i * 2 * Math.PI / STATS.length;
  const pt = (i, r) => (C + Math.cos(ang(i)) * r).toFixed(1) + ',' + (C + Math.sin(ang(i)) * r).toFixed(1);
  const rings = [0.25, 0.5, 0.75, 1].map((f) => sv('polygon', { points: STATS.map((_, i) => pt(i, R * f)).join(' '), class: 'grid' }));
  const svg = sv('svg', { viewBox: '0 0 ' + S + ' ' + S, role: 'img', 'aria-label': L('القدرات: ', 'Abilities: ') + STATS.map((k) => STAT_AR[k] + ' ' + state.stats[k]).join(L('، ', ', ')), class: 'radar-svg' },
    ...rings,
    ...STATS.map((_, i) => sv('line', { x1: C, y1: C, x2: pt(i, R).split(',')[0], y2: pt(i, R).split(',')[1], class: 'grid' })),
    sv('polygon', { points: prev.map((v, i) => pt(i, R * v / max)).join(' '), class: 'prev' }),
    sv('polygon', { points: vals.map((v, i) => pt(i, R * v / max)).join(' '), class: 'area' }),
    // كل قدرة بلونها، ونفس اللون اللي يطلع جنب المهمة
    ...STATS.map((k, i) => { const [cx, cy] = pt(i, R * vals[i] / max).split(','); return sv('circle', { cx, cy, r: 5, class: 'vdot s-' + k }); }),
    ...STATS.map((k, i) => {
      const [lx, ly] = pt(i, R + 24).split(',');
      return sv('text', { x: lx, y: ly, class: 'lbl s-' + k, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, document.createTextNode(STAT_AR[k] + ' ' + state.stats[k]));
    }));
  $('radar').replaceChildren(svg);
}

function openNameDialog(welcome) {
  const dlg = $('nameDialog');
  $('nameNote').hidden = welcome !== true;
  $('nameInput').value = state.name;
  dlg.returnValue = '';
  dlg.onclose = () => { if (dlg.returnValue === 'save') { state.name = $('nameInput').value.trim().slice(0, 18); commit(); } };
  dlg.showModal();
}

function setView(v) {
  view = v;
  render();
  if (theme() === 'anime' && !reducedMotion()) document.querySelectorAll('#view-' + v + ' .panel').forEach((p, i) => {
    p.classList.remove('opening'); void p.offsetWidth; p.style.animationDelay = (i * 0.12) + 's'; p.classList.add('opening');
  });
  window.scrollTo({ top: 0 });
}

/* ============ 13. التشغيل ============ */
function bind() {
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) setView(g.dataset.goto); });

  $('themeBtn').addEventListener('click', () => {
    const next = theme() === 'anime' ? 'ink' : 'anime';
    document.documentElement.dataset.theme = next;
    store.set(THEME_KEY, next);
    document.querySelector('meta[name="theme-color"]').content = next === 'anime' ? '#040915' : '#10222B';
    buildEmbers(); setView(view);
  });
  $('soundBtn').addEventListener('click', () => { state.sound = !state.sound; commit(); if (state.sound) sound('done'); });

  const menu = $('backupMenu');
  const closeMenu = () => { menu.hidden = true; $('backupBtn').setAttribute('aria-expanded', 'false'); };
  $('backupBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('backupBtn').setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) $('exportBtn').focus(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); $('backupBtn').focus(); } });
  $('exportBtn').addEventListener('click', () => { closeMenu(); exportBackup(); });
  $('importBtn').addEventListener('click', () => { closeMenu(); $('importFile').click(); });
  $('resetBtn').addEventListener('click', () => { closeMenu(); resetAll(); });
  $('importFile').addEventListener('change', (e) => { importBackup(e.target.files[0]); e.target.value = ''; });

  $('quickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = readQuick();
    if (!p) { toast(L('اكتب اسم المهمة أولاً', 'Type the quest name first'), '', 'warn'); return; }
    addParsed(p);
    $('quickInput').value = '';
    $('quickHint').textContent = HINT;
    $('quickHint').classList.remove('chips');
  });
  const HINT = $('quickHint').textContent;
  const preview = () => { const p = readQuick(); if (p) quickChips(p); else $('quickHint').textContent = HINT; $('quickHint').classList.toggle('chips', Boolean(p)); };
  $('quickInput').addEventListener('input', preview);
  document.querySelectorAll('input[name="repeat"]').forEach((r) => r.addEventListener('change', preview));

  $('editBtn').addEventListener('click', () => { editing = !editing; renderTasks(); });
  $('restBtn').addEventListener('click', toggleRest);

  $('timerStart').addEventListener('click', timerToggle);
  $('timerReset').addEventListener('click', timerReset);
  $('timerMinutes').addEventListener('change', (e) => { if (state.timer.status !== 'idle') return; state.timer.minutes = Number(e.target.value); state.timer.phase = 0; state.timer.remaining = timerTotal(); commit(); });
  $('timerLink').addEventListener('change', (e) => { state.timer.link = e.target.value; save(); });
  $('timerAuto').addEventListener('change', (e) => { state.timer.auto = e.target.checked; save(); });

  $('achForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addAchievement($('achName').value, $('achDays').value)) { $('achName').value = ''; $('achDays').value = ''; toast(L('أضيف الإنجاز', 'Achievement added'), ''); }
    else toast(L('تأكد من الاسم وعدد الأيام', 'Check the name and number of days'), L('من 1 إلى 3650 يوماً', 'From 1 to 3650 days'), 'warn');
  });

  // كل ثانية: العداد التنازلي، وكل دقيقة: خط "الآن"، وعند منتصف الليل: يوم جديد
  let lastMinute = new Date().getMinutes(), lastDay = todayIso();
  setInterval(() => {
    if (view === 'today') updateSubtitle();
    const n = new Date();
    if (todayIso() !== lastDay) { lastDay = todayIso(); commit(); return; }
    if (n.getMinutes() !== lastMinute) { lastMinute = n.getMinutes(); if (view === 'today' && theme() === 'ink') renderTasks(); }
  }, 1000);

  $('tgBtn').addEventListener('click', () => {
    $('tgUrl').textContent = location.origin + location.pathname;
    $('tgDialog').showModal();
  });
  $('tgCopy').addEventListener('click', async () => {
    const txt = $('tgUrl').textContent;
    try { await navigator.clipboard.writeText(txt); toast(L('نُسخ الرابط', 'Link copied'), ''); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($('tgUrl')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast(L('حدد الرابط وانسخه بـ Ctrl+C', 'Select the link and copy it with Ctrl+C'), '', 'warn'); }
  });
  $('tgTry').addEventListener('click', () => {
    const txt = $('tgTest').value.trim();
    if (!txt) return;
    $('tgDialog').close();
    location.hash = '#add=' + encodeURIComponent(txt);
  });

  bindExtras();
  bindMore();
  bindLook();
  window.addEventListener('hashchange', importFromHash);
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { try { state = normalize(JSON.parse(e.newValue)); render(); runTimer(); } catch (err) { /* تجاهل */ } } });
}

// بعد الدخول: يضيف مهمة البوت لو فيه، ويسأل عن الاسم أول مرة
function afterEntry() {
  importFromHash();
  if (!state.name && !store.get('hunterNameAsked_v6') && !location.hash.startsWith('#add=')) {
    store.set('hunterNameAsked_v6', '1');
    setTimeout(() => { if (!document.querySelector('dialog[open]')) openNameDialog(true); }, 900);
  }
  // تقرير النظام: أول فتح في اليوم، وأول فتح بعد 8 م، ويوم الجمعة ملخص الأسبوع
  setTimeout(maybeBrief, 1300);
}

/* ============ 14. الإضافات ============ */
function crownIcon() { return sv('svg', { viewBox: '0 0 24 24', class: 'crown', 'aria-hidden': 'true' }, sv('path', { d: 'M3 18h18l-2-10-5 4-2-7-2 7-5-4z' })); }
function starIcon() { return sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: 'm12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z' })); }
function arrowIcon() { return sv('svg', { viewBox: '0 0 24 24', class: 'sc-go', 'aria-hidden': 'true' }, sv('path', { d: 'M17 17 7 7' }), sv('path', { d: 'M7 15V7h8' })); }
const byTimeAsc = (a, b) => a.time.localeCompare(b.time);
// يعزل النص الإنجليزي (مثل +50 XP) عشان ما ينقلب داخل الجملة العربية
const ltr = (txt) => '\u2066' + txt + '\u2069';

// --- الألقاب ---
function activeTitle() {
  const a = state.achievements.find((x) => x.id === state.title);
  if (!a) return null;
  return state.unlocked.includes(a.id) || Math.max(state.bestStreak, streakInfo().streak) >= a.days ? a : null;
}
function setTitle(id) {
  const a = state.achievements.find((x) => x.id === id);
  if (!a) return;
  if (state.title === id) { state.title = ''; toast(L('شلت اللقب', 'Title removed'), L('تقدر تختار غيره وقت ما تبي', 'You can pick another one any time')); }
  else { state.title = id; toast(L('لقبك الجديد: ', 'New title: ') + a.name, L('يطلع جنب اسمك فوق', 'It shows next to your name at the top'), 'gold'); sound('done'); }
  commit();
}

// --- مهمة اليوم الأهم: وحدة بس كل يوم، و+50 XP لما تخلص ---
const mitKey = () => state.mit.date === todayIso() ? state.mit.key : '';
function setMit(key) {
  const cur = mitKey();
  state.mit = cur === key ? { date: '', key: '' } : { date: todayIso(), key };
  const gained = syncMit();
  if (state.mit.key && !gained) toast(L('صارت مهمة اليوم الأهم', "Set as today's top quest"), L('أنجزها وتاخذ +' + MIT_XP + ' XP زيادة', 'Finish it for +' + MIT_XP + ' bonus XP'), 'gold');
  commit();
}
// يعطي مكافأة الأهم لو مهمتها منجزة، ويسحبها لو لا
function syncMit() {
  const t = todayIso();
  const key = mitKey();
  const { fixed, gates } = todayTasks();
  const task = key ? fixed.concat(gates).find((x) => x.kind + ':' + x.id === key) : null;
  if (task && task.done) {
    if (grant('mit:' + t, MIT_XP, null)) { toast(L('أنجزت مهمة اليوم الأهم', 'Top quest complete'), '+' + MIT_XP + ' XP', 'gold'); return true; }
    return false;
  }
  revoke('mit:' + t);
  return false;
}

// --- البطاقات الأربع ---
function nextTask() {
  const { fixed, gates } = todayTasks();
  const open = fixed.concat(gates).filter((t) => !t.done).sort(byTimeAsc);
  const n = new Date();
  const now = pad(n.getHours()) + ':' + pad(n.getMinutes());
  return open.find((t) => !t.late && t.time >= now) || open[0] || null;
}
function combatPower(si) {
  const sum = STATS.reduce((a, k) => a + (state.stats[k] || 0), 0);
  return sum * 10 + levelInfo(state.totalXp).level * 50 + si.streak * 20;
}
function renderStatCards(si) {
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates);
  const doneN = all.filter((t) => t.done).length;
  const t = todayIso();
  const nt = nextTask();
  const focusMin = focusMinutes(t);
  const cards = [
    { go: 'cp', label: L('القوة القتالية (CP)', 'Combat Power (CP)'), value: combatPower(si).toLocaleString('en'), sub: L('مجموع قدراتك ومستواك وسلسلتك', 'Your abilities, level and streak combined'), hint: L('يفتح رادار القدرات', 'Opens the ability radar') },
    { go: 'tasks', label: L('إنجاز مهام اليوم', "Today's progress"), value: (all.length ? Math.round(doneN / all.length * 100) : 0) + '%', sub: all.length ? L('أنجزت ' + doneN + ' من ' + all.length + (all.length > 2 && all.length < 11 ? ' مهام' : ' مهمة'), doneN + ' of ' + all.length + ' quests done') : L('ما عندك مهام اليوم', 'No quests today'), hint: L('ينزلك للمهام', 'Jumps to your quests') },
    { go: 'next', label: L('المهمة / البوابة القادمة', 'Next quest / gate'), value: nt ? fmt12(nt.time) : '—', sub: nt ? nt.title + (nt.late ? L(' (متأخرة)', ' (overdue)') : '') : L('ما باقي شي اليوم', 'Nothing left today'), hint: nt ? L('يجهزها في بوابة التركيز', 'Loads it into the focus gate') : L('ينزلك لبوابة التركيز', 'Jumps to the focus gate') },
    { go: 'xp', label: L('خبرة اليوم المكتسبة', 'XP earned today'), value: '+' + (state.xpByDate[t] || 0) + ' XP', sub: L('تركيز اليوم: ' + Math.round(focusMin) + ' دقيقة', 'Focus today: ' + Math.round(focusMin) + ' min'), hint: L('يفتح منحنى الخبرة', 'Opens the XP chart'), ltr: true }
  ];
  $('statCards').replaceChildren(...cards.map((c) => el('button', { class: 'panel stat-card', 'data-card': c.go, 'aria-label': c.label + ': ' + c.value + '. ' + c.sub + '. ' + c.hint },
    arrowIcon(),
    el('span', { class: 'sc-label', text: c.label }),
    el('span', { class: 'sc-value' + (c.ltr ? ' ltr' : ''), text: c.value }),
    el('span', { class: 'sc-sub', text: c.sub }),
    el('span', { class: 'sc-hint', 'aria-hidden': 'true', text: c.hint }))));
}
function flashTo(id, focusId) {
  const node = $(id);
  if (!node) return;
  const box = node.closest('.panel') || node;
  box.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
  setTimeout(() => box.classList.remove('flash'), 1400);
  if (focusId) setTimeout(() => { const f = $(focusId); if (f) f.focus({ preventScroll: true }); }, 400);
}
function cardGo(go) {
  if (go === 'cp' || go === 'xp') { setView('stats'); requestAnimationFrame(() => flashTo(go === 'cp' ? 'radar' : 'xpChart')); return; }
  if (go === 'tasks') { flashTo('tasksPanel'); return; }
  const nt = nextTask();
  if (nt && state.timer.status === 'idle') {
    state.timer.link = nt.kind + ':' + nt.id;
    save(); renderLinkOptions();
    toast(L('جهّزت «' + nt.title + '» في بوابة التركيز', 'Loaded "' + nt.title + '" into the focus gate'), L('اضغط «ادخل البوابة» وقت ما تبدأ', 'Press "Enter the gate" when you\'re ready'));
  } else if (nt) toast(L('عندك جلسة تركيز شغالة', 'A focus session is running'), L('خلّصها أول، وبعدين اربط المهمة الجاية', 'Finish it first, then link the next quest'), 'warn');
  flashTo('focusPanel', 'timerStart');
}

// --- تقرير النظام ---
const BRIEF_KEY = 'hunterBrief_v6';
function briefSeen() { try { return JSON.parse(store.get(BRIEF_KEY)) || {}; } catch (e) { return {}; } }
// auto = عند الفتح (يطلع مرة وحدة)، وبدونها = زر «تقرير اليوم»
function briefKind(auto) {
  const n = new Date(), t = todayIso(), seen = briefSeen();
  const eve = n.getHours() >= 20;
  if (!auto) return n.getDay() === 5 && !eve ? 'friday' : eve ? 'evening' : 'morning';
  if (n.getDay() === 5 && seen.friday !== t) return 'friday';
  if (eve) return seen.evening !== t ? 'evening' : '';
  return seen.morning !== t ? 'morning' : '';
}
function maybeBrief() {
  if (document.documentElement.classList.contains('need-auth') || document.querySelector('dialog[open]') || view !== 'today') return;
  const k = briefKind(true);
  if (k) openBrief(k);
}
const countAr = (n, one, two, many) => n === 1 ? one : n === 2 ? two : n + ' ' + (n <= 10 ? many : one);
// العدد بالعربي (مفرد/مثنى/جمع) أو بالإنجليزي (مفرد/جمع)
const cnt = (n, ar, en1, enMany) => EN ? n + ' ' + (n === 1 ? en1 : enMany) : countAr(n, ar[0], ar[1], ar[2]);
function briefData(kind) {
  const anime = theme() === 'anime';
  const si = streakInfo();
  const now = new Date();
  const t = todayIso();
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates);
  const open = all.filter((x) => !x.done).sort(byTimeAsc);
  const nt = nextTask();
  const mk = mitKey();
  const mitT = mk ? all.find((x) => x.kind + ':' + x.id === mk) : null;
  const ttl = activeTitle();
  const name = state.name || '';
  const hey = name ? L(' يا ' + name, ', ' + name) : '';
  const dateLine = WEEKDAYS[now.getDay()] + L('، ', ', ') + now.getDate() + ' ' + MONTHS[now.getMonth()];
  const nodes = [];
  const speech = [];
  const lead = (parts) => { nodes.push(el('p', { class: 'brief-lead' }, ...parts)); speech.push(parts.map((x) => typeof x === 'string' ? x : x.textContent).join('')); };
  const grid = (rows) => nodes.push(el('dl', { class: 'brief-grid' }, ...rows.map(([l, v, c]) => el('div', { class: c || '' }, el('dt', { text: l }), el('dd', { text: v })))));
  const foot = (txt) => { nodes.push(el('p', { class: 'brief-foot', text: txt })); speech.push(txt); };
  const b = (txt) => el('b', { text: txt });
  const tasksTxt = (fixed.length ? cnt(fixed.length, ['مهمة ثابتة', 'مهمتين ثابتة', 'مهام ثابتة'], 'daily quest', 'daily quests') : '')
    + (fixed.length && gates.length ? L(' و', ' and ') : '')
    + (gates.length ? cnt(gates.length, ['بوابة واحدة', 'بوابتين', 'بوابات'], 'gate', 'gates') : '');
  let title, cta;

  if (kind === 'friday') {
    title = anime ? L('تقرير الأسبوع', 'Weekly Report') : L('حصاد الأسبوع', 'Week in Review');
    cta = L('ابدأ الأسبوع الجديد', 'Start the new week');
    const ws = addDays(weekStart(t), -7);
    const we = addDays(ws, 6);
    const range = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    if (we < state.startDate) {
      lead([L('هذا أول أسبوع لك في النظام. الجمعة الجاية بيطلع لك هنا ملخص أسبوعك: الأيام المكتملة والخبرة والتركيز.', "This is your first week in the System. Next Friday you'll see your weekly summary here: completed days, XP and focus.")]);
    } else {
      const doneSet = new Set(state.completedDates);
      const counted = range.filter((d) => d >= state.startDate && !isRest(d) && !isOff(d));
      const full = counted.filter((d) => doneSet.has(d)).length;
      const xp = range.reduce((a, d) => a + (state.xpByDate[d] || 0), 0);
      const prev = Array.from({ length: 7 }, (_, i) => addDays(ws, i - 7)).reduce((a, d) => a + (state.xpByDate[d] || 0), 0);
      const focusMin = focusMinutes(ws, we);
      let best = null;
      range.forEach((d) => { const r = dayRatio(d); if (r >= 0 && (!best || r > best.r || (r === best.r && (state.xpByDate[d] || 0) > best.xp))) best = { d, r, xp: state.xpByDate[d] || 0 }; });
      lead(EN
        ? ['Your week is over, Hunter. You completed ', b(full + ' of ' + counted.length), ' days and earned ', b(ltr(xp + ' XP')), '.']
        : ['انتهى أسبوعك أيها الصياد. أكملت ', b(full + ' من ' + counted.length), ' أيام، وجمعت ', b(ltr(xp + ' XP')), '.']);
      nodes.push(el('div', { class: 'brief-week', role: 'img', 'aria-label': L('أيام الأسبوع: ' + full + ' مكتملة', 'Days of the week: ' + full + ' completed') },
        ...range.map((d, i) => el('span', { class: 'bw-day ' + (doneSet.has(d) ? 'done' : isRest(d) ? 'rest' : d < state.startDate || isOff(d) ? 'off' : 'miss') }, el('i'), WD_FROM_FRI[i]))));
      const h = Math.floor(focusMin / 60), m = Math.round(focusMin % 60);
      grid([
        [L('أيام مكتملة', 'Days completed'), full + ' / ' + counted.length],
        [L('خبرة الأسبوع', 'Weekly XP'), ltr('+' + xp + ' XP')],
        [L('وقت التركيز', 'Focus time'), h ? L(h + ' س ' + m + ' د', h + 'h ' + m + 'm') : L(m + ' دقيقة', m + ' min')],
        [L('أفضل يوم', 'Best day'), best ? WEEKDAYS[dateOf(best.d).getDay()] + ' · ' + Math.round(best.r * 100) + '%' : '—']
      ]);
      if (prev > 0) {
        const diff = Math.round((xp - prev) / prev * 100);
        foot(diff >= 0
          ? L('أحسن من الأسبوع اللي قبله بـ ' + diff + '% في الخبرة.', diff + '% more XP than the week before.')
          : L('أقل من الأسبوع اللي قبله بـ ' + Math.abs(diff) + '% في الخبرة. الأسبوع هذا فرصتك.', Math.abs(diff) + '% less XP than the week before. This week is your chance.'));
      } else foot(L('الأسبوع الجاي نقدر نقارنه بهذا.', "Next week we'll be able to compare it with this one."));
    }
    if (all.length) foot(L('واليوم عندك ', 'Today you have ') + tasksTxt + (nt ? L('، أقربها الساعة ', ', the next one at ') + fmt12(nt.time) : '') + '.');
  } else if (kind === 'evening') {
    title = anime ? L('تقرير المساء', 'Evening Report') : L('مساء الخير', 'Good evening') + hey;
    cta = open.length ? L('كمّل المهام', 'Finish your quests') : L('تمام', 'Got it');
    if (isRest(t)) lead([L('اليوم يوم راحة، وسلسلتك محفوظة. تصبح على خير.', 'Today is a rest day and your streak is safe. Good night.')]);
    else if (!all.length) lead([L('ما كان عندك مهام اليوم. بكرة أضف أول مهمة من خانة الإضافة.', 'You had no quests today. Tomorrow, add your first one from the quick-add box.')]);
    else if (EN) lead(['You completed ', b((all.length - open.length) + ' of ' + all.length), " of today's quests.", open.length ? ' You have ' + cnt(open.length, [], 'quest', 'quests') + ' left before the day resets.' : ' You finished everything. Well done.']);
    else lead(['أنجزت ', b((all.length - open.length) + ' من ' + all.length), ' مهام اليوم.', open.length ? ' باقي لك ' + countAr(open.length, 'مهمة وحدة', 'مهمتين', 'مهام') + ' قبل ما يُعاد ضبط اليوم.' : ' خلصت كل شي، الله يعطيك العافية.']);
    if (open.length) {
      nodes.push(el('ul', { class: 'brief-list' }, ...open.slice(0, 4).map((x) => el('li', {},
        x.kind === 'gate' ? el('span', { class: 'rank', text: x.rank }) : el('span', { class: 'bl-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'bl-title', text: x.title }),
        el('span', { class: 'bl-time', text: fmt12(x.time) })))));
      speech.push(L('الباقي: ', 'Remaining: ') + open.slice(0, 4).map((x) => x.title).join(L('، ', ', ')) + '.');
    }
    const restXp = open.reduce((a, x) => a + x.xp, 0) + (fixed.some((x) => !x.done) && !isComplete(t) ? DAY_BONUS_XP : 0) + (mitT && !mitT.done ? MIT_XP : 0);
    if (all.length) grid([
      [L('خبرة اليوم', "Today's XP"), ltr('+' + (state.xpByDate[t] || 0) + ' XP')],
      [L('إذا كملت الباقي', 'If you finish the rest'), open.length ? ltr('+' + restXp + ' XP') : L('خلصت ✓', 'All done ✓')],
      [L('المهمة الأهم', 'Top quest'), mitT ? (mitT.done ? mitT.title + ' ✓' : mitT.title + L(' · باقية', ' · pending')) : L('ما حددتها اليوم', 'Not set today'), 'mit'],
      [L('السلسلة', 'Streak'), daysAr(si.streak) + (isComplete(t) ? L(' · اليوم محسوب', ' · today counts') : '')]
    ]);
  } else {
    title = anime ? L('تقرير النظام الصباحي', 'Morning System Report') : (now.getHours() < 12 ? L('صباح الخير', 'Good morning') : L('مساء الخير', 'Good evening')) + hey;
    cta = L('ابدأ اليوم', 'Start the day');
    if (isRest(t)) lead([L('اليوم يوم راحة، وسلسلتك محفوظة. استرح زين.', 'Today is a rest day and your streak is safe. Rest well.')]);
    else if (!all.length) lead([L('أهلاً بك أيها الصياد', 'Welcome, Hunter'), name ? ' ' + name : '', L('. ما عندك مهام اليوم، أضف أول مهمة من خانة الإضافة.', '. You have no quests today. Add your first one from the quick-add box.')]);
    else lead([L('أهلاً بك أيها الصياد', 'Welcome, Hunter'), name ? ' ' + name : '', L('. لديك اليوم ', '. Today you have '), b(tasksTxt), nt ? L('، أقربها الساعة ', ', the next one at ') : '', nt ? b(fmt12(nt.time)) : '', '.']);
    if (all.length) grid([
      [L('مهام اليوم', "Today's quests"), fixed.length + (gates.length ? ' + ' + cnt(gates.length, ['بوابة', 'بوابتين', 'بوابات'], 'gate', 'gates') : '')],
      [L('أقرب موعد', 'Next up'), nt ? nt.title + ' · ' + fmt12(nt.time) : L('ما فيه', 'Nothing')],
      [L('المهمة الأهم', 'Top quest'), mitT ? mitT.title : L('ما حددتها. اضغط النجمة جنب أي مهمة', 'Not set. Tap the star next to any quest'), 'mit'],
      [L('أيام السماح', 'Grace days'), si.graceLeft + L(' من ', ' of ') + GRACE_DAYS + (si.graceLeft === GRACE_DAYS ? L(' · كاملة', ' · full') : '')]
    ]);
    foot(L('سلسلتك ', 'Your streak: ') + daysAr(si.streak) + (ttl ? L('. لقبك الحالي: ', '. Current title: ') + ttl.name : '') + '.');
  }
  return { title, date: kind === 'friday' ? L('الجمعة · ملخص الأسبوع اللي فات', 'Friday · Last week in review') : dateLine, nodes, cta, speech: title + '. ' + speech.join(' ') };
}

let briefSpeech = '';
function openBrief(kind) {
  const seen = briefSeen();
  seen[kind] = todayIso();
  if (kind === 'friday') seen.morning = todayIso();
  store.set(BRIEF_KEY, JSON.stringify(seen));
  const d = briefData(kind);
  $('briefKicker').textContent = L('إشعار النظام', 'System Notice');
  $('briefTitle').textContent = d.title;
  $('briefDate').textContent = d.date;
  $('briefBody').replaceChildren(...d.nodes);
  $('briefCta').textContent = d.cta;
  briefSpeech = d.speech;
  const dlg = $('briefDialog');
  dlg.onclose = stopSpeak;
  setSpeak(false);
  if (!dlg.open) dlg.showModal();
}
function setSpeak(on) {
  $('briefSpeak').setAttribute('aria-pressed', String(on));
  $('briefSpeakLbl').textContent = on ? L('وقّف القراءة', 'Stop reading') : L('اسمع التقرير', 'Listen to the report');
}
function stopSpeak() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* تجاهل */ } setSpeak(false); }
function speakBrief() {
  const ss = window.speechSynthesis;
  if (!ss || typeof SpeechSynthesisUtterance === 'undefined') { toast(L('متصفحك ما يدعم القراءة بصوت', "Your browser can't read aloud"), '', 'warn'); return; }
  if (ss.speaking || ss.pending) { stopSpeak(); return; }
  const voices = ss.getVoices();
  const v = voices.find((x) => (EN ? /^en([-_]|$)/i : /^ar([-_]|$)/i).test(x.lang));
  if (!v && voices.length) { toast(L('ما لقيت صوت عربي في جهازك', 'No English voice found on your device'), L('تقدر تضيفه من إعدادات الوقت واللغة في ويندوز', 'You can add one in Windows Time & Language settings'), 'warn'); return; }
  const u = new SpeechSynthesisUtterance(briefSpeech);
  u.lang = v ? v.lang : L('ar-SA', 'en-US');
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = () => setSpeak(false);
  u.onerror = () => setSpeak(false);
  ss.cancel(); ss.speak(u); setSpeak(true);
}

function bindExtras() {
  $('statCards').addEventListener('click', (e) => { const c = e.target.closest('[data-card]'); if (c) cardGo(c.dataset.card); });
  $('briefBtn').addEventListener('click', () => openBrief(briefKind(false)));
  $('briefSpeak').addEventListener('click', speakBrief);
  try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) { /* تجاهل */ }
  // اختصار /: يكتب في خانة الإضافة من أي مكان (على الكيبورد العربي نفس الزر «ظ»)
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key !== '/' && !(e.code === 'Slash' && !e.shiftKey)) return;
    const tg = e.target;
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    if (document.querySelector('dialog[open]') || document.documentElement.classList.contains('need-auth')) return;
    e.preventDefault();
    if (view !== 'today') setView('today');
    const q = $('quickInput');
    q.focus({ preventScroll: true });
    q.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  });
  // لو رجعت للصفحة بعد 8 م أو بيوم جديد، يطلع التقرير
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(maybeBrief, 600); });
}

/* ============ 15. إضافات 26 أكتوبر ============ */
// --- التراجع من الإشعار ---
function undoToggle(kind, id) {
  return {
    label: L('تراجع', 'Undo'),
    run: () => {
      const { fixed, gates } = todayTasks();
      const t = fixed.concat(gates).find((x) => x.kind === kind && x.id === id);
      if (t && t.done) { toggleTask(kind, id); toast(L('رجّعتها، وانسحبت الخبرة', 'Undone, the XP was removed'), ''); }
    }
  };
}
function undoAdd(kind, id) {
  return {
    label: L('تراجع', 'Undo'),
    run: () => {
      const t = todayIso();
      if (kind === 'fixed') {
        if (!state.fixed.some((x) => x.id === id)) return;
        if (doneIds(t).includes(id)) { state.log[t] = doneIds(t).filter((x) => x !== id); revoke('fixed:' + t + ':' + id); }
        state.fixed = state.fixed.filter((x) => x.id !== id);
        syncDay(t);
      } else {
        const g = state.gates.find((x) => x.id === id);
        if (!g) return;
        if (g.done) revoke('gate:' + id);
        state.gates = state.gates.filter((x) => x.id !== id);
      }
      if (state.timer.link === kind + ':' + id) state.timer.link = '';
      if (state.mit.key === kind + ':' + id) state.mit = { date: '', key: '' };
      syncMit();
      commit();
      toast(L('شلتها من القائمة', 'Removed from the list'), '');
    }
  };
}

// --- خطوات البوابة ---
function subsBlock(g) {
  const done = g.subs.filter((x) => x.done).length;
  const pct = Math.round(done / g.subs.length * 100);
  return el('div', { class: 'subs' },
    el('div', { class: 'subs-head' },
      el('span', { text: L('الخطوات ', 'Steps ') + done + '/' + g.subs.length }),
      el('span', { class: 'bar', 'aria-hidden': 'true' }, el('span', { style: 'width:' + pct + '%' }))),
    el('ul', { class: 'subs-list' }, g.subs.map((x) => el('li', {},
      el('button', {
        type: 'button', class: 'sub' + (x.done ? ' done' : ''), 'aria-pressed': String(x.done),
        'aria-label': (x.done ? L('إلغاء الخطوة: ', 'Undo step: ') : L('أنجز الخطوة: ', 'Complete step: ')) + x.title,
        onclick: () => toggleSub(g.id, x.id)
      }, el('span', { class: 'sub-box', 'aria-hidden': 'true' }), el('span', { class: 'sub-title', text: x.title }))))));
}
function toggleSub(gid, sid) {
  const g = state.gates.find((x) => x.id === gid);
  const sub = g && g.subs.find((x) => x.id === sid);
  if (!sub) return;
  sub.done = !sub.done;
  sound(sub.done ? 'done' : 'undo');
  // آخر خطوة تنجز البوابة كلها (وتقدر تتراجع من الإشعار)
  if (sub.done && !g.done && g.date <= todayIso() && g.subs.every((x) => x.done)) { toggleTask('gate', gid); return; }
  commit();
}

// --- تفاصيل أي يوم في السجل ---
let heatSel = '';
function dayStatus(iso) {
  if (isRest(iso)) return { k: 'rest', t: L('يوم راحة', 'Rest day') };
  if (state.completedDates.includes(iso)) return { k: 'done', t: L('مكتمل', 'Complete') };
  if (isOff(iso) && !state.gates.some((g) => g.date === iso)) return { k: 'off', t: L('ما فيه مهام', 'No quests') };
  if (iso === todayIso()) return { k: 'today', t: L('اليوم، للحين ما خلص', 'Today, still going') };
  return dayRatio(iso) > 0 ? { k: 'part', t: L('جزئي', 'Partial') } : { k: 'miss', t: L('فائت', 'Missed') };
}
function dayLabel(iso) {
  const d = dateOf(iso);
  return WEEKDAYS[d.getDay()] + L('، ', ', ') + d.getDate() + ' ' + MONTHS[d.getMonth()] + L('، ', ', ') + dayStatus(iso).t;
}
function renderHeatDay() {
  const box = $('heatDay');
  if (!box) return;
  if (!heatSel) { box.replaceChildren(el('span', { class: 'hd-hint', text: L('اضغط أي يوم في السجل وتطلع لك تفاصيله.', 'Tap any day in the record to see its details.') })); return; }
  const d = dateOf(heatSel);
  const st = dayStatus(heatSel);
  const app = fixedFor(heatSel);
  const done = doneIds(heatSel).filter((id) => app.some((q) => q.id === id)).length;
  const gates = state.gates.filter((g) => g.date === heatSel);
  const focus = focusMinutes(heatSel);
  const xp = state.xpByDate[heatSel] || 0;
  const parts = [];
  if (app.length) parts.push(L('اليومية ', 'Daily ') + done + L(' من ', ' of ') + app.length);
  if (gates.length) parts.push(L('البوابات ', 'Gates ') + gates.filter((g) => g.done).length + L(' من ', ' of ') + gates.length);
  if (focus) parts.push(L('تركيز ', 'Focus ') + Math.round(focus) + L(' د', ' min'));
  box.replaceChildren(
    el('b', { class: 'hd-date', text: WEEKDAYS[d.getDay()] + L('، ', ', ') + d.getDate() + ' ' + MONTHS[d.getMonth()] + (heatSel === todayIso() ? L(' (اليوم)', ' (today)') : '') }),
    el('span', { class: 'hd-st hd-' + st.k, text: st.t }),
    ...parts.map((x) => el('span', { class: 'hd-info', text: x })),
    el('span', { class: 'hd-xp', dir: 'ltr', text: '+' + xp + ' XP' }),
    el('button', { type: 'button', class: 'mini hd-close', onclick: () => { heatSel = ''; renderHeat(); }, 'aria-label': L('إخفاء التفاصيل', 'Hide details'), text: '×' }));
}

// --- وضع الغمر: المؤقت بملء الشاشة وكل شي ثاني يختفي ---
function openImmersive() {
  const dlg = $('immersive');
  if (dlg.open) return;
  dlg.showModal();
  document.documentElement.classList.add('immersed');
  // ملء الشاشة على النافذة نفسها (لو على الصفحة كلها، تغطي النافذة)
  try { if (dlg.requestFullscreen && !document.fullscreenElement) dlg.requestFullscreen().catch(() => {}); } catch (e) { /* بدون ملء الشاشة */ }
  renderTimer();
  $('imToggle').focus();
}
function closeImmersive() { const dlg = $('immersive'); if (dlg.open) dlg.close(); }
function renderImmersive(left, total, ph) {
  const dlg = $('immersive');
  if (!dlg || !dlg.open) return;
  const { fixed, gates } = todayTasks();
  const linked = state.timer.link ? fixed.concat(gates).find((x) => x.kind + ':' + x.id === state.timer.link) : null;
  $('imTask').textContent = linked ? linked.title : L('جلسة تركيز حرة', 'Free focus session');
  $('imPhase').textContent = $('timerPhase').textContent;
  $('imTime').textContent = $('timerDisplay').textContent;
  $('imSub').textContent = $('timerSub').textContent;
  $('imRing').style.strokeDashoffset = String(Math.round((1 - (total ? left / total : 1)) * 1000));
  placeOrbit('imOrbit', total ? left / total : 1);
  $('imToggle').textContent = $('timerStart').textContent;
  $('imSteps').hidden = $('timerSteps').hidden;
  $('imSteps').replaceChildren(...[...$('timerSteps').children].map((c) => c.cloneNode(true)));
  dlg.classList.toggle('on-break', ph.type === 'break' && state.timer.status !== 'idle');
}

function bindMore() {
  $('immBtn').addEventListener('click', openImmersive);
  $('imToggle').addEventListener('click', timerToggle);
  $('imExit').addEventListener('click', closeImmersive);
  $('immersive').addEventListener('close', () => {
    document.documentElement.classList.remove('immersed');
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) { /* تجاهل */ }
  });
}

/* ============ 16. الشكل الجديد: النظام الحي ودفتر القمر ============ */
let chartRange = 30;

// يوم الراحة: بطاقة بدل قائمة المهام
function restCard() {
  const anime = theme() === 'anime';
  return el('div', { class: 'rest-card' },
    el('span', { class: 'rest-icon', 'aria-hidden': 'true' }),
    el('div', { class: 'rest-txt' },
      el('p', { class: 'rest-kicker', text: anime ? L('[ يوم استشفاء ]', '[ RECOVERY DAY ]') : L('يوم راحة', 'Rest day') }),
      el('p', { class: 'rest-main', text: L('اليوم محايد: سلسلتك محفوظة وما ينحسب من أيام السماح.', "Today is neutral: your streak is safe and it doesn't use a grace day.") }),
      el('p', { class: 'rest-sub', text: L('مهامك ترجع بكرة. ولو تبيها اليوم، اضغط «إلغاء يوم الراحة».', 'Your quests come back tomorrow. To get them today, press "Cancel rest day".') })));
}

// سطر المكافأة: يصير شريط احتفال لما يكتمل اليوم
function renderBonusLine(t) {
  const box = $('bonusLine');
  const done = isComplete(t);
  box.classList.toggle('complete', done);
  if (!done) { box.textContent = L('أكمل كل المهام اليومية لتحصل على +' + DAY_BONUS_XP + ' XP إضافية.', 'Finish all daily quests to earn +' + DAY_BONUS_XP + ' bonus XP.'); return; }
  const anime = theme() === 'anime';
  box.replaceChildren(
    el('span', { class: 'bl-tag', text: anime ? L('[ اكتملت مهام اليوم ]', '[ ALL DAILY QUESTS COMPLETE ]') : L('اكتمل البدر', 'The moon is full') }),
    el('span', { class: 'bl-txt', text: L('المكافأة ', 'Bonus ') + '+' + DAY_BONUS_XP + ' XP  ·  ' + L('السلسلة صارت ', 'Streak is now ') + streakInfo().streak }));
}

// نقطة تدور مع المؤقت (تبان في حبر الليل)
function placeOrbit(id, frac) {
  const o = $(id);
  if (!o) return;
  const a = (-90 + 360 * Math.max(0, Math.min(1, frac))) * Math.PI / 180;
  o.setAttribute('cx', (120 + 108 * Math.cos(a)).toFixed(1));
  o.setAttribute('cy', (120 + 108 * Math.sin(a)).toFixed(1));
}

// معاينة الإضافة: شرائح تبيّن وش فهم النظام وأنت تكتب
function quickChips(p) {
  const chip = (txt, cls, ltrTxt) => el('span', { class: 'qchip ' + (cls || ''), dir: ltrTxt ? 'ltr' : null, text: txt });
  // replaceChildren يحوّل null لنص «null»، فنشيل الفارغ قبل
  $('quickHint').replaceChildren(...[
    el('span', { class: 'qlabel', text: L('النظام فهم:', 'The System read:') }),
    chip(p.kind === 'fixed' ? L('مهمة يومية', 'Daily quest') : L('بوابة ', 'Gate ') + p.rank, p.kind === 'fixed' ? 'q-daily' : 'q-gate'),
    chip('«' + p.title + '»', 'q-title'),
    p.kind === 'gate' ? chip(p.dateLabel, 'q-date') : null,
    chip(fmt12(p.time), 'q-time'),
    chip('#' + STAT_AR[p.stat], 'q-stat s-' + p.stat),
    chip('+' + p.xp + ' XP', 'q-xp', true)].filter(Boolean));
}

// الأسبوع اللي فات (الجمعة إلى الخميس)
function renderWeek() {
  const ws = addDays(weekStart(todayIso()), -7);
  const range = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const prevRange = Array.from({ length: 7 }, (_, i) => addDays(ws, i - 7));
  const doneSet = new Set(state.completedDates);
  const counted = (rg) => rg.filter((d) => d >= state.startDate && !isRest(d) && !isOff(d));
  const fullOf = (rg) => counted(rg).filter((d) => doneSet.has(d)).length;
  const xpOf = (rg) => rg.reduce((a, d) => a + (state.xpByDate[d] || 0), 0);
  const focusOn = (d) => focusMinutes(d);
  const mins = range.map(focusOn);
  const focusTot = mins.reduce((a, b) => a + b, 0);
  const prevFocus = prevRange.map(focusOn).reduce((a, b) => a + b, 0);
  const xp = xpOf(range), pxp = xpOf(prevRange);
  let best = null;
  range.forEach((d) => { const x = state.xpByDate[d] || 0; if (x > 0 && (!best || x > best.x)) best = { d, x }; });
  const hm = (m) => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + L('س ', 'h ') + (m % 60) + L('د', 'm') : m + L(' د', ' min'); };
  const delta = (a, b, fmt) => b > 0 ? (a >= b ? '+' : '−') + fmt(Math.abs(a - b)) : '';
  const d0 = dateOf(range[0]), d6 = dateOf(range[6]);
  $('weekRange').textContent = WEEKDAYS[d0.getDay()] + ' ' + d0.getDate() + ' ' + MONTHS[d0.getMonth()] + L(' إلى ', ' to ') + WEEKDAYS[d6.getDay()] + ' ' + d6.getDate() + ' ' + MONTHS[d6.getMonth()];
  const rows = [
    [L('أيام مكتملة', 'Days completed'), fullOf(range) + ' / ' + counted(range).length, L('اللي قبله ', 'week before ') + fullOf(prevRange), ''],
    [L('الخبرة', 'XP'), xp.toLocaleString('en'), pxp > 0 ? delta(xp, pxp, (v) => Math.round(v / pxp * 100) + '%') : '', xp >= pxp ? 'up' : 'down'],
    [L('التركيز', 'Focus'), hm(focusTot), prevFocus > 0 ? delta(focusTot, prevFocus, hm) : '', focusTot >= prevFocus ? 'up' : 'down'],
    [L('أفضل يوم', 'Best day'), best ? WEEKDAYS[dateOf(best.d).getDay()] : '—', best ? '+' + best.x + ' XP' : '', '']
  ];
  $('weekStats').replaceChildren(...rows.map(([l, v, c, k]) => el('div', {},
    el('dt', { text: l }), el('dd', {}, el('b', { text: v }), c ? el('span', { class: 'wk-ch ' + k, dir: 'ltr', text: c }) : null))));
  const maxM = Math.max(30, ...mins);
  const top = Math.max(...mins);
  $('weekBars').setAttribute('aria-label', L('دقائق التركيز: ', 'Focus minutes: ') + range.map((d, i) => WEEKDAYS[dateOf(d).getDay()] + ' ' + Math.round(mins[i])).join(L('، ', ', ')));
  $('weekBars').replaceChildren(...range.map((d, i) => el('div', { class: 'wb' + (mins[i] > 0 && mins[i] === top ? ' top' : '') },
    el('span', { class: 'wb-v', text: String(Math.round(mins[i])) }),
    el('span', { class: 'wb-bar', style: 'height:' + Math.max(3, Math.round(mins[i] / maxM * 96)) + 'px' }),
    el('span', { class: 'wb-d', text: WD_FROM_FRI[i] }))));
}

function bindLook() {
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (view === 'stats') renderXpChart(Array.from({ length: chartRange }, (_, i) => addDays(todayIso(), i - chartRange + 1))); }, 200); });
  document.querySelectorAll('.range [data-range]').forEach((b) => b.addEventListener('click', () => { chartRange = Number(b.dataset.range); renderStats(streakInfo()); }));
}

function start() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme() === 'anime' ? '#040915' : '#10222B';
  bind();
  if (state.migratedFrom) {
    delete state.migratedFrom;
    save();
    setTimeout(() => toast(L('نقلت بياناتك من النسخة القديمة', 'Your data was moved from the old version'), L('المستوى ' + levelInfo(state.totalXp).level + '، والنسخة القديمة ما انمسحت', 'Level ' + levelInfo(state.totalXp).level + '. The old copy was not deleted'), 'gold'), 900);
  }
  commit();
  runTimer();
  buildEmbers();
  setView('today');
  // لو شاشة الدخول ظاهرة، cloud.js يكمل هالخطوات بعد ما تدخل أو تختار ضيف
  if (!document.documentElement.classList.contains('need-auth')) afterEntry();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
