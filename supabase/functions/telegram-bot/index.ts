// بوت تيليجرام لنظام الصياد: بوت واحد يخدم الكل، ويشتغل على Supabase 24 ساعة.
//
// ترسل له مهمة بسطر واحد، فيرد برابط فيه المهمة. تضغطه فيفتح موقعك ويسألك قبل الإضافة.
// البوت ما يحفظ أي شي ولا يوصل لقاعدة البيانات: المهمة تنضاف في متصفحك وحسابك أنت،
// فلو استخدمه أكثر من شخص، كل واحد مهامه تروح له بس.
//
// الإعداد (مرة وحدة):
//   1. في لوحة Supabase: Edge Functions ← Secrets، أضف TELEGRAM_BOT_TOKEN (من @BotFather).
//      واختياري SITE_URL لو تبي رابط غير الافتراضي.
//      وأضف SETUP_KEY: أي كلمة طويلة عشوائية من عندك (تحمي رابط الإعداد).
//   2. افتح في المتصفح: https://<project>.supabase.co/functions/v1/telegram-bot?setup=1&key=<SETUP_KEY>
//      يربط البوت بهذي الدالة (webhook) ويضبط قائمة الأوامر. بدون المفتاح الصحيح يرفض.
//
// الحماية:
//   - تيليجرام يرسل معه سر (secret_token) مشتق من التوكن، وأي طلب بدونه ينرفض.
//   - يرد في المحادثات الخاصة بس، والرسالة أقصر من 300 حرف، و20 رسالة بالدقيقة لكل شخص.
//   - لو فشل إرسال الرد (مشكلة شبكة أو 5xx) يعيد المحاولة، وبعدها يرجع 500 فتيليجرام يعيد التحديث.
//     لو تيليجرام قال «انتظر» (429) أكثر من 5 ثواني، ما نرسل شي لين تخلص المدة، ونخلي تيليجرام يعيد التحديث بعدين.
//   - منع تكرار الرد بالذاكرة: نفس التحديث لو وصل وهو للحين ينعالج، أو بعد ما خلص، ما ينرد عليه مرة ثانية.
//     حدود هذا الضمان: الذاكرة لكل نسخة من الدالة بس. لو Supabase شغّل نسختين بنفس الوقت، أو أعاد تشغيل
//     الدالة، تحديث معاد ممكن ينرد عليه مرة ثانية. وكذلك لو الرد وصل وانقطع الاتصال قبل ما نعرف.
//     الضمان الكامل يحتاج جدول في قاعدة البيانات، والبوت مقصود ما يحفظ شي.

const MAX_LEN = 300;
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_SITE = 'https://fadel-xr7.github.io/hunter-system/';

export interface Env {
  token: string;
  siteUrl: string;
  selfUrl: string; // رابط هذي الدالة نفسها (للـ webhook)
  setupKey?: string; // يحمي ?setup=1
  sleep?: (ms: number) => Promise<void>; // للاختبارات
  now?: () => number; // للاختبارات
}

type SendResult = { ok: boolean; description?: string; result?: unknown; error_code?: number; parameters?: { retry_after?: number } };
type Send = (method: string, body: Record<string, unknown>) => Promise<SendResult>;

/** فشل إرسال مؤقت بعد كل المحاولات: نرجع 5xx عشان تيليجرام يعيد التحديث. */
export class SendFailed extends Error {}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const HELP_AR =
  '⚔️ <b>نظام الصياد جاهز</b>\n\n' +
  'اكتب مهمتك مثل ما تتكلم، مثال:\n' +
  '<code>مراجعة الكود 8 مساءً</code>\n\n' +
  'وتقدر تضيف (كلها اختيارية):\n' +
  '• الوقت: <code>8 مساءً</code> أو <code>7 الصبح</code> أو <code>9:30م</code>\n' +
  '• اليوم: <code>بكرة</code> أو <code>بعد بكرة</code> أو <code>يوم 12</code>\n' +
  '• <code>يومي</code> لو تتكرر كل يوم\n' +
  '• الصعوبة: من <code>!E</code> (سهلة) إلى <code>!S</code> (أصعب شي)\n' +
  '• القدرة: <code>#قوة #حيوية #رشاقة #ذكاء #انضباط</code>\n' +
  'بدون وقت: اليومية 9 الصبح، واللي لمرة وحدة 5 مساءً.\n\n' +
  'أرد عليك برابط، اضغطه فيفتح الموقع ويسألك قبل الإضافة.\n' +
  '🔒 ما أحفظ رسائلك، والمهمة تنضاف في حسابك أنت بس.';

const HELP_EN =
  '⚔️ <b>The Hunter System is ready</b>\n\n' +
  "Write your quest the way you'd say it, for example:\n" +
  '<code>review the code 8pm</code>\n\n' +
  'You can add (all optional):\n' +
  '• a time: <code>8pm</code> or <code>7:30am</code>\n' +
  '• a day: <code>tomorrow</code> or <code>day 12</code>\n' +
  '• <code>daily</code> if it repeats every day\n' +
  '• difficulty: <code>!E</code> (easy) to <code>!S</code> (hardest)\n' +
  '• ability: <code>#strength #vitality #agility #intellect #discipline</code>\n' +
  'No time: daily quests default to 9 am, one-time quests to 5 pm.\n\n' +
  'I reply with a link. Open it and the site asks you before adding.\n' +
  "🔒 I don't keep your messages, and the quest is added to your own account only.";

const ARABIC = /[؀-ۿ]/;

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** الرد بالإنجليزي إذا الرسالة ما فيها عربي، أو (لـ /start) إذا لغة تيليجرام مو عربي. */
export function isEnglish(text: string, languageCode?: string): boolean {
  if (text && !text.startsWith('/')) return !ARABIC.test(text);
  const code = (languageCode || '').toLowerCase();
  return !!code && !code.startsWith('ar');
}

export function makeLink(siteUrl: string, text: string): string {
  return siteUrl.split('#')[0] + '#add=' + encodeURIComponent(text);
}

/** تيليجرام يرفض أزرار الروابط المحلية. */
export function buttonOk(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** السر اللي يرسله تيليجرام مع كل تحديث: أول 48 حرف من sha256 للتوكن. */
export async function webhookSecret(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hunter-bot:' + token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

// حد الرسائل: بالذاكرة لكل نسخة من الدالة، يكفي يوقف السبام العادي.
const hits = new Map<number, number[]>();
export function rateLimited(userId: number, now = Date.now()): boolean {
  const recent = (hits.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= RATE_WINDOW_MS) hits.delete(k);
  return recent.length > RATE_MAX;
}

type Outcome = 'ok' | 'permanent' | 'transient' | 'deferred';
const MAX_INLINE_WAIT_MS = 5000; // أطول انتظار داخل الطلب نفسه. أطول من كذا نأجّل للإعادة
let floodUntil = 0; // تيليجرام قال «لا ترسل قبل هذا الوقت» (429 retry_after)

/**
 * يرسل مع إعادة محاولة للأخطاء المؤقتة بس (انقطاع، 5xx، 429). الأخطاء الدائمة (محظور، طلب غلط) ما تنعاد.
 *   'ok'         انرسل
 *   'permanent'  خطأ دائم، لا تعيد
 *   'transient'  فشل مؤقت بعد 3 محاولات
 *   'deferred'   تيليجرام طلب ننتظر أكثر من 5 ثواني: ما أرسلنا، ونحترم المدة كاملة
 */
export async function deliver(send: Send, method: string, body: Record<string, unknown>, sleep = realSleep, now: () => number = Date.now): Promise<Outcome> {
  if (now() < floodUntil) return 'deferred';
  for (let attempt = 0; attempt < 3; attempt++) {
    let r: SendResult;
    try {
      r = await send(method, body);
    } catch (e) {
      r = { ok: false, error_code: 0, description: e instanceof Error ? e.message : String(e) };
    }
    if (r.ok) return 'ok';
    const code = r.error_code ?? 0;
    if (!(code === 0 || code === 429 || code >= 500)) return 'permanent';
    if (code === 429) {
      const wait = Math.max(1, Number(r.parameters?.retry_after) || 1) * 1000;
      if (wait > MAX_INLINE_WAIT_MS || attempt === 2) { floodUntil = now() + wait; return 'deferred'; }
      await sleep(wait);
    } else if (attempt < 2) await sleep(400 * (attempt + 1));
  }
  return 'transient';
}

// تحديثات خلصنا منها (ما نرد عليها مرتين)، وعدد المحاولات الفاشلة لكل تحديث
const handled = new Map<number, number>();
const failures = new Map<number, number>();
const inFlight = new Map<number, Promise<void>>(); // تحديثات للحين تنعالج
const counted = new Set<number>(); // تحديثات انحسبت في حد الرسائل: إعادة نفس التحديث ما تنحسب مرة ثانية
const MAX_FAILS = 3;

/** للاختبارات: يرجع الذاكرة لحالتها الأولى. */
export function resetBotMemory() {
  handled.clear(); failures.clear(); inFlight.clear(); counted.clear(); hits.clear(); floodUntil = 0;
}

function markHandled(id: number | undefined) {
  if (id === undefined) return;
  handled.set(id, Date.now());
  failures.delete(id);
  if (handled.size > 5000) for (const k of handled.keys()) { handled.delete(k); if (handled.size <= 4000) break; }
}

/**
 * يعالج التحديث مرة وحدة: لو وصل وهو للحين ينعالج (تيليجرام أعاده لأن الرد تأخر)، النسخة الثانية
 * تنتظر الأولى وترجع نفس النتيجة بدون ما ترسل شي.
 */
// deno-lint-ignore no-explicit-any
export function handleUpdate(update: any, env: Env, send: Send): Promise<void> {
  const id: number | undefined = typeof update?.update_id === 'number' ? update.update_id : undefined;
  if (id === undefined) return processUpdate(update, env, send, undefined);
  if (handled.has(id)) return Promise.resolve(); // وصل مرة ثانية وخلصنا منه
  const running = inFlight.get(id);
  if (running) return running;
  const p = processUpdate(update, env, send, id).finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

// deno-lint-ignore no-explicit-any
async function processUpdate(update: any, env: Env, send: Send, updateId: number | undefined): Promise<void> {
  const msg = update?.message;
  if (!msg || msg.chat?.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const sleep = env.sleep || realSleep;
  const now = env.now || Date.now;
  // يسجّل النتيجة: نجاح أو فشل دائم = خلصنا. فشل مؤقت = نعيد المحاولة لين MAX_FAILS ثم نتوقف.
  // مؤجّل (429 طويل) = تيليجرام يعيده بعدين، وما ينحسب فشل.
  const finish = (res: Outcome) => {
    if (res === 'deferred') throw new SendFailed('telegram asked us to wait');
    if (res === 'transient' && updateId !== undefined) {
      const n = (failures.get(updateId) || 0) + 1;
      if (n < MAX_FAILS) { failures.set(updateId, n); throw new SendFailed('telegram send failed'); }
    }
    markHandled(updateId);
  };
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const en = isEnglish(text, msg.from.language_code);

  // حد الرسائل للرسائل الجديدة بس. لو تيليجرام أعاد نفس التحديث (فشل أو تأجيل)، ما يعتبر رسالة ثانية
  const fresh = updateId === undefined || !counted.has(updateId);
  if (updateId !== undefined && fresh) {
    counted.add(updateId);
    if (counted.size > 5000) for (const k of counted) { counted.delete(k); if (counted.size <= 4000) break; }
  }
  if (fresh && rateLimited(msg.from.id)) {
    // نرد مرة وحدة بس لما يتعدى الحد، وبعدها نسكت لين تخلص الدقيقة
    if ((hits.get(msg.from.id) || []).length === RATE_MAX + 1) {
      await deliver(send, 'sendMessage', { chat_id: chatId, text: en ? '⏳ Too many messages, wait a minute.' : '⏳ رسائل كثيرة، انتظر دقيقة.' }, sleep, now);
    }
    return;
  }
  if (!text || /^\/(start|help)(@\w+)?(\s|$)/i.test(text)) {
    finish(await deliver(send, 'sendMessage', { chat_id: chatId, text: en ? HELP_EN : HELP_AR, parse_mode: 'HTML' }, sleep, now));
    return;
  }
  if (text.startsWith('/')) return; // أوامر ثانية: نتجاهلها
  if (text.length > MAX_LEN) {
    finish(await deliver(send, 'sendMessage', { chat_id: chatId, text: en ? '⚠️ That message is too long, keep it under 300 characters.' : '⚠️ الرسالة طويلة، خلها أقصر من 300 حرف.' }, sleep, now));
    return;
  }
  const link = makeLink(env.siteUrl, text);
  const reply = en
    ? `📨 Quest received:\n<b>${escapeHtml(text)}</b>\n\nOpen the link to add it to the System:\n${escapeHtml(link)}`
    : `📨 وصلت المهمة:\n<b>${escapeHtml(text)}</b>\n\nاضغط الرابط لإضافتها للنظام:\n${escapeHtml(link)}`;
  const body: Record<string, unknown> = { chat_id: chatId, text: reply, parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
  if (buttonOk(link)) body.reply_markup = { inline_keyboard: [[{ text: en ? '⚔️ Add it to the System' : '⚔️ أضفها للنظام', url: link }]] };
  finish(await deliver(send, 'sendMessage', body, sleep, now));
}

/** يربط البوت بهذي الدالة. ما يسوي شي لو كان مربوط من قبل وما فيه خطأ. */
export async function setup(env: Env, send: Send): Promise<{ ok: boolean; message: string }> {
  const info = await send('getWebhookInfo', {});
  // deno-lint-ignore no-explicit-any
  const cur = (info.result || {}) as any;
  if (info.ok && cur.url === env.selfUrl && !cur.last_error_message) return { ok: true, message: 'already set' };
  const r = await send('setWebhook', {
    url: env.selfUrl,
    secret_token: await webhookSecret(env.token),
    allowed_updates: ['message'],
    max_connections: 20,
  });
  if (!r.ok) return { ok: false, message: r.description || 'setWebhook failed' };
  await send('setMyCommands', { commands: [{ command: 'start', description: 'طريقة الاستخدام' }] });
  await send('setMyCommands', { commands: [{ command: 'start', description: 'How to use' }], language_code: 'en' });
  return { ok: true, message: 'webhook set' };
}

export function telegramSender(token: string): Send {
  return async (method, body) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const j = await res.json().catch(() => ({ ok: false, description: 'HTTP ' + res.status }));
      if (!j.ok && !j.error_code) j.error_code = res.status;
      return j;
    } catch (e) {
      // انقطاع أو تأخير: error_code 0 = مؤقت، ونعيد المحاولة
      return { ok: false, error_code: 0, description: e instanceof Error ? e.message : String(e) };
    }
  };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** مقارنة نصين بدون ما يتغير الوقت حسب أول حرف يختلف. */
export function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function serve(req: Request, env: Env, send: Send): Promise<Response> {
  if (!env.token) return json({ ok: false, message: 'TELEGRAM_BOT_TOKEN is not set in Supabase secrets' }, 500);
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('setup') === '1') {
      if (!env.setupKey) return json({ ok: false, message: 'SETUP_KEY is not set in Supabase secrets' }, 403);
      if (!sameText(url.searchParams.get('key') || '', env.setupKey)) return json({ ok: false, message: 'forbidden' }, 403);
      return json(await setup(env, send));
    }
    return json({ ok: true, message: 'Hunter System bot' });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env.token))) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    await handleUpdate(await req.json(), env, send);
  } catch (e) {
    console.error('update failed', e instanceof Error ? e.message : e);
    // فشل إرسال مؤقت: 500 عشان تيليجرام يعيد التحديث (ينعالج مرة وحدة بفضل handled)
    if (e instanceof SendFailed) return new Response('retry', { status: 500 });
  }
  // باقي الحالات 200، عشان تيليجرام ما يعيد نفس التحديث
  return new Response('ok');
}

// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D?.serve) {
  const token = (D.env.get('TELEGRAM_BOT_TOKEN') || '').trim();
  const env: Env = {
    token,
    siteUrl: (D.env.get('SITE_URL') || DEFAULT_SITE).trim(),
    selfUrl: (D.env.get('SUPABASE_URL') || '').replace(/\/$/, '') + '/functions/v1/telegram-bot',
    setupKey: (D.env.get('SETUP_KEY') || '').trim(),
  };
  const send = telegramSender(token);
  D.serve((req: Request) => serve(req, env, send));
}
