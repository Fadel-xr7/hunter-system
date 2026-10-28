'use strict';
/* =====================================================================
   نظام الصياد — stats.js
   صفحة التحليلات: الأرقام، منحنى الخبرة، رادار القدرات، والأسبوع اللي فات.
   ===================================================================== */

let chartRange = 30; // أيام منحنى الخبرة: 7 أو 30

function renderStats(si) {
  const doneCount = Object.keys(state.rewards).filter((k) => k.startsWith('fixed:') || k.startsWith('gate:')).length;
  const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(todayIso(), -i));
  const rated = days.map(dayRatio).filter((r) => r >= 0);
  const rate = rated.length ? Math.round(rated.reduce((a, b) => a + b, 0) / rated.length * 100) : 0;
  const nums = [
    [doneCount.toLocaleString('en'), L('مهمة أنجزتها', 'quests completed')],
    [state.focus.minutes.toLocaleString('en'), L('دقيقة تركيز', 'focus minutes')],
    [String(longestStreak()), L('أطول سلسلة', 'longest streak')],
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

// الأسبوع اللي فات (الجمعة إلى الخميس)
function renderWeek() {
  const ws = addDays(weekStart(todayIso()), -7);
  const range = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const cur = weekSummary(ws), prev = weekSummary(addDays(ws, -7));
  const mins = range.map((d) => focusMinutes(d));
  const focusTot = cur.focus, prevFocus = prev.focus;
  const xp = cur.xp, pxp = prev.xp;
  let best = null;
  range.forEach((d) => { const x = state.xpByDate[d] || 0; if (x > 0 && (!best || x > best.x)) best = { d, x }; });
  const hm = (m) => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + L('س ', 'h ') + (m % 60) + L('د', 'm') : m + L(' د', ' min'); };
  const delta = (a, b, fmt) => b > 0 ? (a >= b ? '+' : '−') + fmt(Math.abs(a - b)) : '';
  const d0 = dateOf(range[0]), d6 = dateOf(range[6]);
  $('weekRange').textContent = WEEKDAYS[d0.getDay()] + ' ' + d0.getDate() + ' ' + MONTHS[d0.getMonth()] + L(' إلى ', ' to ') + WEEKDAYS[d6.getDay()] + ' ' + d6.getDate() + ' ' + MONTHS[d6.getMonth()];
  const rows = [
    [L('أيام مكتملة', 'Days completed'), cur.full + ' / ' + cur.counted, L('اللي قبله ', 'week before ') + prev.full, ''],
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

// الرسم يتعدّل مع عرض الشاشة، وأزرار 7/30 يوم
function bindStats() {
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (view === 'stats') renderXpChart(Array.from({ length: chartRange }, (_, i) => addDays(todayIso(), i - chartRange + 1))); }, 200); });
  document.querySelectorAll('.range [data-range]').forEach((b) => b.addEventListener('click', () => { chartRange = Number(b.dataset.range); renderStats(streakInfo()); }));
}
