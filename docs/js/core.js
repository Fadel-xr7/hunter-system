'use strict';
/* =====================================================================
   نظام الصياد — core.js
   المنطق اللي ما يرسم شي: الأدوات، شكل البيانات، المكافآت، الأيام والسلسلة،
   ومحلل الإضافة السريعة. يتحمّل قبل app.js، والاختبارات (tests/) تشغّله لحاله.
   يحتاج من i18n.js: EN و L. ويستخدم المتغير state (معرّف في app.js) وقت النداء بس.
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
// خيارات مدة المؤقت بالدقائق. القائمة وأزرار الأنمي تنبني منها (timerLabel)
const TIMER_OPTS = [15, 25, 45, 60, 120, 180, 240];
// اسم المدة: الطويل للقائمة، والقصير لأزرار الأنمي
function timerLabel(m, short) {
  if (m < 60) return short ? L(m + ' د', m + 'm') : L(m + ' دقيقة', m + ' min');
  if (m === 60) return short ? L('ساعة', '1h') : L('ساعة (بومودورو)', '1 hr (Pomodoro)');
  const h = m / 60;
  if (h === 2) return short ? L('ساعتين', '2h') : L('ساعتين', '2 hrs');
  return short ? L(h + ' ساعات', h + 'h') : L(h + ' ساعات', h + ' hrs');
}
const WEEKDAYS = EN ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const WEEKDAYS_SHORT = EN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
// أيام الأسبوع من الجمعة (للسجل وتقرير الجمعة)
const WD_FROM_FRI = EN ? ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'] : ['جمع', 'سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي'];
// الأسبوع يبدأ يوم الجمعة
const WEEK_ORDER = [5, 6, 0, 1, 2, 3, 4];
const weekStart = (iso) => addDays(iso, -((dateOf(iso).getDay() + 2) % 7));
const byTime = (a, b) => a.time.localeCompare(b.time);
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
const KEY = STORE_KEYS.state;
const THEME_KEY = STORE_KEYS.theme;
const OLD_KEYS = ['soloLevelingState_v5_0', 'soloLevelingState_v4_1', 'soloLevelingStateV4_0', 'soloLevelingStateV3_1'];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* تجاهل */ } }
};

/** بعد ما ينتهي رفع للسحابة: لو المستخدم عدّل أثناء الطلب (rev تغيّر)، تبقى البيانات «معلّقة» وتنرفع بعدين. */
function afterPush(uid, at, startRev, currentRev) {
  return { uid, at, dirty: currentRev !== startRev };
}

/**
 * نسخة تُسترجع منها البيانات قبل أي حذف. تنحفظ في المتصفح (لو أقل من ميغا) وتنقرأ بعد الحفظ، وتنزل كملف.
 * ترجع:
 *   'saved'      النسخة في المتصفح وانقرأت = مؤكدة
 *   'downloaded' بس الملف نزل، وما نقدر نتأكد إن المتصفح حفظه (ممكن يمنعه بصمت) = لازم تأكيد منك
 *   'failed'     ولا وحدة = لا نحذف شي
 */
function saveRecoveryCopy(data, side, download) {
  const txt = JSON.stringify({ at: new Date().toISOString(), side, state: data });
  const saved = txt.length < 1e6 && store.set(STORE_KEYS.conflictCopy, txt) && store.get(STORE_KEYS.conflictCopy) === txt;
  let downloaded = false;
  try { download(); downloaded = true; } catch (e) { /* نعتمد على النسخة المحلية */ }
  return saved ? 'saved' : downloaded ? 'downloaded' : 'failed';
}

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
    plans: {},          // 'YYYY-MM-DD' -> ids المهام اليومية لذاك اليوم (تنحفظ أول ما يخلص اليوم)
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
  if (raw.plans && typeof raw.plans === 'object' && !Array.isArray(raw.plans)) {
    for (const [d, ids] of Object.entries(raw.plans).slice(-4000)) if (isIso(d) && Array.isArray(ids)) s.plans[d] = [...new Set(ids.map(String))].slice(0, 100);
  }
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
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const deletedQuest = (id) => ({ id, title: L('مهمة محذوفة', 'Deleted quest'), stat: 'SENSE', xp: 0, time: '00:00', days: [] });
// المهام اليومية ليوم معيّن. الأيام اللي خلصت تاخذ لقطتها من state.plans،
// فتعديل أيام مهمة أو حذفها ما يغيّر الماضي (لا السجل ولا السلسلة).
function fixedFor(iso) {
  if (iso < todayIso() && hasOwn(state.plans, iso)) return state.plans[iso].map((id) => state.fixed.find((q) => q.id === id) || deletedQuest(id));
  return state.fixed.filter((q) => appliesOn(q, iso));
}
// يحفظ مهام كل يوم خلص وما له لقطة. ينادى مع كل commit وأول ما يفتح الموقع،
// يعني قبل أي تعديل على المهام في يوم جديد.
function snapshotPlans() {
  const today = todayIso();
  for (let d = state.startDate, i = 0; d < today && i < 4000; d = addDays(d, 1), i++) {
    if (!hasOwn(state.plans, d)) state.plans[d] = state.fixed.filter((q) => appliesOn(q, d)).map((q) => q.id);
  }
}
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
let calcMemo = null; // render() يفتحها ويقفلها، فالحساب يصير مرة وحدة لكل رسم
function streakInfo() {
  if (calcMemo && calcMemo.si) return calcMemo.si;
  const r = streakCalc();
  if (calcMemo) calcMemo.si = r;
  return r;
}
function streakCalc() {
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

// أطول سلسلة من سجل الأيام نفسه وبنفس قواعد streakInfo (3 أيام سماح، والراحة محايدة).
// تنحسب كل مرة بدل ما تنحفظ، فلو رجعت عن يوم مكتمل تنزل معه.
function longestStreak() {
  if (calcMemo && 'best' in calcMemo) return calcMemo.best;
  const done = new Set(state.completedDates);
  const today = todayIso();
  let best = 0, cur = 0, miss = 0;
  for (let d = state.completedDates[0], i = 0; d && d <= today && i < 40000; d = addDays(d, 1), i++) {
    if (done.has(d)) { cur++; miss = 0; if (cur > best) best = cur; }
    else if (d === today || isRest(d) || isOff(d)) { /* محايد: اليوم للحين ما خلص */ }
    else if (++miss > GRACE_DAYS) cur = 0;
  }
  if (calcMemo) calcMemo.best = best;
  return best;
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

// ملخص أسبوع يبدأ يوم الجمعة ws: يستخدمه تقرير الجمعة وصفحة «الأسبوع اللي فات»
function weekSummary(ws) {
  const range = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const done = new Set(state.completedDates);
  const counted = range.filter((d) => d >= state.startDate && !isRest(d) && !isOff(d));
  return {
    range,
    counted: counted.length,
    full: counted.filter((d) => done.has(d)).length,
    xp: range.reduce((a, d) => a + (state.xpByDate[d] || 0), 0),
    focus: focusMinutes(ws, range[6])
  };
}
