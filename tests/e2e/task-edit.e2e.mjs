// تعديل المهمة من سطرها (⋯)، زر «تفاصيل» وقت الإضافة، الحذف من نافذة التعديل،
// والترتيب اليدوي: أزرار ▲▼، السحب بالماوس، وباللمس (ضغطة مطوّلة)، والسحبة يمين/يسار.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const keys = (page) => page.evaluate(() => [...document.querySelectorAll('#taskList .task-li[data-key]')].map((li) => li.dataset.key));
const center = (page, key) => page.evaluate((k) => { const r = [...document.querySelectorAll('#taskList .task-li .task')].find((b) => b.parentNode.dataset.key === k).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, key);
// زر في نافذة: حدث close يجي بعد الضغطة بلحظة
const press = async (page, sel) => { await page.click(sel); await page.waitForTimeout(60); await page.clock.runFor(60); };
async function open(opts = {}) {
  const ctx = await newContext(browser, { seed: guestSeed(buildSeed()), ...opts });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  return { ctx, page };
}
// لمسة حقيقية (CDP)، عشان تطلع أحداث pointer من نوع touch
async function touch(page, points, { hold = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(points[0]) });
  if (hold) await page.clock.runFor(hold);
  for (const p of points.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.clock.runFor(400);
}

test('زر «تفاصيل»: يفتح نافذة المهمة الجديدة، الحفظ يضيفها بالقيم، والإلغاء ما يضيف شي', async () => {
  const { ctx, page } = await open();
  const before0 = (await pageState(page)).gates.length;

  // مع نص مكتوب: النافذة تنفتح معبّاة، ونغيّر الوقت والقدرة
  await page.fill('#quickInput', 'مراجعة الفصل');
  await page.click('#quickMore');
  assert.equal(await page.isVisible('#editDialog'), true);
  assert.equal(await page.inputValue('#eTitle'), 'مراجعة الفصل');
  assert.equal(await page.isVisible('#eDelete'), false, 'مهمة جديدة: ما فيه زر حذف');
  await page.fill('#eTime', '21:15');
  await page.selectOption('#eStat', 'INT');
  await press(page, '#editDialog button[value="save"]');
  let s = await pageState(page);
  const g = s.gates.find((x) => x.title === 'مراجعة الفصل');
  assert.deepEqual({ time: g.time, stat: g.stat }, { time: '21:15', stat: 'INT' });
  assert.equal(await page.inputValue('#quickInput'), '');

  // بدون نص + إلغاء: ما ينضاف شي
  await page.click('#quickMore');
  assert.equal(await page.inputValue('#eTitle'), '');
  await press(page, '#editDialog button[value="cancel"]');
  s = await pageState(page);
  assert.equal(s.gates.length, before0 + 1, 'الإلغاء لازم يشيل المهمة المؤقتة');

  // «كل يوم» + تفاصيل + Esc: نفس الشي، وما تبقى مهمة يومية زايدة
  const fixed0 = s.fixed.length;
  await page.fill('#quickInput', 'قراءة');
  await page.check('input[name="repeat"][value="daily"]');
  await page.click('#quickMore');
  assert.equal(await page.isVisible('#eDaysBox'), true, 'المهمة اليومية تعرض أيام التكرار');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  assert.equal((await pageState(page)).fixed.length, fixed0);

  assert.deepEqual(page.errors, []);
  await ctx.close();
});

for (const theme of ['anime', 'ink']) {
  test(`زر ⋯ على المهمة (${theme}): يفتح التعديل بدون وضع «تعديل المهام»، والحذف من النافذة`, async () => {
    const { ctx, page } = await open({ theme });
    await page.click('.task-li[data-key="fixed:f_sleep"] .more-btn');
    assert.equal(await page.inputValue('#eTitle'), 'النوم قبل 12');
    await page.fill('#eTime', '22:45');
    await press(page, '#editDialog button[value="save"]');
    assert.equal((await pageState(page)).fixed.find((x) => x.id === 'f_sleep').time, '22:45');
    // الضغط على ⋯ ما ينجز المهمة
    assert.equal((await pageState(page)).log['2026-10-28'].includes('f_sleep'), false);

    await page.click('.task-li[data-key="fixed:f_sleep"] .more-btn');
    await press(page, '#eDelete');
    await press(page, '#confirmOk');
    await page.clock.runFor(100);
    assert.equal((await pageState(page)).fixed.some((x) => x.id === 'f_sleep'), false);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}

test('الترتيب: ▲▼ في وضع التعديل، ينحفظ بعد التحديث، و«رجّع الترتيب حسب الوقت» يلغيه', async () => {
  const { ctx, page } = await open();
  assert.deepEqual(await keys(page), ['fixed:f_train', 'fixed:f_study', 'fixed:f_sleep', 'gate:g_today'], 'البداية بالوقت');
  await page.click('#editBtn');
  await page.click('.task-li[data-key="fixed:f_sleep"] .mini.move >> nth=0'); // ▲
  assert.deepEqual((await keys(page)).slice(0, 3), ['fixed:f_train', 'fixed:f_sleep', 'fixed:f_study']);
  await page.click('.task-li[data-key="fixed:f_train"] .mini.move >> nth=1'); // ▼
  assert.deepEqual((await keys(page)).slice(0, 3), ['fixed:f_sleep', 'fixed:f_train', 'fixed:f_study']);
  assert.deepEqual((await pageState(page)).order.slice(0, 3), ['fixed:f_sleep', 'fixed:f_train', 'fixed:f_study']);

  await page.reload();
  await page.clock.runFor(200);
  assert.deepEqual((await keys(page)).slice(0, 3), ['fixed:f_sleep', 'fixed:f_train', 'fixed:f_study'], 'الترتيب لازم يبقى بعد التحديث');

  await page.click('#editBtn');
  await page.click('#orderReset');
  assert.deepEqual((await pageState(page)).order, []);
  assert.deepEqual((await keys(page)).slice(0, 3), ['fixed:f_train', 'fixed:f_study', 'fixed:f_sleep']);
  assert.equal(await page.locator('#orderReset').count(), 0);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('السحب بالماوس: يرتّب بدون ما ينجز المهمة', async () => {
  const { ctx, page } = await open();
  await page.evaluate(() => document.querySelector('#taskList').scrollIntoView({ block: 'center' }));
  const from = await center(page, 'fixed:f_sleep');
  const to = await center(page, 'fixed:f_train');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y - 20, { steps: 2 });
  await page.mouse.move(to.x, to.y - 10, { steps: 6 });
  await page.mouse.up();
  await page.clock.runFor(400);
  assert.deepEqual((await keys(page)).slice(0, 3), ['fixed:f_sleep', 'fixed:f_train', 'fixed:f_study']);
  const s = await pageState(page);
  assert.deepEqual(s.order.slice(0, 3), ['fixed:f_sleep', 'fixed:f_train', 'fixed:f_study']);
  assert.deepEqual(s.log['2026-10-28'], ['f_train'], 'السحب ما ينجز ولا يلغي إنجاز');
  // ضغطة عادية بعدها تشتغل
  await page.click('.task-li[data-key="fixed:f_sleep"] .task');
  assert.ok((await pageState(page)).log['2026-10-28'].includes('f_sleep'));
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

for (const theme of ['anime', 'ink']) {
  test(`اللمس (${theme}): سحبة يمين تنجز، سحبة يسار تفتح التعديل، وضغطة مطوّلة ثم سحب ترتّب`, async () => {
    const { ctx, page } = await open({ theme, viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.evaluate(() => document.querySelector('#taskList').scrollIntoView({ block: 'center' }));
    const done = async (id) => (await pageState(page)).log['2026-10-28'].includes(id);

    // يمين = إنجاز
    let c = await center(page, 'fixed:f_sleep');
    await touch(page, [c, { x: c.x + 30, y: c.y }, { x: c.x + 100, y: c.y + 2 }]);
    assert.equal(await done('f_sleep'), true, 'سحبة يمين لازم تنجز المهمة');

    // سحبة قصيرة ما تسوي شي
    c = await center(page, 'fixed:f_study');
    await touch(page, [c, { x: c.x + 20, y: c.y }, { x: c.x + 40, y: c.y }]);
    assert.equal(await done('f_study'), false);

    // يسار = تعديل
    await touch(page, [c, { x: c.x - 30, y: c.y }, { x: c.x - 100, y: c.y }]);
    assert.equal(await page.isVisible('#editDialog'), true);
    assert.equal(await page.inputValue('#eTitle'), 'مذاكرة بتركيز ساعة');
    await press(page, '#editDialog button[value="cancel"]');
    assert.equal(await done('f_study'), false);

    // ضغطة مطوّلة ثم سحب لفوق = ترتيب
    const before0 = await keys(page);
    const from = await center(page, before0[2]);
    const to = await center(page, before0[0]);
    await touch(page, [from, { x: from.x, y: from.y - 30 }, { x: to.x, y: to.y - 10 }], { hold: 400 });
    const now = await keys(page);
    assert.equal(now[0], before0[2], 'المهمة الثالثة لازم تصير الأولى');
    assert.deepEqual((await pageState(page)).order.slice(0, 3), now.slice(0, 3));
    if (theme === 'ink') assert.equal(await page.locator('#taskList .now-row').count(), 0, 'سطر «الآن» يختفي مع الترتيب اليدوي');

    assert.deepEqual(page.errors, []);
    await ctx.close();
  });
}
