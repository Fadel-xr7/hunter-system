// تسجيل الخروج مع المكتبة الحقيقية (docs/vendor/supabase.js) وطلبات شبكة معترَضة.
// الفرق عن الـ Supabase الوهمي: المكتبة الحقيقية لما يفشل /logout تمسح الجلسة المحلية وترجع error،
// ولما تفشل قبل ما توصل للسيرفر (جلسة منتهية وتجديدها فشل) ترجع error والجلسة باقية.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, buildSeed, pageState, until, TODAY } from './harness.mjs';
import { mockSupabase, realUserSeed, TOKEN_KEY, ACCESS, REFRESH, session } from './real-supabase.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const COPY = JSON.stringify({ at: '2026-10-27T20:00:00.000Z', side: 'browser', state: { totalXp: 999 } });
const task = (page, title) => page.locator('#taskList button.task', { hasText: title }).first();

/** يفتح الموقع بالمكتبة الحقيقية وحساب مزامنته نظيفة، وينجز مهمة (فيصير فيه تعديل ما ترفع) */
async function setup({ logout, refresh } = {}) {
  const seed = buildSeed();
  const ctx = await newContext(browser, { realLib: true, seed: { ...realUserSeed(seed), hunterConflictCopy_v6: JSON.parse(COPY) } });
  const api = await mockSupabase(ctx, { rows: { u_test: { data: seed, updated_at: 'U0' } }, logout, refresh });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(500);
  assert.ok(await until(page, () => document.getElementById('syncChip').dataset.state === 'ok'), 'دخل ومتزامن بالمكتبة الحقيقية');
  await task(page, 'مذاكرة بتركيز ساعة').click();
  return { ctx, api, page, seed };
}
async function signOutFlow(page) {
  await page.click('#cloudBtn');
  await page.click('#accOut');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.clock.runFor(2000); // ساعة الصفحة واقفة: نخلي الرفع والخروج يكملون
}
// تجديد الجلسة الفاشل تعيده المكتبة بتأخير متصاعد (لين 30 ثانية تقريبًا)، فنحرّك ساعة الصفحة لين يجي الرد
async function advanceUntil(page, fn, maxSec = 60) {
  for (let t = 0; t < maxSec; t += 2) {
    if (await page.evaluate(fn)) return true;
    await page.clock.runFor(2000); await page.waitForTimeout(30);
  }
  return page.evaluate(fn);
}
const snap = (page) => page.evaluate((TK) => {
  const all = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); all[k] = localStorage.getItem(k); }
  return {
    copy: all.hunterConflictCopy_v6 ?? null, meta: all.hunterSync_v6 ?? null, session: all[TK] ?? null,
    needAuth: document.documentElement.classList.contains('need-auth'),
    accOutHidden: document.getElementById('accOut').hidden, chipHidden: document.getElementById('syncChip').hidden,
    all
  };
}, TOKEN_KEY);
// التوكن ما ينحفظ إلا في مفتاح المكتبة نفسه: أي مفتاح ثاني فيه التوكن = تخزين إضافي
const tokenLeaks = (s) => Object.entries(s.all).filter(([k, v]) => k !== TOKEN_KEY && (String(v).includes(REFRESH) || String(v).includes(ACCESS)) ).map(([k]) => k);
const notice = (page) => page.locator('#confirmDialog[open] #confirmText').textContent();

test('الجلسة باقية (التجديد فشل قبل ما يوصل للسيرفر): البيانات ونسخة الاسترجاع باقية، والتحذير يظهر', async () => {
  const { ctx, api, page, seed } = await setup({ refresh: 'abort' });
  // الجلسة انتهت: المكتبة تحاول تجددها قبل الخروج، والتجديد ينقطع
  await page.evaluate(([k, exp]) => { const s = JSON.parse(localStorage.getItem(k)); s.expires_at = exp; localStorage.setItem(k, JSON.stringify(s)); }, [TOKEN_KEY, Math.floor(new Date('2026-10-28T08:00:00+03:00').getTime() / 1000)]);
  await signOutFlow(page);
  assert.ok(await advanceUntil(page, () => document.getElementById('toasts').textContent.includes('ما قدرنا ننهي الجلسة')), 'طلع تحذير');
  const s = await snap(page);
  assert.equal(s.needAuth, false, 'ما رجعت شاشة الدخول');
  assert.equal(s.copy, COPY, 'نسخة الاسترجاع باقية');
  assert.ok(s.meta, 'حالة المزامنة باقية');
  assert.ok(s.session, 'الجلسة المحلية باقية');
  assert.equal(s.accOutHidden, false, 'زر الخروج للحين ظاهر');
  const local = await pageState(page);
  assert.ok(local.totalXp >= seed.totalXp && local.log[TODAY].includes('f_study'), 'بيانات المتصفح باقية (بما فيها آخر تعديل)');
  assert.equal(await page.locator('#confirmDialog[open]').count(), 0, 'ما طلعت رسالة «الخروج المحلي تم»');
  assert.ok(api.calls.some((c) => c.path === '/auth/v1/token'), 'جرّبت تجدد الجلسة');
  assert.ok(!api.calls.some((c) => c.path === '/auth/v1/logout'), 'ما وصلت لطلب الإلغاء');
  assert.deepEqual(tokenLeaks(s), []);
  await ctx.close();
});

for (const [label, logout] of [['انقطاع الشبكة', 'abort'], ['خطأ 500 من السيرفر', 500]]) {
  test(`فشل /logout (${label}) والمكتبة مسحت الجلسة محليًا: خروج محلي وتنظيف، ورسالة إن الإلغاء ما تأكد`, async () => {
    const { ctx, api, page } = await setup({ logout });
    await signOutFlow(page);
    assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')), 'رجعت شاشة الدخول');
    const s = await snap(page);
    // التعديل انرفع قبل الخروج (قبل ما نمسح شي)
    const pushIdx = api.calls.findIndex((c) => c.method === 'PATCH');
    const outIdx = api.calls.findIndex((c) => c.path === '/auth/v1/logout');
    assert.ok(pushIdx >= 0 && outIdx > pushIdx, 'الرفع صار قبل طلب الإلغاء');
    assert.ok(api.rows.u_test.data.log[TODAY].includes('f_study'), 'آخر تعديل في الحساب');
    // التنظيف
    assert.equal(s.copy, null, 'نسخة الاسترجاع انمسحت');
    assert.equal(s.meta, null, 'حالة المزامنة انمسحت');
    assert.equal(s.session, null, 'الجلسة المحلية انمسحت (المكتبة)');
    assert.equal((await pageState(page)).totalXp, 0, 'بيانات هذا المتصفح انمسحت');
    assert.deepEqual(tokenLeaks(s), [], 'ما فيه توكن في أي تخزين ثاني');
    // واجهة الحساب والمزامنة
    assert.equal(s.accOutHidden, true, 'زر الخروج اختفى');
    assert.equal(s.chipHidden, true, 'شارة المزامنة اختفت');
    const before = api.calls.length;
    await page.clock.runFor(60_000); await page.waitForTimeout(200);
    assert.equal(api.calls.length, before, 'المزامنة وقفت: ما فيه طلبات بعد الخروج');
    // الرسالة: الخروج المحلي تم، والإلغاء ما تأكد، وما فيه إعادة محاولة
    const msg = await notice(page);
    assert.match(msg, /خرجت من هذا المتصفح/);
    assert.match(msg, /ما تأكدنا إن جلستك انلغت في الخوادم/);
    assert.match(msg, /لا تعتبر الجلسة ملغاة/);
    assert.doesNotMatch(msg, /حاول مرة ثانية|أعد المحاولة/);
    assert.deepEqual(page.errors.filter((e) => !/Failed to load resource|ERR_FAILED|status of 500/.test(e)), []);
    await ctx.close();
  });
}

// المكتبة ترجع error: null للحالتين، فالموقع يسوي خروج وتنظيف محلي عادي. مع 401 هذا ما يثبت إن السيرفر ألغى كل الجلسات
// (معناه بس إن التوكن اللي أرسلناه مرفوض)، والموقع ما يدّعي الإلغاء: ما يطلع أي رسالة عن الخوادم.
for (const [label, logout] of [['204', 'ok'], ['401 (المكتبة تعتبره نجاح، وهذا ما يثبت إلغاء جلسات السيرفر)', 401]]) {
  test(`/logout يرد ${label}: خروج وتنظيف محلي، بدون رسالة`, async () => {
    const { ctx, page } = await setup({ logout });
    await signOutFlow(page);
    assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')));
    const s = await snap(page);
    assert.equal(s.copy, null); assert.equal(s.meta, null); assert.equal(s.session, null);
    assert.equal(await page.locator('#confirmDialog[open]').count(), 0, 'ما طلعت رسالة');
    assert.deepEqual(tokenLeaks(s), []);
    await ctx.close();
  });
}

test('أثناء انتظار /logout: مؤشر «جاري تسجيل الخروج…»، الضغطة الثانية ما تكرر، والتعديل ما ينمسح وينرفع بعد الدخول', async () => {
  const { ctx, api, page } = await setup({ logout: 'ok' });
  api.logoutDelayMs = 2500;
  await page.click('#cloudBtn');
  await page.click('#accOut');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.clock.runFor(200);
  // ننتظر لين يبدأ طلب /logout (بعد رفع التعديل الأول)
  for (let i = 0; i < 100 && !api.calls.some((c) => c.path === '/auth/v1/logout'); i++) await page.waitForTimeout(20);
  assert.ok(api.calls.some((c) => c.path === '/auth/v1/logout'), 'بدأ طلب الإلغاء');
  assert.ok(api.rows.u_test.data.log[TODAY].includes('f_study'), 'التعديل اللي قبل الخروج انرفع');

  // المؤشر
  assert.equal(await page.locator('#syncChip').textContent(), 'جاري تسجيل الخروج…');
  assert.equal(await page.locator('#syncChip').getAttribute('data-state'), 'busy');
  assert.equal(await page.locator('#cloudBtn').isDisabled(), true, 'زر الحساب متعطل');
  // ضغطة ثانية (حتى لو وصلت للزر مباشرة) ما تبدأ خروج ثاني ولا تفتح تأكيد
  await page.evaluate(() => document.getElementById('accOut').click());
  assert.equal(await page.locator('#confirmDialog[open]').count(), 0, 'ما انفتح تأكيد ثاني');

  // تعديل أثناء الانتظار
  await task(page, 'النوم قبل 12').click();
  assert.equal(await page.locator('#syncChip').textContent(), 'جاري تسجيل الخروج…', 'المؤشر باقي بعد التعديل');

  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth'), 6000), 'رجعت شاشة الدخول');
  const s = await snap(page);
  assert.equal(api.calls.filter((c) => c.path === '/auth/v1/logout').length, 1, 'طلب /logout واحد بس');
  assert.equal(s.session, null, 'الجلسة المحلية انمسحت');
  // ما انمسح شي: التعديل وحالة المزامنة ونسخة الاسترجاع باقية في المتصفح
  const local = await pageState(page);
  assert.ok(local.log[TODAY].includes('f_sleep'), 'التعديل باقي في الصفحة');
  assert.ok(JSON.parse(s.all.hunterSystem_v6).log[TODAY].includes('f_sleep'), 'التعديل محفوظ في المتصفح');
  assert.equal(JSON.parse(s.meta).dirty, true, 'معلّم إنه ما انرفع');
  assert.equal(s.copy, COPY, 'نسخة الاسترجاع باقية');
  assert.ok(!api.rows.u_test.data.log[TODAY].includes('f_sleep'), 'التعديل ما وصل الحساب');
  assert.equal(s.accOutHidden, true, 'واجهة الحساب تحدّثت');
  assert.deepEqual(tokenLeaks(s), []);
  const msg = await notice(page);
  assert.match(msg, /صار تعديل أثناء الخروج وما تأكدنا إنه انحفظ/);
  assert.match(msg, /تعديلاتك باقية في هذا المتصفح\. سجّل دخولك للحساب نفسه لإكمال المزامنة، وقد نطلب منك اختيار النسخة إذا تغيّرت بيانات الحساب من جهاز آخر\./);
  assert.doesNotMatch(msg, /يترفع/, 'ما نوعد إنه يترفع بدون سؤال');
  assert.doesNotMatch(msg, /انلغت في الخوادم/, '/logout نجح، فما فيه ملاحظة عن الإلغاء');
  // المزامنة وقفت: ما فيه رفع بعد الخروج
  const n = api.calls.length;
  await page.clock.runFor(30_000); await page.waitForTimeout(200);
  assert.equal(api.calls.length, n, 'ما فيه طلبات بعد الخروج');
  assert.equal(await page.locator('#cloudBtn').isDisabled(), false, 'زر الحساب رجع يشتغل');

  // الدخول من جديد بنفس الحساب: التعديل يترفع
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.fill('#aEmail', 'hunter@example.com');
  await page.fill('#aPw', 'password123');
  await page.locator('#authForm button[type="submit"]').click();
  for (let i = 0; i < 150 && !api.rows.u_test.data.log[TODAY].includes('f_sleep'); i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  assert.ok(api.rows.u_test.data.log[TODAY].includes('f_sleep'), 'التعديل انرفع بعد الدخول');
  assert.ok(await until(page, () => JSON.parse(localStorage.getItem('hunterSync_v6')).dirty === false), 'المزامنة نظيفة');
  await ctx.close();
});

test('تعديل معلّق لحساب A بعد الخروج: الدخول بحساب B ما يرفعه ولا يخلطه، والدخول بـ A يرفعه', async () => {
  const { ctx, api, page } = await setup({ logout: 'ok' });
  api.logoutDelayMs = 1500;
  await page.click('#cloudBtn');
  await page.click('#accOut');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.clock.runFor(200);
  for (let i = 0; i < 100 && !api.calls.some((c) => c.path === '/auth/v1/logout'); i++) await page.waitForTimeout(20);
  await task(page, 'النوم قبل 12').click(); // تعديل أثناء الانتظار: يبقى معلّق لحساب A
  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth'), 5000));
  assert.match(await notice(page), /تعديلاتك باقية في هذا المتصفح/);
  const meta = JSON.parse(await page.evaluate(() => localStorage.getItem('hunterSync_v6')));
  assert.deepEqual([meta.uid, meta.dirty, meta.email], ['u_test', true, 'hunter@example.com'], 'المعلّق مربوط بحساب A');
  await page.locator('#confirmDialog[open] #confirmOk').click();

  // حساب B جديد (ما عنده صف في الجدول)
  api.logoutDelayMs = 0;
  const before = api.calls.length;
  await page.fill('#aEmail', 'other@example.com');
  await page.fill('#aPw', 'password123');
  await page.locator('#authForm button[type="submit"]').click();
  for (let i = 0; i < 30; i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  const after = api.calls.slice(before);
  assert.ok(!after.some((c) => c.path === '/rest/v1/hunter_state'), 'ما فيه أي قراءة أو رفع لجدول البيانات بحساب B');
  assert.equal(api.rows.u_other, undefined, 'ما انكتب صف لحساب B');
  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')), 'رجع لشاشة الدخول');
  const s = await snap(page);
  assert.equal(s.session, null, 'جلسة B انمسحت من المتصفح');
  assert.ok(after.some((c) => c.path === '/auth/v1/logout'), 'طلبنا إنهاء جلسة B');
  const msg = await notice(page);
  assert.match(msg, /تعديلات ما انحفظت لحساب ثاني \(hunter@example\.com\)/);
  assert.match(msg, /ما رفعناها لهذا الحساب ولا خلطناها فيه/);
  // بيانات A المعلّقة باقية مثل ما هي
  assert.ok(JSON.parse(s.all.hunterSystem_v6).log[TODAY].includes('f_sleep'), 'تعديل A باقي في المتصفح');
  assert.deepEqual(JSON.parse(s.meta), meta, 'حالة المزامنة ما تغيّرت');
  assert.ok(!api.rows.u_test.data.log[TODAY].includes('f_sleep'), 'وما وصل حساب A للحين');
  // بعد وقت، للحين ما فيه أي طلب للجدول
  await page.clock.runFor(30_000); await page.waitForTimeout(100);
  assert.ok(!api.calls.slice(before).some((c) => c.path === '/rest/v1/hunter_state'));

  // الدخول بحساب A: التعديل يترفع لحسابه
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.fill('#aEmail', 'hunter@example.com');
  await page.fill('#aPw', 'password123');
  await page.locator('#authForm button[type="submit"]').click();
  for (let i = 0; i < 150 && !api.rows.u_test.data.log[TODAY].includes('f_sleep'); i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  assert.ok(api.rows.u_test.data.log[TODAY].includes('f_sleep'), 'التعديل انرفع لحساب A');
  assert.equal(api.rows.u_other, undefined, 'وحساب B للحين ما فيه شي');
  assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
  await ctx.close();
});

/** خروج A مع تعديل أثناء انتظار /logout: يبقى معلّق لحساب A في المتصفح، والصفحة على شاشة الدخول */
async function leavePendingA() {
  const r = await setup({ logout: 'ok' });
  const { api, page } = r;
  api.logoutDelayMs = 1500;
  await page.click('#cloudBtn');
  await page.click('#accOut');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.clock.runFor(200);
  for (let i = 0; i < 100 && !api.calls.some((c) => c.path === '/auth/v1/logout'); i++) await page.waitForTimeout(20);
  await task(page, 'النوم قبل 12').click();
  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth'), 5000));
  await page.locator('#confirmDialog[open] #confirmOk').click();
  api.logoutDelayMs = 0;
  r.saved = await page.evaluate(() => ({ data: localStorage.getItem('hunterSystem_v6'), meta: localStorage.getItem('hunterSync_v6') }));
  assert.ok(JSON.parse(r.saved.data).log[TODAY].includes('f_sleep'));
  return r;
}
// الضيف ما يشوف بيانات A ولا يعدّلها: شاشة الدخول باقية، والمهام مخفية، والتخزين ما تغيّر
async function assertLocked(page, saved, why) {
  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')), why + ': شاشة الدخول باقية');
  assert.equal(await page.locator('#view-today').isVisible(), false, why + ': صفحة المهام مخفية');
  assert.equal(await page.locator('#taskList button.task').first().isVisible().catch(() => false), false, why + ': ولا مهمة ظاهرة');
  const now = await page.evaluate(() => ({ data: localStorage.getItem('hunterSystem_v6'), meta: localStorage.getItem('hunterSync_v6'), guest: localStorage.getItem('hunterGuest_v6') }));
  assert.equal(now.data, saved.data, why + ': بيانات A ما تغيّرت');
  assert.equal(now.meta, saved.meta, why + ': حالة مزامنة A ما تغيّرت');
  const msg = await notice(page);
  assert.match(msg, /تعديلات ما انحفظت لحساب \(hunter@example\.com\)/, why);
  assert.match(msg, /ما نقدر نفتح النظام كضيف/, why);
  return now;
}

test('تعديل معلّق لحساب: زر «كمّل كضيف» ما يفتح بياناته، وإعادة التحميل ما تفتحها، ودخول نفس الحساب يكمل المزامنة', async () => {
  const { ctx, api, page, saved } = await leavePendingA();

  // 1) الضغط على «كمّل كضيف»
  await page.click('#guestBtn');
  await page.clock.runFor(200);
  const s1 = await assertLocked(page, saved, 'الزر');
  assert.equal(s1.guest, null, 'ما تفعّل وضع الضيف');

  // 2) إعادة التحميل وهو على وضع الضيف (مثلاً اختاره قبل في نسخة أقدم): للحين مقفول
  await page.evaluate(() => localStorage.setItem('hunterGuest_v6', '1'));
  // لحظة أول رسم للمهام: لازم شاشة الدخول تكون فوقها من البداية (boot.js)، مو بعد ما يرد Supabase
  await ctx.addInitScript(() => {
    window.__lockedAtFirstRender = null;
    new MutationObserver((_, o) => {
      const t = document.getElementById('taskList');
      if (t && t.children.length) { window.__lockedAtFirstRender = document.documentElement.classList.contains('need-auth'); o.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await page.clock.runFor(500);
  assert.equal(await page.evaluate(() => window.__lockedAtFirstRender), true, 'شاشة الدخول من أول رسم، بدون ما تبان البيانات');
  await assertLocked(page, saved, 'إعادة التحميل مع وضع الضيف');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  // ضغط الزر بعد إعادة التحميل
  await page.click('#guestBtn');
  await page.clock.runFor(200);
  await assertLocked(page, saved, 'الزر بعد إعادة التحميل');
  await page.locator('#confirmDialog[open] #confirmOk').click();

  // 3) إعادة التحميل بدون وضع الضيف: نفس الشي
  await page.evaluate(() => localStorage.removeItem('hunterGuest_v6'));
  await page.reload();
  await page.clock.runFor(500);
  await assertLocked(page, saved, 'إعادة التحميل بدون وضع الضيف');
  await page.locator('#confirmDialog[open] #confirmOk').click();

  // 4) دخول نفس الحساب يفتح ويكمل المزامنة
  await page.fill('#aEmail', 'hunter@example.com');
  await page.fill('#aPw', 'password123');
  await page.locator('#authForm button[type="submit"]').click();
  for (let i = 0; i < 150 && !api.rows.u_test.data.log[TODAY].includes('f_sleep'); i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  assert.ok(api.rows.u_test.data.log[TODAY].includes('f_sleep'), 'التعديل انرفع لحساب A');
  assert.ok(await until(page, () => !document.documentElement.classList.contains('need-auth')), 'انفتح بعد دخول A');
  assert.ok(await until(page, () => JSON.parse(localStorage.getItem('hunterSync_v6')).dirty === false), 'المزامنة نظيفة');
  assert.deepEqual(page.errors.filter((e) => !/Failed to load resource/.test(e)), []);
  await ctx.close();
});

test('تعديل معلّق لحساب: الدخول بحساب ثاني ما يفك القفل، ولا ينفتح كضيف بعده', async () => {
  const { ctx, api, page, saved } = await leavePendingA();
  await page.fill('#aEmail', 'other@example.com');
  await page.fill('#aPw', 'password123');
  await page.locator('#authForm button[type="submit"]').click();
  for (let i = 0; i < 30; i++) { await page.clock.runFor(100); await page.waitForTimeout(20); }
  assert.equal(api.rows.u_other, undefined, 'ما انكتب شي لحساب B');
  assert.match(await notice(page), /لحساب ثاني \(hunter@example\.com\)/);
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.click('#guestBtn');
  await page.clock.runFor(200);
  await assertLocked(page, saved, 'ضيف بعد محاولة حساب B');
  await page.reload();
  await page.clock.runFor(500);
  await assertLocked(page, saved, 'إعادة التحميل بعد محاولة حساب B');
  await ctx.close();
});
