'use strict';
/* =====================================================================
   نظام الصياد — backup.js
   النسخ الاحتياطي: التنزيل والاستعادة، «ابدأ من جديد»، ونسخة مؤكدة قبل أي حذف.
   ===================================================================== */

// ينزّل أي نسخة من البيانات كملف نسخة احتياطية. ما يغيّر state ولا يحرّك المزامنة
function downloadState(s, name) {
  const { migratedFrom, ...clean } = s;
  const blob = new Blob([JSON.stringify({ app: 'hunter-system', version: 6, exportedAt: new Date().toISOString(), state: clean }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportBackup(quiet) {
  downloadState({ ...state, lastBackup: Date.now() }, 'hunter-backup-' + todayIso() + '.json');
  state.lastBackup = Date.now();
  commit();
  if (!quiet) toast(L('حُفظت النسخة الاحتياطية', 'Backup saved'), L('احفظ الملف في مكان آمن', 'Keep the file somewhere safe'), 'gold');
}

// يمسح كل شي ويبدأ من جديد، وقبلها ينزّل نسخة احتياطية تلقائياً
async function resetAll() {
  if (!(await confirmBox(L('بيمسح كل بياناتك: المستوى والمهام والسلسلة والإنجازات، ويبدأ النظام كأنك توك بادي.\n\nقبل المسح بنزّل لك نسخة احتياطية تلقائياً، عشان لو غيرت رأيك تستعيدها.', 'This erases all your data: level, quests, streak and achievements, and the System starts fresh.\n\nA backup downloads automatically first, so you can restore it if you change your mind.'), L('امسح وابدأ من جديد', 'Erase and start over')))) return;
  // لو ما عندنا نسخة مؤكدة، ما نمسح شي
  if (!(await ensureRecoveryCopy(state, 'reset', 'hunter-backup-' + todayIso() + '.json'))) {
    toast(L('ما مسحنا شي', 'Nothing was erased'), L('ما عندنا نسخة احتياطية مؤكدة. فضّي مساحة بالمتصفح أو احفظ ملف النسخة وحاول مرة ثانية.', "There's no confirmed backup. Free some browser space or save the backup file, then try again."), 'warn');
    return;
  }
  clearInterval(timerTick);
  state = freshState();
  store.del(STORE_KEYS.nameAsked);
  editing = false;
  commit(); runTimer(); setView('today');
  toast(L('بدأت من الصفر', 'Started from zero'), L('نزّلنا نسخة من بياناتك القديمة', 'A copy of your old data was downloaded'), 'gold');
  setTimeout(() => { store.set(STORE_KEYS.nameAsked, '1'); openNameDialog(true); }, 900);
}

/**
 * قبل أي حذف: نسخة نقدر نرجع لها. لو انحفظت في المتصفح وانقرأت = مؤكدة.
 * لو بس نزل ملف، ما نقدر نعرف إن المتصفح حفظه فعلاً، فنسألك تتأكد بنفسك قبل ما نكمل.
 */
async function ensureRecoveryCopy(data, side, fileName) {
  const r = saveRecoveryCopy(data, side, () => downloadState({ ...data, lastBackup: Date.now() }, fileName));
  if (r === 'saved') return true;
  if (r === 'failed') return false;
  return confirmBox(L('ما قدرنا نحفظ نسخة في المتصفح، فنزّلنا ملف «' + fileName + '».\n\nتأكد إنه موجود في التنزيلات قبل ما نكمل، لأن البيانات بتنحذف بعدها.', "We couldn't keep a copy in the browser, so we downloaded \u201c" + fileName + "\u201d.\n\nCheck it's in your downloads before we continue, because the data gets deleted next."), L('الملف موجود، كمّل', "The file's there, continue"));
}

function importBackup(file) {
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast(L('الملف كبير جداً', 'File too large'), L('الحد 3 ميجا', 'Max 3 MB'), 'warn'); return; }
  const r = new FileReader();
  r.onload = async () => {
    let data;
    try { data = JSON.parse(String(r.result)); } catch (e) { toast(L('الملف غير صالح', 'Invalid file'), L('لازم يكون ملف JSON من النظام', 'It must be a JSON file from the System'), 'warn'); return; }
    let next = null;
    if (data && data.app === 'hunter-system' && data.state) next = normalize(data.state);
    else if (data && (data.fixedQuests || data.progress)) next = migrateOld(data);
    if (!next) { toast(L('ما تعرفت على الملف', 'Unrecognized file'), L('استخدم ملف نسخة احتياطية من النظام', 'Use a backup file from the System'), 'warn'); return; }
    if (!(await confirmBox(L('تستبدل بياناتك الحالية بالنسخة من الملف؟ ما تقدر تتراجع إلا بنسخة احتياطية.', 'Replace your current data with the file? You can only undo this with a backup.'), L('استبدل', 'Replace')))) return;
    state = next; state.lastBackup = Date.now();
    commit(); runTimer();
    toast(L('رجعت بياناتك', 'Your data is back'), L('المستوى ', 'Level ') + levelInfo(state.totalXp).level, 'gold');
  };
  r.readAsText(file);
}

const backupDue = () => Object.keys(state.rewards).length > 0 && Date.now() - state.lastBackup > 7 * 86400000;

/* ============ الأزرار ============ */
// قائمة النسخ الاحتياطي في الشريط العلوي
function bindBackup() {
  const menu = $('backupMenu');
  const closeMenu = () => { menu.hidden = true; $('backupBtn').setAttribute('aria-expanded', 'false'); };
  $('backupBtn').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('backupBtn').setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) $('exportBtn').focus(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); $('backupBtn').focus(); } });
  $('exportBtn').addEventListener('click', () => { closeMenu(); exportBackup(); });
  $('importBtn').addEventListener('click', () => { closeMenu(); $('importFile').click(); });
  $('resetBtn').addEventListener('click', () => { closeMenu(); resetAll(); });
  $('importFile').addEventListener('change', (e) => { importBackup(e.target.files[0]); e.target.value = ''; });
}
