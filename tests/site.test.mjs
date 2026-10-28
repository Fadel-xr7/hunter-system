// فحوصات ثابتة على ملفات الموقع (بدون متصفح): قائمة sw.js، السكربتات، والعناصر اللي يطلبها الكود.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const DOCS = new URL('../docs/', import.meta.url);
const read = (p) => readFileSync(new URL(p, DOCS), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
// كل ملفات الكود في docs/js
const JS = readdirSync(new URL('js/', DOCS)).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
const ASSETS = JSON.parse(sw.match(/const ASSETS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));

test('sw.js: كل ملف في ASSETS موجود (لو واحد ناقص، الـ service worker ما يتثبت)', () => {
  const missing = ASSETS.filter((a) => a !== './' && !existsSync(new URL(a, DOCS)));
  assert.deepEqual(missing, []);
  assert.equal(new Set(ASSETS).size, ASSETS.length, 'ملف مكرر في ASSETS');
  assert.match(sw, /const CACHE = 'hunter-v\d+';/);
});

test('sw.js: كل سكربت وستايل محلي في index.html موجود في ASSETS', () => {
  const local = [...html.matchAll(/<(?:script[^>]+src|link[^>]+href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^(https?:)?\/\//.test(u) && !u.startsWith('#') && !u.startsWith('data:'));
  assert.ok(local.length >= 7);
  const notCached = local.map((u) => './' + u.replace(/^\.\//, '')).filter((u) => !ASSETS.includes(u));
  assert.deepEqual(notCached, []);
});

test('ترتيب السكربتات: core ثم ui ثم الواجهتين ثم الأقسام ثم main ثم cloud', () => {
  const order = [...html.matchAll(/<script src="js\/([\w-]+)\.js"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['boot', 'i18n', 'config', 'core', 'ui', 'look-anime', 'look-ink', 'tasks', 'hero', 'timer', 'records', 'stats', 'brief', 'backup', 'main', 'cloud']);
  // كل ملف في docs/js محمّل في الصفحة (ما فيه ملف منسي)
  assert.deepEqual(JS.map((f) => f.slice(3, -3)).sort(), order.slice().sort());
});

test('manifest: الأيقونات موجودة', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, DOCS)), i.src);
});

test("كل $('id') في الكود له عنصر في index.html", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  // عناصر تنبني بالكود نفسه (مو في index.html)
  const built = new Set([...JS.map(read).join('\n').matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of JS) for (const m of read(f).matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) used.add(m[1]);
  const missing = [...used].filter((id) => !ids.has(id) && !built.has(id));
  assert.deepEqual(missing, []);
});

test('config.js: المفتاح العام بس، بدون أي مفتاح سري', () => {
  const cfg = read('js/config.js');
  assert.doesNotMatch(cfg, /sb_secret_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,}\./); // مفتاح secret أو JWT (service_role)
  assert.match(cfg, /supabaseKey: 'sb_publishable_/);
  assert.match(cfg, /telegramBot:/);
});

test('مفاتيح التخزين مكتوبة في boot.js بس', () => {
  for (const f of JS.filter((x) => x !== 'js/boot.js')) {
    assert.doesNotMatch(read(f), /'hunter[A-Za-z]+_v\d+'/, f);
  }
});

test('قائمة مدة المؤقت تنبني من الكود (ما فيه خيارات مكررة في index.html)', () => {
  assert.match(html, /<select id="timerMinutes">\s*<!--[^>]*-->\s*<\/select>/);
});

test('الواجهتين: نفس الأسماء في look-anime.js و look-ink.js', () => {
  const ctx = vm.createContext({ LOOKS: {}, L: (ar) => ar });
  vm.runInContext(read('js/look-anime.js'), ctx);
  vm.runInContext(read('js/look-ink.js'), ctx);
  const { anime, ink } = ctx.LOOKS;
  assert.deepEqual(Object.keys(anime).sort(), Object.keys(ink).sort());
  assert.deepEqual(Object.keys(anime.briefTitles).sort(), Object.keys(ink.briefTitles).sort());
  for (const k of Object.keys(anime)) assert.equal(typeof anime[k], typeof ink[k], k);
  assert.equal(anime.other, 'ink');
  assert.equal(ink.other, 'anime');
});

test('الأقسام ما تسأل «أي واجهة؟»: الفرق كله في look-*.js', () => {
  for (const f of JS.filter((x) => !/^js\/(boot|ui|look-[a-z]+)\.js$/.test(x))) {
    assert.doesNotMatch(read(f), /theme\(\)|dataset\.theme\s*[!=]==|'(anime|ink)'\s*[?:]/, f);
  }
});

test('شرح الوقت الافتراضي (الموقع والبوت): اليومية 9 الصبح، واللي لمرة وحدة 5 مساءً', () => {
  const bot = readFileSync(new URL('../supabase/functions/telegram-bot/index.ts', import.meta.url), 'utf8');
  const hint = html.match(/<p class="quick-hint" id="quickHint"[^>]*>[^<]*<\/p>/)[0];
  for (const [name, text] of [['index.html', hint], ['telegram-bot', bot]]) {
    assert.match(text, /بدون وقت: اليومية 9 الصبح، واللي لمرة وحدة 5 مساءً/, name);
    assert.match(text, /No time: daily quests default to 9 am, one-time quests to 5 pm/, name);
    assert.doesNotMatch(text, /بدون وقت تصير 5|No time means 5/, name);
  }
});
