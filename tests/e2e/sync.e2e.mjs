// المزامنة مع Supabase (وهمي): التعديل أثناء الرفع ما يضيع، والتعارض ما يحذف شي بدون نسخة مؤكدة.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, userSeed, buildSeed, pageState, serverRows, until, TODAY } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const task = (page, title) => page.locator('#taskList button.task', { hasText: title }).first();

test('مزامنة بطيئة: تعديل وقت الرفع ينرفع بعده، ما يضيع', async () => {
  const seed = buildSeed();
  const ctx = await newContext(browser, { seed: userSeed({ state: seed }) });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(500);
  // أول دخول: ما فيه صف في السحابة، فيرفع المحلي
  let rows = await serverRows(page);
  assert.ok(rows.u_test, 'انرفع أول صف');
  assert.equal(await page.locator('#syncChip').getAttribute('data-state'), 'ok');

  // الرفع ياخذ 3 ثواني. ننجز مهمة، وأول ما يبدأ رفعها ننجز الثانية
  await page.evaluate(() => localStorage.setItem('__delay', '3000'));
  await task(page, 'مذاكرة بتركيز ساعة').click();
  await page.clock.runFor(1600); // بدأ رفع المهمة الأولى
  await task(page, 'النوم قبل 12').click();
  rows = await serverRows(page);
  assert.deepEqual(rows.u_test.data.log[TODAY], ['f_train'], 'الرفع الأول للحين ما وصل');

  await page.clock.runFor(10_000);
  rows = await serverRows(page);
  const local = await pageState(page);
  assert.deepEqual(rows.u_test.data.log[TODAY].slice().sort(), ['f_sleep', 'f_study', 'f_train'], 'المهمة الثانية انرفعت بعد الأولى');
  assert.equal(rows.u_test.data.totalXp, local.totalXp);
  assert.ok(rows.u_test.data.completedDates.includes(TODAY));
  const meta = JSON.parse(await page.evaluate(() => localStorage.getItem('hunterSync_v6')));
  assert.equal(meta.dirty, false);
  assert.equal(meta.at, rows.u_test.updated_at);
  assert.equal(await page.locator('#syncChip').getAttribute('data-state'), 'ok');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('تعارض بين جهازين: لو ما انحفظت نسخة مؤكدة، ما ينحذف شي', async () => {
  const seed = buildSeed();
  const other = { ...seed, totalXp: 50, name: 'جهاز ثاني' };
  const ctx = await newContext(browser, {
    seed: {
      ...userSeed({ state: seed, row: { data: other, updated_at: '2026-10-28T09:00:00.000Z' } }),
      // هذا المتصفح عنده تعديلات ما ترفعت، والسحابة تغيّرت من جهاز ثاني بعد آخر مزامنة
      hunterSync_v6: { uid: 'u_test', at: '2026-10-27T09:00:00.000Z', dirty: true }
    }
  });
  // المتصفح ما يقدر يحفظ نسخة التعارض (مساحة ممتلئة)
  await ctx.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'hunterConflictCopy_v6') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
  });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(300);
  await assert.doesNotReject(page.locator('#chooseDialog[open]').waitFor());

  // نختار «اللي في حسابي»: لازم ينزل ملف نسخة من هذا المتصفح، ويسأل قبل ما يحذف
  const dl = page.waitForEvent('download');
  await page.click('#chooseA');
  const file = await dl;
  assert.match(file.suggestedFilename(), /^hunter-browser-copy-2026-10-28\.json$/);
  await page.locator('#confirmDialog[open] #confirmText', { hasText: 'فنزّلنا ملف' }).waitFor();
  assert.match(await page.locator('#confirmOk').textContent(), /الملف موجود، كمّل/);

  // نلغي: ولا طرف ينحذف
  await page.locator('#confirmDialog button[value="cancel"]').click();
  assert.ok(await until(page, () => document.getElementById('toasts').textContent.includes('ما غيّرنا شي في بياناتك')));
  const local = await pageState(page);
  assert.equal(local.totalXp, seed.totalXp, 'بيانات هذا المتصفح باقية');
  assert.equal((await serverRows(page)).u_test.data.totalXp, 50, 'بيانات الحساب باقية');
  assert.equal(await page.locator('#syncChip').getAttribute('data-state'), 'warn');
  await ctx.close();
});

// الخروج: نسخة الاسترجاع فيها بيانات الحساب، فتنمسح مع باقي بيانات الحساب. بس لو الخروج وقف (الرفع فشل) تبقى.
async function signOutFlow(page) {
  await page.click('#cloudBtn');
  await page.click('#accOut');
  await page.locator('#confirmDialog[open] #confirmOk').click();
  await page.clock.runFor(2000); // ساعة الصفحة واقفة: نخلي الرفع والخروج يكملون
}
const COPY = JSON.stringify({ at: '2026-10-27T20:00:00.000Z', side: 'browser', state: { totalXp: 999 } });

test('تسجيل الخروج الناجح يمسح نسخة الاسترجاع (hunterConflictCopy_v6)', async () => {
  const seed = buildSeed();
  const ctx = await newContext(browser, { seed: { ...userSeed({ state: seed }), hunterConflictCopy_v6: JSON.parse(COPY) } });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(500);
  assert.equal(await page.evaluate(() => localStorage.getItem('hunterConflictCopy_v6')), COPY, 'النسخة موجودة قبل الخروج');
  await task(page, 'مذاكرة بتركيز ساعة').click(); // تعديل ما ترفع، فالخروج يرفعه أول
  await signOutFlow(page);
  assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')), 'رجعت شاشة الدخول');
  const ls = await page.evaluate(() => ({ copy: localStorage.getItem('hunterConflictCopy_v6'), meta: localStorage.getItem('hunterSync_v6'), token: localStorage.getItem('sb-fake-auth-token') }));
  assert.equal(ls.copy, null, 'نسخة الاسترجاع انمسحت');
  assert.equal(ls.meta, null);
  assert.equal(ls.token, null, 'الجلسة انتهت');
  assert.deepEqual((await serverRows(page)).u_test.data.log[TODAY].slice().sort(), ['f_study', 'f_train'], 'آخر تعديل انرفع قبل الخروج');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('لو الخروج وقف لأن الرفع فشل، نسخة الاسترجاع والبيانات والجلسة باقية', async () => {
  const seed = buildSeed();
  const ctx = await newContext(browser, { seed: { ...userSeed({ state: seed }), hunterConflictCopy_v6: JSON.parse(COPY) } });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(500);
  await page.evaluate(() => localStorage.setItem('__failWrites', '1'));
  await task(page, 'مذاكرة بتركيز ساعة').click();
  await signOutFlow(page);
  assert.ok(await until(page, () => document.getElementById('toasts').textContent.includes('ما قدرنا نرفع آخر تعديلاتك')), 'طلع تحذير فشل الرفع');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('need-auth')), false, 'ما طلع من الحساب');
  const ls = await page.evaluate(() => ({ copy: localStorage.getItem('hunterConflictCopy_v6'), meta: JSON.parse(localStorage.getItem('hunterSync_v6')), token: localStorage.getItem('sb-fake-auth-token') }));
  assert.equal(ls.copy, COPY, 'نسخة الاسترجاع باقية');
  assert.equal(ls.meta.dirty, true, 'التعديل للحين ينتظر الرفع');
  assert.ok(ls.token, 'الجلسة باقية');
  assert.deepEqual((await pageState(page)).log[TODAY].slice().sort(), ['f_study', 'f_train'], 'بيانات المتصفح باقية');
  await ctx.close();
});

for (const mode of ['error', 'throw']) {
  test(`لو إنهاء الجلسة فشل (${mode === 'error' ? 'خطأ راجع من Supabase' : 'استثناء'}): ما ينمسح شي، والمحاولة الثانية تكمل`, async () => {
    const seed = buildSeed();
    const ctx = await newContext(browser, { seed: { ...userSeed({ state: seed }), hunterConflictCopy_v6: JSON.parse(COPY) } });
    const page = await openPage(ctx, srv.url);
    await page.clock.runFor(500);
    await page.evaluate((m) => localStorage.setItem('__failSignOut', m), mode);
    await signOutFlow(page);
    assert.ok(await until(page, () => document.getElementById('toasts').textContent.includes('ما قدرنا ننهي الجلسة')), 'طلع تحذير');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('need-auth')), false, 'ما رجعت شاشة الدخول');
    const ls = await page.evaluate(() => ({ copy: localStorage.getItem('hunterConflictCopy_v6'), meta: localStorage.getItem('hunterSync_v6'), name: localStorage.getItem('hunterNameAsked_v6') }));
    assert.equal(ls.copy, COPY, 'نسخة الاسترجاع باقية');
    assert.ok(ls.meta, 'حالة المزامنة باقية');
    assert.equal(ls.name, '1');
    const local = await pageState(page);
    assert.equal(local.totalXp, seed.totalXp, 'بيانات المتصفح باقية');

    // المحاولة الثانية تنجح: الحين ينمسح كل شي
    await page.evaluate(() => localStorage.removeItem('__failSignOut'));
    await signOutFlow(page);
    assert.ok(await until(page, () => document.documentElement.classList.contains('need-auth')), 'المحاولة الثانية طلّعته');
    assert.equal(await page.evaluate(() => localStorage.getItem('hunterConflictCopy_v6')), null);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}
