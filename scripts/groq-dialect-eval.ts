// تقييم المساعد مع Groq الحقيقي باللهجة السعودية. منفصل عن الاختبارات (npm test ما يشغّله، ونتيجته مو مضمونة).
// يمر بنفس طريق البوت بالضبط: respond() في assistant.ts، بنفس المهلة (AI_TIMEOUT_MS) والموديل والحدود.
// كل حالة تبدأ بمحادثة جديدة. الحالات اللي تحتاج أكثر من رسالة (تكملة، إلغاء) تمر بالترتيب.
//
// التشغيل (المفتاح من الطرفية بس، ما ينطبع ولا ينحفظ ولا يروح لأي مكان غير Groq):
//   PowerShell:  $env:GROQ_API_KEY = "gsk_..." ; node --experimental-strip-types scripts/groq-dialect-eval.ts
//   bash:        GROQ_API_KEY=gsk_... node --experimental-strip-types scripts/groq-dialect-eval.ts
// اختياري: GROQ_MODEL لموديل ثاني، و--out results.json يحفظ النتائج (بدون المفتاح).
// ياخذ تقريباً 8–10 دقايق: طلب كل 16 ثانية عشان يبقى تحت حد الخطة المجانية (8000 توكن بالدقيقة) وتحت حدنا (4 بالدقيقة).
//
// النتيجة ثلاث أنواع:
//   ✅ نجح الفحص  ❌ فشل (فهم غلط)  ⚠️ الذكاء ما رد (رجع للطريقة البديلة): ينحسب لحاله، مو نجاح ولا فشل فهم.
// ردود السوالف تنطبع كاملة عشان تحكم عليها بنفسك (طبيعية؟ لهجة سعودية؟). الفحص الآلي يتأكد من السلوك بس.
import { writeFileSync } from 'node:fs';
import { respond, resetAssistant, clockAt, addDaysIso, nextDayOfMonth, DEFAULT_MODEL, AI_TIMEOUT_MS, type Outgoing } from '../supabase/functions/telegram-bot/assistant.ts';

const SITE = 'https://fadel-xr7.github.io/hunter-system/';
type Want = {
  kind: Outgoing['kind'];
  ask?: 'task' | 'time' | 'repeat';
  title?: string[]; // العنوان لازم يحتوي وحدة منها
  day?: number; weekday?: number; dom?: number; // التاريخ: بعد كم يوم، أو يوم الأسبوع (0 الأحد)، أو يوم الشهر
  time?: string | [string, string] | 'default'; inMinutes?: number;
  daily?: boolean; rank?: string; stat?: string; // stat ملاحظة بس
  english?: boolean;
  date?: string; // تاريخ ثابت بالضبط (لحالة منتصف الليل)
};
// at: وقت ثابت للخطوة (بتوقيت الرياض «YYYY-MM-DD HH:MM») بدل الوقت الحقيقي
type Step = { text: string; want: Want | Want[]; at?: string }; // قائمة = أي وحدة منها مقبولة
type Case = { name: string; steps: Step[]; en?: boolean };

const CASES: Case[] = [
  { name: 'سلام', steps: [{ text: 'هلا', want: { kind: 'chat' } }] },
  { name: 'سؤال عن الحال', steps: [{ text: 'شلونك؟ عساك طيب', want: { kind: 'chat' } }] },
  { name: 'وش تقدر تسوي', steps: [{ text: 'وش تقدر تسوي؟', want: { kind: 'chat' } }] },
  { name: 'سؤال عن طريقة الإضافة', steps: [{ text: 'كيف أضيف مهمة؟', want: { kind: 'chat' } }] },
  { name: 'كلام عن خطة بدون طلب', steps: [{ text: 'بكرة عندي اختبار فيزياء وخايف شوي', want: { kind: 'chat' } }] },
  { name: 'رأي بدون طلب', steps: [{ text: 'وش رأيك أذاكر الحين ولا بعد العشا؟', want: { kind: 'chat' } }] },
  { name: 'نص مقتبس', steps: [{ text: 'أخوي قال لي «ضيف مهمة اغسل السيارة» وأنا ما ودي', want: { kind: 'chat' } }] },
  { name: 'طلب كامل', steps: [{ text: 'ضيف مهمة أذاكر بكرة الساعة 9 الليل', want: { kind: 'task', title: ['أذاكر', 'مذاكرة'], day: 1, time: '21:00', stat: 'INT' } }] },
  { name: 'باجر', steps: [{ text: 'ضيف مهمة باجر أروح السوق', want: { kind: 'task', title: ['السوق'], day: 1, time: 'default' } }] },
  {
    name: 'طلب بدون تفاصيل ثم تكملة',
    steps: [
      { text: 'ضيف مهمة', want: { kind: 'ask', ask: 'task' } },
      { text: 'مذاكرة', want: { kind: 'task', title: ['مذاكرة'], day: 0, time: 'default' } },
    ],
  },
  {
    name: 'وقت صلاة ثم ساعة',
    steps: [
      { text: 'سجّل لي مهمة أروح النادي بعد المغرب', want: { kind: 'ask', ask: 'time' } },
      { text: '7 ونص', want: { kind: 'task', title: ['النادي'], day: 0, time: '19:30', stat: 'STR' } },
    ],
  },
  {
    name: 'وقت صلاة يومي (بدون اختراع ساعة)',
    steps: [{ text: 'ضيف مهمة صلاة الفجر كل يوم', want: [{ kind: 'ask', ask: 'time' }, { kind: 'task', daily: true, time: 'default' }] }],
  },
  { name: 'يومية بساعة', steps: [{ text: 'أضف لي مهمة أقرأ 10 صفحات كل يوم الساعة 10 الليل', want: { kind: 'task', title: ['صفحات'], daily: true, time: '22:00', stat: 'INT' } }] },
  {
    name: 'تكرار غير مدعوم ثم مرة وحدة',
    steps: [
      { text: 'ضيف مهمة أرتب غرفتي كل خميس', want: { kind: 'ask', ask: 'repeat' } },
      { text: 'مرة وحدة بس', want: { kind: 'task', title: ['غرفتي', 'غرفة'], weekday: 4 } },
    ],
  },
  { name: 'صعوبة ويوم أسبوع', steps: [{ text: 'حط لي مهمة صعبة أخلص التقرير الخميس 5 العصر', want: { kind: 'task', title: ['التقرير'], weekday: 4, time: '17:00', rank: 'B' } }] },
  { name: 'ساعة مع اسم صلاة', steps: [{ text: 'ضيف مهمة أزور أهلي 7 المغرب', want: { kind: 'task', title: ['أهلي', 'اهلي'], time: '19:00' } }] },
  { name: 'عدد صفحات مو ساعة صلاة', steps: [{ text: 'ضيف مهمة أقرأ 5 صفحات بعد العصر', want: { kind: 'ask', ask: 'time' } }] },
  { name: 'سهلة ونص', steps: [{ text: 'ضيف مهمة سهلة أكمل المشروع الساعة 10 ونص بالليل', want: { kind: 'task', title: ['المشروع'], time: '22:30', rank: 'E' } }] },
  { name: 'بعد ساعة', steps: [{ text: 'ضيف مهمة بعد ساعة أطلع الغسيل', want: { kind: 'task', title: ['الغسيل'], inMinutes: 60 } }] },
  { name: 'يوم 15', steps: [{ text: 'ضيف مهمة أدفع فاتورة الجوال يوم 15', want: { kind: 'task', title: ['فاتورة', 'فاتوره'], dom: 15 } }] },
  { name: 'ساعة بدون فترة', steps: [{ text: 'ممكن تضيف لي مهمة أتغدى مع الشباب 2', want: { kind: 'task', title: ['الشباب'], time: '14:00' } }] },
  {
    name: 'إلغاء',
    steps: [
      { text: 'ضيف مهمة', want: { kind: 'ask', ask: 'task' } },
      { text: 'إلغاء', want: { kind: 'cancel' } },
    ],
  },
  {
    name: 'منتصف الليل: «بكرة» تبقى يوم الطلب',
    steps: [
      { text: 'ضيف مهمة مذاكرة بكرة بعد المغرب', at: '2026-10-28 23:59', want: { kind: 'ask', ask: 'time' } },
      { text: '6 المسا', at: '2026-10-29 00:01', want: { kind: 'task', title: ['مذاكرة'], date: '2026-10-29', time: '18:00' } },
    ],
  },
  { name: 'English chat', en: true, steps: [{ text: 'hi, how are you?', want: { kind: 'chat', english: true } }] },
  { name: 'English task', en: true, steps: [{ text: 'add a task: call dad tomorrow at 7pm', want: { kind: 'task', title: ['dad'], day: 1, time: '19:00' } }] },
];

const key = (process.env.GROQ_API_KEY || '').trim();
if (!key) { console.error('حط GROQ_API_KEY في الطرفية أول (شوف أول الملف).'); process.exit(2); }
const model = (process.env.GROQ_MODEL || '').trim() || DEFAULT_MODEL;
const outFile = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '';
const GAP_MS = Number(process.env.EVAL_GAP_MS) || 16_000; // EVAL_GAP_MS للتجربة السريعة بس
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** يفحص الرد مقابل المطلوب. يرجع قائمة المشاكل (فاضية = نجح) */
function check(out: Outgoing, w: Want, sentAt: number): string[] {
  const p: string[] = [];
  if (out.kind !== w.kind) return [`النوع ${out.kind} (${out.code}) بدل ${w.kind}`];
  if (w.kind === 'chat') {
    if (out.button) p.push('فيه زر رابط');
    if (/ما لقيت مهمة/.test(out.text)) p.push('قال «ما لقيت مهمة»');
    if (!out.text.trim()) p.push('رد فاضي');
    if (w.english && /[\u0600-\u06FF]/.test(out.text)) p.push('رد بالعربي على رسالة إنجليزية');
    if (!w.english && !/[\u0600-\u06FF]/.test(out.text)) p.push('رد مو بالعربي');
  }
  if (w.ask && out.code !== 'ok_ask_' + w.ask) p.push(`سأل ${out.code} بدل ${w.ask}`);
  if (w.kind !== 'task') return p;
  if (!out.button || !out.button.url.includes('#quest=1')) return ['ما فيه رابط مهمة'];
  const q = Object.fromEntries(new URLSearchParams(out.button.url.split('#')[1]));
  const c = clockAt(sentAt);
  if (w.title && !w.title.some((t) => q.t.includes(t))) p.push(`العنوان «${q.t}»`);
  if (w.daily !== undefined && (q.k === 'daily') !== w.daily) p.push(`النوع ${q.k}`);
  if (w.rank && q.r !== w.rank) p.push(`الصعوبة ${q.r ?? '—'}`);
  if (w.time === 'default') { if (!/الافتراضي|default/.test(out.text)) p.push(`الوقت ${q.h} (مو الافتراضي)`); }
  else if (typeof w.time === 'string' && q.h !== w.time) p.push(`الوقت ${q.h}`);
  else if (Array.isArray(w.time) && (mins(q.h) < mins(w.time[0]) || mins(q.h) > mins(w.time[1]))) p.push(`الوقت ${q.h}`);
  let want: string | null = null;
  if (w.day !== undefined) want = addDaysIso(c.date, w.day);
  if (w.weekday !== undefined) want = addDaysIso(c.date, (w.weekday - c.weekday + 7) % 7);
  if (w.dom !== undefined) want = nextDayOfMonth(c.date, w.dom);
  if (w.inMinutes !== undefined) {
    const total = c.hour * 60 + c.minute + w.inMinutes;
    const diff = Math.abs(mins(q.h) - (total % 1440));
    if (Math.min(diff, 1440 - diff) > 3) p.push(`الوقت ${q.h}`);
    want = addDaysIso(c.date, Math.floor(total / 1440));
  }
  if (w.date) want = w.date;
  if (want && q.k === 'gate' && q.d !== want) p.push(`التاريخ ${q.d} بدل ${want}`);
  return p;
}

console.log(`الموديل: ${model} — المهلة ${AI_TIMEOUT_MS} ms — ${CASES.length} حالة\n`);
const rows: unknown[] = [];
let pass = 0, fail = 0, fallback = 0, local = 0;
const fallbackCodes: Record<string, number> = {};
const times: number[] = [];
let first = true;
for (const c of CASES) {
  resetAssistant(); // كل حالة محادثة جديدة
  console.log(`— ${c.name}`);
  for (const step of c.steps) {
    const willCallAi = !/^(?:ضيف مهمة|إلغاء)$/.test(step.text); // هذي تنرد بدون ذكاء
    if (willCallAi && !first) await sleep(GAP_MS);
    if (willCallAi) first = false;
    const t0 = Date.now();
    const at = step.at ? Date.parse(step.at.replace(' ', 'T') + ':00+03:00') : 0;
    const out = await respond({ text: step.text, userId: 1, chatId: 1, en: Boolean(c.en), forwarded: false }, { siteUrl: SITE, ai: { key, model }, now: at ? () => at : undefined });
    const ms = Date.now() - t0;
    const wants = Array.isArray(step.want) ? step.want : [step.want];
    const results = wants.map((w) => check(out, w, at || t0));
    const ok = results.some((r) => r.length === 0);
    const aiDown = /^(groq_|limit_)/.test(out.code);
    let mark: string;
    if (aiDown) { fallback++; fallbackCodes[out.code] = (fallbackCodes[out.code] || 0) + 1; mark = '⚠️'; }
    else if (ok) { pass++; mark = '✅'; } else { fail++; mark = '❌'; }
    if (willCallAi && !aiDown) times.push(ms); else if (!willCallAi) local++;
    const link = out.button ? decodeURIComponent(out.button.url.split('#')[1]) : '';
    console.log(`${mark} «${step.text}» → ${out.kind} (${out.code}, ${ms} ms)${willCallAi ? '' : ' [بدون ذكاء]'}`);
    console.log('   ' + out.text.replace(/<[^>]+>/g, '').replace(/\n/g, '\n   '));
    if (link) console.log('   الرابط: ' + link);
    if (!ok && !aiDown) console.log('   ✗ ' + results.map((r) => r.join('، ')).join(' | أو: '));
    rows.push({ case: c.name, text: step.text, kind: out.kind, code: out.code, ms, ok, aiDown, reply: out.text, link });
  }
}
times.sort((a, b) => a - b);
const pct = (q: number) => times.length ? times[Math.min(times.length - 1, Math.floor(q * times.length))] : 0;
console.log(`\nالنتيجة (فحص السلوك، بدون الحكم على طبيعية الكلام):`);
console.log(`  ✅ ${pass}   ❌ ${fail}   ⚠️ الذكاء ما رد: ${fallback} ${JSON.stringify(fallbackCodes)}   (منها ${local} خطوة بدون ذكاء أصلاً)`);
console.log(`  زمن الرد من Groq: الوسيط ${pct(0.5)} ms، الأبطأ ${times.at(-1) ?? 0} ms، والمهلة ${AI_TIMEOUT_MS} ms`);
console.log('  تشغيلة وحدة، والموديل ممكن يعطي نتيجة ثانية لو تكرر. ردود السوالف فوق: احكم عليها بنفسك.');
if (outFile) { writeFileSync(outFile, JSON.stringify({ model, timeoutMs: AI_TIMEOUT_MS, at: new Date().toISOString(), pass, fail, fallback, fallbackCodes, rows }, null, 2)); console.log('انحفظت في ' + outFile); }
process.exit(fail === 0 && fallback === 0 ? 0 : 1);
