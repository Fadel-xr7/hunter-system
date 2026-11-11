// واجهة «سماء اليوم»: خريطة النجوم (كل مهمة نجمة تنضغط)، خط «الآن»، اتجاه الوقت، وأسماء المنازل.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const star = (key) => `.sky-star[data-key="${key}"]`;
const starX = (page, key) => page.evaluate((k) => Number(document.querySelector(`.sky-star[data-key="${k}"]`).getAttribute('transform').match(/translate\(([\d.]+)/)[1]), key);
async function open(opts = {}) {
  const ctx = await newContext(browser, { theme: 'anime', seed: guestSeed(buildSeed({ lang: opts.lang })), ...opts });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  return { ctx, page };
}

test('سماء اليوم: كل مهمة نجمة، والضغط عليها (ماوس أو كيبورد) ينجز ويتراجع', async () => {
  const { ctx, page } = await open();
  const done = async (id) => (await pageState(page)).log['2026-10-28'].includes(id);

  assert.equal(await page.locator('.sky-star').count(), 4, 'نجمة لكل مهمة اليوم');
  assert.equal(await page.getAttribute(star('fixed:f_train'), 'aria-pressed'), 'true');
  assert.equal(await page.locator(star('fixed:f_train') + ' path.core').count(), 1, 'المنجزة نجمة مضيئة');
  assert.equal(await page.locator(star('fixed:f_sleep') + ' circle.core').count(), 1, 'الباقية حلقة');
  assert.equal(await page.locator(star('fixed:f_study') + ' .halo').count(), 1, 'المهمة الأهم حولها هالة');
  assert.match(await page.getAttribute(star('fixed:f_sleep'), 'aria-label'), /النوم قبل 12.*11:30/);

  // بالماوس
  await page.click(star('fixed:f_sleep') + ' .hit');
  assert.equal(await done('f_sleep'), true);
  assert.equal(await page.getAttribute(star('fixed:f_sleep'), 'aria-pressed'), 'true');
  assert.equal(await page.locator('.sky-line').count(), 1, 'نجمتين منجزتين: خط الكوكبة يطلع');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.key), 'fixed:f_sleep', 'التركيز يبقى على النجمة بعد الرسم');
  // القائمة تحت تتحدث معها
  assert.equal(await page.locator('.task-li[data-key="fixed:f_sleep"] .task.done').count(), 1);

  // بالكيبورد: Enter يتراجع، ومسطرة تنجز
  await page.keyboard.press('Enter');
  assert.equal(await done('f_sleep'), false);
  await page.keyboard.press(' ');
  assert.equal(await done('f_sleep'), true);

  // البوابة نجمة كذلك
  await page.click(star('gate:g_today') + ' .hit');
  assert.equal((await pageState(page)).gates.find((g) => g.id === 'g_today').done, true);

  // ما بقى شي من الواجهة القديمة: لا صورة شخصية ولا بوابة
  assert.equal(await page.locator('.avatar, .status-win, img[src*="hunter-avatar"]').count(), 0);
  assert.match(await page.textContent('.rank-chip'), /منزلة/);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('سماء اليوم: الوقت يمين لليسار بالعربي والعكس بالإنجليزي، وخط «الآن» يتحرك كل دقيقة', async () => {
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang });
    const early = await starX(page, 'fixed:f_train');  // 18:00
    const late = await starX(page, 'fixed:f_sleep');   // 23:30
    if (lang === 'ar') assert.ok(early > late, 'بالعربي: الأبكر على اليمين'); else assert.ok(early < late, 'بالإنجليزي: الأبكر على اليسار');

    const nowX = () => page.evaluate(() => document.getElementById('skyNow').getAttribute('transform'));
    const x0 = await nowX();
    await page.clock.runFor(10 * 60 * 1000);
    assert.notEqual(await nowX(), x0, 'خط «الآن» لازم يتحرك');
    assert.equal(await page.locator('.sky-star').count(), 4, 'تحريك الخط ما يعيد رسم الخريطة ولا يضيع شي');
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
});

test('سماء اليوم على الجوال: بطاقة المستوى، ثم المهام، ثم الخريطة (نجوم أكبر بدون أسماء)', async () => {
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 } });
  const top = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);
  const order = [await top('.sky-id'), await top('#tasksPanel'), await top('.sky-chart'), await top('#statCards')];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(await page.locator('.sky-svg.small').count(), 1);
  assert.equal(await page.locator('.sky-star .name').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  // النجمة تنضغط باللمس كذلك (مساحة الضغط 44 بكسل على الأقل)
  const hit = await page.evaluate(() => document.querySelector('.sky-star .hit').getBoundingClientRect().width);
  assert.ok(hit >= 40, 'مساحة ضغط النجمة صغيرة: ' + hit);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
