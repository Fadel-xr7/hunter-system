// منتصف الليل والتبويب نايم: أول ما ترجع للصفحة يطلع اليوم الجديد، وأمس ينحفظ مثل ما كان.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const task = (page, title) => page.locator('#taskList button.task', { hasText: title }).first();

for (const theme of ['anime', 'ink']) {
  test(`الرجوع للصفحة بعد منتصف الليل (${theme})`, async () => {
    const ctx = await newContext(browser, { theme, seed: guestSeed(buildSeed()) });
    const page = await openPage(ctx, srv.url, { time: new Date('2026-10-28T23:50:00+03:00') });
    await page.clock.runFor(200);
    // نكمّل اليوم قبل منتصف الليل
    await task(page, 'مذاكرة بتركيز ساعة').click();
    await task(page, 'النوم قبل 12').click();
    await page.clock.runFor(200);
    const before = await pageState(page);
    assert.ok(before.completedDates.includes('2026-10-28'));
    const streak = await page.evaluate(() => streakInfo().streak);

    // التبويب نام: الوقت مشى للصبح وما اشتغل أي مؤقت في الصفحة
    await page.clock.setSystemTime(new Date('2026-10-29T08:00:00+03:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    // على طول، قبل ما يشتغل مؤقت الثانية: الصفحة على اليوم الجديد
    const s = await pageState(page);
    assert.deepEqual(s.plans['2026-10-28'], ['f_train', 'f_study', 'f_sleep'], 'لقطة أمس انحفظت');
    assert.equal(await page.locator('#taskList button.task.done').count(), 0, 'مهام اليوم الجديد ما انحسب منها شي');
    assert.match(await page.locator('#taskCount').textContent(), theme === 'anime' ? /29/ : /0 من 4/);

    // نحذف مهمة يومية الصبح: أمس يبقى مكتمل والسلسلة ما تنكسر
    await page.click('#editBtn');
    const row = page.locator('#taskList li', { hasText: 'النوم قبل 12' });
    await row.locator('.row-tools .mini.danger').click();
    await page.click('#confirmOk');
    await page.clock.runFor(100);
    const after = await pageState(page);
    assert.ok(after.completedDates.includes('2026-10-28'), 'أمس للحين مكتمل');
    assert.equal(await page.evaluate(() => streakInfo().streak), streak);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}
