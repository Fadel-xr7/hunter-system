// اختبارات مساعد البوت (assistant.ts) من طريق تيليجرام نفسه (handleUpdate). بدون شبكة: Groq وهمي يرجع اللي نحدده.
// هذي تختبر منطقنا (الحدود، الذاكرة، الفحص، الروابط)، مو فهم الموديل للهجة. الموديل الحقيقي: scripts/groq-dialect-eval.ts
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate, resetBotMemory, serve, webhookSecret, SendFailed, type Env } from '../supabase/functions/telegram-bot/index.ts';
import {
  clockAt, checkTask, findExplicitAdd, isCancel, maskQuotes, peekConversation, questLink, rawLink, cleanReply,
  AI_PER_MINUTE, AI_PER_USER_DAY, AI_PER_DAY, MAX_TURNS, MAX_ASKS, type RawTask, type Clock,
} from '../supabase/functions/telegram-bot/assistant.ts';
import { loadCore } from './helpers/load-core.mjs';

// الأربعاء 28 أكتوبر 2026، 9 مساءً بتوقيت الرياض
const NOW = Date.UTC(2026, 9, 28, 18, 0);
const SITE = 'https://fadel-xr7.github.io/hunter-system/';
const C = clockAt(NOW);

const EMPTY: RawTask = {
  title: '', time: '', vague_time: '', when: 'none', weekday: null, day_of_month: null, in_minutes: null,
  repeat: 'once', repeat_phrase: '', difficulty: 'none', ability: 'none',
};
type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; throws?: string };
const model = (o: object): Reply => ({ body: { choices: [{ message: { content: JSON.stringify(o) } }] } });
const chat = (reply: string) => model({ intent: 'chat', reply, task: EMPTY });
const add = (task: Partial<RawTask>) => model({ intent: 'add_task', reply: '', task: { ...EMPTY, ...task } });

/** Groq وهمي: يرجع الردود بالترتيب (والأخير يتكرر). الرد ممكن يكون دالة ترجع Promise (رد متأخر نتحكم فيه) */
function fakeGroq(replies: (Reply | (() => Promise<Reply>))[]) {
  const calls: { url: string; init: any; body: any }[] = [];
  const f = (async (url: string, init: any) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r0 = replies.length > 1 ? replies.shift()! : replies[0];
    const r = typeof r0 === 'function' ? await r0() : r0;
    if (r.throws) throw new DOMException('x', r.throws);
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { calls, f, system: (i = -1) => calls.at(i)!.body.messages[0].content as string, msgs: (i = -1) => calls.at(i)!.body.messages as { role: string; content: string }[] };
}
function fakeSend(failFirst = 0) {
  const calls: { method: string; body: any }[] = [];
  let n = 0;
  const send = async (method: string, body: any) => { calls.push({ method, body }); if (n++ < failFirst) return { ok: false, error_code: 502 }; return { ok: true, result: {} }; };
  return { calls, send, last: () => calls.at(-1)!.body };
}
let clock = NOW;
let upd = 50_000;
const msg = (text: string, from = 7001, extra: object = {}) =>
  ({ update_id: ++upd, message: { text, chat: { id: from, type: 'private' }, from: { id: from, is_bot: false, language_code: 'ar' }, ...extra } });
const envWith = (f: typeof fetch | null): Env => ({
  token: '1:A', siteUrl: SITE, selfUrl: 'https://x.supabase.co/functions/v1/telegram-bot',
  sleep: async () => {}, now: () => clock, ...(f ? { ai: { key: 'gsk_test', fetch: f } } : {}),
});
const buttonUrl = (b: any): string | undefined => b.reply_markup?.inline_keyboard?.[0]?.[0]?.url;
const linkEntries = (url: string) => [...new URLSearchParams(url.split('#')[1])];

/** يسجّل كل اللي ينكتب في console خلال fn */
async function captureLogs(fn: () => Promise<void>) {
  const out: string[] = [];
  const keep = { log: console.log, warn: console.warn, error: console.error };
  for (const k of ['log', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { out.push(a.map(String).join(' ')); };
  try { await fn(); } finally { Object.assign(console, keep); }
  return out;
}

beforeEach(() => { resetBotMemory(); clock = NOW; });

/* ===== السوالف ===== */

test('«هلا» و«شلونك»: رد طبيعي من الموديل، بدون رابط وبدون «ما لقيت مهمة»، والسياق يوصل للرسالة الثانية', async () => {
  const g = fakeGroq([chat('هلا والله! وش أخبارك؟'), chat('بخير الحمدلله، وأنت شلونك؟')]);
  const s = fakeSend();
  await handleUpdate(msg('هلا'), envWith(g.f), s.send);
  const b = s.last();
  assert.equal(b.text, 'هلا والله! وش أخبارك؟');
  assert.equal(b.reply_markup, undefined);
  assert.equal(b.parse_mode, undefined, 'رد الموديل نص عادي');
  assert.ok(!b.text.includes('ما لقيت مهمة'));

  const req = g.calls[0];
  assert.equal(req.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(req.init.headers.authorization, 'Bearer gsk_test');
  assert.equal(req.body.model, 'openai/gpt-oss-120b');
  assert.equal(req.body.response_format.json_schema.strict, true);
  assert.ok(g.system(0).includes('2026-10-28, Wed') && g.system(0).includes('21:00'));
  assert.deepEqual(g.msgs(0).slice(1), [{ role: 'user', content: 'هلا' }]);

  await handleUpdate(msg('شلونك'), envWith(g.f), s.send);
  assert.deepEqual(g.msgs(1).slice(1), [
    { role: 'user', content: 'هلا' }, { role: 'assistant', content: 'هلا والله! وش أخبارك؟' }, { role: 'user', content: 'شلونك' },
  ]);
  assert.equal(s.last().reply_markup, undefined);
});

test('الموديل قال «مهمة» والرسالة بدون طلب صريح: ما نجهز شي', async () => {
  const g = fakeGroq([add({ title: 'أذاكر', when: 'tomorrow' })]);
  const s = fakeSend();
  const logs = await captureLogs(() => handleUpdate(msg('بكرة عندي اختبار ولازم أذاكر'), envWith(g.f), s.send));
  assert.equal(s.last().reply_markup, undefined);
  assert.match(s.last().text, /ضيف مهمة/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
  assert.deepEqual(logs, ['bot: gated_add']);
});

test('«كيف أضيف مهمة؟»: الكلمة الصريحة موجودة بس الموديل قال سوالف = رد عادي بدون رابط', async () => {
  const g = fakeGroq([chat('سهلة! اكتب: ضيف مهمة وبعدها التفاصيل.')]);
  const s = fakeSend();
  await handleUpdate(msg('كيف أضيف مهمة؟'), envWith(g.f), s.send);
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(s.last().text, 'سهلة! اكتب: ضيف مهمة وبعدها التفاصيل.');
});

test('النص المقتبس والرسالة المحوّلة ما تعتبر طلب، حتى لو الموديل قال «مهمة»', async () => {
  for (const t of ['أخوي قال لي «ضيف مهمة اغسل السيارة»', 'كتب "ضيف مهمة أذاكر" وراح', 'قال “سجل لي مهمة رياضة”', 'شفت «ضيف مهمة',
    'قال « ضيف مهمة أذاكر »', 'كتب "أبي أضيف مهمة رياضة" وراح', 'رسالته: “طيب حط لي مهمة مشي” 😂', 'كاتب «لو سمحت ضيف مهمة']) {
    assert.equal(findExplicitAdd(t), null, t);
  }
  assert.equal(maskQuotes('أ «ب» ج').length, 'أ «ب» ج'.length);
  const g = fakeGroq([add({ title: 'اغسل السيارة' })]);
  const s = fakeSend();
  await handleUpdate(msg('أخوي قال لي «ضيف مهمة اغسل السيارة»'), envWith(g.f), s.send);
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('ضيف مهمة أذاكر بكرة', 7002, { forward_origin: { type: 'user' } }), envWith(g.f), s.send);
  assert.equal(s.last().reply_markup, undefined, 'محوّلة');
  assert.ok(g.msgs().at(-1)!.content.startsWith('[رسالة محوّلة من شخص ثاني]'), 'الموديل يعرف إنها محوّلة');
});

test('findExplicitAdd: الصيغ الصريحة ونص المهمة بدون كلمة الطلب', () => {
  const yes: [string, string][] = [
    ['ضيف مهمة أذاكر بكرة الساعة 9 الليل', 'أذاكر بكرة الساعة 9 الليل'],
    ['ضيفلي مهمة: أذاكر', 'أذاكر'],
    ['أضف لي مهمة أقرأ 10 صفحات', 'أقرأ 10 صفحات'],
    ['سجّل لي مهمة رياضة', 'رياضة'],
    ['حط لي مهمه مشي', 'مشي'],
    ['لو سمحت ضيف مهمة مراجعة', 'مراجعة'],
    ['ممكن تضيف لي مهمة أكلم أمي؟', 'أكلم أمي؟'],
    ['أبي أضيف مهمة', ''],
    ['مهمة: مراجعة الكود', 'مراجعة الكود'],
    ['add a task call dad tomorrow', 'call dad tomorrow'],
    ['Add me a new task: gym at 6am', 'gym at 6am'],
    ['ضيف مهمة', ''],
    ['ضيف مهمة!', ''],
  ];
  for (const [t, rest] of yes) assert.deepEqual(findExplicitAdd(t), { rest }, t);
  for (const t of ['هلا', 'عندي مهمة بكرة', 'المهمة صعبة', 'عندي ضيف مهم بكرة', 'عندي ضيفة مهمة', 'وش المهام اللي عندي؟', 'مهمتي اليوم', 'task list']) {
    assert.equal(findExplicitAdd(t), null, t);
  }
});

/* ===== طلب الإضافة ===== */

test('طلب كامل: ملخص + زر بحقول ثابتة، والموقع يقرأ نفس التاريخ حتى لو انفتح بعدين', async () => {
  const g = fakeGroq([add({ title: 'أذاكر', time: '21:00', when: 'tomorrow', ability: 'INT' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة أذاكر بكرة الساعة 9 الليل'), envWith(g.f), s.send);
  const b = s.last();
  assert.equal(b.parse_mode, 'HTML');
  assert.ok(b.text.includes('<b>أذاكر</b>'));
  assert.ok(b.text.includes('بكرة، الخميس 29 أكتوبر، 9:00 م'), b.text);
  assert.ok(b.text.includes('القدرة: ذكاء'));
  assert.ok(b.text.includes('يسألك قبل'));
  const url = buttonUrl(b)!;
  assert.ok(url.startsWith(SITE + '#quest=1&'));
  const core = loadCore({ today: '2026-10-28' });
  for (const opened of ['2026-10-28', '2026-10-29', '2026-10-30', '2027-01-05']) {
    core.setToday(opened);
    const p = core.call('questFromLink', linkEntries(url));
    assert.deepEqual([p.kind, p.title, p.date, p.time, p.rank, p.stat], ['gate', 'أذاكر', '2026-10-29', '21:00', 'E', 'INT'], opened);
  }
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});

test('«ضيف مهمة» بدون تفاصيل: يسأل بدون ذكاء، و«مذاكرة» تكمّل نفس الطلب', async () => {
  const g = fakeGroq([add({ title: 'مذاكرة' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  assert.equal(g.calls.length, 0, 'السؤال بدون ذكاء');
  assert.match(s.last().text, /وش المهمة/);
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');

  await handleUpdate(msg('مذاكرة'), envWith(g.f), s.send);
  assert.ok(g.system().includes('Pending task request') && g.system().includes('what the task is'));
  const b = s.last();
  assert.ok(b.text.includes('<b>مذاكرة</b>'));
  assert.ok(b.text.includes('اليوم، الأربعاء 28 أكتوبر، 5:00 م (الافتراضي)'), b.text);
  const p = loadCore({ today: '2026-10-28' }).call('questFromLink', linkEntries(buttonUrl(b)!));
  assert.deepEqual([p.title, p.date, p.time], ['مذاكرة', '2026-10-28', '17:00']);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});

test('عزل المستخدمين: الطلب المعلّق والسياق لكل شخص لحاله', async () => {
  const g = fakeGroq([chat('هلا'), chat('مذاكرة؟ وش تقصد؟'), add({ title: 'مذاكرة' })]);
  const s = fakeSend();
  await handleUpdate(msg('هلا', 1), envWith(g.f), s.send); // سياق عند 1
  await handleUpdate(msg('ضيف مهمة', 1), envWith(g.f), s.send); // طلب معلّق عند 1
  await handleUpdate(msg('مذاكرة', 2), envWith(g.f), s.send); // 2 ما عنده شي
  assert.ok(!g.system().includes('Pending'), 'طلب 1 ما يوصل لـ 2');
  assert.deepEqual(g.msgs().slice(1), [{ role: 'user', content: 'مذاكرة' }], 'سياق 1 ما يوصل لـ 2');
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(peekConversation(2, 2)!.pending, null);

  await handleUpdate(msg('مذاكرة', 1), envWith(g.f), s.send);
  assert.ok(g.system().includes('Pending'));
  assert.ok(buttonUrl(s.last())!.includes('#quest=1'));
});

test('الإلغاء: «إلغاء» و/cancel بدون ذكاء، وبعدها «مذاكرة» سوالف عادية', async () => {
  for (const t of ['إلغاء', 'الغ', 'الغيها', 'خلاص', 'لا تضيفها', 'كنسل', 'cancel', '/cancel', 'إلغاء!']) assert.equal(isCancel(t), true, t);
  for (const t of ['الغ المهمة اللي أمس', 'لا', 'مذاكرة']) assert.equal(isCancel(t), false, t);
  const g = fakeGroq([chat('حلو، وش بتذاكر؟')]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  await handleUpdate(msg('إلغاء'), envWith(g.f), s.send);
  assert.match(s.last().text, /تم الإلغاء/);
  assert.equal(g.calls.length, 0);
  await handleUpdate(msg('مذاكرة'), envWith(g.f), s.send);
  assert.ok(!g.system().includes('Pending'));
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('/cancel'), envWith(g.f), s.send);
  assert.match(s.last().text, /ما فيه طلب معلّق/);
});

test('وقت صلاة بدون ساعة: يسأل بدل ما يخمّن، والجواب يكمّل (والعنوان من المسودة)', async () => {
  const g = fakeGroq([add({ title: 'أروح النادي', vague_time: 'بعد المغرب', ability: 'STR' }), add({ time: '19:30' })]);
  const s = fakeSend();
  await handleUpdate(msg('سجّل لي مهمة أروح النادي بعد المغرب'), envWith(g.f), s.send);
  assert.match(s.last().text, /«بعد المغرب» بدون ساعة/);
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(peekConversation(7001, 7001)!.pending, 'time');
  await handleUpdate(msg('7 ونص'), envWith(g.f), s.send);
  const p = loadCore({ today: '2026-10-28' }).call('questFromLink', linkEntries(buttonUrl(s.last())!));
  assert.deepEqual([p.title, p.date, p.time, p.stat], ['أروح النادي', '2026-10-28', '19:30', 'STR']);
});

test('سؤال الساعة: «بدون وقت» = الافتراضي، وجواب ما فيه ساعة = نسأل مرة ثانية (ما نخمّن)', async () => {
  const g = fakeGroq([add({ title: 'صلاة الفجر', vague_time: 'الفجر', repeat: 'daily' }), add({ title: 'صلاة الفجر', repeat: 'daily' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة صلاة الفجر كل يوم'), envWith(g.f), s.send);
  assert.match(s.last().text, /9 الصبح/, 'اليومية: الافتراضي 9');
  await handleUpdate(msg('هممم'), envWith(g.f), s.send);
  assert.match(s.last().text, /الساعة كم/);
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('بدون وقت'), envWith(g.f), s.send);
  const b = s.last();
  assert.ok(b.text.includes('كل يوم، 9:00 ص (الافتراضي)'), b.text);
  assert.deepEqual(linkEntries(buttonUrl(b)!).map(([k]) => k).sort(), ['h', 'k', 'quest', 's', 't']);
});

test('تكرار غير مدعوم («كل خميس»): يوضح ويسأل، و«مرة وحدة» أو «كل يوم» يكمّل', async () => {
  const draft = { title: 'أرتب غرفتي', repeat: 'unsupported' as const, repeat_phrase: 'كل خميس', when: 'weekday' as const, weekday: 4 };
  const g = fakeGroq([add(draft), add({ title: 'أرتب غرفتي', when: 'weekday', weekday: 4 }), add(draft), add({ repeat: 'daily' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة أرتب غرفتي كل خميس'), envWith(g.f), s.send);
  assert.match(s.last().text, /«كل خميس» ما أقدر أضبطه/);
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('مرة وحدة'), envWith(g.f), s.send);
  let p = loadCore({ today: '2026-10-28' }).call('questFromLink', linkEntries(buttonUrl(s.last())!));
  assert.deepEqual([p.kind, p.date], ['gate', '2026-10-29']);

  await handleUpdate(msg('ضيف مهمة أرتب غرفتي كل خميس'), envWith(g.f), s.send);
  await handleUpdate(msg('كل يوم'), envWith(g.f), s.send);
  p = loadCore({ today: '2026-10-28' }).call('questFromLink', linkEntries(buttonUrl(s.last())!));
  assert.deepEqual([p.kind, p.title], ['fixed', 'أرتب غرفتي']);
});

test('ثلاث أسئلة بدون جواب واضح: نترك الطلب ونقول نبدأ من جديد', async () => {
  const g = fakeGroq([add({})]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  for (let i = 1; i < MAX_ASKS; i++) await handleUpdate(msg('ما أدري'), envWith(g.f), s.send);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
  await handleUpdate(msg('ما أدري'), envWith(g.f), s.send);
  assert.match(s.last().text, /نبدأ من جديد/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});

/* ===== الحقول الغلط والتواريخ ===== */

const T = (o: Partial<RawTask>): RawTask => ({ ...EMPTY, title: 'مهمة', ...o });
const at = (iso: string, h: number, m = 0): Clock => clockAt(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8)), h - 3, m));

test('الحقول الغلط أو المتناقضة ترفض (ما تتحول لـ «اليوم 5 مساءً»)، والغايبة تاخذ الافتراضي', () => {
  const bad: [Partial<RawTask>, string][] = [
    [{ time: '25:99' }, 'invalid_time'], [{ time: '9:00 PM' }, 'invalid_time'], [{ time: 'الليل' }, 'invalid_time'],
    [{ when: 'weekday', weekday: 9 }, 'invalid_weekday'], [{ when: 'weekday', weekday: null }, 'invalid_weekday'],
    [{ when: 'day_of_month', day_of_month: 40 }, 'invalid_day_of_month'], [{ when: 'day_of_month', day_of_month: null }, 'invalid_day_of_month'],
    [{ when: 'in_minutes', in_minutes: -5 }, 'invalid_in_minutes'], [{ when: 'in_minutes', in_minutes: 60, time: '20:00' }, 'conflict_in_minutes_time'],
    [{ when: 'in_minutes', in_minutes: 60, vague_time: 'المغرب' }, 'conflict_in_minutes_time'],
    [{ when: 'tomorrow', weekday: 2 }, 'conflict_weekday'], [{ when: 'tomorrow', day_of_month: 15 }, 'conflict_day_of_month'],
    [{ when: 'none', in_minutes: 30 }, 'conflict_in_minutes'], [{ repeat: 'daily', when: 'tomorrow' }, 'conflict_daily_date'],
    [{ repeat: 'daily', when: 'weekday', weekday: 4 }, 'conflict_daily_date'],
  ];
  for (const [o, code] of bad) assert.deepEqual(checkTask(T(o), C), { ok: false, code }, JSON.stringify(o));
  // متوافقة: «بكرة» والموديل حط الخميس، وبكرة الخميس
  assert.equal((checkTask(T({ when: 'tomorrow', weekday: 4, day_of_month: 29 }), C) as any).final.date, '2026-10-29');
  const def = (checkTask(T({}), C) as any).final;
  assert.deepEqual([def.date, def.time, def.timeDefault, def.rank, def.stat], ['2026-10-28', '17:00', true, 'E', 'SENSE']);
  assert.equal((checkTask(T({ time: '7:05' }), C) as any).final.time, '07:05');
});

test('حقل غلط من الموديل وسط طلب: نطلب إعادة، بدون رابط بحقول، وزر «كما كتبتها» يحفظ الطلب', async () => {
  const g = fakeGroq([add({ title: 'أذاكر', time: '25:99', when: 'tomorrow' })]);
  const s = fakeSend();
  const logs = await captureLogs(() => handleUpdate(msg('ضيف مهمة أذاكر بكرة الساعة 9 الليل'), envWith(g.f), s.send));
  const b = s.last();
  assert.match(b.text, /ما قدرت أفهم تفاصيل المهمة بشكل أكيد/);
  assert.equal(buttonUrl(b), SITE + '#add=' + encodeURIComponent('أذاكر بكرة الساعة 9 الليل') + '&on=2026-10-28');
  assert.ok(!b.text.includes('📝'));
  assert.deepEqual(logs, ['bot: invalid_time']);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
});

test('التواريخ: نص الليل، آخر الشهر، آخر السنة، «يوم 31»، وأيام الأسبوع', () => {
  const d = (o: Partial<RawTask>, c: Clock) => { const r = checkTask(T(o), c) as any; return [r.final.date, r.final.time]; };
  assert.deepEqual(d({ when: 'in_minutes', in_minutes: 120 }, at('2026-10-28', 23, 10)), ['2026-10-29', '01:10']);
  assert.deepEqual(d({ when: 'in_minutes', in_minutes: 0 }, at('2026-10-28', 23, 59)), ['2026-10-28', '23:59']);
  assert.deepEqual(d({ when: 'in_minutes', in_minutes: 30 }, at('2026-12-31', 23, 45)), ['2027-01-01', '00:15']);
  assert.deepEqual(d({ when: 'tomorrow', time: '08:00' }, at('2026-10-31', 21)), ['2026-11-01', '08:00']);
  assert.deepEqual(d({ when: 'tomorrow' }, at('2026-12-31', 21)), ['2027-01-01', '17:00']);
  assert.deepEqual(d({ when: 'after_tomorrow' }, at('2026-12-31', 21)), ['2027-01-02', '17:00']);
  assert.deepEqual(d({ when: 'after_tomorrow' }, at('2028-02-28', 9)), ['2028-03-01', '17:00']);
  assert.deepEqual(d({ when: 'day_of_month', day_of_month: 31 }, at('2026-11-05', 9)), ['2026-12-31', '17:00']);
  assert.deepEqual(d({ when: 'day_of_month', day_of_month: 30 }, at('2027-02-01', 9)), ['2027-03-30', '17:00']);
  assert.deepEqual(d({ when: 'day_of_month', day_of_month: 5 }, at('2026-11-05', 9)), ['2026-11-05', '17:00']);
  assert.deepEqual(d({ when: 'day_of_month', day_of_month: 4 }, at('2026-12-05', 9)), ['2027-01-04', '17:00']);
  assert.deepEqual(d({ when: 'weekday', weekday: 3 }, C), ['2026-10-28', '17:00'], 'الأربعاء = اليوم');
  assert.deepEqual(d({ when: 'weekday', weekday: 0 }, C), ['2026-11-01', '17:00'], 'الأحد يعبر الشهر');
  // ساعة الرياض: 9:30 مساءً بتوقيت UTC = 12:30 بعد نص الليل في الرياض
  assert.deepEqual(clockAt(Date.UTC(2026, 9, 28, 21, 30)), { date: '2026-10-29', weekday: 4, hour: 0, minute: 30 });
});

test('كل رابط نبنيه يقرأه الموقع بنفس الحقول بالضبط، وفي أي يوم ينفتح', () => {
  const cases: [Partial<RawTask>, Clock][] = [
    [{ title: 'أذاكر', when: 'tomorrow', time: '21:00', difficulty: 'B', ability: 'INT' }, C],
    [{ title: 'مشي', when: 'in_minutes', in_minutes: 120 }, at('2026-10-28', 23, 10)],
    [{ title: 'سنة جديدة', when: 'tomorrow', time: '00:15' }, at('2026-12-31', 21)],
    [{ title: 'فاتورة', when: 'day_of_month', day_of_month: 31 }, at('2026-11-05', 9)],
    [{ title: 'اقرأ 10 صفحات', repeat: 'daily', time: '22:00', ability: 'INT' }, C],
    [{ title: 'مراجعة بكرة يومي 8 مساء', when: 'today', time: '23:00' }, C], // العنوان ما ينقرأ أوامر
  ];
  for (const [o, c] of cases) {
    const f = (checkTask(T(o), c) as any).final;
    const url = questLink(SITE, f);
    for (const opened of [c.date, '2027-06-01']) {
      const p = loadCore({ today: opened }).call('questFromLink', linkEntries(url));
      assert.equal(p.title, f.title, url);
      assert.equal(p.kind, f.kind === 'daily' ? 'fixed' : 'gate');
      assert.equal(p.time, f.time);
      assert.equal(p.stat, f.stat);
      if (f.kind === 'gate') { assert.equal(p.date, f.date); assert.equal(p.rank, f.rank); }
    }
  }
});

test('رابط الطوارئ (#add مع on): «بكرة» تبقى يوم الإرسال +1 لو انفتح بعدين', () => {
  const url = rawLink(SITE, 'أذاكر بكرة الساعة 9 الليل', '2026-10-28');
  const core = loadCore({ today: '2026-10-30' });
  const a = core.call('addLinkParts', url.split('#add=')[1]);
  const p = core.call('parseQuick', a.text, { base: a.base });
  assert.deepEqual([p.date, p.time, p.title], ['2026-10-29', '21:00', 'أذاكر']);
});

test('العنوان: يتهرّب في الملخص، ويوصل الموقع كما هو (ما يتحول لتاريخ أو تكرار)', async () => {
  const g = fakeGroq([add({ title: 'كلم <i>أمي</i> & أبوي بكرة يومي' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة كلم أمي وأبوي'), envWith(g.f), s.send);
  const b = s.last();
  assert.ok(b.text.includes('<b>كلم i أمي /i &amp; أبوي بكرة يومي</b>'), b.text);
  const p = loadCore({ today: '2026-10-28' }).call('questFromLink', linkEntries(buttonUrl(b)!));
  assert.deepEqual([p.title, p.kind, p.date], ['كلم i أمي /i & أبوي بكرة يومي', 'gate', '2026-10-28']);
});

test('اليومية مع صعوبة: نقول إن اليومية ما لها صعوبة. والوقت اللي فات اليوم: تنبيه', async () => {
  const g = fakeGroq([add({ title: 'تمرين', repeat: 'daily', difficulty: 'A' }), add({ title: 'اجتماع', time: '08:00' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة تمرين صعب مرة كل يوم'), envWith(g.f), s.send);
  assert.match(s.last().text, /اليومية ما لها صعوبة/);
  await handleUpdate(msg('ضيف مهمة اجتماع 8 الصبح'), envWith(g.f), s.send);
  assert.match(s.last().text, /هالموعد فات/);
});

test('الإنجليزي: طلب صريح بالإنجليزي، وملخص بالإنجليزي', async () => {
  const g = fakeGroq([add({ title: 'call dad', time: '19:00', when: 'tomorrow' })]);
  const s = fakeSend();
  await handleUpdate(msg('add a task: call dad tomorrow at 7pm'), envWith(g.f), s.send);
  assert.ok(s.last().text.includes('tomorrow, Thursday 29 October, 7:00 pm'), s.last().text);
  assert.equal(s.last().reply_markup.inline_keyboard[0][0].text, '⚔️ Add it to the System');
});

/* ===== الأعطال والحدود ===== */

const FAILURES: [Reply, string][] = [
  [{ status: 429, headers: { 'retry-after': '3' } }, 'groq_429'],
  [{ throws: 'TimeoutError' }, 'groq_timeout'],
  [{ throws: 'TypeError' }, 'groq_network'],
  [{ status: 503 }, 'groq_5xx'],
  [{ status: 401 }, 'groq_auth'],
  [{ status: 400, body: { error: { message: 'schema' } } }, 'groq_4xx'],
  [{ body: { choices: [{ message: { content: 'not json' } }] } }, 'groq_bad_json'],
  [model({ intent: 'maybe', reply: '', task: EMPTY }), 'groq_bad_shape'],
  [model({ intent: 'add_task', reply: '', task: { ...EMPTY, when: 'someday' } }), 'groq_bad_shape'],
];

test('تعذّر الذكاء أثناء السوالف: رسالة تعذّر بسيطة، بدون رابط ولا مهمة', async () => {
  for (const [r, code] of FAILURES) {
    resetBotMemory();
    const g = fakeGroq([r]);
    const s = fakeSend();
    const logs = await captureLogs(() => handleUpdate(msg('هلا شلونك'), envWith(g.f), s.send));
    assert.match(s.last().text, /ما قدرت أرد الحين/, code);
    assert.equal(s.last().reply_markup, undefined, code);
    assert.ok(!s.last().text.includes('#add') && !s.last().text.includes('#quest'), code);
    assert.deepEqual(logs, ['bot: ' + code]);
  }
});

test('تعذّر الذكاء أثناء طلب إضافة: يقول إنه ما فهم، وزر «كما كتبتها» يحفظ الطلب والتأكيد', async () => {
  for (const [r, code] of FAILURES) {
    resetBotMemory();
    const g = fakeGroq([r]);
    const s = fakeSend();
    await captureLogs(() => handleUpdate(msg('ضيف مهمة أذاكر بكرة 9 الليل'), envWith(g.f), s.send));
    const b = s.last();
    assert.match(b.text, /ما قدرت أفهم تفاصيل المهمة الحين/, code);
    assert.ok(!b.text.includes('📝'), code);
    assert.equal(b.reply_markup.inline_keyboard[0][0].text, 'افتحها كما كتبتها');
    assert.equal(buttonUrl(b), SITE + '#add=' + encodeURIComponent('أذاكر بكرة 9 الليل') + '&on=2026-10-28', code);
  }
});

test('بعد 429: ولا طلب لـ Groq لين تخلص المدة، وبعدها يرجع', async () => {
  const g = fakeGroq([{ status: 429, headers: { 'retry-after': '20' } }, chat('هلا')]);
  const s = fakeSend();
  await captureLogs(async () => {
    await handleUpdate(msg('هلا', 11), envWith(g.f), s.send);
    clock += 10_000;
    await handleUpdate(msg('هلا', 12), envWith(g.f), s.send);
  });
  assert.equal(g.calls.length, 1);
  assert.match(s.last().text, /ما قدرت أرد/);
  clock += 11_000;
  await handleUpdate(msg('هلا', 13), envWith(g.f), s.send);
  assert.equal(g.calls.length, 2);
  assert.equal(s.last().text, 'هلا');
});

test('حدودنا: بالدقيقة للكل، ولكل شخص باليوم، وللكل باليوم. والزايد رسالة حد بدون رابط', async () => {
  const g = fakeGroq([chat('هلا')]);
  const s = fakeSend();
  await captureLogs(async () => {
    for (let i = 0; i < AI_PER_MINUTE + 1; i++) await handleUpdate(msg('هلا', 100 + i), envWith(g.f), s.send);
  });
  assert.equal(g.calls.length, AI_PER_MINUTE);
  assert.match(s.last().text, /وصلت حد السوالف/);
  assert.equal(s.last().reply_markup, undefined);

  resetBotMemory();
  const g2 = fakeGroq([chat('هلا')]);
  await captureLogs(async () => {
    for (let i = 0; i < AI_PER_USER_DAY + 1; i++) { clock += 61_000; await handleUpdate(msg('هلا', 77), envWith(g2.f), s.send); }
  });
  assert.equal(g2.calls.length, AI_PER_USER_DAY, 'نفس الشخص يوقف عند حده');
  await handleUpdate(msg('هلا', 78), envWith(g2.f), s.send);
  assert.equal(g2.calls.length, AI_PER_USER_DAY + 1, 'شخص ثاني عادي');

  resetBotMemory();
  clock = NOW - 20 * 3_600_000; // أول اليوم نفسه
  const g3 = fakeGroq([chat('هلا')]);
  await captureLogs(async () => {
    for (let i = 0; i < AI_PER_DAY + 1; i++) { clock += 16_000; await handleUpdate(msg('هلا', 1000 + i), envWith(g3.f), s.send); }
  });
  assert.equal(g3.calls.length, AI_PER_DAY);
});

test('تيليجرام أعاد نفس التحديث بعد فشل الإرسال: طلب واحد لـ Groq، نفس الرد، والذاكرة ما تتكرر', async () => {
  const g = fakeGroq([add({ title: 'مشي', time: '07:00', when: 'tomorrow' })]);
  const s = fakeSend(3); // المحاولات الثلاث الأولى تفشل
  const m = msg('ضيف مهمة امشي بكرة 7 الصبح');
  await assert.rejects(handleUpdate(m, envWith(g.f), s.send), SendFailed);
  await handleUpdate(m, envWith(g.f), s.send);
  assert.equal(g.calls.length, 1);
  assert.equal(s.calls.length, 4);
  assert.equal(s.calls[0].body.text, s.calls[3].body.text);
  assert.equal(peekConversation(7001, 7001)!.turns, 2);

  // نفس الشي لسؤال معلّق: الإعادة ما تزيد عدد الأسئلة
  const s2 = fakeSend(3);
  const m2 = msg('ضيف مهمة', 7003);
  await assert.rejects(handleUpdate(m2, envWith(g.f), s2.send), SendFailed);
  await handleUpdate(m2, envWith(g.f), s2.send);
  assert.deepEqual(peekConversation(7003, 7003), { turns: 2, pending: 'task' });
});

test('السياق: آخر 6 رسائل بس، وينمسح بعد 30 دقيقة بدون رسائل، والطلب المعلّق بعد 15', async () => {
  const g = fakeGroq([chat('تمام')]);
  const s = fakeSend();
  for (let i = 0; i < 5; i++) { clock += 60_000; await handleUpdate(msg('رسالة ' + i), envWith(g.f), s.send); }
  assert.equal(g.msgs().length, 1 + MAX_TURNS + 1, 'النظام + آخر 6 + الحالية');
  assert.equal(g.msgs()[1].content, 'رسالة 1');
  clock += 31 * 60_000;
  await handleUpdate(msg('رجعت'), envWith(g.f), s.send);
  assert.equal(g.msgs().length, 2, 'السياق انمسح');

  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  clock += 16 * 60_000;
  await handleUpdate(msg('مذاكرة'), envWith(g.f), s.send);
  assert.ok(!g.system().includes('Pending'), 'الطلب المعلّق انتهى');
});

test('السجلات: رموز بس، بدون نص المستخدم ولا رد الموديل ولا رسالة Groq', async () => {
  const secret = 'سري-جدا-٤٢';
  const s = fakeSend();
  const logs = await captureLogs(async () => {
    await handleUpdate(msg('هلا ' + secret), envWith(fakeGroq([{ status: 400, body: { error: { message: 'bad ' + secret, failed_generation: secret } } }]).f), s.send);
    await handleUpdate(msg('ضيف مهمة ' + secret), envWith(fakeGroq([add({ title: secret, time: '99:99' })]).f), s.send);
    await handleUpdate(msg('هلا ' + secret), envWith(fakeGroq([chat('رد ' + secret)]).f), s.send);
    await handleUpdate(msg('ضيف مهمة ' + secret), envWith(fakeGroq([add({ title: secret })]).f), s.send);
    const body = '{"message":{"text":"' + secret;
    await serve(new Request('https://x/', { method: 'POST', body, headers: { 'x-telegram-bot-api-secret-token': await webhookSecret('1:A') } }), envWith(null), s.send);
  });
  assert.deepEqual(logs, ['bot: groq_4xx', 'bot: invalid_time', 'update failed SyntaxError']);
  assert.ok(logs.every((l) => !l.includes(secret)));
});

test('رد الموديل في السوالف: نص عادي بدون روابط، وطول محدود', async () => {
  const long = 'كلام '.repeat(400);
  const g = fakeGroq([chat('<b>شوف</b> https://evil.example/x و t.me/abc ' + long)]);
  const s = fakeSend();
  await handleUpdate(msg('هلا'), envWith(g.f), s.send);
  const b = s.last();
  assert.equal(b.parse_mode, undefined);
  assert.ok(!b.text.includes('https://') && !b.text.includes('t.me/'), b.text.slice(0, 80));
  assert.ok(b.text.length <= 600);
  assert.equal(b.link_preview_options.is_disabled, true);
  assert.equal(cleanReply('  '), '');
});

/* ===== بدون مفتاح، والمساعدة ===== */

test('بدون مفتاح Groq: «هلا» رد ثابت بدون رابط، والطلب الصريح رابط بكلامه، وولا طلب لـ Groq', async () => {
  const s = fakeSend();
  await handleUpdate(msg('هلا'), envWith(null), s.send);
  assert.match(s.last().text, /المحادثة الذكية مو مفعّلة/);
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('بكرة عندي اختبار'), envWith(null), s.send);
  assert.equal(s.last().reply_markup, undefined, 'كلام عادي ما يصير مهمة');
  await handleUpdate(msg('ضيف مهمة'), envWith(null), s.send);
  await handleUpdate(msg('أذاكر بكرة'), envWith(null), s.send);
  assert.equal(buttonUrl(s.last()), SITE + '#add=' + encodeURIComponent('أذاكر بكرة') + '&on=2026-10-28');
});

test('/start و/help: يشرحون السوالف والطلب الصريح والإلغاء، ويذكرون Groq لما الذكاء شغال بس', async () => {
  const s = fakeSend();
  const g = fakeGroq([chat('x')]);
  await handleUpdate(msg('/start'), envWith(g.f), s.send);
  const on = s.last().text;
  for (const w of ['سولف معي', 'ضيف مهمة', 'إلغاء', 'Groq', 'ما أقدر أشوف حسابك', 'ما تنضاف إلا لما تأكدها', '30 دقيقة', 'مرة وحدة أو كل يوم']) assert.ok(on.includes(w), w);
  await handleUpdate(msg('/help'), envWith(g.f), s.send);
  assert.equal(s.last().text, on);
  await handleUpdate(msg('/start'), envWith(null), s.send);
  assert.ok(!s.last().text.includes('Groq'));
  assert.ok(s.last().text.includes('ضيف مهمة'));
  const en = { update_id: ++upd, message: { text: '/start', chat: { id: 9, type: 'private' }, from: { id: 9, is_bot: false, language_code: 'en' } } };
  await handleUpdate(en, envWith(g.f), s.send);
  assert.ok(s.last().text.includes('add a task') && s.last().text.includes('Groq'));
  assert.equal(g.calls.length, 0, 'المساعدة بدون ذكاء');
});


/* ===== مراجعة كوديكس الثانية: الرد المتأخر، «بكرة» بعد منتصف الليل، والمحوّل أثناء الطلب المعلّق ===== */
import { saysDay } from '../supabase/functions/telegram-bot/assistant.ts';

/** رد Groq متأخر: يرجع لما نقول */
function later() {
  let resolve!: (r: Reply) => void;
  const promise = new Promise<Reply>((r) => { resolve = r; });
  return { wait: () => promise, resolve };
}
/** يخلي الرسائل اللي بدأت توصل لحد طلب Groq */
const settle = () => new Promise((r) => setTimeout(r, 5));
const riyadh = (iso: string, h: number, m: number) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8)), h - 3, m);
const questOf = (b: any) => Object.fromEntries(linkEntries(buttonUrl(b)!));

test('1. «ضيف مهمة» ← «مذاكرة بعد المغرب» وأثناء انتظار Groq /cancel: الرد المتأخر ما يرجّع الطلب ولا يسأل عن الساعة', async () => {
  const slow = later();
  const g = fakeGroq([slow.wait, chat('تمام')]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  const inFlight = handleUpdate(msg('مذاكرة بعد المغرب', 7001, { message_id: 55 }), envWith(g.f), s.send);
  await settle();
  assert.equal(g.calls.length, 1, 'الرسالة تنتظر Groq');
  await handleUpdate(msg('/cancel'), envWith(g.f), s.send);
  assert.match(s.last().text, /تم الإلغاء/);
  slow.resolve(add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }));
  await inFlight;
  const b = s.last();
  assert.match(b.text, /تجاهلت هالرسالة/);
  assert.doesNotMatch(b.text, /الساعة كم|بدون ساعة/);
  assert.equal(b.reply_markup, undefined);
  assert.deepEqual(b.reply_parameters, { message_id: 55, allow_sending_without_reply: true }, 'مربوط برسالته');
  assert.equal(peekConversation(7001, 7001)!.pending, null, 'ما انرجع طلب معلّق');
  // الرسالة الجاية سوالف عادية، مو تكملة
  await handleUpdate(msg('6 المسا'), envWith(g.f), s.send);
  assert.ok(!g.system().includes('Pending'));
  assert.equal(s.last().reply_markup, undefined);
});

test('1. طلب صريح بتفاصيل وهو ينتظر Groq: «إلغاء» يلغيه (مو «ما فيه طلب»)، والرد المتأخر ما يجهّز رابط', async () => {
  const slow = later();
  const g = fakeGroq([slow.wait]);
  const s = fakeSend();
  const inFlight = handleUpdate(msg('ضيف مهمة أذاكر بكرة 9 الليل'), envWith(g.f), s.send);
  await settle();
  await handleUpdate(msg('إلغاء'), envWith(g.f), s.send);
  assert.match(s.last().text, /تم الإلغاء/);
  slow.resolve(add({ title: 'أذاكر', when: 'tomorrow', time: '21:00' }));
  await inFlight;
  assert.match(s.last().text, /تجاهلت هالرسالة/);
  assert.equal(s.last().reply_markup, undefined);
  assert.ok(s.calls.every((c) => !c.body.reply_markup), 'ولا رابط');
});

test('1. طلب صريح جديد وهو ينتظر رد التكملة: القديم يتجاهل (بدون سؤال الساعة)، والجديد يكمل', async () => {
  const slow = later();
  const g = fakeGroq([slow.wait, add({ title: 'رياضة', time: '19:00' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  const old = handleUpdate(msg('مذاكرة بعد المغرب'), envWith(g.f), s.send);
  await settle();
  const fresh = handleUpdate(msg('ضيف مهمة رياضة الساعة 7 الليل'), envWith(g.f), s.send);
  await settle();
  slow.resolve(add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }));
  await Promise.all([old, fresh]);
  const texts = s.calls.map((c) => c.body.text);
  assert.ok(!texts.some((t) => /بدون ساعة/.test(t)), 'ما سأل عن ساعة المذاكرة');
  assert.ok(texts.some((t) => /تجاهلت هالرسالة/.test(t)));
  const links = s.calls.filter((c) => buttonUrl(c.body));
  assert.equal(links.length, 1);
  assert.equal(questOf(links[0].body).t, 'رياضة');
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});

test('1. تكملتين ورا بعض بسرعة: تنعالج وحدة وحدة، والثانية تشوف سؤال الأولى (رابط واحد)', async () => {
  const slow = later();
  const g = fakeGroq([slow.wait, add({ title: 'مذاكرة', time: '18:00' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  const a = handleUpdate(msg('مذاكرة بعد المغرب'), envWith(g.f), s.send);
  const b = handleUpdate(msg('6 المسا'), envWith(g.f), s.send);
  await settle();
  assert.equal(g.calls.length, 1, 'الثانية تنتظر دورها');
  slow.resolve(add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }));
  await Promise.all([a, b]);
  assert.ok(g.system(1).includes('a clock hour for "بعد المغرب"'), 'الثانية تكمّل سؤال الساعة');
  const links = s.calls.filter((c) => buttonUrl(c.body));
  assert.equal(links.length, 1);
  assert.deepEqual([questOf(links[0].body).t, questOf(links[0].body).h], ['مذاكرة', '18:00']);
});

test('1. سوالف ردها المتأخر «cancel» ما تلغي طلب بدأ بعدها', async () => {
  const slow = later();
  const g = fakeGroq([slow.wait]);
  const s = fakeSend();
  const chatMsg = handleUpdate(msg('هلا'), envWith(g.f), s.send);
  await settle();
  const req = handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  slow.resolve(model({ intent: 'cancel', reply: '', task: EMPTY }));
  await Promise.all([chatMsg, req]);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
  assert.match(s.last().text, /وش المهمة/);
});

test('2. 23:59 «ضيف مهمة مذاكرة بكرة بعد المغرب» والجواب 00:01: التاريخ يبقى بكرة حق يوم الطلب (والشهر والسنة)', async () => {
  const cases: [string, string, string][] = [['2026-10-28', '2026-10-29', 'الخميس 29 أكتوبر'], ['2026-10-31', '2026-11-01', 'الأحد 1 نوفمبر'], ['2026-12-31', '2027-01-01', 'الجمعة 1 يناير']];
  // الموديل في التكملة: يكرر «tomorrow»، أو يرجعها none، أو يغلط ويقول today. الثلاث لازم يعطون نفس اليوم
  for (const echo of [{ when: 'tomorrow' as const }, { when: 'none' as const }, { when: 'today' as const }]) {
    for (const [first, next, label] of cases) {
      resetBotMemory();
      clock = riyadh(first, 23, 59);
      const g = fakeGroq([add({ title: 'مذاكرة', when: 'tomorrow', vague_time: 'بعد المغرب', ability: 'INT' }), add({ title: 'مذاكرة', time: '18:00', ...echo })]);
      const s = fakeSend();
      await handleUpdate(msg('ضيف مهمة مذاكرة بكرة بعد المغرب'), envWith(g.f), s.send);
      assert.match(s.last().text, /بدون ساعة/);
      clock = riyadh(next, 0, 1);
      await handleUpdate(msg('6 المسا'), envWith(g.f), s.send);
      const q = questOf(s.last());
      const tag = `${first} ${echo.when}`;
      assert.deepEqual([q.d, q.h, q.t], [next, '18:00', 'مذاكرة'], tag);
      assert.ok(s.last().text.includes('اليوم، ' + label), tag + ': ' + s.last().text);
      assert.ok(g.system(1).includes(`its day is ${next}`), 'الموديل يشوف اليوم الثابت');
      assert.ok(!s.last().text.includes('فات'), tag);
    }
  }
});

test('2. «بكرة» انقالت بعد منتصف الليل (في التكملة): تنحسب من اليوم الجديد', async () => {
  clock = riyadh('2026-10-28', 23, 59);
  const g = fakeGroq([add({ title: 'مذاكرة', when: 'tomorrow', time: '18:00' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  clock = riyadh('2026-10-29', 0, 1);
  await handleUpdate(msg('مذاكرة بكرة 6 المسا'), envWith(g.f), s.send);
  assert.equal(questOf(s.last()).d, '2026-10-30');
  for (const t of ['بكرة', 'وبكرة', 'باجر', 'الخميس', 'بعد ساعة', 'يوم 15', 'الليلة', 'tomorrow']) assert.equal(saysDay('مذاكرة ' + t), true, t);
  for (const t of ['6 المسا', 'بعد المغرب', 'بدون وقت', 'كل يوم', 'مرة وحدة', 'قال «بكرة»']) assert.equal(saysDay(t), false, t);
});

test('2. بدون يوم: المهمة لليوم اللي تكتمل فيه. و«الليلة» انقالت أمس: تبقى أمس مع تنبيه «فات»', async () => {
  clock = riyadh('2026-10-28', 23, 59);
  let g = fakeGroq([add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }), add({ title: 'مذاكرة', time: '18:00' })]);
  let s = fakeSend();
  await handleUpdate(msg('ضيف مهمة مذاكرة بعد المغرب'), envWith(g.f), s.send);
  clock = riyadh('2026-10-29', 0, 1);
  await handleUpdate(msg('6 المسا'), envWith(g.f), s.send);
  assert.equal(questOf(s.last()).d, '2026-10-29');

  resetBotMemory();
  clock = riyadh('2026-10-28', 23, 59);
  g = fakeGroq([add({ title: 'أذاكر', when: 'today', vague_time: 'بعد العشا' }), add({ title: 'أذاكر', time: '23:00' })]);
  s = fakeSend();
  await handleUpdate(msg('ضيف مهمة الليلة أذاكر بعد العشا'), envWith(g.f), s.send);
  clock = riyadh('2026-10-29', 0, 1);
  await handleUpdate(msg('11 الليل'), envWith(g.f), s.send);
  assert.equal(questOf(s.last()).d, '2026-10-28');
  assert.match(s.last().text, /هالموعد فات/);
});

test('2. تعذّر تكملة الطلب بعد منتصف الليل: نطلب رسالة كاملة بدل دمج كلمات من يومين في رابط', async () => {
  clock = riyadh('2026-12-31', 23, 59);
  const g = fakeGroq([add({ title: 'مذاكرة', when: 'tomorrow', vague_time: 'بعد المغرب' }), { status: 503 }]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة مذاكرة بكرة بعد المغرب'), envWith(g.f), s.send);
  clock = riyadh('2027-01-01', 0, 1);
  await captureLogs(() => handleUpdate(msg('6 المسا'), envWith(g.f), s.send));
  assert.equal(buttonUrl(s.last()), undefined);
  assert.match(s.last().text, /رسالة واحدة/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});

test('3. «ضيف مهمة» ثم رسالة محوّلة «اغسل السيارة»: ما تكمّل الطلب حتى لو الموديل قال مهمة، والطلب يبقى', async () => {
  const g = fakeGroq([add({ title: 'اغسل السيارة' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  await captureLogs(() => handleUpdate(msg('اغسل السيارة', 7001, { forward_origin: { type: 'user' } }), envWith(g.f), s.send));
  assert.equal(s.last().reply_markup, undefined);
  assert.ok(!g.system().includes('Pending'), 'الموديل ما يشوفها تكملة');
  assert.ok(g.msgs().at(-1)!.content.startsWith('[رسالة محوّلة من شخص ثاني]'));
  assert.equal(peekConversation(7001, 7001)!.pending, 'task', 'الطلب المعلّق باقي لكلامك أنت');
  // ومحوّلة «إلغاء» ما تلغي
  await handleUpdate(msg('إلغاء', 7001, { forward_from: { id: 1 } }), envWith(fakeGroq([chat('طيب')]).f), s.send);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
});

test('3. محوّلة أثناء طلب معلّق وGroq متعطل: رسالة تعذّر سوالف، بدون زر «كما كتبتها»', async () => {
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(fakeGroq([chat('x')]).f), s.send);
  await captureLogs(() => handleUpdate(msg('اغسل السيارة', 7001, { forward_origin: { type: 'user' } }), envWith(fakeGroq([{ status: 503 }]).f), s.send));
  assert.match(s.last().text, /ما قدرت أرد الحين/);
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
});

test('3. بدون مفتاح: المحوّلة والمقتبسة أثناء طلب معلّق ما تصير رابط، وكلامك أنت يصير', async () => {
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(null), s.send);
  await handleUpdate(msg('اغسل السيارة', 7001, { forward_origin: { type: 'user' } }), envWith(null), s.send);
  assert.equal(s.last().reply_markup, undefined);
  await handleUpdate(msg('«اغسل السيارة»'), envWith(null), s.send);
  assert.equal(s.last().reply_markup, undefined);
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
  await handleUpdate(msg('مذاكرة'), envWith(null), s.send);
  assert.equal(buttonUrl(s.last()), SITE + '#add=' + encodeURIComponent('مذاكرة') + '&on=2026-10-28');
});

test('3. رسالة كلها اقتباس أثناء طلب معلّق: سوالف (الموديل يعرف إنها مقتبسة). وكلامك مع اقتباس: تكملة', async () => {
  const g = fakeGroq([add({ title: 'اغسل السيارة' }), add({ title: 'مذاكرة' })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة'), envWith(g.f), s.send);
  await captureLogs(() => handleUpdate(msg('«اغسل السيارة»'), envWith(g.f), s.send));
  assert.equal(s.last().reply_markup, undefined);
  assert.ok(!g.system().includes('Pending'));
  assert.ok(g.msgs().at(-1)!.content.startsWith('[نص مقتبس بس]'));
  assert.equal(peekConversation(7001, 7001)!.pending, 'task');
  await handleUpdate(msg('مذاكرة، وأخوي قال «اغسل السيارة»'), envWith(g.f), s.send);
  assert.ok(g.system().includes('Pending'));
  assert.equal(questOf(s.last()).t, 'مذاكرة');
});

test('2. «كل خميس» واليوم داخل التكرار (المسودة بدون يوم): «مرة وحدة» تاخذ الخميس من وقت الطلب، حتى بعد منتصف الليل', async () => {
  clock = riyadh('2026-10-27', 23, 59); // الثلاثاء
  const g = fakeGroq([add({ title: 'أرتب غرفتي', repeat: 'unsupported', repeat_phrase: 'كل خميس' }), add({ title: 'أرتب غرفتي', when: 'weekday', weekday: 4 })]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة أرتب غرفتي كل خميس'), envWith(g.f), s.send);
  clock = riyadh('2026-10-28', 0, 1); // الأربعاء
  await handleUpdate(msg('مرة وحدة'), envWith(g.f), s.send);
  assert.equal(questOf(s.last()).d, '2026-10-29');
});


/* ===== الجولة الثالثة: الروابط البديلة أثناء تكملة طلب ===== */

test('4. بكرة في تكملة بعد منتصف الليل مع 503: لا رابط خاطئ، وإعادة الطلب كاملة تثبت التاريخ عبر الشهر والسنة', async () => {
  for (const [first, next, target] of [
    ['2026-10-28', '2026-10-29', '2026-10-30'],
    ['2026-10-31', '2026-11-01', '2026-11-02'],
    ['2026-12-31', '2027-01-01', '2027-01-02'],
  ]) {
    resetBotMemory();
    clock = riyadh(first, 23, 59);
    const g = fakeGroq([
      add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }),
      { status: 503 },
      add({ title: 'مذاكرة', when: 'tomorrow', time: '18:00' }),
    ]);
    const s = fakeSend();
    await handleUpdate(msg('ضيف مهمة مذاكرة بعد المغرب'), envWith(g.f), s.send);
    clock = riyadh(next, 0, 1);
    await captureLogs(() => handleUpdate(msg('بكرة الساعة 6 المسا'), envWith(g.f), s.send));
    assert.equal(buttonUrl(s.last()), undefined, first);
    assert.match(s.last().text, /رسالة واحدة/);
    assert.equal(peekConversation(7001, 7001)!.pending, null);
    clock += 31_000; // انتهت مهلة التوقف بعد 503
    await handleUpdate(msg('ضيف مهمة مذاكرة بكرة الساعة 6 المسا'), envWith(g.f), s.send);
    const q = questOf(s.last());
    assert.deepEqual([q.t, q.d, q.h], ['مذاكرة', target, '18:00']);
    const core = loadCore({ today: '2027-02-01' });
    const parsed = core.call('questFromLink', linkEntries(buttonUrl(s.last())!));
    assert.equal(parsed.date, target, 'التاريخ ثابت حتى عند فتح الرابط لاحقاً');
  }
});

test('4. كل أعطال Groq أو حقوله الخاطئة أثناء التكملة: إعادة كاملة بدون رابط ولا طلب قديم', async () => {
  for (const [failure, code] of [...FAILURES, [add({ title: 'مذاكرة', when: 'tomorrow', time: '25:99' }), 'invalid_time']] as [Reply, string][]) {
    resetBotMemory();
    clock = riyadh('2026-10-28', 23, 59);
    const g = fakeGroq([add({ title: 'مذاكرة', vague_time: 'بعد المغرب' }), failure]);
    const s = fakeSend();
    await handleUpdate(msg('ضيف مهمة مذاكرة بعد المغرب'), envWith(g.f), s.send);
    clock = riyadh('2026-10-29', 0, 1);
    const logs = await captureLogs(() => handleUpdate(msg('بكرة الساعة 6 المسا'), envWith(g.f), s.send));
    assert.equal(buttonUrl(s.last()), undefined, code);
    assert.match(s.last().text, /رسالة واحدة/, code);
    assert.equal(peekConversation(7001, 7001)!.pending, null, code);
    assert.deepEqual(logs, ['bot: ' + code]);
    await handleUpdate(msg('/cancel'), envWith(g.f), s.send);
    assert.match(s.last().text, /ما فيه طلب معلّق/);
  }
});

test('4. إذا اختفى المفتاح أثناء تكملة ساعة: نطلب إعادة كاملة ثم السوالف تبقى بدون رابط', async () => {
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة مذاكرة بعد المغرب'), envWith(fakeGroq([add({ title: 'مذاكرة', vague_time: 'بعد المغرب' })]).f), s.send);
  await captureLogs(() => handleUpdate(msg('بكرة الساعة 6 المسا'), envWith(null), s.send));
  assert.equal(buttonUrl(s.last()), undefined);
  assert.match(s.last().text, /رسالة واحدة/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
  await handleUpdate(msg('هلا'), envWith(null), s.send);
  assert.equal(buttonUrl(s.last()), undefined);
  assert.match(s.last().text, /هلا/);
});

test('4. «ضيف مهمة» بدون تفاصيل ثم المهمة كاملة بعد منتصف الليل: البديل يستخدم يوم كتابة التفاصيل', async () => {
  for (const enabled of [false, true]) {
    resetBotMemory();
    clock = riyadh('2026-12-31', 23, 59);
    const env = envWith(enabled ? fakeGroq([{ status: 503 }]).f : null);
    const s = fakeSend();
    await handleUpdate(msg('ضيف مهمة'), env, s.send);
    clock = riyadh('2027-01-01', 0, 1);
    await captureLogs(() => handleUpdate(msg('مذاكرة بكرة الساعة 6 المسا'), env, s.send));
    const url = buttonUrl(s.last())!;
    assert.ok(url.endsWith('&on=2027-01-01'));
    const core = loadCore({ today: '2027-01-03' });
    const a = core.call('addLinkParts', url.split('#add=')[1]);
    const p = core.call('parseQuick', a.text, { base: a.base });
    assert.deepEqual([p.title, p.date, p.time], ['مذاكرة', '2027-01-02', '18:00']);
  }
});

test('4. تصحيح اليوم في نفس اليوم وتجاوز الحد: لا يدمج «بكرة» و«اليوم» في رابط بديل', async () => {
  const g = fakeGroq([add({ title: 'مذاكرة', when: 'tomorrow', vague_time: 'بعد المغرب' }), chat('هلا')]);
  const s = fakeSend();
  await handleUpdate(msg('ضيف مهمة مذاكرة بكرة بعد المغرب'), envWith(g.f), s.send);
  for (let i = 0; i < AI_PER_MINUTE - 1; i++) await handleUpdate(msg('هلا', 8000 + i), envWith(g.f), s.send);
  const logs = await captureLogs(() => handleUpdate(msg('لا، اليوم الساعة 6 المسا'), envWith(g.f), s.send));
  assert.equal(buttonUrl(s.last()), undefined);
  assert.match(s.last().text, /رسالة واحدة/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
  assert.deepEqual(logs, ['bot: limit_minute']);
});

test('4. English continuation failure asks for the whole task in one message, with no link', async () => {
  const g = fakeGroq([add({ title: 'study', vague_time: 'evening' }), { status: 503 }]);
  const s = fakeSend();
  const english = (text: string) => {
    const u = msg(text);
    u.message.from.language_code = 'en';
    return u;
  };
  await handleUpdate(english('add a task study in the evening'), envWith(g.f), s.send);
  await captureLogs(() => handleUpdate(english('tomorrow at 6 pm'), envWith(g.f), s.send));
  assert.equal(buttonUrl(s.last()), undefined);
  assert.match(s.last().text, /one message/);
  assert.doesNotMatch(s.last().text, /[\u0600-\u06FF]/);
  assert.equal(peekConversation(7001, 7001)!.pending, null);
});
