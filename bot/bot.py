# /// script
# requires-python = ">=3.10"
# dependencies = ["python-telegram-bot==21.6"]
# ///
"""
بوت تيليجرام لنظام سولو ليفلنق.

ترسل له مهمة بسطر واحد، مثل:
    مهمة: مراجعة الكود الساعة 10 مساءً !A #ذكاء
    task: review the code at 10pm !A #intellect
فيرد عليك برابط. تضغطه فيفتح الموقع ويسألك: تضيفها؟
يرد بالعربي إذا رسالتك عربي، وبالإنجليزي إذا رسالتك إنجليزي.

التشغيل (من داخل مجلد bot):
    uv run bot.py

الإعدادات تُقرأ من ملف .env بجانب هذا الملف (انسخ .env.example إلى .env).
"""
import logging
import os
import re
from pathlib import Path
from urllib.parse import quote, urlparse

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("solo-bot")


def load_env(path: Path) -> None:
    """قراءة بسيطة لملف .env بدون مكتبات إضافية."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env(Path(__file__).with_name(".env"))

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
SITE_URL = os.environ.get("SITE_URL", "http://127.0.0.1:5501/Final-Daily-Tasks-Project/index.html").strip()
ALLOWED_ID = os.environ.get("ALLOWED_USER_ID", "").strip()

HELP = (
    "⚔️ <b>نظام الصياد جاهز</b>\n\n"
    "أرسل مهمتك بسطر واحد، مثال:\n"
    "<code>مهمة: مراجعة الكود الساعة 10 مساءً !A #ذكاء</code>\n\n"
    "• <code>!E</code> إلى <code>!S</code> = رتبة البوابة\n"
    "• <code>#قوة #حيوية #رشاقة #ذكاء #انضباط</code> = القدرة\n"
    "• <code>بكرة</code> أو <code>يوم 12</code> = اليوم\n"
    "• <code>يومي</code> = مهمة ثابتة كل يوم\n\n"
    "أرد عليك برابط، اضغطه فيفتح الموقع ويسألك قبل الإضافة."
)

HELP_EN = (
    "⚔️ <b>The Hunter System is ready</b>\n\n"
    "Send your quest in one line, for example:\n"
    "<code>task: review the code at 10pm !A #intellect</code>\n\n"
    "• <code>!E</code> to <code>!S</code> = gate rank\n"
    "• <code>#strength #vitality #agility #intellect #discipline</code> = ability\n"
    "• <code>tomorrow</code> or <code>day 12</code> = the day\n"
    "• <code>daily</code> = a quest that repeats every day\n\n"
    "I reply with a link. Open it and the site asks you before adding."
)

ARABIC = re.compile(r"[\u0600-\u06FF]")


def is_english(update: Update, text: str = "") -> bool:
    """الرد بالإنجليزي إذا الرسالة ما فيها حروف عربية، أو (لـ /start) إذا لغة تيليجرام مو عربي."""
    if text:
        return not ARABIC.search(text)
    user = update.effective_user
    code = (user.language_code or "") if user else ""
    return bool(code) and not code.lower().startswith("ar")


def is_allowed(update: Update) -> bool:
    if not ALLOWED_ID:
        return True  # قبل ما تضبط رقمك: يقبل الكل، لكن يذكّرك تضبطه
    user = update.effective_user
    return bool(user) and str(user.id) == ALLOWED_ID


def make_link(text: str) -> str:
    return SITE_URL.split("#", 1)[0] + "#add=" + quote(text, safe="")


def button_ok(url: str) -> bool:
    """تيليجرام يرفض أزرار الروابط المحلية (localhost / 127.0.0.1)."""
    host = (urlparse(url).hostname or "").lower()
    return url.startswith("https://") and host not in ("localhost", "127.0.0.1")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    en = is_english(update)
    msg = HELP_EN if en else HELP
    if not ALLOWED_ID and user:
        if en:
            msg += (
                f"\n\n🔒 Your Telegram ID: <code>{user.id}</code>\n"
                "Put it in the .env file at ALLOWED_USER_ID so the bot only answers you, then restart it."
            )
        else:
            msg += (
                f"\n\n🔒 رقمك في تيليجرام: <code>{user.id}</code>\n"
                "حطه في ملف .env عند ALLOWED_USER_ID عشان البوت يرد عليك أنت بس، وأعد تشغيله."
            )
    await update.message.reply_text(msg, parse_mode=ParseMode.HTML)


async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not is_allowed(update):
        log.warning("رسالة مرفوضة من %s", update.effective_user.id if update.effective_user else "?")
        return
    text = (update.message.text or "").strip()
    if not text:
        return
    en = is_english(update, text)
    if len(text) > 300:
        await update.message.reply_text("⚠️ That message is too long, keep it under 300 characters." if en
                                        else "⚠️ الرسالة طويلة، خلها أقصر من 300 حرف.")
        return

    link = make_link(text)
    if en:
        reply = f"📨 Quest received:\n<b>{escape(text)}</b>\n\nOpen the link to add it to the System:\n{escape(link)}"
    else:
        reply = f"📨 وصلت المهمة:\n<b>{escape(text)}</b>\n\nاضغط الرابط لإضافتها للنظام:\n{escape(link)}"
    markup = None
    if button_ok(link):
        markup = InlineKeyboardMarkup([[InlineKeyboardButton("⚔️ Add it to the System" if en else "⚔️ أضفها للنظام", url=link)]])
    await update.message.reply_text(reply, parse_mode=ParseMode.HTML, reply_markup=markup,
                                    disable_web_page_preview=True)


def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> None:
    if not TOKEN:
        raise SystemExit("❌ ما فيه توكن. انسخ .env.example إلى .env وحط TELEGRAM_BOT_TOKEN.")
    if not ALLOWED_ID:
        log.warning("ALLOWED_USER_ID فاضي: أرسل /start للبوت عشان تعرف رقمك وتضبطه.")
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler(["start", "help"], start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
    log.info("البوت شغال. الرابط: %s  (Ctrl+C للإيقاف)", SITE_URL)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
