'use strict';
/* نظام الصياد — boot.js
   يشتغل قبل أول رسم: يطبّق الواجهة واللغة المحفوظة، ويقرر إذا تطلع شاشة الدخول.
   (كان داخل index.html، وانتقل لملف لحاله عشان سياسة الأمان CSP تمنع أي سكربت داخل الصفحة) */
// الواجهة المحفوظة
try { var t = localStorage.getItem('hunterTheme_v6'); if (t === 'ink' || t === 'anime') document.documentElement.dataset.theme = t; } catch (e) {}
// اللغة: اختيارك المحفوظ، وأول مرة حسب لغة الجهاز (عربي إذا الجهاز عربي، وإلا English)
try {
  var lg = localStorage.getItem('hunterLang_v6');
  if (lg !== 'ar' && lg !== 'en') lg = /^ar\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || 'ar') ? 'ar' : 'en';
  if (lg === 'en') { document.documentElement.lang = 'en'; document.documentElement.dir = 'ltr'; document.title = 'Hunter System'; }
} catch (e) {}
// شاشة الدخول: تظهر إذا ما فيه جلسة محفوظة وما اخترت تكمل كضيف
try {
  var hasSession = Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k); });
  if (!hasSession && !localStorage.getItem('hunterGuest_v6')) document.documentElement.classList.add('need-auth');
} catch (e) {}
