'use strict';
/* =====================================================================
   نظام الصياد — records.js
   الإنجازات والألقاب، والسجل (خريطة الالتزام) وتفاصيل أي يوم فيه.
   ===================================================================== */

/* ============ الإنجازات ============ */
function checkAchievements(streakNow) {
  const reach = Math.max(streakNow, longestStreak());
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

/* ============ الألقاب ============ */
function activeTitle() {
  const a = state.achievements.find((x) => x.id === state.title);
  if (!a) return null;
  return state.unlocked.includes(a.id) || longestStreak() >= a.days ? a : null;
}

function setTitle(id) {
  const a = state.achievements.find((x) => x.id === id);
  if (!a) return;
  if (state.title === id) { state.title = ''; toast(L('شلت اللقب', 'Title removed'), L('تقدر تختار غيره وقت ما تبي', 'You can pick another one any time')); }
  else { state.title = id; toast(L('لقبك الجديد: ', 'New title: ') + a.name, L('يطلع جنب اسمك فوق', 'It shows next to your name at the top'), 'gold'); sound('done'); }
  commit();
}

/* ============ قائمة الإنجازات ============ */
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
  const reach = longestStreak();
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
  const reach = longestStreak();
  const list = state.achievements.slice().sort((a, b) => a.days - b.days);
  $('achList').replaceChildren(...(list.length ? list.map((a) => achRow(a, reach, true)) : [el('li', { class: 'empty', text: L('ما عندك إنجازات للحين. أضف أول واحد تحت.', 'No achievements yet. Add your first one below.') })]));
}

/* ============ السجل (خريطة الالتزام) ============ */
// نسبة إنجاز اليوم: -1 لو ما فيه مهام
function dayRatio(iso) {
  const app = fixedFor(iso);
  const g = state.gates.filter((x) => x.date === iso);
  const total = app.length + g.length;
  if (!total) return -1;
  const d = doneIds(iso);
  return (app.filter((q) => d.includes(q.id)).length + g.filter((x) => x.done).length) / total;
}

let heatSel = ''; // اليوم المختار في السجل
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
  return { counted, full, best: longestStreak() };
}

function renderHeatStats() {
  const { counted, full, best } = commitStats();
  const items = [
    // الرقم يطلع دايماً (daysAr تكتب «يوم» و«يومين» بدون رقم)
    ['hs-streak', L('أطول سلسلة', 'Longest streak'), best ? L(best + (best >= 3 && best <= 10 ? ' أيام' : ' يوم'), best + (best === 1 ? ' day' : ' days')) : '0'],
    ['hs-days', L('أيام مكتملة من البداية', 'Days completed since start'), full + L(' من ', ' of ') + counted],
    ['hs-rate', L('نسبة الالتزام', 'Commitment rate'), counted ? Math.round(full / counted * 100) + '%' : '—']
  ];
  $('heatStats').replaceChildren(...items.map(([c, l, v]) => el('div', { class: c }, el('dt', { text: l }), el('dd', { text: v }))));
}

// تفاصيل أي يوم في السجل
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
  // لو ما اخترت يوم: الأنمي يعرض اليوم على طول، وحبر الليل يعرض تلميح
  const sel = heatSel || (look().heatShowsToday ? todayIso() : '');
  if (!sel) { box.replaceChildren(el('span', { class: 'hd-hint', text: L('اضغط أي يوم في السجل وتطلع لك تفاصيله.', 'Tap any day in the record to see its details.') })); return; }
  const d = dateOf(sel);
  const st = dayStatus(sel);
  const app = fixedFor(sel);
  const done = doneIds(sel).filter((id) => app.some((q) => q.id === id)).length;
  const gates = state.gates.filter((g) => g.date === sel);
  const focus = focusMinutes(sel);
  const xp = state.xpByDate[sel] || 0;
  const parts = [];
  if (app.length) parts.push(L('اليومية ', 'Daily ') + done + L(' من ', ' of ') + app.length);
  if (gates.length) parts.push(L('البوابات ', 'Gates ') + gates.filter((g) => g.done).length + L(' من ', ' of ') + gates.length);
  if (focus) parts.push(L('تركيز ', 'Focus ') + Math.round(focus) + L(' د', ' min'));
  box.replaceChildren(...[
    el('b', { class: 'hd-date', text: WEEKDAYS[d.getDay()] + L('، ', ', ') + d.getDate() + ' ' + MONTHS[d.getMonth()] + (sel === todayIso() ? L(' (اليوم)', ' (today)') : '') }),
    el('span', { class: 'hd-st hd-' + st.k, text: st.t }),
    ...parts.map((x) => el('span', { class: 'hd-info', text: x })),
    el('span', { class: 'hd-xp', dir: 'ltr', text: '+' + xp + ' XP' }),
    heatSel ? el('button', { type: 'button', class: 'mini hd-close', onclick: () => { heatSel = ''; renderHeat(); }, 'aria-label': L('إخفاء التفاصيل', 'Hide details'), text: '×' }) : null].filter(Boolean));
}

/* ============ الأزرار ============ */
function bindRecords() {
  $('achForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (addAchievement($('achName').value, $('achDays').value)) { $('achName').value = ''; $('achDays').value = ''; toast(L('أضيف الإنجاز', 'Achievement added'), ''); }
    else toast(L('تأكد من الاسم وعدد الأيام', 'Check the name and number of days'), L('من 1 إلى 3650 يوماً', 'From 1 to 3650 days'), 'warn');
  });
}
