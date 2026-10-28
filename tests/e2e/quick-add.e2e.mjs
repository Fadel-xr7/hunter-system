// الإضافة السريعة من الواجهة: اختيار «كل يوم» يعطي نفس نتيجة كلمة «يومي» (9 الصبح بدون وقت)، والوقت المكتوب يبقى.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

async function add(page, repeat, text) {
  await page.check(`input[name="repeat"][value="${repeat}"]`);
  await page.fill('#quickInput', text);
  await page.press('#quickInput', 'Enter');
  await page.clock.runFor(100);
}
const added = async (page, title) => {
  const s = await pageState(page);
  const f = s.fixed.find((x) => x.title === title);
  if (f) return { kind: 'fixed', time: f.time };
  const g = s.gates.find((x) => x.title === title);
  return g && { kind: 'gate', time: g.time };
};

test('الإضافة السريعة من الواجهة: «كل يوم» بدون وقت = 9 الصبح مثل «يومي»، والوقت المكتوب يبقى', async () => {
  const ctx = await newContext(browser, { seed: guestSeed(buildSeed()) });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  const cases = [
    ['daily', 'قراءة', 'قراءة', { kind: 'fixed', time: '09:00' }],          // الاختيار بدون وقت
    ['once', 'تمارين يومي', 'تمارين', { kind: 'fixed', time: '09:00' }],    // الكلمة بدون وقت
    ['daily', 'رياضة 7 مساء', 'رياضة', { kind: 'fixed', time: '19:00' }],   // الاختيار مع وقت مكتوب
    ['daily', 'مشي الساعة 6:30 الصبح', 'مشي', { kind: 'fixed', time: '06:30' }],
    ['once', 'مراجعة', 'مراجعة', { kind: 'gate', time: '17:00' }]           // مرة وحدة بدون وقت
  ];
  for (const [repeat, text, title, want] of cases) {
    await add(page, repeat, text);
    assert.deepEqual(await added(page, title), want, `${repeat}: ${text}`);
  }
  assert.deepEqual(page.errors, []);
  await ctx.close();
});
