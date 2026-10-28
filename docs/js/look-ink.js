'use strict';
/* =====================================================================
   نظام الصياد — look-ink.js
   واجهة حبر الليل «دفتر القمر»: كل اللي يختلف فيها عن الأنمي (الشكل نفسه في style.css).
   الأسماء نفسها في look-anime.js، والملفات الثانية توصل لها من look().
   ===================================================================== */

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

// خط «الآن» بين المهام في الخط الزمني
function nowRow(nowStr) {
  return el('li', { class: 'now-row', 'aria-label': L('الوقت الآن ', 'Current time ') + fmt12(nowStr) },
    el('span', { 'aria-hidden': 'true' }),
    timeNode(nowStr, 'time'), el('span', { class: 'nowdot', 'aria-hidden': 'true' }),
    el('span', { class: 'nowline', 'aria-hidden': 'true' }, el('i'), el('b', { text: L('الآن', 'Now') })));
}

LOOKS.ink = {
  other: 'anime',
  themeColor: '#10222B',
  switchLabel: L('التبديل لواجهة الأنمي', 'Switch to the Anime theme'),
  switchTip: L('واجهة الأنمي', 'Anime theme'),
  embers: false,
  liveNowLine: true,            // خط «الآن» يتحرك مع الوقت، فالقائمة تنرسم كل دقيقة
  alwaysShowSteps: false,       // مراحل المؤقت تطلع بس لو الجلسة فيها أكثر من مرحلة
  heatShowsToday: false,        // السجل يعرض تلميح لين تختار يوم
  restKicker: L('يوم راحة', 'Rest day'),
  bonusTag: L('اكتمل البدر', 'The moon is full'),
  briefTitles: {
    friday: () => L('حصاد الأسبوع', 'Week in Review'),
    evening: (hey) => L('مساء الخير', 'Good evening') + hey,
    morning: (hey, now) => (now.getHours() < 12 ? L('صباح الخير', 'Good morning') : L('مساء الخير', 'Good evening')) + hey
  },

  afterView() {},

  /* ---------- الرأس ---------- */
  heroClass: 'hero-ink',
  // الخبرة: خط رفيع بنقطة
  xpBar(lv) {
    return el('div', { class: 'xpbar', role: 'img', 'aria-label': L('الخبرة ', 'XP ') + lv.xp + L(' من ', ' of ') + lv.need }, el('span', { style: 'width:' + Math.round(lv.xp / lv.need * 1000) / 10 + '%' }));
  },
  // ثلاث أعمدة: المستوى، القمر، والسلسلة مع أطول سلسلة والالتزام
  heroParts({ si, lvlBlock, graceDots, streakLbl }) {
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
    return [el('div', { class: 'hero-body ink-grid' }, lvlBlock, moonBlock(), streakBlock)];
  },
  // التاريخ قبل العد التنازلي
  subtitleDate: (n) => WEEKDAYS[n.getDay()] + ' ' + n.getDate() + ' ' + MONTHS[n.getMonth()] + ' ' + n.getFullYear() + '  ·  ',

  /* ---------- المهام ---------- */
  // المهمة: الوقت، عقدة على الخط، الاسم والوسوم، والخبرة
  taskBody(t, { statTag, mitTag, xp }) {
    return [
      timeNode(t.time, 'time'),
      el('span', { class: 'node ' + t.kind, 'aria-hidden': 'true' }),
      el('span', { class: 'body' },
        el('span', { class: 'title strk' + (t.done ? ' on' : ''), text: t.title }),
        t.kind === 'gate' ? el('span', { class: 'rank', text: L('بوابة ', 'Gate ') + t.rank }) : null,
        statTag, mitTag,
        t.late ? el('span', { class: 'late', text: L('متأخرة', 'Overdue') }) : null),
      el('span', { class: 'xp', dir: 'ltr', text: '+' + xp })];
  },
  taskCount(all, doneN) {
    $('taskCount').textContent = all.length ? L('أنجزت ' + doneN + ' من ' + all.length, doneN + ' of ' + all.length + ' done') : '';
  },
  // خط زمني واحد مرتب بالوقت، وخط «الآن» في مكانه
  taskList(list, fixed, gates, all) {
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
};
