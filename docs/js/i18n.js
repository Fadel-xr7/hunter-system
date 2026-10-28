'use strict';
/* =====================================================================
   نظام الصياد — i18n.js
   اللغة: عربي (الافتراضي) أو English.
   - L('نص عربي', 'English text') ترجع النص حسب اللغة المختارة.
   - النصوص الثابتة في index.html تترجم من الخصائص:
       data-en       النص الظاهر (يغيّر آخر نص مباشر في العنصر ويخلي الأيقونات)
       data-en-html  محتوى فيه وسوم بسيطة (مثل <br> و<code>)
       data-en-ph    placeholder      data-en-aria  aria-label
       data-en-tip   data-tip         data-en-title title
       data-en-val   value
   - أول زيارة: اللغة حسب لغة الجهاز. وزر اللغة يحفظ اختيارك في المتصفح ويعيد تحميل الصفحة.
   ===================================================================== */

const LANG_KEY = STORE_KEYS.lang;
// اختيارك المحفوظ أول، وإذا ما اخترت للحين: حسب لغة الجهاز. ينحسب مرة وحدة في boot.js
const LANG = BOOT_LANG;
const EN = LANG === 'en';
const L = (ar, en) => (EN ? en : ar);

function applyStaticLang() {
  const root = document.documentElement;
  root.lang = LANG;
  root.dir = EN ? 'ltr' : 'rtl';
  if (!EN) return;
  document.querySelectorAll('[data-en]').forEach((n) => {
    const txt = n.getAttribute('data-en');
    const direct = [...n.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim());
    if (!direct.length) { n.textContent = txt; return; }
    // يبدّل آخر نص مباشر ويمسح الباقي، فتبقى الأيقونات والخانات داخل العنصر
    const last = direct[direct.length - 1];
    direct.slice(0, -1).forEach((c) => { c.textContent = ' '; });
    const lead = /^\s/.test(last.textContent) ? ' ' : '';
    const tail = /\s$/.test(last.textContent) ? ' ' : '';
    last.textContent = lead + txt + tail;
  });
  // محتوى ثابت من هذا الملف نفسه (مو من المستخدم)
  document.querySelectorAll('[data-en-html]').forEach((n) => { n.innerHTML = n.getAttribute('data-en-html'); });
  const attr = (sel, from, to) => document.querySelectorAll(sel).forEach((n) => n.setAttribute(to, n.getAttribute(from)));
  attr('[data-en-ph]', 'data-en-ph', 'placeholder');
  attr('[data-en-aria]', 'data-en-aria', 'aria-label');
  attr('[data-en-tip]', 'data-en-tip', 'data-tip');
  attr('[data-en-title]', 'data-en-title', 'title');
  document.querySelectorAll('[data-en-val]').forEach((n) => { n.value = n.getAttribute('data-en-val'); });
  document.title = 'Hunter System';
}

function bindLangBtn() {
  const b = document.getElementById('langBtn');
  if (!b) return;
  const lbl = b.querySelector('span');
  lbl.textContent = EN ? 'عربي' : 'EN';
  lbl.lang = EN ? 'ar' : 'en';
  b.setAttribute('aria-label', EN ? 'التبديل إلى العربية' : 'Switch to English');
  b.dataset.tip = EN ? 'العربية' : 'English';
  b.addEventListener('click', () => {
    try { localStorage.setItem(LANG_KEY, EN ? 'ar' : 'en'); } catch (e) { /* بدون حفظ */ }
    document.documentElement.classList.add('lang-switching');
    setTimeout(() => location.reload(), 120);
  });
}

applyStaticLang();
bindLangBtn();
