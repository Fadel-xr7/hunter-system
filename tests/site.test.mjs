// فحوصات ثابتة على ملفات الموقع (بدون متصفح): قائمة sw.js، السكربتات، والعناصر اللي يطلبها الكود.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const DOCS = new URL('../docs/', import.meta.url);
const read = (p) => readFileSync(new URL(p, DOCS), 'utf8');
const html = read('index.html');
const sw = read('sw.js');
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

test('ترتيب السكربتات: i18n ثم config ثم core ثم app ثم cloud', () => {
  const order = [...html.matchAll(/<script src="js\/(\w+)\.js"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['boot', 'i18n', 'config', 'core', 'app', 'cloud']);
});

test('manifest: الأيقونات موجودة', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, DOCS)), i.src);
});

test("كل $('id') في الكود له عنصر في index.html", () => {
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  // عناصر تنبني بالكود نفسه (مو في index.html)
  const built = new Set([...['js/app.js', 'js/core.js', 'js/cloud.js'].map(read).join('\n').matchAll(/\bid: '([^']+)'/g)].map((m) => m[1]));
  const used = new Set();
  for (const f of ['js/app.js', 'js/core.js', 'js/cloud.js']) for (const m of read(f).matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)) used.add(m[1]);
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
  for (const f of ['js/i18n.js', 'js/core.js', 'js/app.js', 'js/cloud.js']) {
    assert.doesNotMatch(read(f), /'hunter[A-Za-z]+_v\d+'/, f);
  }
});

test('قائمة مدة المؤقت تنبني من الكود (ما فيه خيارات مكررة في index.html)', () => {
  assert.match(html, /<select id="timerMinutes">\s*<!--[^>]*-->\s*<\/select>/);
});
