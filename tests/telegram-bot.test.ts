// اختبارات بوت تيليجرام (supabase/functions/telegram-bot). بدون شبكة: send وهمي يسجل الطلبات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, handleUpdate, makeLink, buttonOk, isEnglish, webhookSecret, setup, type Env } from '../supabase/functions/telegram-bot/index.ts';

const env: Env = { token: '123:ABC', siteUrl: 'https://fadel-xr7.github.io/hunter-system/', selfUrl: 'https://x.supabase.co/functions/v1/telegram-bot' };
function fakeSend(results: Record<string, unknown> = {}) {
  const calls: { method: string; body: any }[] = [];
  const send = async (method: string, body: any) => { calls.push({ method, body }); return (results[method] as any) || { ok: true, result: {} }; };
  return { calls, send };
}
let uid = 1000;
const msg = (text: string, extra: any = {}) => ({ message: { text, chat: { id: 5, type: 'private' }, from: { id: ++uid, is_bot: false, language_code: 'ar' }, ...extra } });

test('الرابط يحمل المهمة كاملة ويتفك صح', () => {
  const t = 'مهمة: قراءة 10 صفحات الساعة 9 مساءً !A #ذكاء & <x>';
  const link = makeLink(env.siteUrl + '#old', t);
  assert.ok(link.startsWith(env.siteUrl + '#add='));
  assert.equal(decodeURIComponent(link.split('#add=')[1]), t);
});

test('الأزرار للروابط https بس، مو المحلية', () => {
  assert.equal(buttonOk('https://fadel-xr7.github.io/x'), true);
  assert.equal(buttonOk('http://127.0.0.1:5500/docs/'), false);
  assert.equal(buttonOk('https://localhost/x'), false);
  assert.equal(buttonOk('not a url'), false);
});

test('اللغة: من نص الرسالة، و/start من لغة تيليجرام', () => {
  assert.equal(isEnglish('task: read'), true);
  assert.equal(isEnglish('مهمة: قراءة'), false);
  assert.equal(isEnglish('/start', 'en-US'), true);
  assert.equal(isEnglish('/start', 'ar'), false);
  assert.equal(isEnglish('/start', ''), false);
});

test('طلب صريح بدون ذكاء («مهمة: …»): رد فيه الرابط وزر، والنص مهرّب، و«بكرة» تنحسب من يوم الإرسال', async () => {
  const { calls, send } = fakeSend();
  await handleUpdate(msg('مهمة: <b>تجربة</b> بكرة'), { ...env, now: () => Date.UTC(2026, 9, 28, 9) }, send);
  assert.equal(calls.length, 1);
  const b = calls[0].body;
  assert.equal(b.parse_mode, 'HTML');
  assert.ok(b.text.includes('&lt;b&gt;تجربة&lt;/b&gt;'));
  assert.ok(!b.text.includes('<b>تجربة'));
  assert.equal(b.reply_markup.inline_keyboard[0][0].url, env.siteUrl + '#add=' + encodeURIComponent('<b>تجربة</b> بكرة') + '&on=2026-10-28');
});

test('/start يعطي الشرح، والقروبات والبوتات ما يرد عليها', async () => {
  const { calls, send } = fakeSend();
  await handleUpdate(msg('/start'), env, send);
  assert.ok(calls[0].body.text.includes('نظام الصياد'));
  await handleUpdate(msg('مهمة', { chat: { id: 9, type: 'group' } }), env, send);
  await handleUpdate({ message: { text: 'x', chat: { id: 9, type: 'private' }, from: { id: 1, is_bot: true } } }, env, send);
  await handleUpdate({ edited_message: { text: 'x' } }, env, send);
  assert.equal(calls.length, 1);
});

test('رسالة طويلة ترفض', async () => {
  const { calls, send } = fakeSend();
  await handleUpdate(msg('ا'.repeat(301)), env, send);
  assert.ok(calls[0].body.text.includes('طويلة'));
  assert.equal(calls[0].body.reply_markup, undefined);
});

test('حد الرسائل: 20 بالدقيقة، وتنبيه مرة وحدة', async () => {
  const { calls, send } = fakeSend();
  const from = { id: 777, is_bot: false, language_code: 'ar' };
  for (let i = 0; i < 25; i++) await handleUpdate({ message: { text: 'مهمة ' + i, chat: { id: 7, type: 'private' }, from } }, env, send);
  assert.equal(calls.length, 21);
  assert.ok(calls[20].body.text.includes('انتظر'));
});

test('الطلب بدون السر الصحيح ينرفض، ومعه ينقبل', async () => {
  const { calls, send } = fakeSend();
  const body = JSON.stringify(msg('مهمة'));
  const bad = await serve(new Request('https://x/', { method: 'POST', body, headers: { 'x-telegram-bot-api-secret-token': 'wrong' } }), env, send);
  assert.equal(bad.status, 403);
  assert.equal(calls.length, 0);
  const ok = await serve(new Request('https://x/', { method: 'POST', body, headers: { 'x-telegram-bot-api-secret-token': await webhookSecret(env.token) } }), env, send);
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
  // تحديث خربان: يرجع 200 (عشان تيليجرام ما يعيده) ويسجّل الخطأ بس
  const logged: unknown[] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const broken = await serve(new Request('https://x/', { method: 'POST', body: '{bad', headers: { 'x-telegram-bot-api-secret-token': await webhookSecret(env.token) } }), env, send);
    assert.equal(broken.status, 200);
  } finally { console.error = realError; }
  assert.equal(logged.length, 1);
});

test('بدون توكن: خطأ واضح', async () => {
  const { send } = fakeSend();
  const r = await serve(new Request('https://x/?setup=1'), { ...env, token: '' }, send);
  assert.equal(r.status, 500);
  assert.match((await r.json()).message, /TELEGRAM_BOT_TOKEN/);
});

test('setup يربط الـ webhook بالسر، ولو مربوط من قبل ما يعيده', async () => {
  const a = fakeSend();
  assert.deepEqual(await setup(env, a.send), { ok: true, message: 'webhook set' });
  const set = a.calls.find((c) => c.method === 'setWebhook')!;
  assert.equal(set.body.url, env.selfUrl);
  assert.equal(set.body.secret_token, await webhookSecret(env.token));
  assert.match(set.body.secret_token, /^[0-9a-f]{48}$/);
  const b = fakeSend({ getWebhookInfo: { ok: true, result: { url: env.selfUrl } } });
  assert.deepEqual(await setup(env, b.send), { ok: true, message: 'already set' });
  assert.equal(b.calls.length, 1);
  const c = fakeSend({ setWebhook: { ok: false, description: 'Unauthorized' } });
  assert.deepEqual(await setup(env, c.send), { ok: false, message: 'Unauthorized' });
});


/* ===== ملاحظات المراجعة: حماية الإعداد، وفشل الرد ===== */
import { deliver, sameText, SendFailed, resetBotMemory } from '../supabase/functions/telegram-bot/index.ts';

const noSleep = async () => {};
const withKey: Env = { ...env, setupKey: 'secret-key-123', sleep: noSleep };

test('?setup=1: بدون SETUP_KEY في الإعدادات يرفض، ولا يلمس تيليجرام', async () => {
  const { calls, send } = fakeSend();
  const r = await serve(new Request('https://x/?setup=1&key=whatever'), { ...env, setupKey: '' }, send);
  assert.equal(r.status, 403);
  assert.equal(calls.length, 0);
});

test('?setup=1: مفتاح غلط أو ناقص يرفض، ولا يستدعي setWebhook', async () => {
  const { calls, send } = fakeSend();
  for (const q of ['?setup=1', '?setup=1&key=', '?setup=1&key=wrong', '?setup=1&key=secret-key-12']) {
    const r = await serve(new Request('https://x/' + q), withKey, send);
    assert.equal(r.status, 403, q);
  }
  assert.equal(calls.length, 0);
});

test('?setup=1: المفتاح الصحيح يشتغل، وsetWebhook ما يحذف التحديثات المعلّقة', async () => {
  const { calls, send } = fakeSend({ getWebhookInfo: { ok: true, result: { url: '' } } });
  const r = await serve(new Request('https://x/?setup=1&key=secret-key-123'), withKey, send);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, message: 'webhook set' });
  const hook = calls.find((c) => c.method === 'setWebhook')!;
  assert.equal('drop_pending_updates' in hook.body, false);
});

test('sameText: يقارن صح', () => {
  assert.equal(sameText('abc', 'abc'), true);
  assert.equal(sameText('abc', 'abd'), false);
  assert.equal(sameText('abc', 'abcd'), false);
  assert.equal(sameText('', ''), true);
});

test('deliver: خطأ مؤقت (5xx أو انقطاع) يعيد المحاولة وينجح', async () => {
  const seq: any[] = [{ ok: false, error_code: 502 }, new Error('network down'), { ok: true }];
  let n = 0;
  const send = async () => { const r = seq[n++]; if (r instanceof Error) throw r; return r; };
  assert.equal(await deliver(send, 'sendMessage', {}, noSleep), 'ok');
  assert.equal(n, 3);
});

test('deliver: 429 قصير (≤5 ثواني) ينتظر المدة كاملة ويعيد', async () => {
  resetBotMemory();
  const waits: number[] = [];
  const seq = [{ ok: false, error_code: 429, parameters: { retry_after: 2 } }, { ok: true }];
  let n = 0;
  assert.equal(await deliver(async () => seq[n++] as any, 'sendMessage', {}, async (ms) => { waits.push(ms); }), 'ok');
  assert.deepEqual(waits, [2000]);
});

test('deliver: 429 طويل (99 ثانية) ما يختصر المدة: يأجّل، وما يرسل شي لين تخلص', async () => {
  resetBotMemory();
  let t = 1_000_000, n = 0;
  const now = () => t;
  const waits: number[] = [];
  const send = async () => { n++; return n === 1 ? { ok: false, error_code: 429, parameters: { retry_after: 99 } } : { ok: true }; };
  assert.equal(await deliver(send, 'sendMessage', {}, async (ms) => { waits.push(ms); }, now), 'deferred');
  assert.deepEqual(waits, []); // ما انتظر داخل الطلب
  t += 98_000;
  assert.equal(await deliver(send, 'sendMessage', {}, noSleep, now), 'deferred');
  assert.equal(n, 1); // قبل ما تخلص المدة ما لمسنا تيليجرام
  t += 2_000;
  assert.equal(await deliver(send, 'sendMessage', {}, noSleep, now), 'ok');
  assert.equal(n, 2);
});

test('deliver: خطأ دائم (البوت محظور 403) ما ينعاد', async () => {
  let n = 0;
  const send = async () => { n++; return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }; };
  assert.equal(await deliver(send, 'sendMessage', {}, noSleep), 'permanent');
  assert.equal(n, 1);
});

test('deliver: لو كل المحاولات فشلت مؤقتاً يرجع transient بعد 3 محاولات', async () => {
  let n = 0;
  assert.equal(await deliver(async () => { n++; return { ok: false, error_code: 500 }; }, 'sendMessage', {}, noSleep), 'transient');
  assert.equal(n, 3);
});

test('فشل الرد المؤقت: الدالة ترجع 500 عشان تيليجرام يعيد التحديث', async () => {
  const send = async () => ({ ok: false, error_code: 500 });
  const secret = await webhookSecret(env.token);
  const req = () => new Request('https://x/', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ update_id: 9001, ...msg('مهمة: اختبار') }) });
  const orig = console.error; console.error = () => {};
  try {
    assert.equal((await serve(req(), { ...env, sleep: noSleep }, send)).status, 500);
  } finally { console.error = orig; }
});

test('إعادة التحديث بعد فشل: ينرد عليه مرة وحدة بس، حتى لو وصل ثلاث مرات', async () => {
  const sent: any[] = [];
  let failNext = true;
  const send = async (_m: string, body: any) => {
    if (failNext) return { ok: false, error_code: 500 }; // الطلب الأول: كل المحاولات تفشل
    sent.push(body); return { ok: true };
  };
  const upd = { update_id: 777001, ...msg('مهمة: مرة وحدة') };
  const e: Env = { ...env, sleep: noSleep };
  await assert.rejects(() => handleUpdate(upd, e, send), SendFailed); // تيليجرام بيعيده
  failNext = false;
  await handleUpdate(upd, e, send);   // الإعادة: نرد
  await handleUpdate(upd, e, send);   // وصل مرة ثانية: نتجاهل
  await handleUpdate(upd, e, send);
  assert.equal(sent.length, 1);
});

test('فشل متكرر: نتوقف بعد 3 محاولات بدل ما يعلق التحديث للأبد', async () => {
  const send = async () => ({ ok: false, error_code: 500 });
  const upd = { update_id: 777002, ...msg('مهمة: ما تنرسل') };
  const e: Env = { ...env, sleep: noSleep };
  await assert.rejects(() => handleUpdate(upd, e, send), SendFailed);
  await assert.rejects(() => handleUpdate(upd, e, send), SendFailed);
  await handleUpdate(upd, e, send); // الثالثة: نستسلم بدون خطأ، فتيليجرام يتوقف
});

test('فشل دائم (محظور): ما نعيد ولا نرمي خطأ', async () => {
  const send = async () => ({ ok: false, error_code: 403 });
  await handleUpdate({ update_id: 777003, ...msg('مهمة: محظور') }, { ...env, sleep: noSleep }, send); // لا يرمي
});


/* ===== الجولة الثانية: الطلبات المتزامنة، و429 الطويل داخل handleUpdate ===== */

test('نفس التحديث وصل مرتين بنفس الوقت: رد واحد بس', async () => {
  resetBotMemory();
  const sent: any[] = [];
  const send = async (_m: string, body: any) => { await new Promise((r) => setTimeout(r, 20)); sent.push(body); return { ok: true }; };
  const upd = { update_id: 888001, ...msg('مهمة: متوازي') };
  const e: Env = { ...env, sleep: noSleep };
  await Promise.all([handleUpdate(upd, e, send), handleUpdate(upd, e, send), handleUpdate(upd, e, send)]);
  assert.equal(sent.length, 1);
});

test('نفس التحديث بالتوازي والإرسال فشل: النسختين ترجع فشل، والمحاولات ما تتضاعف', async () => {
  resetBotMemory();
  let n = 0;
  const send = async () => { n++; await new Promise((r) => setTimeout(r, 5)); return { ok: false, error_code: 500 }; };
  const upd = { update_id: 888002, ...msg('مهمة: متوازي يفشل') };
  const e: Env = { ...env, sleep: noSleep };
  const rs = await Promise.allSettled([handleUpdate(upd, e, send), handleUpdate(upd, e, send)]);
  assert.deepEqual(rs.map((r) => r.status), ['rejected', 'rejected']);
  assert.ok(rs.every((r) => r.status === 'rejected' && r.reason instanceof SendFailed));
  assert.equal(n, 3); // 3 محاولات لطلب واحد، مو 6
});

test('429 طويل داخل handleUpdate: 500 لتيليجرام، ما ينحسب فشل، ويرد بعد ما تخلص المدة', async () => {
  resetBotMemory();
  let t = 5_000_000, n = 0;
  const sent: any[] = [];
  const send = async (_m: string, body: any) => { n++; if (n === 1) return { ok: false, error_code: 429, parameters: { retry_after: 99 } }; sent.push(body); return { ok: true }; };
  const upd = { update_id: 888003, ...msg('مهمة: انتظر') };
  const e: Env = { ...env, sleep: noSleep, now: () => t };
  // تيليجرام يعيده كثير خلال المدة: ولا مرة نستسلم (المؤجّل ما ينحسب من الـ 3)
  for (let i = 0; i < 6; i++) await assert.rejects(() => handleUpdate(upd, e, send), SendFailed);
  assert.equal(n, 1);
  t += 100_000;
  await handleUpdate(upd, e, send);
  assert.equal(sent.length, 1);
  await handleUpdate(upd, e, send); // خلصنا منه
  assert.equal(sent.length, 1);
});


/* ===== الجولة الثالثة: الإعادة ما تنحسب في حد الرسائل ===== */

test('429 طويل + تيليجرام يعيد نفس التحديث 30 مرة: ما يوقفه حد الرسائل، ويرد مرة وحدة بعد المدة', async () => {
  resetBotMemory();
  let t = 9_000_000, n = 0;
  const sent: any[] = [];
  const send = async (_m: string, body: any) => { n++; if (n === 1) return { ok: false, error_code: 429, parameters: { retry_after: 99 } }; sent.push(body); return { ok: true }; };
  const upd = { update_id: 999001, ...msg('مهمة: إعادة كثيرة') };
  const e: Env = { ...env, sleep: noSleep, now: () => t };
  for (let i = 0; i < 30; i++) await assert.rejects(() => handleUpdate(upd, e, send), SendFailed, 'الإعادة رقم ' + (i + 1));
  assert.equal(n, 1); // ولا مرة لمسنا تيليجرام خلال المدة
  t += 100_000;
  await handleUpdate(upd, e, send);
  assert.equal(sent.length, 1);
  assert.ok(String(sent[0].text).includes('إعادة كثيرة')); // الرد الحقيقي، مو رسالة «رسائل كثيرة»
});

test('حد الرسائل للرسائل الجديدة: 21 رسالة مختلفة من نفس الشخص = الأخيرة تنحجب', async () => {
  resetBotMemory();
  const sent: any[] = [];
  const send = async (_m: string, body: any) => { sent.push(body); return { ok: true }; };
  const from = { id: 424242, is_bot: false, language_code: 'ar' };
  for (let i = 0; i < 22; i++) await handleUpdate({ update_id: 999100 + i, message: { text: 'مهمة ' + i, chat: { id: 5, type: 'private' }, from } }, env, send);
  assert.equal(sent.length, 21); // 20 رد + تنبيه «رسائل كثيرة» مرة وحدة، والـ 22 بدون رد
  assert.ok(String(sent[20].text).includes('رسائل كثيرة'));
});
