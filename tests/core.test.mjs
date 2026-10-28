// اختبارات المنطق في docs/js/core.js: البيانات، الخبرة، السلسلة، لقطات الأيام، والإضافة السريعة.
// التاريخ ثابت: اليوم الأربعاء 28 أكتوبر 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore, days } from './helpers/load-core.mjs';

const TODAY = '2026-10-28';
const every = (id, xp = 30) => ({ id, title: id, stat: 'STR', xp, time: '09:00', days: [] });

/** حالة فيها مهمة يومية وحدة، وأيام مكتملة (والـ log متوافق معها) */
function withDays(core, completed, extra = {}) {
  const log = Object.fromEntries(completed.map((d) => [d, ['f1']]));
  core.setState({ startDate: '2026-09-01', fixed: [every('f1')], completedDates: completed, log, ...extra });
  core.run('snapshotPlans()');
}

test('normalize: بيانات خربانة ترجع حالة جديدة نظيفة', () => {
  const c = loadCore();
  for (const bad of [null, 5, 'x', [], undefined]) {
    c.run('state = normalize(' + JSON.stringify(bad ?? null) + ')');
    const s = c.state();
    assert.equal(s.fixed.length, 3);
    assert.equal(s.startDate, TODAY);
    assert.deepEqual(s.plans, {});
  }
});

test('normalize: ينظّف ويقصّ القيم', () => {
  const c = loadCore();
  c.setState({
    name: 'ا'.repeat(30), totalXp: -5,
    fixed: [{ id: 'a', title: 'T', stat: 'XXX', xp: 99999, time: '25:00', days: [0, 1, 2, 3, 4, 5, 6] }, { title: 'بدون id' }],
    log: { '2026-10-01': ['a', 'a', 7], 'bad-date': ['a'] },
    completedDates: ['2026-10-02', '2026-10-01', '2026-10-01', 'nope'],
    plans: { '2026-10-01': ['a', 'a', 'b'], bad: ['x'], '2026-10-02': 'not-array' },
    timer: { minutes: 7 }
  });
  const s = c.state();
  assert.equal(s.name.length, 18);
  assert.equal(s.totalXp, 0);
  assert.equal(s.fixed.length, 1);
  assert.deepEqual(s.fixed[0], { id: 'a', title: 'T', stat: 'SENSE', xp: 1000, time: '09:00', days: [] });
  assert.deepEqual(s.log, { '2026-10-01': ['a', '7'] });
  assert.deepEqual(s.completedDates, ['2026-10-01', '2026-10-02']);
  assert.deepEqual(s.plans, { '2026-10-01': ['a', 'b'] });
  assert.equal(s.timer.minutes, 25);
  assert.equal(s.startDate, '2026-10-01'); // بدون startDate: أول يوم مكتمل
});

test('المستوى والرتبة', () => {
  const c = loadCore();
  assert.deepEqual(c.call('levelInfo', 0), { level: 1, xp: 0, need: 100 });
  assert.deepEqual(c.call('levelInfo', 100), { level: 2, xp: 0, need: 200 });
  assert.deepEqual(c.call('levelInfo', 350), { level: 3, xp: 50, need: 300 });
  assert.equal(c.run('rankFor(5, 3).cur.l'), 'D');
  assert.equal(c.run('rankFor(5, 2).cur.l'), 'E');
  assert.equal(c.run('rankFor(5, 2).next.l'), 'D');
  assert.equal(c.run('rankFor(99, 999).next'), null);
});

test('grant و revoke: الخبرة والقدرات ترجع مثل ما كانت', () => {
  const c = loadCore();
  assert.equal(c.run("grant('k1', 30, 'STR')"), true);
  assert.equal(c.run("grant('k1', 30, 'STR')"), false);
  let s = c.state();
  assert.equal(s.totalXp, 30);
  assert.equal(s.xpByDate[TODAY], 30);
  assert.equal(s.stats.STR, 11);
  assert.equal(c.run("revoke('k1')"), true);
  assert.equal(c.run("revoke('k1')"), false);
  s = c.state();
  assert.equal(s.totalXp, 0);
  assert.equal(s.xpByDate[TODAY], 0);
  assert.equal(s.stats.STR, 10);
});

test('دقائق التركيز من مكافآت التركيز', () => {
  const c = loadCore();
  c.setState({ rewards: { 'focus:1': { xp: 75, date: '2026-10-27' }, 'focus:2': { xp: 30, date: TODAY }, 'fixed:x': { xp: 30, date: TODAY } } });
  assert.equal(c.call('focusMinutes', TODAY), 10);
  assert.equal(c.call('focusMinutes', '2026-10-27', TODAY), 35);
});

test('السلسلة: الأيام المتتالية، واليوم ما ينحسب عليك قبل ما يخلص', () => {
  const c = loadCore();
  withDays(c, days('2026-10-25', 3)); // 25 و26 و27، واليوم للحين ما خلص
  assert.deepEqual(c.call('streakInfo'), { streak: 3, graceLeft: 3, tailMiss: 0 });
  assert.equal(c.run('longestStreak()'), 3);
});

test('السلسلة: 3 أيام سماح، والرابع يكسرها', () => {
  const c = loadCore();
  withDays(c, ['2026-10-20', '2026-10-21', '2026-10-25', '2026-10-26', '2026-10-27']); // فاتت 22 و23 و24
  assert.equal(c.call('streakInfo').streak, 5);
  withDays(c, ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27']); // فاتت 22 إلى 25 (أربعة)
  assert.equal(c.call('streakInfo').streak, 2);
  assert.equal(c.run('longestStreak()'), 2);
});

test('السلسلة: يوم الراحة محايد', () => {
  const c = loadCore();
  withDays(c, ['2026-10-20', '2026-10-21', '2026-10-26', '2026-10-27'], { restDays: ['2026-10-22'] });
  assert.equal(c.call('streakInfo').streak, 4);
});

test('السلسلة: تنقطع لو فاتت 4 أيام لين اليوم', () => {
  const c = loadCore();
  withDays(c, ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']); // فاتت 24 إلى 27
  assert.equal(c.call('streakInfo').streak, 0);
  assert.equal(c.run('longestStreak()'), 4);
});

test('أطول سلسلة: من السجل، مو أعلى رقم انحفظ', () => {
  const c = loadCore();
  // اللي صار عند أحمد: bestStreak محفوظ 1، وما فيه ولا يوم مكتمل
  c.setState({ bestStreak: 1, completedDates: [] });
  assert.equal(c.run('longestStreak()'), 0);
  // سلسلة 5، انكسرت، وبعدها 3
  withDays(c, [...days('2026-10-01', 5), ...days('2026-10-10', 3)]);
  assert.equal(c.run('longestStreak()'), 5);
  assert.equal(c.call('streakInfo').streak, 0);
  // التراجع عن يوم مكتمل ينزلها
  withDays(c, days('2026-10-25', 3));
  assert.equal(c.run('longestStreak()'), 3);
  c.run("state.completedDates = state.completedDates.filter((d) => d !== '2026-10-27')");
  assert.equal(c.run('longestStreak()'), 2);
});

test('أطول سلسلة = السلسلة الحالية لو ما انكسرت', () => {
  const c = loadCore();
  for (const set of [days('2026-10-27', 1), days('2026-10-01', 27), ['2026-10-10', '2026-10-13', '2026-10-16', '2026-10-27']]) {
    withDays(c, set);
    assert.ok(c.run('longestStreak()') >= c.call('streakInfo').streak);
  }
  withDays(c, ['2026-10-10', '2026-10-13', '2026-10-16']);
  assert.equal(c.run('longestStreak()'), 3);
});

// بند 6 في tech-debt: مهمة الأحد إلى الخميس، فاتت أربعاء وخميس، ثم صارت «كل يوم»
function sunThuScenario(c) {
  const done = [...days('2026-10-04', 5), ...days('2026-10-11', 5), ...days('2026-10-18', 3), ...days('2026-10-25', 3)];
  const log = Object.fromEntries(done.map((d) => [d, ['f1']]));
  c.setState({ startDate: '2026-10-04', fixed: [{ ...every('f1'), days: [0, 1, 2, 3, 4] }], completedDates: done, log });
}

test('بند 6: تعديل أيام المهمة ما يغيّر السلسلة اللي فاتت', () => {
  const c = loadCore();
  sunThuScenario(c);
  c.run('snapshotPlans()');
  assert.equal(c.call('streakInfo').streak, 16);
  c.run("state.fixed[0].days = []"); // صارت كل يوم
  assert.equal(c.call('streakInfo').streak, 16);
  assert.equal(c.run('longestStreak()'), 16);
  assert.equal(c.run("isOff('2026-10-23')"), true); // الجمعة اللي فاتت تبقى بدون مهام
  assert.equal(c.run("isOff('" + TODAY + "')"), false); // اليوم يمشي على التعديل الجديد
});

test('بند 6: بدون اللقطة كانت المشكلة تصير (عشان نتأكد إن الاختبار يمسكها)', () => {
  const c = loadCore();
  sunThuScenario(c);
  c.run("state.fixed[0].days = []");
  assert.equal(c.call('streakInfo').streak, 3);
});

test('اللقطة: تنحفظ للأيام اللي خلصت بس، وما تتغير بعد ما تنحفظ', () => {
  const c = loadCore();
  c.setState({ startDate: '2026-10-25', fixed: [every('f1'), { ...every('f2'), days: [1] }] }); // f2 يوم الاثنين بس
  c.run('snapshotPlans()');
  assert.deepEqual(c.state().plans, { '2026-10-25': ['f1'], '2026-10-26': ['f1', 'f2'], '2026-10-27': ['f1'] });
  c.run("state.fixed.push({ id: 'f3', title: 'f3', stat: 'STR', xp: 30, time: '09:00', days: [] }); snapshotPlans()");
  assert.deepEqual(c.state().plans['2026-10-27'], ['f1']);
  assert.deepEqual(c.call('fixedFor', TODAY).map((q) => q.id), ['f1', 'f3']);
  // يوم جديد: أمس ينحفظ بالمهام الجديدة
  c.setToday('2026-10-29');
  c.run('snapshotPlans()');
  assert.deepEqual(c.state().plans[TODAY], ['f1', 'f3']);
});

test('حذف مهمة: الأيام اللي فاتت تبقى مكتملة', () => {
  const c = loadCore();
  c.setState({ startDate: '2026-10-26', fixed: [every('f1'), every('f2')], log: { '2026-10-26': ['f1', 'f2'] }, completedDates: ['2026-10-26'] });
  c.run('snapshotPlans()');
  c.run("state.fixed = state.fixed.filter((q) => q.id !== 'f2')");
  const past = c.call('fixedFor', '2026-10-26');
  assert.deepEqual(past.map((q) => q.id), ['f1', 'f2']);
  assert.equal(past[1].title, 'مهمة محذوفة');
  assert.equal(c.run("isComplete('2026-10-26')"), true);
  assert.deepEqual(c.call('fixedFor', TODAY).map((q) => q.id), ['f1']);
});

test('الذاكرة المؤقتة: نفس النتيجة، وتنمسح بعد الرسم', () => {
  const c = loadCore();
  withDays(c, days('2026-10-25', 3));
  c.run('calcMemo = {}');
  assert.equal(c.call('streakInfo').streak, 3);
  c.run("state.completedDates = []");
  assert.equal(c.call('streakInfo').streak, 3); // داخل نفس الرسم: من الذاكرة
  c.run('calcMemo = null');
  assert.equal(c.call('streakInfo').streak, 0);
  assert.equal(c.run('longestStreak()'), 0);
});

test('الإضافة السريعة: الصيغة العربية الكاملة', () => {
  const c = loadCore();
  const p = c.call('parseQuick', 'مهمة: مراجعة الكود الساعة 10 مساءً !A #ذكاء');
  assert.deepEqual(p, { kind: 'gate', rank: 'A', stat: 'INT', time: '22:00', date: TODAY, dateLabel: 'اليوم', title: 'مراجعة الكود', xp: 200 });
});

test('الإضافة السريعة: إنجليزي، يومي، وأرقام عربية', () => {
  const c = loadCore();
  const en = c.call('parseQuick', 'task: read 10 pages at 9pm #intellect daily');
  assert.equal(en.kind, 'fixed');
  assert.equal(en.time, '21:00');
  assert.equal(en.stat, 'INT');
  assert.equal(en.title, 'read 10 pages');
  assert.equal(en.xp, 30);
  const ar = c.call('parseQuick', 'قراءة بكرة الساعة ٩ صباحاً');
  assert.equal(ar.time, '09:00');
  assert.equal(ar.date, '2026-10-29');
  assert.equal(ar.title, 'قراءة');
  const d = c.call('parseQuick', 'يومي رياضة الساعة 6:30 م #قوة');
  assert.deepEqual([d.kind, d.time, d.stat, d.title], ['fixed', '18:30', 'STR', 'رياضة']);
  const pm = c.call('parseQuick', 'اجتماع 9:15');
  assert.deepEqual([pm.time, pm.title], ['09:15', 'اجتماع']);
});

test('الإضافة السريعة: يوم في الشهر، والرتبة تخليها بوابة حتى لو «يومي»', () => {
  const c = loadCore();
  assert.equal(c.call('parseQuick', 'تسليم المشروع يوم 5').date, '2026-11-05');
  assert.equal(c.call('parseQuick', 'تسليم يوم 30').date, '2026-10-30');
  const g = c.call('parseQuick', 'يومي مراجعة !B');
  assert.deepEqual([g.kind, g.rank, g.xp], ['gate', 'B', 120]);
});

test('الإضافة السريعة: بدون اسم ترجع null', () => {
  const c = loadCore();
  for (const t of ['', '   ', 'مهمة:', '!S', 'الساعة 9 مساءً #ذكاء']) assert.equal(c.call('parseQuick', t), null, t);
});

test('ملخص الأسبوع: الأيام المكتملة من الأيام اللي فيها مهام، والخبرة والتركيز', () => {
  const c = loadCore();
  // الأسبوع من الجمعة 16 إلى الخميس 22 أكتوبر. راحة يوم 18، والبداية 17
  const done = ['2026-10-17', '2026-10-19', '2026-10-20'];
  c.setState({
    startDate: '2026-10-17', fixed: [every('f1')], completedDates: done, restDays: ['2026-10-18'],
    log: Object.fromEntries(done.map((d) => [d, ['f1']])),
    xpByDate: { '2026-10-16': 5, '2026-10-17': 10, '2026-10-22': 20, '2026-10-23': 99 },
    rewards: { 'focus:a': { xp: 60, date: '2026-10-22' }, 'focus:b': { xp: 30, date: '2026-10-23' } }
  });
  c.run('snapshotPlans()');
  const w = c.call('weekSummary', '2026-10-16');
  assert.equal(w.range.length, 7);
  assert.equal(w.range[6], '2026-10-22');
  assert.equal(w.counted, 5); // 17 و19 إلى 22 (16 قبل البداية، و18 راحة)
  assert.equal(w.full, 3);
  assert.equal(w.xp, 35);
  assert.equal(w.focus, 20);
  assert.equal(c.run("weekStart('2026-10-22')"), '2026-10-16');
  assert.equal(c.run("weekStart('2026-10-16')"), '2026-10-16');
});

test('أسماء مدد المؤقت: لكل خيار اسم طويل وقصير', () => {
  const ar = loadCore();
  assert.deepEqual(JSON.parse(ar.run('JSON.stringify(TIMER_OPTS.map((m) => timerLabel(m)))')), ['15 دقيقة', '25 دقيقة', '45 دقيقة', 'ساعة (بومودورو)', 'ساعتين', '3 ساعات', '4 ساعات']);
  assert.deepEqual(JSON.parse(ar.run('JSON.stringify(TIMER_OPTS.map((m) => timerLabel(m, true)))')), ['15 د', '25 د', '45 د', 'ساعة', 'ساعتين', '3 ساعات', '4 ساعات']);
  const en = loadCore({ lang: 'en' });
  assert.deepEqual(JSON.parse(en.run('JSON.stringify(TIMER_OPTS.map((m) => timerLabel(m)))')), ['15 min', '25 min', '45 min', '1 hr (Pomodoro)', '2 hrs', '3 hrs', '4 hrs']);
  assert.deepEqual(JSON.parse(en.run('JSON.stringify(TIMER_OPTS.map((m) => timerLabel(m, true)))')), ['15m', '25m', '45m', '1h', '2h', '3h', '4h']);
});

test('مفاتيح التخزين من boot.js', () => {
  const c = loadCore();
  assert.equal(c.run('KEY'), 'hunterSystem_v6');
  assert.equal(c.run('THEME_KEY'), 'hunterTheme_v6');
  assert.throws(() => c.run("'use strict'; STORE_KEYS.state = 'x'"));
});


/* ===== ملاحظات المراجعة: مزامنة بطيئة، فشل النسخة الاحتياطية، منتصف الليل ===== */

test('مزامنة بطيئة: تعديل أثناء الرفع يبقى معلّق، وبدون تعديل يصير متزامن', () => {
  const c = loadCore();
  // rev=3 وقت بدء الرفع. المستخدم عدّل مرتين والطلب شغّال، فصار 5
  assert.deepEqual(c.call('afterPush', 'u1', 'T2', 3, 5), { uid: 'u1', at: 'T2', dirty: true });
  // ما عدّل: نظيف
  assert.deepEqual(c.call('afterPush', 'u1', 'T2', 3, 3), { uid: 'u1', at: 'T2', dirty: false });
});

test('نسخة الاسترجاع: تنحفظ وتنقرأ للتأكد (مؤكدة)، وتنزل كملف', () => {
  const c = loadCore();
  c.run('globalThis.dl = 0');
  assert.equal(c.run("saveRecoveryCopy(state, 'browser', () => { dl++; })"), 'saved');
  assert.equal(c.run('dl'), 1);
  const saved = JSON.parse(c.run('store.get(STORE_KEYS.conflictCopy)'));
  assert.equal(saved.side, 'browser');
  assert.equal(saved.state.version, 6);
});

test('نسخة الاسترجاع: فشل الحفظ المحلي والملف نزل = غير مؤكدة، لازم تأكيد منك', () => {
  const c = loadCore();
  c.failStorage();
  assert.equal(c.run("saveRecoveryCopy(state, 'account', () => {})"), 'downloaded');
});

test('نسخة الاسترجاع: الحفظ المحلي نجح لكن التنزيل فشل = مؤكدة', () => {
  const c = loadCore();
  assert.equal(c.run("saveRecoveryCopy(state, 'account', () => { throw new Error('blocked'); })"), 'saved');
});

test('نسخة الاسترجاع: لو الثنتين فشلوا = failed (ما نحذف شي)', () => {
  const c = loadCore();
  c.failStorage();
  assert.equal(c.run("saveRecoveryCopy(state, 'account', () => { throw new Error('blocked'); })"), 'failed');
});

test('نسخة الاسترجاع: بيانات أكبر من ميغا ما تنحفظ محلياً، فالتنزيل لازم ينجح', () => {
  const c = loadCore();
  c.run("state.name = 'x'.repeat(1.2e6)");
  assert.equal(c.run("saveRecoveryCopy(state, 'browser', () => { throw new Error('blocked'); })"), 'failed');
  assert.equal(c.run("saveRecoveryCopy(state, 'browser', () => {})"), 'downloaded'); // غير مؤكدة
  assert.equal(c.run('store.get(STORE_KEYS.conflictCopy)'), null);
});

test('منتصف الليل: لو نثبّت أمس قبل التعديل، تعديل المهمة ما يغيّر سجل أمس', () => {
  const c = loadCore({ today: '2026-10-27' });
  c.setState({ startDate: '2026-10-20', fixed: [every('f1'), every('f2')], completedDates: [], log: {} });
  c.run('snapshotPlans()'); // يثبّت لين أمس 26
  c.setToday('2026-10-28'); // عدّى منتصف الليل والتبويب كان نايم
  // أول تعديل: احذف f2. التطبيق ينادي snapshotPlans() قبل التغيير
  c.run("snapshotPlans(); state.fixed = state.fixed.filter((q) => q.id !== 'f2'); snapshotPlans();");
  assert.deepEqual(c.state().plans['2026-10-27'], ['f1', 'f2']);
  assert.deepEqual(c.call('fixedFor', '2026-10-27').map((q) => q.id), ['f1', 'f2']);
});

test('منتصف الليل: بدون تثبيت قبل التعديل، أمس يتغيّر (هذا الخطأ اللي سددناه)', () => {
  const c = loadCore({ today: '2026-10-27' });
  c.setState({ startDate: '2026-10-20', fixed: [every('f1'), every('f2')], completedDates: [], log: {} });
  c.run('snapshotPlans()');
  c.setToday('2026-10-28');
  c.run("state.fixed = state.fixed.filter((q) => q.id !== 'f2'); snapshotPlans();"); // الترتيب القديم
  assert.deepEqual(c.state().plans['2026-10-27'], ['f1']); // أمس خسر f2
});

test('منتصف الليل: مهمة يومية جديدة ما تنضاف لأمس لو ثبّتنا قبلها', () => {
  const c = loadCore({ today: '2026-10-27' });
  c.setState({ startDate: '2026-10-20', fixed: [every('f1')], completedDates: [], log: {} });
  c.run('snapshotPlans()');
  c.setToday('2026-10-28');
  c.run("snapshotPlans(); state.fixed.push({ id: 'f9', title: 'new', stat: 'STR', xp: 30, time: '09:00', days: [] });");
  assert.deepEqual(c.call('fixedFor', '2026-10-27').map((q) => q.id), ['f1']);
  assert.deepEqual(c.call('fixedFor', '2026-10-28').map((q) => q.id), ['f1', 'f9']);
});
