'use strict';
/* =====================================================================
   نظام الصياد — ui.js
   أساس الواجهة: حالة الواجهة المشتركة (state والصفحة المعروضة)، الرسم (commit/render)،
   والأدوات اللي تستخدمها كل الأقسام: الإشعارات، نافذة التأكيد، الصوت، والتأثيرات.
   والواجهتين: LOOKS و look() (كل واجهة في ملفها: look-anime.js و look-ink.js).
   ===================================================================== */

/* ============ حالة الواجهة ============ */
let state = loadState();
let editing = false;     // وضع «تعديل المهام»
let justToggled = '';    // آخر مهمة انضغطت (عشان حركتها)، ينمسح بعد كل رسم
let view = 'today';      // الصفحة المعروضة: today / stats / ach

/* ============ الواجهتين ============
   كل اللي يختلف بين الواجهتين في ملفها: look-anime.js («النظام الحي») و look-ink.js («دفتر القمر»).
   الملفات الثانية ما تسأل «أي واجهة؟»، تنادي look() وتاخذ منها الجزء اللي تحتاجه.
   الواجهتين لازم يكون فيهم نفس الأسماء (فيه اختبار يتأكد). */
const LOOKS = {};
const theme = () => document.documentElement.dataset.theme;
const look = () => LOOKS[theme()] || LOOKS.anime;

/* ============ الرسم ============ */
function commit() {
  snapshotPlans();
  const si = streakInfo();
  state.bestStreak = longestStreak(); // يبقى محفوظ للنسخ الاحتياطية، والقراءة من longestStreak()
  checkAchievements(si.streak);
  save();
  render();
}

function render() {
  // السلسلة وأطول سلسلة تنحسب مرة وحدة لكل رسم (بند 13)
  calcMemo = {};
  try { renderNow(); } finally { calcMemo = null; }
}

function renderNow() {
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
  $('themeBtn').setAttribute('aria-label', look().switchLabel);
  $('backupBtn').classList.toggle('due', backupDue());
  $('backupBtn').dataset.tip = backupDue() ? L('نسخة احتياطية: مر أسبوع بدون نسخة', 'Backup: a week without one') : L('نسخة احتياطية', 'Backup');
  $('soundBtn').dataset.tip = state.sound ? L('الصوت شغال', 'Sound on') : L('الصوت مطفي', 'Sound off');
  $('themeBtn').dataset.tip = look().switchTip;
  $('backupNote').textContent = state.lastBackup ? L('آخر نسخة: ', 'Last backup: ') + new Date(state.lastBackup).toLocaleDateString(L('ar', 'en-GB')) : L('ما أخذت نسخة احتياطية للحين.', 'No backup yet.');
}

function setView(v) {
  view = v;
  render();
  look().afterView(v);
  window.scrollTo({ top: 0 });
}

/* ============ الإشعارات والتأكيد والصوت والتأثيرات ============ */
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
  if (reducedMotion() || !look().embers) return;
  for (let i = 0; i < 22; i++) {
    fx.append(el('span', { class: 'ember', style: 'left:' + Math.random() * 100 + '%;width:' + (2 + Math.random() * 3) + 'px;height:' + (2 + Math.random() * 3) + 'px;animation-duration:' + (9 + Math.random() * 12) + 's;animation-delay:' + (-Math.random() * 20) + 's;--dx:' + (Math.random() * 80 - 40) + 'px' }));
  }
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

/* ============ أيقونات ونصوص صغيرة ============ */
function crownIcon() { return sv('svg', { viewBox: '0 0 24 24', class: 'crown', 'aria-hidden': 'true' }, sv('path', { d: 'M3 18h18l-2-10-5 4-2-7-2 7-5-4z' })); }
function starIcon() { return sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d: 'm12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z' })); }
function arrowIcon() { return sv('svg', { viewBox: '0 0 24 24', class: 'sc-go', 'aria-hidden': 'true' }, sv('path', { d: 'M17 17 7 7' }), sv('path', { d: 'M7 15V7h8' })); }

// يعزل النص الإنجليزي (مثل +50 XP) عشان ما ينقلب داخل الجملة العربية
const ltr = (txt) => '\u2066' + txt + '\u2069';
