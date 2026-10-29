// روابط البوت في الموقع: #quest (حقول جاهزة بتاريخ كامل) و#add (نص، مع يوم الإرسال on أو بدونه).
// الرابط ينفتح في يوم غير يوم الإرسال، والتاريخ لازم يبقى مثل ما هو.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState, until } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const quest = (o) => '#' + new URLSearchParams({ quest: '1', ...o }).toString();
const day = (iso) => new Date(iso + 'T10:30:00+03:00');

/** يفتح الموقع بالرابط في يوم معيّن، ويرجع نص نافذة التأكيد (أو null لو ما طلعت) */
async function openLink(hash, iso) {
  const ctx = await newContext(browser, { seed: guestSeed(buildSeed(), iso) });
  const page = await openPage(ctx, srv.url + hash, { time: day(iso) });
  await page.clock.runFor(200);
  const shown = await until(page, () => Boolean(document.querySelector('#confirmDialog[open]')), 1500);
  const text = shown ? await page.locator('#confirmText').textContent() : null;
  return { ctx, page, text };
}
// الإضافة تصير بعد حدث إغلاق النافذة، فننتظر إشعارها بالوقت الحقيقي (ساعة الصفحة واقفة)
async function accept(page) {
  await page.click('#confirmOk');
  await page.clock.runFor(100);
  assert.ok(await until(page, () => !document.querySelector('#confirmDialog[open]') && Boolean(document.querySelector('.toast'))), 'ما انضافت');
}
const gate = async (page, title) => (await pageState(page)).gates.find((g) => g.title === title);

test('#quest: الرابط انرسل 28 أكتوبر لمهمة 29، وانفتح 29 = تنضاف 29 (مو 30)', async () => {
  const hash = quest({ t: 'أذاكر فيزياء', k: 'gate', d: '2026-10-29', h: '21:00', r: 'B', s: 'INT' });
  for (const opened of ['2026-10-28', '2026-10-29']) {
    const { ctx, page, text } = await openLink(hash, opened);
    assert.match(text, /الخميس 29 أكتوبر/, opened);
    assert.match(text, /9:00 م/);
    assert.doesNotMatch(text, /فات/);
    await accept(page);
    const g = await gate(page, 'أذاكر فيزياء');
    assert.deepEqual([g.date, g.time, g.rank, g.stat], ['2026-10-29', '21:00', 'B', 'INT'], opened);
    assert.deepEqual(page.errors, []);
    await ctx.close();
  }
});

test('#quest: انفتح بعد التاريخ = تحذير «فات» وتنضاف بنفس تاريخها، وعبور السنة', async () => {
  const late = await openLink(quest({ t: 'تسليم', k: 'gate', d: '2026-10-29', h: '17:00', r: 'E', s: 'SENSE' }), '2026-11-02');
  assert.match(late.text, /تاريخ المهمة فات/);
  await accept(late.page);
  assert.equal((await gate(late.page, 'تسليم')).date, '2026-10-29');
  await late.ctx.close();

  const ny = await openLink(quest({ t: 'سنة جديدة', k: 'gate', d: '2027-01-01', h: '00:15', r: 'E', s: 'SENSE' }), '2026-12-31');
  assert.match(ny.text, /1 يناير 2027/);
  await accept(ny.page);
  assert.deepEqual([(await gate(ny.page, 'سنة جديدة')).date, (await gate(ny.page, 'سنة جديدة')).time], ['2027-01-01', '00:15']);
  await ny.ctx.close();
});

test('#quest يومية، ورابط خربان ما يفتح نافذة ولا يضيف شي', async () => {
  const d = await openLink(quest({ t: 'أقرأ 10 صفحات', k: 'daily', h: '22:00', s: 'INT' }), '2026-10-28');
  assert.match(d.text, /مهمة يومية/);
  await accept(d.page);
  assert.ok((await pageState(d.page)).fixed.some((f) => f.title === 'أقرأ 10 صفحات' && f.time === '22:00' && f.stat === 'INT'));
  await d.ctx.close();

  const bad = await openLink(quest({ t: 'خربان', k: 'gate', d: '2026-02-30', h: '21:00', r: 'B', s: 'INT' }), '2026-10-28');
  assert.equal(bad.text, null);
  assert.match(await bad.page.locator('.toast').first().textContent(), /رابط المهمة غير صالح/);
  assert.equal(await gate(bad.page, 'خربان'), undefined);
  await bad.ctx.close();
});

test('#add: مع on تنحسب «بكرة» من يوم الإرسال، وبدونه (روابط قديمة) من يوم الفتح', async () => {
  const withOn = await openLink('#add=' + encodeURIComponent('أذاكر بكرة الساعة 9 الليل') + '&on=2026-10-28', '2026-10-30');
  assert.match(withOn.text, /29 أكتوبر/);
  assert.match(withOn.text, /تاريخ المهمة فات/);
  await accept(withOn.page);
  assert.equal((await gate(withOn.page, 'أذاكر')).date, '2026-10-29');
  await withOn.ctx.close();

  const legacy = await openLink('#add=' + encodeURIComponent('أذاكر بكرة'), '2026-10-30');
  assert.match(legacy.text, /بكرة/);
  await accept(legacy.page);
  assert.equal((await gate(legacy.page, 'أذاكر')).date, '2026-10-31');
  await legacy.ctx.close();
});
