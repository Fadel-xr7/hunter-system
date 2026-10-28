'use strict';
/* =====================================================================
   نظام الصياد — hero.js
   رأس الصفحة: المستوى والاسم واختبار الرتبة، وسطر العد التنازلي، والبطاقات الأربع.
   ===================================================================== */

/* ============ الاسم ============ */
function nameButton(cls) {
  return el('button', { class: cls + (state.name ? '' : ' unnamed'), 'aria-label': state.name ? L('اسمك ' + state.name + '، اضغط لتغييره', 'Your name is ' + state.name + ', click to change it') : L('اكتب اسمك', 'Enter your name'), onclick: openNameDialog },
    state.name || L('اكتب اسمك', 'Enter your name'),
    sv('svg', { viewBox: '0 0 24 24', class: 'pen', 'aria-hidden': 'true' }, sv('path', { d: 'M12 20h9' }), sv('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' })));
}

function openNameDialog(welcome) {
  const dlg = $('nameDialog');
  $('nameNote').hidden = welcome !== true;
  $('nameInput').value = state.name;
  dlg.returnValue = '';
  dlg.onclose = () => { if (dlg.returnValue === 'save') { state.name = $('nameInput').value.trim().slice(0, 18); commit(); } };
  dlg.showModal();
}

/* ============ الرأس ============ */
// الرأس: كتلة المستوى (نفسها في الواجهتين)، والباقي من الواجهة (look-*.js: heroParts)
function renderHero(si) {
  const hero = $('hero');
  const lv = levelInfo(state.totalXp);
  const reach = longestStreak();
  const { cur, next } = rankFor(lv.level, reach);
  const ttl = activeTitle();
  const need = lv.need - lv.xp;

  const lvlBlock = el('div', { class: 'lvl-block' },
    el('div', { class: 'lvl-row' },
      el('span', { class: 'lvl-num' }, String(lv.level)),
      el('div', { class: 'who' },
        el('span', { class: 'muted', text: L('المستوى', 'Level') }),
        nameButton('hname'),
        el('div', { class: 'chips' },
          el('span', { class: 'rank-chip', text: L('صياد رتبة ' + cur.l, cur.l + '-Rank Hunter') }),
          ttl ? el('span', { class: 'title-chip', title: L('لقبك الحالي', 'Your current title') }, crownIcon(), ttl.name) : null))),
    look().xpBar(lv),
    el('div', { class: 'xp-meta' },
      el('span', { text: L('تبقّى ' + need + ' XP على المستوى ' + (lv.level + 1), need + ' XP to level ' + (lv.level + 1)) }),
      el('span', { dir: 'ltr', text: lv.xp + ' / ' + lv.need + ' XP' })),
    next ? rankTrial(next, lv.level, reach) : el('p', { class: 'rank-max', text: L('وصلت أعلى رتبة في النظام.', 'You reached the highest rank in the System.') }));

  const graceDots = el('span', { class: 'grace', 'aria-label': L('أيام السماح المتبقية: ' + si.graceLeft + ' من ', 'Grace days left: ' + si.graceLeft + ' of ') + GRACE_DAYS },
    ...Array.from({ length: GRACE_DAYS }, (_, i) => el('i', { class: i < si.graceLeft ? 'left' : '' })));
  const streakLbl = si.streak === 1 ? L('يوم متتالي', 'day in a row') : L('يوماً متتالياً', 'days in a row');

  hero.className = look().heroClass;
  hero.replaceChildren(...look().heroParts({ si, lvlBlock, graceDots, streakLbl }), el('p', { class: 'subtitle', id: 'subtitle' }));
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

function updateSubtitle() {
  const sub = $('subtitle');
  if (!sub) return;
  const { fixed, gates } = todayTasks();
  const left = fixed.concat(gates).filter((t) => !t.done).length;
  const n = new Date();
  const toMid = 86400 - (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds());
  const clock = pad(Math.floor(toMid / 3600)) + ':' + pad(Math.floor(toMid % 3600 / 60)) + ':' + pad(toMid % 60);
  sub.textContent = look().subtitleDate(n) + (isRest(todayIso()) ? L('يوم راحة. استرح، وسلسلتك محفوظة.', 'Rest day. Recharge, your streak is safe.')
    : left === 0 ? L('أكملت كل مهام اليوم. يبدأ يوم جديد بعد ', 'All quests done. A new day starts in ') + clock
    : L('تبقّت ' + left + (left === 1 ? ' مهمة' : ' مهام') + '، ويُعاد ضبط اليوم بعد ', left + (left === 1 ? ' quest' : ' quests') + ' left. The day resets in ') + clock);
}

/* ============ البطاقات الأربع ============ */
function nextTask() {
  const { fixed, gates } = todayTasks();
  const open = fixed.concat(gates).filter((t) => !t.done).sort(byTime);
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

function bindHero() {
  $('statCards').addEventListener('click', (e) => { const c = e.target.closest('[data-card]'); if (c) cardGo(c.dataset.card); });
}
