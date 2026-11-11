// الجوال (390×844): شريط التنقل تحت، الشريط العلوي سطر واحد، المهام على أول شاشة، وشرح الإضافة تحت زر «؟».
// والكمبيوتر يبقى مثل ما هو: التبويبات فوق، والشرح ظاهر بدون زر.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const PHONE = { width: 390, height: 844 };
const box = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; }, sel);
const shown = (page, sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display !== 'none', sel);
const pageTop = (page, sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top + scrollY, sel);

for (const theme of ['anime', 'ink']) for (const lang of ['ar', 'en']) {
  test(`الجوال (${theme}، ${lang}): التنقل تحت، والمهام على أول شاشة`, async () => {
    const ctx = await newContext(browser, { theme, lang, viewport: PHONE, seed: guestSeed(buildSeed({ lang })) });
    const page = await openPage(ctx, srv.url);
    await page.clock.runFor(200);

    // شريط التنقل ثابت تحت بعرض الشاشة، وفيه الثلاث أقسام بأيقوناتها
    const tabs = await box(page, '.tabs');
    assert.equal(Math.round(tabs.bottom), PHONE.height, 'شريط التنقل لازم يكون لاصق تحت');
    assert.equal(Math.round(tabs.left), 0);
    assert.equal(Math.round(tabs.right), PHONE.width);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.tabs')).position), 'fixed');
    assert.equal(await page.locator('.tab svg:visible').count(), 3);

    // الشريط العلوي سطر واحد: الاسم وكل الأزرار داخل عرض الشاشة
    assert.ok((await box(page, '.topbar')).height <= 64, 'الشريط العلوي أكثر من سطر');
    for (const id of ['cloudBtn', 'tgBtn', 'soundBtn', 'backupBtn', 'langBtn', 'themeBtn']) {
      const b = await box(page, '#' + id);
      assert.ok(b.left >= 0 && b.right <= PHONE.width, id + ' طالع برا الشاشة');
    }
    const brand = await box(page, '.brand');
    assert.ok(brand.left >= 0 && brand.right <= PHONE.width && brand.height > 0, 'اسم الموقع مقصوص');

    // أول مهمة ظاهرة على أول شاشة، فوق شريط التنقل
    const first = await box(page, '#taskList .task');
    assert.ok(first.top < tabs.top - 40, `أول مهمة تحت أول شاشة (top=${Math.round(first.top)})`);

    // الترتيب: المهام، ثم لمحة اليوم، ثم التركيز، ثم السجل، ثم الألقاب
    const order = [];
    for (const sel of ['#hero', '#tasksPanel', '#statCards', '#focusPanel', '#heatPanel', '#achMini']) order.push(await pageTop(page, sel));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ترتيب الأقسام على الجوال تغيّر');

    // ما فيه سكرول بالعرض، وآخر الصفحة (الحقوق) ما يتغطى بشريط التنقل
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    assert.ok((await box(page, '.site-footer')).bottom <= (await box(page, '.tabs')).top + 1, 'الحقوق تحت شريط التنقل');

    // التنقل يشتغل من الشريط
    await page.click('.tab[data-view="stats"]');
    await page.clock.runFor(100);
    assert.equal(await page.getAttribute('.tab[data-view="stats"]', 'aria-current'), 'page');
    assert.equal(await page.isVisible('#view-stats'), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width);

    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}

test('الجوال: شرح الإضافة مطوي تحت «؟»، والمعاينة وأنت تكتب تطلع دايماً', async () => {
  const ctx = await newContext(browser, { viewport: PHONE, seed: guestSeed(buildSeed()) });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);

  assert.equal(await shown(page, '#quickHelp'), true);
  assert.equal(await shown(page, '#quickHint'), false, 'الشرح لازم يكون مطوي في البداية');
  assert.equal(await page.getAttribute('#quickHelp', 'aria-expanded'), 'false');
  assert.equal(await page.getAttribute('#quickHelp', 'aria-controls'), 'quickHint');

  await page.click('#quickHelp');
  assert.equal(await shown(page, '#quickHint'), true);
  assert.equal(await page.getAttribute('#quickHelp', 'aria-expanded'), 'true');
  assert.match(await page.textContent('#quickHint'), /اكتبها مثل ما تتكلم/);

  await page.click('#quickHelp');
  assert.equal(await shown(page, '#quickHint'), false);
  assert.equal(await page.getAttribute('#quickHelp', 'aria-expanded'), 'false');

  // تكتب والشرح مطوي: «النظام فهم» يطلع، ولما تمسح يرجع ينطوي
  await page.fill('#quickInput', 'قراءة 9 مساء');
  assert.equal(await shown(page, '#quickHint'), true);
  assert.match(await page.textContent('#quickHint'), /النظام فهم/);
  await page.fill('#quickInput', '');
  assert.equal(await shown(page, '#quickHint'), false);

  // «مرة وحدة / كل يوم» مخفي والخانة فاضية، ويطلع أول ما تكتب، ويبقى لو «كل يوم» مختار
  assert.equal(await shown(page, '#quickForm .seg'), false);
  await page.fill('#quickInput', 'قراءة');
  assert.equal(await shown(page, '#quickForm .seg'), true);
  await page.check('input[name="repeat"][value="daily"]');
  await page.fill('#quickInput', '');
  assert.equal(await shown(page, '#quickForm .seg'), true, '«كل يوم» مختار: الاختيار لازم يبقى ظاهر');
  await page.check('input[name="repeat"][value="once"]');
  assert.equal(await shown(page, '#quickForm .seg'), false);

  // الخانة وزر «أضف» بنفس السطر
  const field = await box(page, '.quick-field');
  const add = await box(page, '#quickForm .main-btn');
  assert.ok(Math.abs(field.top - add.top) < 4, 'الخانة وزر «أضف» مو بنفس السطر');

  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('الكمبيوتر ما تغيّر: التبويبات فوق بدون أيقونات، والشرح ظاهر بدون زر «؟»', async () => {
  const ctx = await newContext(browser, { seed: guestSeed(buildSeed()) });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tabs')).position), 'fixed');
  assert.equal(await page.locator('.tab svg:visible').count(), 0);
  assert.equal(await shown(page, '#quickHelp'), false);
  assert.equal(await shown(page, '#quickHint'), true);
  assert.equal(await shown(page, '.slash-key'), true);
  assert.equal(await shown(page, '#quickForm .seg'), true);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).paddingBottom), '0px');
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('الجوال: شاشة الدخول بدون شريط تنقل', async () => {
  const ctx = await newContext(browser, { viewport: PHONE });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  assert.equal(await page.isVisible('#view-auth'), true);
  assert.equal(await shown(page, '.tabs'), false);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).paddingBottom), '0px');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), PHONE.width);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
