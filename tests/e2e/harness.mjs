// أدوات اختبارات المتصفح (Playwright): سيرفر محلي لمجلد docs، وSupabase وهمي، وبيانات تجربة ثابتة.
// كل اختبار يفتح متصفح نظيف، بوقت ثابت (2026-10-28) ومنطقة الرياض، وبدون أي طلب للإنترنت.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadCore, days } from '../helpers/load-core.mjs';

const DOCS = fileURLToPath(new URL('../../docs/', import.meta.url));
const FAKE_SB = fileURLToPath(new URL('./fake-supabase.js', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

/** سيرفر بسيط لمجلد docs على منفذ عشوائي */
export async function startServer(dir = process.env.HUNTER_DOCS || DOCS) {
  const root = path.resolve(dir) + path.sep;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise((r) => server.close(r)) };
}

export const launch = () => chromium.launch();

// الوقت الافتراضي: الأربعاء 28 أكتوبر 2026، 10:30 الصبح بتوقيت الرياض
export const T0 = new Date('2026-10-28T10:30:00+03:00');
export const TODAY = '2026-10-28';

/**
 * سياق متصفح جاهز: كل الطلبات الخارجية ممنوعة، وvendor/supabase.js يتبدّل بالوهمي.
 * seed: بيانات تنكتب في localStorage مرة وحدة (قبل أول تحميل)، فالتبويب الثاني يشوف نفس البيانات.
 */
export async function newContext(browser, { lang = 'ar', theme = 'anime', seed = {}, viewport = { width: 1280, height: 900 }, reducedMotion = 'reduce', realLib = false } = {}) {
  const context = await browser.newContext({
    viewport, locale: lang === 'ar' ? 'ar-SA' : 'en-US', timezoneId: 'Asia/Riyadh',
    serviceWorkers: 'block', reducedMotion, acceptDownloads: true
  });
  const fake = await readFile(FAKE_SB, 'utf8');
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) {
      // realLib: نخلي المكتبة الحقيقية (docs/vendor/supabase.js) تشتغل، والاختبار يعترض طلباتها (real-supabase.mjs)
      if (!realLib && u.includes('/vendor/supabase.js')) return route.fulfill({ contentType: 'text/javascript', body: fake });
      return route.continue();
    }
    if (/\/auth\/v1\/settings/.test(u)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ external: { google: false } }) });
    // الخطوط من Google وأي شي خارجي: رد فاضي، فالاختبار ما يعتمد على النت
    if (/fonts\.googleapis\.com/.test(u)) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.abort();
  });
  const init = { __seeded: '1', hunterLang_v6: lang, hunterTheme_v6: theme, ...seed };
  await context.addInitScript((data) => {
    // Math.random ثابت، عشان أي شي عشوائي يطلع نفس الشي كل مرة
    let s = 42;
    Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    try {
      if (!localStorage.getItem('__seeded')) for (const [k, v] of Object.entries(data)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch (e) { /* about:blank */ }
  }, init);
  return context;
}

/** صفحة على الموقع بساعة مثبتة (ما تتحرك إلا لما نحركها) */
export async function openPage(context, base, { time = T0, paused = true } = {}) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time });
  if (paused) await page.clock.pauseAt(time);
  await page.goto(base);
  page.errors = errors;
  return page;
}

/** ضيف: بدون شاشة دخول، وتقارير اليوم انشافت (ما تطلع نافذة التقرير) */
export function guestSeed(state, today = TODAY) {
  return {
    hunterGuest_v6: '1', hunterNameAsked_v6: '1',
    hunterBrief_v6: { morning: today, evening: today, friday: today },
    ...(state ? { hunterSystem_v6: state } : {})
  };
}

/** مستخدم مسجل في الـ Supabase الوهمي (جلسته محفوظة، وصفّه في «السحابة» لو أعطيناه) */
export function userSeed({ id = 'u_test', email = 'hunter@example.com', state, row, today = TODAY } = {}) {
  const user = { id, email, user_metadata: {} };
  return {
    hunterNameAsked_v6: '1',
    hunterBrief_v6: { morning: today, evening: today, friday: today },
    __fakeUsers: { [email]: { id, password: 'password123', meta: {} } },
    'sb-fake-auth-token': { user },
    ...(row ? { __fakeRows: { [id]: row } } : {}),
    ...(state ? { hunterSystem_v6: state } : {})
  };
}

/**
 * بيانات تجربة ثابتة: من 20 سبتمبر إلى اليوم، فيها أيام مكتملة وأيام فائتة ويوم راحة وبوابات وتركيز.
 * تنبني بنفس دوال core.js، فالخبرة والقدرات والسجل متوافقة مع بعض.
 */
export function buildSeed({ lang = 'ar' } = {}) {
  const c = loadCore({ today: '2026-09-20', lang });
  c.run(`state = freshState(); state.name = ${JSON.stringify(lang === 'ar' ? 'أحمد' : 'Ahmed')};`);
  const list = days('2026-09-20', 38); // لين 27 أكتوبر
  list.forEach((d, i) => {
    c.setToday(d);
    c.run('snapshotPlans()');
    if (i === 24) { c.run(`state.restDays.push('${d}')`); return; }
    if (i === 5 || i === 17) return; // أيام فائتة (داخل أيام السماح)
    const ids = i === 30 ? ['f_train'] : ['f_train', 'f_study', 'f_sleep'];
    c.run(`state.log['${d}'] = ${JSON.stringify(ids)}; ${JSON.stringify(ids)}.forEach((id) => { const q = state.fixed.find((x) => x.id === id); grant('fixed:${d}:' + id, q.xp, q.stat); }); syncDay('${d}');`);
    if (i % 3 === 0) c.run(`grant('focus:${i}:0', 75, 'SENSE')`);
    if (i % 4 === 1) c.run(`state.gates.push({ id: 'g${i}', title: ${JSON.stringify(lang === 'ar' ? 'بوابة قديمة ' : 'Old gate ')} + ${i}, date: '${d}', rank: 'C', xp: 75, time: '16:00', stat: 'AGI', done: true, subs: [] }); grant('gate:g${i}', 75, 'AGI');`);
  });
  c.setToday(TODAY);
  c.run(`snapshotPlans();
    state.log['${TODAY}'] = ['f_train']; grant('fixed:${TODAY}:f_train', 30, 'STR');
    state.gates.push({ id: 'g_today', title: ${JSON.stringify(lang === 'ar' ? 'مراجعة الشبكات' : 'Review networks')}, date: '${TODAY}', rank: 'B', xp: 120, time: '21:00', stat: 'INT', done: false,
      subs: [{ id: 's1', title: ${JSON.stringify(lang === 'ar' ? 'الفصل الأول' : 'Chapter one')}, done: true }, { id: 's2', title: ${JSON.stringify(lang === 'ar' ? 'الفصل الثاني' : 'Chapter two')}, done: false }] });
    state.gates.push({ id: 'g_soon', title: ${JSON.stringify(lang === 'ar' ? 'تسليم المشروع' : 'Project deadline')}, date: '2026-10-30', rank: 'A', xp: 200, time: '12:00', stat: 'SENSE', done: false, subs: [] });
    state.mit = { date: '${TODAY}', key: 'fixed:f_study' };
    state.unlocked = ['a30']; state.title = 'a30';
    state.lastBackup = new Date('2026-10-25T12:00:00').getTime();
    state.bestStreak = longestStreak();`);
  return c.state();
}

/** حالة الصفحة: state من الصفحة نفسها */
export const pageState = (page) => page.evaluate(() => JSON.parse(JSON.stringify(state)));
/** صف «السحابة» في الـ Supabase الوهمي */
export const serverRows = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakeRows') || '{}'));

/** ننتظر لين يصير الشرط صحيح في الصفحة. بالوقت الحقيقي، لأن ساعة الصفحة واقفة (نوافذ وتنزيلات تخلص بدون مؤقتات) */
export async function until(page, fn, ms = 3000) {
  for (let t = 0; t < ms; t += 50) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(50); }
  return false;
}
