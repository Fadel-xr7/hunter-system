'use strict';
/* =====================================================================
   نظام الصياد — main.js
   التشغيل: يربط كل الأقسام بالترتيب، والأزرار العامة (الصفحات، الواجهة، الصوت، اختصار /)،
   ومؤقت الثانية ومنتصف الليل، وأول تشغيل. آخر ملف من ملفات الواجهة (بعده cloud.js).
   ===================================================================== */

/* ============ اليوم الجديد ============ */
// اليوم اللي الصفحة معروضة عليه. لو تغيّر (منتصف الليل، أو رجعت للصفحة بعد ما كانت نايمة):
// commit يثبّت لقطات الأيام اللي خلصت ويرسم اليوم الجديد. يستخدمه مؤقت الثانية ومعالج الرجوع للصفحة.
let shownDay = null;
function checkDay() {
  const t = todayIso();
  if (shownDay === null || t === shownDay) { shownDay = t; return false; }
  shownDay = t;
  commit();
  return true;
}

// كل ثانية: العداد التنازلي، وكل دقيقة: خط «الآن» (لو الواجهة فيها خط)، وعند منتصف الليل: يوم جديد
function startClock() {
  let lastMinute = new Date().getMinutes();
  shownDay = todayIso();
  setInterval(() => {
    if (view === 'today') updateSubtitle();
    const n = new Date();
    if (checkDay()) return;
    if (n.getMinutes() !== lastMinute) { lastMinute = n.getMinutes(); if (view === 'today' && look().liveNowLine) renderTasks(); }
  }, 1000);
}

/* ============ الأزرار العامة ============ */
// لون شريط المتصفح في الجوال حسب الواجهة
function paintThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = look().themeColor;
}

function bindNav() {
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) setView(g.dataset.goto); });

  $('themeBtn').addEventListener('click', () => {
    const next = look().other;
    document.documentElement.dataset.theme = next;
    store.set(THEME_KEY, next);
    paintThemeColor();
    buildEmbers(); setView(view);
  });
  $('soundBtn').addEventListener('click', () => { state.sound = !state.sound; commit(); if (state.sound) sound('done'); });
}

function bindShortcuts() {
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkDay(); setTimeout(maybeBrief, 600); } });
}

// الشريط العلوي شفاف وصورة البوابة تكمل خلفه: نعطي CSS ارتفاعه
function bindTopbar() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const set = () => document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  set();
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(bar); else addEventListener('resize', set);
}

/* ============ التشغيل ============ */
// كل قسم يربط أزراره بنفسه (bindX في ملفه). الترتيب مهم للأحداث المشتركة على document:
// قائمة النسخ تقفل بـ Esc قبل اختصار /، والضغط على [data-goto] قبل إقفال القائمة.
function bind() {
  bindNav();
  bindBackup();
  bindQuick();
  bindTaskTools();
  bindTimer();
  bindRecords();
  startClock();
  bindTelegram();
  bindHero();
  bindBrief();
  bindShortcuts();
  bindStats();
  bindTopbar();
  // تبويب ثاني عدّل البيانات: نرسم نسخته
  window.addEventListener('storage', (e) => { if (e.key === KEY && e.newValue) { try { state = normalize(JSON.parse(e.newValue)); render(); runTimer(); } catch (err) { /* تجاهل */ } } });
}

// بعد الدخول: يضيف مهمة البوت لو فيه، ويسأل عن الاسم أول مرة
function afterEntry() {
  importFromHash();
  if (!state.name && !store.get(STORE_KEYS.nameAsked) && !/^#(add|quest)=/.test(location.hash)) {
    store.set(STORE_KEYS.nameAsked, '1');
    setTimeout(() => { if (!document.querySelector('dialog[open]')) openNameDialog(true); }, 900);
  }
  // تقرير النظام: أول فتح في اليوم، وأول فتح بعد 8 م، ويوم الجمعة ملخص الأسبوع
  setTimeout(maybeBrief, 1300);
}

function start() {
  paintThemeColor();
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
