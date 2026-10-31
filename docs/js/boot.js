'use strict';
/* نظام الصياد — boot.js
   يشتغل قبل أول رسم: يطبّق الواجهة واللغة المحفوظة، ويقرر إذا تطلع شاشة الدخول.
   (كان داخل index.html، وانتقل لملف لحاله عشان سياسة الأمان CSP تمنع أي سكربت داخل الصفحة) */
// منع التضمين (clickjacking): لو الموقع انفتح داخل إطار في صفحة ثانية، يختفي ويحاول يفتح نفسه برا الإطار.
// GitHub Pages ما يسمح بهيدر X-Frame-Options، وframe-ancestors ما يشتغل من وسم meta، فهذا البديل
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location.replace(window.self.location.href); } catch (e) {}
}
// مفاتيح التخزين في المتصفح، بمكان واحد. هذا أول ملف يتحمّل، فكل الملفات بعده تستخدمها
const STORE_KEYS = Object.freeze({
  state: 'hunterSystem_v6', theme: 'hunterTheme_v6', lang: 'hunterLang_v6', guest: 'hunterGuest_v6',
  sync: 'hunterSync_v6', nameAsked: 'hunterNameAsked_v6', brief: 'hunterBrief_v6', conflictCopy: 'hunterConflictCopy_v6'
});
// اللغة: اختيارك المحفوظ، وأول مرة حسب لغة الجهاز (عربي إذا الجهاز عربي، وإلا English). i18n.js يقرأها من هنا
const BOOT_LANG = (function () {
  try {
    var saved = localStorage.getItem(STORE_KEYS.lang);
    if (saved === 'ar' || saved === 'en') return saved;
    return /^ar\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || 'ar') ? 'ar' : 'en';
  } catch (e) { return 'ar'; }
})();
// الواجهة المحفوظة
try { var t = localStorage.getItem(STORE_KEYS.theme); if (t === 'ink' || t === 'anime') document.documentElement.dataset.theme = t; } catch (e) {}
if (BOOT_LANG === 'en') { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; document.title = 'Hunter System'; }
// شاشة الدخول: تظهر إذا ما فيه جلسة محفوظة وما اخترت تكمل كضيف،
// ودايماً لو فيه تعديلات ما انرفعت لحساب (خرج قبل ما تنرفع): ما تنفتح كضيف، وcloud.js يفتحها بس لو دخل نفس الحساب
try {
  var hasSession = Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k); });
  var bootSync = JSON.parse(localStorage.getItem(STORE_KEYS.sync) || '{}') || {};
  if ((bootSync.dirty && bootSync.uid) || (!hasSession && !localStorage.getItem(STORE_KEYS.guest))) document.documentElement.classList.add('need-auth');
} catch (e) {}
