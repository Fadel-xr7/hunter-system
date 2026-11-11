'use strict';
/* =====================================================================
   نظام الصياد — look-anime.js
   واجهة «سماء اليوم» (مفتاحها الداخلي anime): يومك سماء ومهامك نجوم. كل اللي يختلف فيها
   عن الواجهة الثانية (الشكل نفسه في style.css). الأسماء نفسها في look-ink.js، والملفات الثانية توصل لها من look().
   ===================================================================== */

/* ---------- خريطة «سماء اليوم» ----------
   كل مهمة نجمة: مكانها بالعرض حسب وقتها، وبالطول حسب قدرتها. المنجزة تضوي وتتوصل بخط (كوكبة اليوم).
   الضغط على النجمة ينجز المهمة أو يتراجع. الوقت يمشي من اليمين لليسار بالعربي، والعكس بالإنجليزي. */
const SKY = { w: 1000, h: 452, x0: 60, x1: 940, top: 70, gap: 80, bottom: 410 };
const STAR_D = 'M0-15Q0 0 15 0Q0 0 0 15Q0 0-15 0Q0 0 0-15Z';
const skyHours = (time) => { const [h, m] = time.split(':').map(Number); return h + m / 60; };
function skyX(hours, from) {
  const f = Math.min(1, Math.max(0, (hours - from) / (24 - from)));
  return Math.round((EN ? SKY.x0 + f * (SKY.x1 - SKY.x0) : SKY.x1 - f * (SKY.x1 - SKY.x0)) * 10) / 10;
}
const skyNowHours = () => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; };

function skyChart() {
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates).sort(byTime);
  const small = matchMedia('(max-width: 600px)').matches; // الجوال: النجوم أكبر وبدون أسماء (القائمة تحتها)
  const from = all.some((t) => t.time < '05:00') ? 0 : 5;
  const fs = small ? 28 : 13;
  const svg = sv('svg', { viewBox: '0 0 ' + SKY.w + ' ' + SKY.h, class: 'sky-svg' + (small ? ' small' : ''), 'data-from': from, role: 'group', 'aria-label': L('خريطة مهام اليوم حسب الوقت والقدرة', "Map of today's quests by time and ability") });

  // خطوط القدرات وأسماؤها (مع قيمة كل قدرة)، وخطوط الساعات
  const labelX = EN ? 28 : 972;
  STATS.forEach((k, i) => {
    const y = SKY.top + i * SKY.gap;
    svg.append(sv('line', { class: 'sky-band', x1: SKY.x0, y1: y, x2: SKY.x1, y2: y }));
    svg.append(sv('text', { class: 'sky-lbl s-' + k, x: labelX, y: y - (small ? 2 : 3), 'font-size': fs, 'text-anchor': 'middle' }, STAT_AR[k]));
    svg.append(sv('text', { class: 'sky-val', x: labelX, y: y + (small ? 26 : 14), 'font-size': small ? 24 : 12, 'text-anchor': 'middle' }, String(state.stats[k] || 0)));
  });
  const step = small ? 6 : 3;
  for (let h = Math.ceil((from + 1) / step) * step; h <= 24; h += step) {
    const x = skyX(h, from);
    svg.append(sv('line', { class: 'sky-hour', x1: x, y1: 40, x2: x, y2: SKY.bottom }));
    svg.append(sv('text', { class: 'sky-tick', x, y: 440, 'font-size': fs, 'text-anchor': 'middle' }, fmt12(String(h % 24).padStart(2, '0') + ':00').replace(':00', '')));
  }

  // أماكن النجوم: لو نجمتين بنفس المكان، الثانية تنزاح شوي
  const pts = [];
  all.forEach((t) => {
    const band = Math.max(0, STATS.indexOf(t.stat));
    let x = skyX(skyHours(t.time), from);
    const y = SKY.top + band * SKY.gap;
    while (pts.some((p) => p.y === y && Math.abs(p.x - x) < (small ? 46 : 30))) x += (EN ? 1 : -1) * (small ? 46 : 30);
    const near = pts.filter((p) => p.y === y && Math.abs(p.x - x) < 170).length;
    pts.push({ t, x, y, up: near % 2 === 1 });
  });

  // الكوكبة: خط متصل بين المنجزات، ومنقّط للباقي
  const path = (list) => list.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join('');
  const done = pts.filter((p) => p.t.done);
  if (pts.length > 1) svg.append(sv('path', { class: 'sky-route', d: path(pts) }));
  if (done.length > 1) svg.append(sv('path', { class: 'sky-line', d: path(done) }));

  // خط «الآن»
  const nx = skyX(skyNowHours(), from);
  svg.append(sv('g', { id: 'skyNow', class: 'sky-now', transform: 'translate(' + nx + ' 0)' },
    sv('line', { x1: 0, y1: 28, x2: 0, y2: SKY.bottom }),
    sv('text', { x: 0, y: 20, 'font-size': small ? 26 : 12, 'text-anchor': 'middle' }, L('الآن', 'Now'))));

  // النجوم نفسها
  const k = small ? 1.7 : 1;
  pts.forEach(({ t, x, y, up }) => {
    const key = t.kind + ':' + t.id;
    const isMit = mitKey() === key;
    const press = () => {
      toggleTask(t.kind, t.id);
      const again = [...document.querySelectorAll('.sky-star')].find((n) => n.dataset.key === key);
      if (again) { again.focus({ preventScroll: true }); again.classList.add('fresh'); }
    };
    const g = sv('g', {
      class: 'sky-star' + (t.done ? ' done' : '') + (isMit ? ' mit' : '') + (t.late ? ' late' : '') + ' ' + t.kind,
      transform: 'translate(' + x + ' ' + y + ')', tabindex: '0', role: 'button', 'data-key': key,
      'aria-pressed': String(Boolean(t.done)),
      'aria-label': t.title + '، ' + fmt12(t.time) + '، ' + (STAT_AR[t.stat] || '') + (t.done ? L('، منجزة', ', done') : L('، ما انجزت', ', not done'))
    });
    g.append(sv('circle', { class: 'hit', r: small ? 66 : 26 }));
    if (isMit) g.append(sv('circle', { class: 'halo', r: 21 * k }));
    g.append(sv('g', { transform: 'scale(' + k + ')' }, t.done ? sv('path', { class: 'core', d: STAR_D }) : sv('circle', { class: 'core', r: t.kind === 'gate' ? 9 : 7 })));
    if (!small) g.append(sv('text', { class: 'name', x: 0, y: up ? -26 : 38, 'font-size': 14, 'text-anchor': 'middle' }, t.title.length > 22 ? t.title.slice(0, 21) + '…' : t.title));
    g.addEventListener('click', press);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } });
    svg.append(g);
  });

  if (!all.length) svg.append(sv('text', { class: 'sky-empty', x: SKY.w / 2, y: 236, 'font-size': small ? 30 : 16, 'text-anchor': 'middle' }, L('سماك فاضية اليوم. أضف أول نجمة من تحت', 'Your sky is empty today. Add your first star below')));
  return svg;
}

// أسماء المنازل من نجوم العرب، من الأخفت للألمع
const STAR_RANKS = {
  E: L('السُّها', 'Alcor'), D: L('الثريا', 'Pleiades'), C: L('الفرقد', 'Pherkad'), B: L('النسر', 'Altair'),
  A: L('العيّوق', 'Capella'), S: L('سُهيل', 'Canopus'), SS: L('الشِّعرى', 'Sirius')
};

LOOKS.anime = {
  other: 'ink',                 // زر الواجهة يبدّل لها
  themeColor: '#070B1A',        // لون شريط المتصفح في الجوال
  switchLabel: L('التبديل للواجهة الداكنة', 'Switch to the Night Ink theme'),
  switchTip: L('الواجهة الداكنة', 'Night Ink theme'),
  embers: false,                // بدون شرر في الخلفية
  liveNowLine: false,           // القائمة ما تنرسم كل دقيقة (خط «الآن» في الخريطة يتحرك من minuteTick)
  alwaysShowSteps: true,        // مراحل المؤقت ظاهرة حتى لو مرحلة وحدة
  heatShowsToday: true,         // السجل يعرض تفاصيل اليوم لو ما اخترت يوم
  restKicker: L('ليلة راحة', 'Rest night'),
  bonusTag: L('اكتملت كوكبة اليوم', "Today's constellation is complete"),
  briefTitles: {
    friday: () => L('تقرير الأسبوع', 'Weekly Report'),
    evening: () => L('تقرير المساء', 'Evening Report'),
    morning: () => L('تقرير الصباح', 'Morning Report')
  },
  rankName: (r) => L('منزلة ' + STAR_RANKS[r.l], STAR_RANKS[r.l] + ' rank'),
  trialTitle: (r) => L('المنزلة الجاية: ' + STAR_RANKS[r.l], 'Next rank: ' + STAR_RANKS[r.l]),
  // كل دقيقة: خط «الآن» يتحرك في الخريطة
  minuteTick() {
    const now = $('skyNow');
    if (now) now.setAttribute('transform', 'translate(' + skyX(skyNowHours(), Number(now.parentNode.dataset.from)) + ' 0)');
  },

  afterView() {},

  /* ---------- الرأس ---------- */
  heroClass: 'hero-sky',
  // الخبرة: قوس، والنجمة تمشي عليه
  xpBar(lv) {
    const f = Math.min(1, lv.xp / lv.need);
    const a = Math.PI * f;                       // القوس يبدأ من جهة بداية السطر (يمين بالعربي)
    const dir = EN ? -1 : 1;
    const x = Math.round((150 + dir * 140 * Math.cos(a)) * 10) / 10, y = Math.round((150 - 140 * Math.sin(a)) * 10) / 10;
    return sv('svg', { viewBox: '0 0 300 162', class: 'xp-arc', role: 'img', 'aria-label': L('الخبرة ', 'XP ') + lv.xp + L(' من ', ' of ') + lv.need },
      sv('path', { class: 'track', d: 'M10 150A140 140 0 0 1 290 150' }),
      f > 0 ? sv('path', { class: 'fill', d: 'M' + (150 + dir * 140) + ' 150A140 140 0 0 ' + (EN ? 1 : 0) + ' ' + x + ' ' + y }) : null,
      sv('path', { class: 'dot', d: 'M0-10Q0 0 10 0Q0 0 0 10Q0 0-10 0Q0 0 0-10Z', transform: 'translate(' + x + ' ' + y + ')' }),
      sv('line', { class: 'base', x1: 10, y1: 150, x2: 290, y2: 150 }));
  },
  // بطاقة الهوية (المستوى والسلسلة) وجنبها خريطة اليوم
  heroParts({ si, lvlBlock, graceDots }) {
    const id = el('section', { class: 'panel sky-id', 'aria-label': L('مستواك', 'Your level') },
      lvlBlock,
      el('div', { class: 'sky-streak' },
        el('span', { class: 'streak-num', text: String(si.streak) }),
        el('div', { class: 'st-side' },
          el('span', { class: 'streak-lbl', text: si.streak === 1 ? L('ليلة ما انقطعت', 'night unbroken') : L('ليلة ما انقطعت', 'nights unbroken') }),
          el('div', { class: 'grace-row' }, el('span', { text: L('ليالي السماح', 'Grace nights') }), graceDots))));
    const chart = el('section', { class: 'panel sky-chart', 'aria-labelledby': 'skyTitle' },
      el('div', { class: 'panel-head' },
        el('h2', { id: 'skyTitle', text: L('سماء اليوم', "Today's sky") }),
        el('span', { class: 'muted sky-hint', text: L('كل مهمة نجمة: اضغطها لما تنجزها وتضوي', 'Every quest is a star: press it when you finish and it lights up') })),
      skyChart());
    return [el('div', { class: 'hero-body' }, id, chart)];
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
    if (fixed.length) list.append(el('div', { class: 'grp-row' }, el('h3', { class: 'grp', text: L('كل يوم', 'Daily') }), el('span', { class: 'grp-hint', text: L('النجمة = الأهم اليوم (+' + MIT_XP + ' XP)', 'Star = top quest today (+' + MIT_XP + ' XP)') })), el('ul', { class: 'tasks' }, fixed.sort(byOrder).map(taskRow)));
    if (gates.length) list.append(el('h3', { class: 'grp gates', text: L('بوابات اليوم', "Today's gates") }), el('ul', { class: 'tasks' }, gates.sort(byOrder).map(taskRow)));
  }
};
