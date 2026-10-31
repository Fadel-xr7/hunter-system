// منع التضمين (clickjacking): الموقع داخل إطار في صفحة ثانية لازم يختفي، وبرا الإطار يبقى مثل ما هو.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, until } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const hidden = (frame) => frame.evaluate(() => getComputedStyle(document.documentElement).display === 'none');

test('برا الإطار: الصفحة ظاهرة', async () => {
  const ctx = await newContext(browser, { seed: guestSeed(buildSeed()) });
  const page = await openPage(ctx, srv.url);
  assert.equal(await hidden(page), false);
  assert.ok(await page.locator('#quickInput, .hero, main').first().isVisible());
  await ctx.close();
});

for (const sandbox of [null, 'allow-scripts allow-same-origin allow-forms']) {
  test('داخل إطار من موقع ثاني' + (sandbox ? ' (sandbox يمنع فتح الصفحة الأم)' : '') + ': الصفحة تختفي', async () => {
    const ctx = await newContext(browser, { seed: guestSeed(buildSeed()) });
    const page = await ctx.newPage();
    await page.setContent(`<iframe id="f" ${sandbox ? `sandbox="${sandbox}"` : ''} src="${srv.url}" width="1200" height="800"></iframe>`);
    const frame = await (await page.waitForSelector('#f')).contentFrame();
    await frame.waitForLoadState('domcontentloaded');
    assert.ok(await until(frame, () => getComputedStyle(document.documentElement).display === 'none', 3000), 'الموقع ظاهر داخل الإطار');
    await ctx.close();
  });
}
