'use strict';
/* =====================================================================
   نظام الصياد — brief.js
   تقرير النظام: الصباح والمساء وملخص الجمعة، والقراءة بصوت.
   ===================================================================== */

const BRIEF_KEY = STORE_KEYS.brief;
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

// محتوى التقرير: العنوان (من الواجهة: look().briefTitles) والسطور والجدول، والنص اللي ينقرأ بصوت
function briefData(kind) {
  const titles = look().briefTitles;
  const si = streakInfo();
  const now = new Date();
  const t = todayIso();
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates);
  const open = all.filter((x) => !x.done).sort(byTime);
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
    title = titles.friday();
    cta = L('ابدأ الأسبوع الجديد', 'Start the new week');
    const ws = addDays(weekStart(t), -7);
    const we = addDays(ws, 6);
    const range = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    if (we < state.startDate) {
      lead([L('هذا أول أسبوع لك في النظام. الجمعة الجاية بيطلع لك هنا ملخص أسبوعك: الأيام المكتملة والخبرة والتركيز.', "This is your first week in the System. Next Friday you'll see your weekly summary here: completed days, XP and focus.")]);
    } else {
      const doneSet = new Set(state.completedDates);
      const wk = weekSummary(ws);
      const { full, xp, focus: focusMin } = wk;
      const prev = weekSummary(addDays(ws, -7)).xp;
      let best = null;
      range.forEach((d) => { const r = dayRatio(d); if (r >= 0 && (!best || r > best.r || (r === best.r && (state.xpByDate[d] || 0) > best.xp))) best = { d, r, xp: state.xpByDate[d] || 0 }; });
      lead(EN
        ? ['Your week is over, Hunter. You completed ', b(full + ' of ' + wk.counted), ' days and earned ', b(ltr(xp + ' XP')), '.']
        : ['انتهى أسبوعك أيها الصياد. أكملت ', b(full + ' من ' + wk.counted), ' أيام، وجمعت ', b(ltr(xp + ' XP')), '.']);
      nodes.push(el('div', { class: 'brief-week', role: 'img', 'aria-label': L('أيام الأسبوع: ' + full + ' مكتملة', 'Days of the week: ' + full + ' completed') },
        ...range.map((d, i) => el('span', { class: 'bw-day ' + (doneSet.has(d) ? 'done' : isRest(d) ? 'rest' : d < state.startDate || isOff(d) ? 'off' : 'miss') }, el('i'), WD_FROM_FRI[i]))));
      const h = Math.floor(focusMin / 60), m = Math.round(focusMin % 60);
      grid([
        [L('أيام مكتملة', 'Days completed'), full + ' / ' + wk.counted],
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
    title = titles.evening(hey);
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
    title = titles.morning(hey, now);
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

/* ============ النافذة والقراءة بصوت ============ */
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

function bindBrief() {
  $('briefBtn').addEventListener('click', () => openBrief(briefKind(false)));
  $('briefSpeak').addEventListener('click', speakBrief);
  try { if (window.speechSynthesis) speechSynthesis.getVoices(); } catch (e) { /* تجاهل */ }
}
