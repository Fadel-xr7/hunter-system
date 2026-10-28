// إعدادات الاتصال بـ Supabase
// هذا المفتاح «العام» (publishable) ومصمم يكون ظاهر في الموقع.
// الحماية الحقيقية من RLS في قاعدة البيانات: كل حساب يوصل لبياناته بس.
// لا تحط هنا أبداً المفتاح السري (service_role / secret).
window.HUNTER_CONFIG = {
  supabaseUrl: 'https://rfhkbuopqcevzjfnsgrg.supabase.co',
  supabaseKey: 'sb_publishable_s1TTnzSEOwW32u_X92zAMA_BCsuFkR7',
  // اسم بوت تيليجرام بدون @ (البوت نفسه في supabase/functions/telegram-bot). فاضي = زر «ربط تيليجرام» يقول إنه ما انربط
  telegramBot: 'Hunters_system_bot'
};
