'use strict';
/* =====================================================================
   نظام الصياد — look-anime.js
   واجهة الأنمي «النظام الحي»: كل اللي يختلف فيها عن حبر الليل (الشكل نفسه في style.css).
   الأسماء نفسها في look-ink.js، والملفات الثانية توصل لها من look().
   ===================================================================== */

LOOKS.anime = {
  other: 'ink',                 // زر الواجهة يبدّل لها
  themeColor: '#040915',        // لون شريط المتصفح في الجوال
  switchLabel: L('التبديل للواجهة الداكنة', 'Switch to the Night Ink theme'),
  switchTip: L('الواجهة الداكنة', 'Night Ink theme'),
  embers: true,                 // الشرر اللي يطلع في الخلفية
  liveNowLine: false,           // ما فيه خط «الآن» يحتاج يتحدّث كل دقيقة
  alwaysShowSteps: true,        // مراحل المؤقت ظاهرة حتى لو مرحلة وحدة
  heatShowsToday: true,         // السجل يعرض تفاصيل اليوم لو ما اخترت يوم
  restKicker: L('[ يوم استشفاء ]', '[ RECOVERY DAY ]'),
  bonusTag: L('[ اكتملت مهام اليوم ]', '[ ALL DAILY QUESTS COMPLETE ]'),
  briefTitles: {
    friday: () => L('تقرير الأسبوع', 'Weekly Report'),
    evening: () => L('تقرير المساء', 'Evening Report'),
    morning: () => L('تقرير النظام الصباحي', 'Morning System Report')
  },

  // الصفحات تنفتح لوحة لوحة
  afterView(v) {
    if (reducedMotion()) return;
    document.querySelectorAll('#view-' + v + ' .panel').forEach((p, i) => {
      p.classList.remove('opening'); void p.offsetWidth; p.style.animationDelay = (i * 0.12) + 's'; p.classList.add('opening');
    });
  },

  /* ---------- الرأس ---------- */
  heroClass: 'hero-anime',
  // الخبرة: 20 مقطع
  xpBar(lv) {
    const filled = Math.floor(lv.xp / lv.need * 20);
    return el('div', { class: 'xpseg', role: 'img', 'aria-label': L('الخبرة ', 'XP ') + lv.xp + L(' من ', ' of ') + lv.need },
      ...Array.from({ length: 20 }, (_, i) => el('i', { class: i < filled ? 'on' : '' })));
  },
  // الصياد خلف المستوى، ونافذة [الحالة]: السلسلة وأيام السماح والقدرات
  heroParts({ si, lvlBlock, graceDots, streakLbl }) {
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
    return [
      el('div', { class: 'motes', 'aria-hidden': 'true' }, ...Array.from({ length: 16 }, (_, i) => el('i', { style: 'right:' + (3 + i * 6.2) + '%;animation-duration:' + (8 + (i * 7) % 7) + 's;animation-delay:-' + ((i * 3) % 11) + 's' }))),
      el('div', { class: 'avatar', 'aria-hidden': 'true' }, el('img', { src: 'assets/hunter-avatar.webp', alt: '' })),
      el('div', { class: 'hero-body' }, lvlBlock, status)];
  },
  // سطر العد التنازلي بدون تاريخ (التاريخ فوق قائمة المهام)
  subtitleDate: () => '',

  /* ---------- المهام ---------- */
  // المهمة: معيّن، الرتبة، الاسم، الوسوم، خط نقاط، الوقت، الخبرة، والعداد [0/1]
  taskBody(t, { statTag, mitTag, xp }) {
    return [
      el('span', { class: 'dia ' + t.kind, 'aria-hidden': 'true' }),
      t.kind === 'gate' ? el('span', { class: 'rank r-' + t.rank, text: t.rank }) : null,
      el('span', { class: 'title', text: t.title }),
      statTag, mitTag,
      t.late ? el('span', { class: 'late', text: L('متأخرة', 'Overdue') }) : null,
      el('span', { class: 'lead', 'aria-hidden': 'true' }),
      timeNode(t.time, 'time'),
      el('span', { class: 'xpv', dir: 'ltr', 'aria-hidden': 'true', text: '+' + xp }),
      el('span', { class: 'ctr', dir: 'ltr', text: '[' + (t.done ? 1 : 0) + '/1]' })].filter(Boolean);
  },
  // تحت العنوان: تاريخ اليوم وكم أنجزت
  taskCount(all, doneN, t) {
    const d = dateOf(t);
    const day = WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
    $('taskCount').replaceChildren(day, all.length ? ' · ' + L('أنجزت ', '') : '', all.length ? el('b', { dir: 'ltr', text: doneN + '/' + all.length }) : '', all.length ? L('', ' done') : '');
  },
  // قائمتين: «كل يوم» و«بوابات اليوم»
  taskList(list, fixed, gates) {
    if (fixed.length) list.append(el('div', { class: 'grp-row' }, el('h3', { class: 'grp', text: L('كل يوم', 'Daily') }), el('span', { class: 'grp-hint', text: L('النجمة = الأهم اليوم (+' + MIT_XP + ' XP)', 'Star = top quest today (+' + MIT_XP + ' XP)') })), el('ul', { class: 'tasks' }, fixed.sort(byTime).map(taskRow)));
    if (gates.length) list.append(el('h3', { class: 'grp gates', text: L('بوابات اليوم', "Today's gates") }), el('ul', { class: 'tasks' }, gates.sort(byTime).map(taskRow)));
  }
};
