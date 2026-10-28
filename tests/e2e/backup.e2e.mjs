// «ابدأ من جديد» يمسح كل شي، فقبلها لازم نسخة مؤكدة. لو ما قدرنا نتأكد، ما ينمسح شي.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startServer, launch, newContext, openPage, guestSeed, buildSeed, pageState, until } from './harness.mjs';

let srv, browser;
before(async () => { srv = await startServer(); browser = await launch(); });
after(async () => { await browser?.close(); await srv?.close(); });

const seed = buildSeed();

// يمنع المتصفح يحفظ نسخة الطوارئ (مثل مساحة ممتلئة)، واختياري يمنع التنزيل بعد
async function setup({ storageFails = false, downloadFails = false } = {}) {
  const ctx = await newContext(browser, { seed: guestSeed(seed) });
  await ctx.addInitScript(({ storageFails, downloadFails }) => {
    if (storageFails) {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'hunterConflictCopy_v6') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
    }
    if (downloadFails) URL.createObjectURL = () => { throw new Error('blocked'); };
  }, { storageFails, downloadFails });
  const page = await openPage(ctx, srv.url);
  await page.clock.runFor(200);
  return { ctx, page };
}

async function askReset(page) {
  await page.click('#backupBtn');
  await page.click('#resetBtn');
  await page.locator('#confirmDialog[open] #confirmText', { hasText: 'بيمسح كل بياناتك' }).waitFor();
  await page.click('#confirmOk'); // «امسح وابدأ من جديد»
  await page.clock.runFor(50);
}
// نافذة «الملف موجود، كمّل؟» (تطلع بعد التنزيل، فننتظرها بالوقت الحقيقي)
const fileAsk = (page) => page.locator('#confirmDialog[open] #confirmText', { hasText: 'فنزّلنا ملف' }).waitFor();


test('النسخة انحفظت في المتصفح: يمسح على طول، والنسخة موجودة', async () => {
  const { ctx, page } = await setup();
  await askReset(page);
  // المسح يكمل بعد حدث إقفال النافذة (غير متزامن)، فننتظره بالوقت الحقيقي بدل ما نقرأ على طول
  assert.ok(await until(page, () => state.totalXp === 0), 'انمسح');
  const copy = JSON.parse(await page.evaluate(() => localStorage.getItem('hunterConflictCopy_v6')));
  assert.equal(copy.side, 'reset');
  assert.equal(copy.state.totalXp, seed.totalXp);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test('المتصفح ما حفظ النسخة بس نزل ملف: يسأل قبل ما يمسح، والإلغاء ما يمسح شي', async () => {
  const { ctx, page } = await setup({ storageFails: true });
  const dl = page.waitForEvent('download');
  await askReset(page);
  const file = await dl;
  assert.equal(file.suggestedFilename(), 'hunter-backup-2026-10-28.json');
  const saved = JSON.parse(await readFile(await file.path(), 'utf8'));
  assert.equal(saved.app, 'hunter-system');
  assert.equal(saved.state.totalXp, seed.totalXp, 'الملف فيه البيانات كاملة');

  await fileAsk(page);
  assert.match(await page.locator('#confirmText').textContent(), /hunter-backup-2026-10-28\.json/);
  assert.match(await page.locator('#confirmOk').textContent(), /الملف موجود، كمّل/);
  await page.locator('#confirmDialog button[value="cancel"]').click();
  assert.ok(await until(page, () => document.getElementById('toasts').textContent.includes('ما مسحنا شي')));
  assert.equal((await pageState(page)).totalXp, seed.totalXp, 'ما انمسح شي');

  // نعيدها ونأكد إن الملف موجود: الحين يمسح
  await askReset(page);
  await fileAsk(page);
  await page.click('#confirmOk');
  assert.ok(await until(page, () => state.totalXp === 0), 'انمسح بعد ما أكدنا إن الملف موجود');
  await ctx.close();
});

test('لا نسخة بالمتصفح ولا ملف: ما يمسح شي ولا يسأل', async () => {
  const { ctx, page } = await setup({ storageFails: true, downloadFails: true });
  await askReset(page);
  assert.equal(await page.locator('dialog[open]').count(), 0, 'ما فيه نافذة تأكيد ثانية');
  assert.equal((await pageState(page)).totalXp, seed.totalXp);
  assert.match(await page.locator('#toasts').textContent(), /ما مسحنا شي/);
  await ctx.close();
});
