'use strict';
/* =====================================================================
   نظام الصياد — tasks.js
   المهام: مهام اليوم، الإنجاز والتراجع، الحذف والتعديل، يوم الراحة، المهمة الأهم،
   خطوات البوابة، وقائمة المهام. والإضافة السريعة من الحقل ومن روابط البوت (المحلل parseQuick في core.js).
   ===================================================================== */

/* ============ مهام اليوم: الإنجاز والحذف والتعديل ============ */
function todayTasks() {
  const t = todayIso();
  const d = doneIds(t);
  const fixed = fixedFor(t).map((q) => ({ kind: 'fixed', ref: q, id: q.id, title: q.title, time: q.time, xp: q.xp, stat: q.stat, done: d.includes(q.id) }));
  const gates = state.gates
    .filter((g) => g.date === t || (g.date < t && !g.done))
    .map((g) => ({ kind: 'gate', ref: g, id: g.id, title: g.title, time: g.time, xp: g.xp, stat: g.stat, rank: g.rank, done: g.done, late: g.date < t }));
  return { fixed, gates };
}

function toggleTask(kind, id) {
  const t = todayIso();
  if (kind === 'fixed') {
    const q = state.fixed.find((x) => x.id === id);
    if (!q) return;
    const arr = state.log[t] = state.log[t] || [];
    const key = 'fixed:' + t + ':' + id;
    if (arr.includes(id)) {
      state.log[t] = arr.filter((x) => x !== id);
      revoke(key); sound('undo');
    } else {
      arr.push(id);
      grant(key, q.xp, q.stat);
      toast(L('اكتملت المهمة: ', 'Quest complete: ') + q.title, '+' + q.xp + ' XP', '', undoToggle(kind, id)); sound('done');
    }
    syncDay(t);
  } else {
    const g = state.gates.find((x) => x.id === id);
    if (!g) return;
    g.done = !g.done;
    if (g.done) { grant('gate:' + id, g.xp, g.stat); toast(L('تم تطهير بوابة ' + g.rank, 'Gate ' + g.rank + ' cleared') + ': ' + g.title, '+' + g.xp + ' XP', '', undoToggle(kind, id)); sound('done'); }
    else { revoke('gate:' + id); sound('undo'); }
  }
  syncMit();
  justToggled = kind + ':' + id;
  commit();
}

async function deleteTask(kind, id) {
  const q = kind === 'fixed' ? state.fixed.find((x) => x.id === id) : state.gates.find((x) => x.id === id);
  if (!q) return;
  const ask = kind === 'fixed'
    ? L('تحذف المهمة اليومية «' + q.title + '»؟ خبرتك من الأيام السابقة تبقى.', 'Delete the daily quest "' + q.title + '"? XP from earlier days stays.')
    : L('تحذف البوابة «' + q.title + '»؟', 'Delete the gate "' + q.title + '"?');
  if (!(await confirmBox(ask))) return;
  removeTask(kind, id);
  commit();
}

// يشيل مهمة يومية أو بوابة، ويسحب خبرتها لو انحسبت اليوم. يستخدمه الحذف والتراجع عن الإضافة
function removeTask(kind, id) {
  snapshotPlans(); // لو عدّى منتصف الليل والتبويب كان نايم، نثبّت أمس قبل ما نغيّر المهام
  const t = todayIso();
  if (kind === 'fixed') {
    if (!state.fixed.some((x) => x.id === id)) return false;
    if (doneIds(t).includes(id)) { state.log[t] = doneIds(t).filter((x) => x !== id); revoke('fixed:' + t + ':' + id); }
    state.fixed = state.fixed.filter((x) => x.id !== id);
    syncDay(t);
  } else {
    const g = state.gates.find((x) => x.id === id);
    if (!g) return false;
    if (g.done) revoke('gate:' + id);
    state.gates = state.gates.filter((x) => x.id !== id);
  }
  if (state.timer.link === kind + ':' + id) state.timer.link = '';
  if (state.mit.key === kind + ':' + id) state.mit = { date: '', key: '' };
  syncMit();
  return true;
}

// التراجع من الإشعار
function undoToggle(kind, id) {
  return {
    label: L('تراجع', 'Undo'),
    run: () => {
      const { fixed, gates } = todayTasks();
      const t = fixed.concat(gates).find((x) => x.kind === kind && x.id === id);
      if (t && t.done) { toggleTask(kind, id); toast(L('رجّعتها، وانسحبت الخبرة', 'Undone, the XP was removed'), ''); }
    }
  };
}

function undoAdd(kind, id) {
  return {
    label: L('تراجع', 'Undo'),
    run: () => {
      if (!removeTask(kind, id)) return;
      commit();
      toast(L('شلتها من القائمة', 'Removed from the list'), '');
    }
  };
}

// أزرار تعديل/حذف جنب المهمة (تطلع في وضع «تعديل المهام»)
function rowTools(kind, id, title) {
  return el('span', { class: 'row-tools' },
    el('button', { class: 'mini', onclick: () => openEdit(kind, id), 'aria-label': L('تعديل ', 'Edit ') + title, text: L('تعديل', 'Edit') }),
    el('button', { class: 'mini danger', onclick: () => deleteTask(kind, id), 'aria-label': L('حذف ', 'Delete ') + title, text: L('حذف', 'Delete') }));
}

function openEdit(kind, id) {
  const q = kind === 'fixed' ? state.fixed.find((x) => x.id === id) : state.gates.find((x) => x.id === id);
  if (!q) return;
  $('editTitle').textContent = kind === 'fixed' ? L('تعديل المهمة اليومية', 'Edit daily quest') : L('تعديل البوابة', 'Edit gate');
  $('eTitle').value = q.title;
  $('eTime').value = q.time;
  $('eStat').value = q.stat;
  $('eDaysBox').hidden = kind !== 'fixed';
  $('eGateBox').hidden = kind !== 'gate';
  const box = $('eDays');
  box.replaceChildren();
  WEEK_ORDER.forEach((i) => {
    const name = WEEKDAYS_SHORT[i];
    const on = kind === 'fixed' && (!q.days.length || q.days.includes(i));
    box.append(el('label', { class: 'day' }, el('input', { type: 'checkbox', value: i, checked: on }), el('span', { text: name })));
  });
  if (kind === 'gate') { $('eDate').value = q.date; $('eRank').value = q.rank; $('eSubs').value = (q.subs || []).map((x) => x.title).join('\n'); }
  $('eSubsBox').hidden = kind !== 'gate';
  const dlg = $('editDialog');
  dlg.onclose = () => {
    if (dlg.returnValue !== 'save') return;
    const title = $('eTitle').value.trim().slice(0, 120);
    if (!title || !isTime($('eTime').value)) return;
    snapshotPlans(); // نثبّت الأيام اللي خلصت قبل ما تتغيّر أيام المهمة
    q.title = title; q.time = $('eTime').value; q.stat = $('eStat').value;
    if (kind === 'fixed') {
      const days = [...box.querySelectorAll('input:checked')].map((i) => Number(i.value));
      q.days = normDays(days.length ? days : [0, 1, 2, 3, 4, 5, 6]);
      syncDay(todayIso());
    } else {
      if (isIso($('eDate').value)) q.date = $('eDate').value;
      const r = $('eRank').value;
      if (RANK_XP[r] && r !== q.rank) { q.rank = r; if (!q.done) q.xp = RANK_XP[r]; }
      // الخطوات: سطر لكل خطوة، والخطوة اللي ما تغيّر اسمها تحتفظ بحالتها
      const old = q.subs || [];
      q.subs = normSubs($('eSubs').value.split('\n').map((x) => x.trim()).filter(Boolean).map((title) => {
        const o = old.find((x) => x.title === title);
        return o ? o : { id: uid('s'), title, done: false };
      }));
    }
    commit();
  };
  dlg.returnValue = '';
  dlg.showModal();
}

function toggleRest() {
  const t = todayIso();
  if (isRest(t)) state.restDays = state.restDays.filter((d) => d !== t);
  else { state.restDays.push(t); toast(L('اليوم يوم راحة', 'Rest day'), L('سلسلتك محفوظة', 'Your streak is safe'), 'gold'); }
  commit();
}

/* ============ مهمة اليوم الأهم: وحدة بس كل يوم، و+50 XP لما تخلص ============ */
const mitKey = () => state.mit.date === todayIso() ? state.mit.key : '';
function setMit(key) {
  const cur = mitKey();
  state.mit = cur === key ? { date: '', key: '' } : { date: todayIso(), key };
  const gained = syncMit();
  if (state.mit.key && !gained) toast(L('صارت مهمة اليوم الأهم', "Set as today's top quest"), L('أنجزها وتاخذ +' + MIT_XP + ' XP زيادة', 'Finish it for +' + MIT_XP + ' bonus XP'), 'gold');
  commit();
}

// يعطي مكافأة الأهم لو مهمتها منجزة، ويسحبها لو لا
function syncMit() {
  const t = todayIso();
  const key = mitKey();
  const { fixed, gates } = todayTasks();
  const task = key ? fixed.concat(gates).find((x) => x.kind + ':' + x.id === key) : null;
  if (task && task.done) {
    if (grant('mit:' + t, MIT_XP, null)) { toast(L('أنجزت مهمة اليوم الأهم', 'Top quest complete'), '+' + MIT_XP + ' XP', 'gold'); return true; }
    return false;
  }
  revoke('mit:' + t);
  return false;
}

/* ============ قائمة المهام ============ */
// المهمة: النجمة والزر والخطوات وأزرار التعديل. شكل الزر من الواجهة (look().taskBody)
function taskRow(t) {
  const key = t.kind + ':' + t.id;
  const isMit = mitKey() === key;
  const label = (t.done ? L('إلغاء إنجاز ', 'Undo ') : L('إنجاز ', 'Complete ')) + t.title + L('، ', ', ') + STAT_AR[t.stat] + (isMit ? L('، مهمة اليوم الأهم', ", today's top quest") : '');
  const btn = el('button', { class: 'task' + (t.done ? ' done' : '') + (justToggled === key ? ' pop' : ''), 'aria-pressed': String(t.done), 'aria-label': label, onclick: () => toggleTask(t.kind, t.id) });
  const statTag = el('span', { class: 'stag s-' + t.stat, 'aria-hidden': 'true', text: '#' + STAT_AR[t.stat] });
  const mitTag = isMit ? el('span', { class: 'mit-tag', 'aria-hidden': 'true', text: L('الأهم اليوم', 'Top quest') }) : null;
  btn.append(...look().taskBody(t, { statTag, mitTag, xp: t.xp + (isMit ? MIT_XP : 0) }));
  const star = el('button', {
    class: 'mit-btn' + (isMit ? ' on' : ''), 'aria-pressed': String(isMit),
    'aria-label': isMit ? L('إلغاء «' + t.title + '» كمهمة اليوم الأهم', 'Remove "' + t.title + '" as today\'s top quest') : L('اجعل «' + t.title + '» مهمة اليوم الأهم (+' + MIT_XP + ' XP)', 'Make "' + t.title + '" today\'s top quest (+' + MIT_XP + ' XP)'),
    title: isMit ? L('مهمة اليوم الأهم', "Today's top quest") : L('اجعلها مهمة اليوم الأهم', "Make it today's top quest"), onclick: () => setMit(key)
  }, starIcon());
  const li = el('li', { class: 'task-li' + (isMit ? ' is-mit' : '') }, star, btn);
  if (t.kind === 'gate' && t.ref.subs && t.ref.subs.length) { li.classList.add('has-subs'); li.append(subsBlock(t.ref)); }
  if (justToggled === key && t.done) {
    li.classList.add('swept');
    li.append(el('span', { class: 'xpf', 'aria-hidden': 'true', dir: 'ltr', text: '+' + (t.xp + (isMit ? MIT_XP : 0)) }));
  }
  if (editing) li.append(rowTools(t.kind, t.id, t.title));
  return li;
}

function renderTasks() {
  const list = $('taskList');
  const { fixed, gates } = todayTasks();
  const all = fixed.concat(gates);
  const doneN = all.filter((t) => t.done).length;
  const t = todayIso();
  look().taskCount(all, doneN, t);
  $('restBtn').setAttribute('aria-pressed', String(isRest(t)));
  $('restBtn').textContent = isRest(t) ? L('إلغاء يوم الراحة', 'Cancel rest day') : L('خذ يوم راحة', 'Take a rest day');
  $('editBtn').setAttribute('aria-pressed', String(editing));
  $('editLabel').textContent = editing ? L('خلصت التعديل', 'Done editing') : L('تعديل المهام', 'Edit quests');
  list.replaceChildren();

  if (isRest(t)) {
    list.append(restCard());
  } else if (!all.length) {
    list.append(el('p', { class: 'empty', text: L('ما عندك مهام اليوم. اكتب أول مهمة فوق، وأضف «يومي» لو تبيها تتكرر.', 'No quests today. Type your first one above, and add "daily" if it repeats.') }));
  } else {
    look().taskList(list, fixed, gates, all);
  }

  // البوابات القادمة (الأيام الجاية)
  const up = $('upcoming');
  up.replaceChildren();
  const future = state.gates.filter((g) => g.date > t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
  if (future.length) {
    up.append(el('h3', { class: 'grp', text: L('القادمة', 'Upcoming') }), el('ul', { class: 'upcoming' }, future.map((g) => {
      const d = dateOf(g.date);
      return el('li', {},
        el('span', { class: 'up-date', text: WEEKDAYS_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] }),
        el('span', { class: 'up-title', text: g.title }),
        el('span', { class: 'up-rank', text: L('رتبة ' + g.rank + '، الساعة ', 'Rank ' + g.rank + ', at ') + fmt12(g.time) }),
        editing ? rowTools('gate', g.id, g.title) : null);
    })));
  }
  renderBonusLine(t);
}

// يوم الراحة: بطاقة بدل قائمة المهام
function restCard() {
  return el('div', { class: 'rest-card' },
    el('span', { class: 'rest-icon', 'aria-hidden': 'true' }),
    el('div', { class: 'rest-txt' },
      el('p', { class: 'rest-kicker', text: look().restKicker }),
      el('p', { class: 'rest-main', text: L('اليوم محايد: سلسلتك محفوظة وما ينحسب من أيام السماح.', "Today is neutral: your streak is safe and it doesn't use a grace day.") }),
      el('p', { class: 'rest-sub', text: L('مهامك ترجع بكرة. ولو تبيها اليوم، اضغط «إلغاء يوم الراحة».', 'Your quests come back tomorrow. To get them today, press "Cancel rest day".') })));
}

// سطر المكافأة: يصير شريط احتفال لما يكتمل اليوم
function renderBonusLine(t) {
  const box = $('bonusLine');
  const done = isComplete(t);
  box.classList.toggle('complete', done);
  if (!done) {
    const fx = fixedFor(t);
    const got = fx.filter((q) => doneIds(t).includes(q.id)).length;
    box.replaceChildren(
      el('span', { class: 'bl-msg', text: L('أكمل كل المهام اليومية لتحصل على +' + DAY_BONUS_XP + ' XP إضافية.', 'Finish all daily quests to earn +' + DAY_BONUS_XP + ' bonus XP.') }),
      fx.length && !isRest(t) ? el('span', { class: 'pips', role: 'img', 'aria-label': L('أنجزت ' + got + ' من ' + fx.length + ' مهام يومية', got + ' of ' + fx.length + ' daily quests done') },
        ...fx.map((q) => el('i', { class: doneIds(t).includes(q.id) ? 'on' : '' }))) : null);
    return;
  }
  box.replaceChildren(
    el('span', { class: 'bl-tag', text: look().bonusTag }),
    el('span', { class: 'bl-txt', text: L('المكافأة ', 'Bonus ') + '+' + DAY_BONUS_XP + ' XP  ·  ' + L('السلسلة صارت ', 'Streak is now ') + streakInfo().streak }));
}

/* ============ خطوات البوابة ============ */
function subsBlock(g) {
  const done = g.subs.filter((x) => x.done).length;
  const pct = Math.round(done / g.subs.length * 100);
  return el('div', { class: 'subs' },
    el('div', { class: 'subs-head' },
      el('span', { text: L('الخطوات ', 'Steps ') + done + '/' + g.subs.length }),
      el('span', { class: 'bar', 'aria-hidden': 'true' }, el('span', { style: 'width:' + pct + '%' }))),
    el('ul', { class: 'subs-list' }, g.subs.map((x) => el('li', {},
      el('button', {
        type: 'button', class: 'sub' + (x.done ? ' done' : ''), 'aria-pressed': String(x.done),
        'aria-label': (x.done ? L('إلغاء الخطوة: ', 'Undo step: ') : L('أنجز الخطوة: ', 'Complete step: ')) + x.title,
        onclick: () => toggleSub(g.id, x.id)
      }, el('span', { class: 'sub-box', 'aria-hidden': 'true' }), el('span', { class: 'sub-title', text: x.title }))))));
}

function toggleSub(gid, sid) {
  const g = state.gates.find((x) => x.id === gid);
  const sub = g && g.subs.find((x) => x.id === sid);
  if (!sub) return;
  sub.done = !sub.done;
  sound(sub.done ? 'done' : 'undo');
  // آخر خطوة تنجز البوابة كلها (وتقدر تتراجع من الإشعار)
  if (sub.done && !g.done && g.date <= todayIso() && g.subs.every((x) => x.done)) { toggleTask('gate', gid); return; }
  commit();
}

/* ============ الإضافة السريعة (المحلل parseQuick في core.js) ============ */
// الاختيار الظاهر [مرة وحدة / كل يوم] يغلب على الكلمات المكتوبة
function readQuick() {
  const daily = document.querySelector('input[name="repeat"]:checked').value === 'daily';
  return parseQuick($('quickInput').value, { daily });
}

function addParsed(p) {
  snapshotPlans(); // مهمة يومية جديدة ما تنضاف لأمس
  const id = uid(p.kind === 'fixed' ? 'f_' : 'g_');
  if (p.kind === 'fixed') state.fixed.push({ id, title: p.title, stat: p.stat, xp: DAILY_XP, time: p.time, days: [] });
  else state.gates.push({ id, title: p.title, date: p.date, rank: p.rank, xp: p.xp, time: p.time, stat: p.stat, done: false, subs: [] });
  if (p.kind === 'fixed') syncDay(todayIso());
  toast(p.kind === 'fixed' ? L('أضيفت مهمة يومية', 'Daily quest added') : L('فُتحت بوابة جديدة', 'A new gate opened'), p.title, '', undoAdd(p.kind, id));
  sound('done');
  commit();
}

// معاينة الإضافة: شرائح تبيّن وش فهم النظام وأنت تكتب
function quickChips(p) {
  const chip = (txt, cls, ltrTxt) => el('span', { class: 'qchip ' + (cls || ''), dir: ltrTxt ? 'ltr' : null, text: txt });
  // replaceChildren يحوّل null لنص «null»، فنشيل الفارغ قبل
  $('quickHint').replaceChildren(...[
    el('span', { class: 'qlabel', text: L('النظام فهم:', 'The System read:') }),
    chip(p.kind === 'fixed' ? L('مهمة يومية', 'Daily quest') : L('بوابة ', 'Gate ') + p.rank, p.kind === 'fixed' ? 'q-daily' : 'q-gate'),
    chip('«' + p.title + '»', 'q-title'),
    p.kind === 'gate' ? chip(p.dateLabel, 'q-date') : null,
    chip(fmt12(p.time), 'q-time'),
    chip('#' + STAT_AR[p.stat], 'q-stat s-' + p.stat),
    chip('+' + p.xp + ' XP', 'q-xp', true)].filter(Boolean));
}

// روابط البوت: index.html#add=<نص المهمة>
async function importFromHash() {
  const h = location.hash || '';
  if (!h.startsWith('#add=')) return;
  let text = '';
  try { text = decodeURIComponent(h.slice(5).replace(/\+/g, ' ')).slice(0, 300); } catch (e) { text = ''; }
  history.replaceState(null, '', location.pathname + location.search);
  const p = parseQuick(text);
  if (!p) { toast(L('رابط المهمة غير صالح', 'Invalid quest link'), L('ما قدرت أقرأ اسم المهمة', "Couldn't read the quest name"), 'warn'); return; }
  if (await confirmBox(L('مهمة واردة من تيليجرام:\n', 'Quest from Telegram:\n') + describeQuick(p) + L('\n\nتضيفها؟', '\n\nAdd it?'), L('أضفها', 'Add it'))) addParsed(p);
}

/* ============ الأزرار ============ */
// خانة الإضافة السريعة: معاينة وأنت تكتب، وإضافة بـ Enter
function bindQuick() {
  $('quickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = readQuick();
    if (!p) { toast(L('اكتب اسم المهمة أولاً', 'Type the quest name first'), '', 'warn'); return; }
    addParsed(p);
    $('quickInput').value = '';
    $('quickHint').textContent = HINT;
    $('quickHint').classList.remove('chips');
  });
  const HINT = $('quickHint').textContent;
  const preview = () => { const p = readQuick(); if (p) quickChips(p); else $('quickHint').textContent = HINT; $('quickHint').classList.toggle('chips', Boolean(p)); };
  $('quickInput').addEventListener('input', preview);
  document.querySelectorAll('input[name="repeat"]').forEach((r) => r.addEventListener('change', preview));
}

function bindTaskTools() {
  $('editBtn').addEventListener('click', () => { editing = !editing; renderTasks(); });
  $('restBtn').addEventListener('click', toggleRest);
}

// بوت واحد للكل (Supabase Edge Function). اسمه في config.js، وروابطه تجي بـ #add=
function bindTelegram() {
  $('tgBtn').addEventListener('click', () => {
    const bot = String((window.HUNTER_CONFIG || {}).telegramBot || '').replace(/^@/, '').trim();
    const ok = /^\w{5,32}$/.test(bot);
    $('tgReady').hidden = !ok;
    $('tgNotReady').hidden = ok;
    if (ok) $('tgOpen').href = 'https://t.me/' + bot;
    $('tgDialog').showModal();
  });
  $('tgTry').addEventListener('click', () => {
    const txt = $('tgTest').value.trim();
    if (!txt) return;
    $('tgDialog').close();
    location.hash = '#add=' + encodeURIComponent(txt);
  });
  window.addEventListener('hashchange', importFromHash);
}
