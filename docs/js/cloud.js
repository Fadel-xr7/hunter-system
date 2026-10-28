'use strict';
/* =====================================================================
   نظام الصياد — cloud.js
   الحساب (تسجيل ودخول) والمزامنة مع Supabase.
   الموقع يحفظ في المتصفح أول (يشتغل بدون نت)، وإذا كنت مسجل دخول يرفع للسحابة.
   الأقسام: 1. الإعداد   2. الحالة والمزامنة   3. شاشة الدخول   4. قائمة الحساب   5. التشغيل
   ===================================================================== */

const Cloud = (() => {
  /* ============ 1. الإعداد ============ */
  const cfg = window.HUNTER_CONFIG || {};
  const enabled = Boolean(window.supabase && cfg.supabaseUrl && cfg.supabaseKey);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const TABLE = 'hunter_state';
  const META_KEY = STORE_KEYS.sync;
  const GUEST_KEY = STORE_KEYS.guest;
  const here = () => location.origin + location.pathname;

  let user = null;
  let status = 'off';
  let pushTimer = null;
  let pushing = false;
  let signingOut = false; // الخروج شغّال: نمنع تكراره، والشارة تقول «جاري تسجيل الخروج…»
  let rev = 0; // يزيد مع كل تعديل: نعرف لو عدّلت أثناء ما الرفع شغّال
  let applying = false;
  let googleOn = null;
  let meta = readMeta();

  function readMeta() {
    try { const m = JSON.parse(store.get(META_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
  }
  const writeMeta = () => store.set(META_KEY, JSON.stringify(meta));
  // تعديلات ما انرفعت لحساب، وما فيه مستخدم داخل (خرج قبل ما تنرفع): لا ضيف ولا حساب ثاني يشوفها أو يعدّلها
  const pendingAccount = () => !user && Boolean(meta.dirty && meta.uid);
  function pendingNotice() {
    showAuth('in');
    const who = meta.email ? ' (' + meta.email + ')' : '';
    if (!$('confirmDialog').open) confirmBox(L('في هذا المتصفح تعديلات ما انحفظت لحساب' + who + '. ادخل بالحساب ذاك أول عشان تكمل مزامنتها. قبلها ما نقدر نفتح النظام كضيف.', 'This browser has unsaved changes for an account' + who + '. Sign in to that account first to finish syncing them. Until then the System cannot be opened as a guest.'), L('فهمت', 'Got it'));
  }
  const cleanState = () => { const { migratedFrom, ...c } = state; return c; };
  const hasProgress = (s) => Object.keys((s && s.rewards) || {}).length > 0;
  const summary = (s) => { const n = normalize(s); return L('المستوى ' + levelInfo(n.totalXp).level + '، خبرة ' + n.totalXp + '، أيام مكتملة ' + n.completedDates.length, 'Level ' + levelInfo(n.totalXp).level + ', XP ' + n.totalXp + ', completed days ' + n.completedDates.length); };

  /* ============ 2. الحالة والمزامنة ============ */
  const STATUS = {
    off: ['', ''],
    guest: [L('ضيف: بياناتك في هذا المتصفح بس', 'Guest: your data stays in this browser only'), 'guest'],
    synced: [L('متزامن مع حسابك', 'Synced with your account'), 'ok'],
    saving: [L('يحفظ في حسابك…', 'Saving to your account…'), 'busy'],
    leaving: [L('جاري تسجيل الخروج…', 'Signing out…'), 'busy'],
    offline: [L('بدون نت: بيرفع لما يرجع الاتصال', "Offline: it'll upload when you're back online"), 'warn'],
    error: [L('تعذّرت المزامنة، بنحاول مرة ثانية', "Sync failed, we'll try again"), 'warn'],
    // قاعدة البيانات ترفض أي حساب بياناته فوق 5 ميغا (supabase/setup.sql)
    toobig: [L('بياناتك تعدّت حد السحابة (5 ميغا)، فآخر تعديلاتك محفوظة في هذا المتصفح بس. نزّل نسخة احتياطية من القائمة.', 'Your data is over the cloud limit (5 MB), so your latest changes are only saved in this browser. Download a backup from the menu.'), 'warn']
  };
  function setStatus(s) {
    if (signingOut && s !== 'leaving') return; // أثناء الخروج تبقى الشارة «جاري تسجيل الخروج…»
    status = s;
    const b = $('cloudBtn');
    if (!b) return;
    b.hidden = !enabled;
    b.dataset.state = STATUS[s][1];
    b.dataset.tip = s === 'off' ? L('الحساب', 'Account') : STATUS[s][0];
    $('accStatus').textContent = STATUS[s][0];
    // شارة صغيرة جنب زر الحساب: محفوظ / يحفظ / بدون نت
    const chip = $('syncChip');
    if (chip) {
      const short = { synced: L('محفوظ في السحابة', 'Saved to cloud'), saving: L('يحفظ…', 'Saving…'), leaving: L('جاري تسجيل الخروج…', 'Signing out…'), offline: L('بدون نت', 'Offline'), error: L('ما انحفظ للحين', 'Not saved yet'), toobig: L('أكبر من الحد', 'Over the limit'), guest: L('ضيف', 'Guest') }[s];
      chip.hidden = !enabled || !short;
      chip.textContent = short || '';
      chip.dataset.state = STATUS[s][1];
    }
  }

  // التطبيق نادى save(): نجدول رفع بعد ثانية ونص
  function changed() {
    if (!user || applying) return;
    rev++;
    meta.dirty = true; writeMeta();
    setStatus(navigator.onLine ? 'saving' : 'offline');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  }

  function apply(data, at) {
    applying = true;
    try {
      state = normalize(data);
      meta = { uid: user.id, at, dirty: false };
      writeMeta();
      save();
      commit(); runTimer(); setView(view);
    } finally { applying = false; }
    setStatus('synced');
  }

  async function push() {
    if (!user || pushing) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    pushing = true;
    const uid = user.id;
    const startRev = rev;
    const snap = cleanState(); // نرفع هذي بالضبط، وأي تعديل بعدها يبقى معلّق
    try {
      let res;
      if (meta.uid !== uid || !meta.at) {
        res = await sb.from(TABLE).insert({ user_id: uid, data: snap }).select('updated_at').single();
        if (res.error && res.error.code === '23505') { pushing = false; await pull(); return; }
      } else {
        // يحدّث بس إذا محد عدّل من جهاز ثاني بعد آخر مزامنة
        res = await sb.from(TABLE).update({ data: snap }).eq('user_id', uid).eq('updated_at', meta.at).select('updated_at');
        if (!res.error && Array.isArray(res.data) && res.data.length === 0) { pushing = false; await resolveConflict(); return; }
        if (!res.error) res = { data: res.data[0] };
      }
      if (res.error) throw res.error;
      if (!user || user.id !== uid) return;
      meta = afterPush(uid, res.data.updated_at, startRev, rev);
      writeMeta();
      if (meta.dirty) {
        // عدّلت أثناء الرفع: التعديل الأحدث ما انرفع، نرفعه بعد ثانية
        setStatus('saving');
        clearTimeout(pushTimer);
        pushTimer = setTimeout(push, 400);
      } else setStatus('synced');
    } catch (e) {
      clearTimeout(pushTimer);
      // 23514 = تعدّى حد الحجم: ما نعيد المحاولة كل شوي، ننتظر تعديلك الجاي
      if (e && e.code === '23514') { setStatus('toobig'); return; }
      setStatus(navigator.onLine ? 'error' : 'offline');
      pushTimer = setTimeout(push, 15000);
    } finally { pushing = false; }
  }

  async function fetchRow() {
    const { data, error } = await sb.from(TABLE).select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  // يجيب بيانات الحساب ويقرر: ناخذ السحابة، نرفع المحلي، أو نسألك
  async function pull() {
    if (!user) return;
    let row;
    try { row = await fetchRow(); } catch (e) { setStatus(navigator.onLine ? 'error' : 'offline'); return; }
    if (!row) { meta = { uid: user.id, at: null, dirty: true }; writeMeta(); await push(); return; }
    if (meta.uid === user.id) {
      if (!meta.dirty) { if (row.updated_at !== meta.at) apply(row.data, row.updated_at); else setStatus('synced'); return; }
      if (row.updated_at === meta.at) { await push(); return; }
      await ask(row, L('تعدّلت بياناتك من جهاز ثاني، وعندك تعديلات هنا ما ترفعت.', "Your data changed on another device, and you have changes here that weren't uploaded."));
      return;
    }
    // أول دخول من هذا المتصفح
    if (!hasProgress(state) || JSON.stringify(normalize(row.data)) === JSON.stringify(normalize(cleanState()))) { apply(row.data, row.updated_at); toast(L('أهلاً بعودتك', 'Welcome back'), L('جبنا سجلّك من حسابك', 'Loaded your record from your account'), 'gold'); return; }
    await ask(row, L('عندك تقدم في هذا المتصفح، وعندك تقدم محفوظ في حسابك.', 'You have progress in this browser, and progress saved in your account.'));
  }

  async function resolveConflict() {
    let row;
    try { row = await fetchRow(); } catch (e) { setStatus('error'); return; }
    if (!row) { meta.at = null; await push(); return; }
    await ask(row, L('تعدّلت بياناتك من جهاز ثاني، وعندك تعديلات هنا ما ترفعت.', "Your data changed on another device, and you have changes here that weren't uploaded."));
  }

  async function ask(row, why) {
    const keepAccount = await choose(why + L('\n\nحسابك: ', '\n\nAccount: ') + summary(row.data) + L('\nهذا المتصفح: ', '\nThis browser: ') + summary(cleanState()) + L('\n\nأيهم تبقي؟ الثاني ينحذف، وينزل لك ملف نسخة منه احتياط.', '\n\nWhich one do you keep? The other gets deleted, and a backup file of it is downloaded just in case.'), L('اللي في حسابي', 'Keep my account'), L('اللي في هذا المتصفح', 'Keep this browser'));
    if (keepAccount) {
      if (!(await keepCopy(cleanState(), 'browser'))) return noBackup();
      apply(row.data, row.updated_at);
      toast(L('أخذنا بياناتك من الحساب', 'Loaded your data from the account'), L('ونزّلنا نسخة من بيانات هذا المتصفح احتياط', "A copy of this browser's data was downloaded just in case"));
    } else {
      if (!(await keepCopy(normalize(row.data), 'account'))) return noBackup();
      meta = { uid: user.id, at: row.updated_at, dirty: true }; writeMeta(); await push();
      toast(L('رفعنا بيانات هذا المتصفح لحسابك', "Uploaded this browser's data to your account"), L('ونزّلنا نسخة من بيانات الحساب القديمة احتياط', "A copy of the account's old data was downloaded just in case"));
    }
  }

  // قبل ما ينحذف أي طرف في التعارض: نسخة مؤكدة منه (ensureRecoveryCopy في backup.js).
  // false = ما فيه نسخة مؤكدة، فما نحذف شي.
  function keepCopy(data, side) {
    return ensureRecoveryCopy(data, side, 'hunter-' + side + '-copy-' + todayIso() + '.json');
  }
  function noBackup() {
    setStatus('error');
    toast(L('ما غيّرنا شي في بياناتك', "We didn't change your data"), L('ما عندنا نسخة احتياطية مؤكدة قبل الحذف. فضّي مساحة بالمتصفح أو احفظ ملف النسخة، وبعدها اضغط مزامنة.', "There's no confirmed backup copy. Free some browser space or save the backup file, then press Sync."), 'warn');
  }

  function choose(text, aLabel, bLabel) {
    return new Promise((resolve) => {
      const dlg = $('chooseDialog');
      $('chooseText').textContent = text;
      $('chooseA').textContent = aLabel; $('chooseB').textContent = bLabel;
      dlg.returnValue = '';
      dlg.oncancel = (e) => e.preventDefault(); // لازم تختار، ما ينقفل بـ Esc
      dlg.onclose = () => resolve(dlg.returnValue !== 'b');
      dlg.showModal();
    });
  }

  async function onSignedIn(u) {
    if (user && user.id === u.id) return;
    // في هذا المتصفح تعديلات ما انرفعت لحساب ثاني (خرج منه قبل ما تنرفع، signOutSteps).
    // ما نرفعها لهذا الحساب ولا نخلطها فيه: نخرج منه محلياً ونطلب الدخول بالحساب الأصلي.
    if (meta.dirty && meta.uid && meta.uid !== u.id) {
      try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* user يبقى null، فما فيه مزامنة لهذا الحساب على أي حال */ }
      showAuth('in');
      const who = meta.email ? ' (' + meta.email + ')' : '';
      if (!$('confirmDialog').open) confirmBox(L('في هذا المتصفح تعديلات ما انحفظت لحساب ثاني' + who + '. ما رفعناها لهذا الحساب ولا خلطناها فيه. ادخل بالحساب ذاك أول عشان تكمل مزامنتها.', 'This browser has unsaved changes for another account' + who + '. They were not uploaded to or mixed into this account. Sign in to that account first to finish syncing them.'), L('فهمت', 'Got it'));
      return;
    }
    user = u;
    store.del(GUEST_KEY);
    const metaName = u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name);
    hideAuth();
    setStatus('saving');
    await pull();
    if (!state.name && metaName) { state.name = String(metaName).slice(0, 18); store.set(STORE_KEYS.nameAsked, '1'); commit(); }
    renderAccount();
    afterEntry();
  }

  // الخروج: يرفع آخر التعديلات، ينهي الجلسة، وبعدها يمسح بيانات الحساب من هذا المتصفح.
  // ما يمسح شي ما انحفظ: لو الرفع فشل، أو الجلسة باقية، أو صار تعديل أثناء الانتظار.
  async function signOut() {
    if (signingOut) return; // ضغطة ثانية أثناء الخروج ما تسوي شي
    signingOut = true;
    try { await signOutSteps(); } finally {
      signingOut = false;
      $('cloudBtn').disabled = false;
      if (status === 'leaving') setStatus(user ? (meta.dirty ? 'error' : 'synced') : 'off');
    }
  }
  async function signOutSteps() {
    if (!(await confirmBox(L('تسجيل الخروج يمسح بياناتك من هذا المتصفح، وتبقى محفوظة في حسابك. تبي تكمل؟', 'Signing out clears your data from this browser; it stays saved in your account. Continue?'), L('سجّل خروج', 'Sign out')))) return;
    $('cloudBtn').disabled = true;
    setStatus('leaving');
    if (meta.dirty) { clearTimeout(pushTimer); await push(); }
    if (meta.dirty) { toast(L('ما قدرنا نرفع آخر تعديلاتك', "Couldn't upload your latest changes"), L('تأكد من النت وحاول مرة ثانية', 'Check your connection and try again'), 'warn'); return; }
    setStatus('leaving');
    // نفحص الخطأ الراجع والاستثناء. المكتبة لما يفشل إلغاء الجلسة في السيرفر تمسحها من المتصفح وترجع error،
    // ولما تفشل قبل ما توصل للسيرفر (مثلاً جلسة منتهية وتجديدها فشل) ترجع error والجلسة باقية. نفرّق بينهم بسؤالها.
    // error: null معناه الخروج المحلي تم بس: المكتبة ترجعه حتى لو السيرفر رد 401 أو 403 أو 404،
    // فما يثبت إن كل جلسات الحساب في السيرفر انلغت.
    let out, unconfirmed = false;
    try { out = await sb.auth.signOut(); } catch (e) { out = { error: e }; }
    if (!out || out.error) {
      let kept = true; // لو ما قدرنا نتأكد إن الجلسة المحلية انمسحت، نعتبرها باقية
      try { const r = await sb.auth.getSession(); kept = !(r && !r.error && r.data && !r.data.session); } catch (e) { /* باقية */ }
      if (kept) { toast(L('ما قدرنا ننهي الجلسة', "Couldn't sign you out"), L('بياناتك باقية في هذا المتصفح. تأكد من النت وحاول مرة ثانية', 'Your data is still in this browser. Check your connection and try again'), 'warn'); return; }
      unconfirmed = true; // خرجنا محلياً، بس إلغاء الجلسة في السيرفر ما تأكد
    }
    const serverNote = unconfirmed ? L('\n\nوما تأكدنا إن جلستك انلغت في الخوادم: طلب الإلغاء فشل. لا تعتبر الجلسة ملغاة.', '\n\nAlso, we could not confirm that your session was revoked on the server: the revoke request failed. Do not assume it is revoked.') : '';
    // الجلسة المحلية راحت: المزامنة توقف هنا
    const leaving = user;
    user = null;
    clearTimeout(pushTimer);
    if (meta.dirty) {
      // تعديل صار أثناء الانتظار (changed() يخلي dirty = true) وما تأكد رفعه، وما عاد نقدر نرفعه. ما نمسح شي: يبقى في هذا المتصفح مع حالة المزامنة،
      // ويترفع لما تدخل نفس الحساب (أو تطلع نافذة الاختيار لو بيانات الحساب تغيّرت من جهاز ثاني).
      // meta.uid يربطها بهذا الحساب، فأي حساب ثاني ينرفض في onSignedIn. الإيميل بس عشان نقول لك أي حساب.
      meta.email = leaving.email || ''; writeMeta();
      renderAccount(); showAuth('in');
      confirmBox(L('خرجت من الحساب، بس صار تعديل أثناء الخروج وما تأكدنا إنه انحفظ في حسابك. تعديلاتك باقية في هذا المتصفح. سجّل دخولك للحساب نفسه لإكمال المزامنة، وقد نطلب منك اختيار النسخة إذا تغيّرت بيانات الحساب من جهاز آخر.', 'You are signed out, but a change was made while signing out and we could not confirm it was saved to your account. Your changes are still in this browser. Sign in to the same account to finish syncing; we may ask you to choose a version if the account\'s data changed on another device.') + serverNote, L('فهمت', 'Got it'));
      return;
    }
    applying = true;
    state = freshState(); meta = {}; store.del(META_KEY); store.del(STORE_KEYS.nameAsked);
    store.del(STORE_KEYS.conflictCopy); // نسخة الاسترجاع فيها بيانات الحساب، ما تبقى بعد الخروج
    save(); applying = false;
    commit(); runTimer();
    setStatus('off'); renderAccount();
    showAuth('in');
    if (unconfirmed) confirmBox(L('خرجت من هذا المتصفح، وبياناتك انمسحت منه وهي محفوظة في حسابك.', 'You are signed out of this browser and its data was cleared; it stays saved in your account.') + serverNote, L('فهمت', 'Got it'));
  }

  /* ============ 3. شاشة الدخول ============ */
  let mode = 'in';
  const T = {
    in: EN ? ['Enter the System', 'Pick up where you left off. Your data is saved to your account.', 'Sign in'] : ['ادخل النظام', 'كمّل من حيث وقفت. بياناتك محفوظة على حسابك.', 'ادخل'],
    up: EN ? ['The System has chosen you', 'Register as a new Hunter and your quests sync across all your devices.', 'Register as a Hunter'] : ['النظام اختارك', 'سجّل كصياد جديد، وتنحفظ مهامك على كل أجهزتك.', 'سجّل كصياد'],
    forgot: EN ? ['Recover access', "Enter your email and we'll send you a link to set a new password.", 'Send recovery link'] : ['استعادة الدخول', 'اكتب إيميلك ونرسل لك رابط تعيّن فيه كلمة مرور جديدة.', 'أرسل رابط الاستعادة'],
    reset: EN ? ['New password', 'Enter a new password for your account.', 'Save password'] : ['كلمة مرور جديدة', 'اكتب كلمة المرور الجديدة لحسابك.', 'احفظ كلمة المرور']
  };

  function showAuth(m) {
    document.documentElement.classList.add('need-auth');
    setMode(m || 'in');
    window.scrollTo({ top: 0 });
    setTimeout(() => { const f = mode === 'reset' ? $('aPw') : $('aEmail'); if (f) f.focus(); }, 50);
  }
  function hideAuth() { document.documentElement.classList.remove('need-auth'); }

  function setMode(m) {
    mode = m;
    const msg = m === 'verify' || m === 'sent';
    $('authForms').hidden = msg;
    $('authMsg').hidden = !msg;
    if (msg) {
      $('msgTitle').textContent = m === 'verify' ? L('أكّد إيميلك', 'Confirm your email') : L('تفقد بريدك', 'Check your inbox');
      $('msgBody').textContent = m === 'verify' ? L('أرسلنا لك رابط تأكيد. اضغطه ويتفعل حسابك، وبعدها ادخل النظام.', 'We sent you a confirmation link. Open it to activate your account, then sign in.') : L('لو الإيميل مسجّل عندنا، بيوصلك رابط تعيّن فيه كلمة مرور جديدة.', "If that email is registered, you'll get a link to set a new password.");
      $('msgEmail').textContent = $('aEmail').value.trim();
      return;
    }
    $('authTitle').textContent = T[m][0];
    $('authSub').textContent = T[m][1];
    $('authSubmit').textContent = T[m][2];
    const tabs = m === 'in' || m === 'up';
    $('authTabs').hidden = !tabs;
    $('googleBox').hidden = !tabs;
    $('guestBox').hidden = !tabs || Boolean(user);
    $('tabIn').setAttribute('aria-selected', String(m === 'in'));
    $('tabUp').setAttribute('aria-selected', String(m === 'up'));
    $('nameRow').hidden = m !== 'up';
    $('emailRow').hidden = m === 'reset';
    $('pwRow').hidden = m === 'forgot';
    $('pwLabel').firstChild.textContent = m === 'reset' ? L('كلمة المرور الجديدة', 'New password') : L('كلمة المرور', 'Password');
    $('pwStrength').hidden = m !== 'up' && m !== 'reset';
    $('aPw').autocomplete = m === 'in' ? 'current-password' : 'new-password';
    $('forgotLink').hidden = m !== 'in';
    $('backToIn').hidden = m !== 'forgot';
    setErr('');
    updateStrength();
  }

  function setErr(t) {
    $('authErr').textContent = t;
    $('authErr').hidden = !t;
    if (t) { const c = $('authCard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  function updateStrength() {
    const pw = $('aPw').value;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score++;
    $('pwStrength').dataset.score = String(pw ? score : 0);
    $('pwStrengthLbl').textContent = !pw ? L('8 أحرف على الأقل', 'At least 8 characters') : L('قوة كلمة المرور: ', 'Password strength: ') + (EN ? ['weak', 'weak', 'fair', 'good', 'strong'] : ['ضعيفة', 'ضعيفة', 'مقبولة', 'جيدة', 'قوية'])[score];
  }

  // رسائل Supabase بالعربي
  function arError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '').toLowerCase();
    const code = String((e && e.code) || '');
    if (code === 'invalid_credentials' || m.includes('invalid login')) return L('الإيميل أو كلمة المرور غلط.', 'Wrong email or password.');
    if (code === 'email_not_confirmed' || m.includes('not confirmed')) return L('أكّد إيميلك أول من الرابط اللي وصلك، وبعدها ادخل.', 'Confirm your email first with the link you received, then sign in.');
    if (code === 'user_already_exists' || m.includes('already registered')) return L('هذا الإيميل مسجّل. ادخل بدل ما تسجّل.', 'This email is already registered. Sign in instead.');
    if (code === 'weak_password' || m.includes('password should')) return L('كلمة المرور ضعيفة. خلها 8 أحرف على الأقل، وفيها أرقام وحروف.', 'That password is too weak. Use at least 8 characters with letters and numbers.');
    if (code === 'same_password' || m.includes('different from the old')) return L('كلمة المرور الجديدة لازم تختلف عن القديمة.', 'The new password must be different from the old one.');
    if (code.includes('rate_limit') || m.includes('rate limit') || m.includes('too many')) return L('محاولات كثيرة. انتظر شوي وحاول مرة ثانية.', 'Too many attempts. Wait a little and try again.');
    if (code === 'provider_disabled' || m.includes('provider is not enabled')) return L('الدخول بـ Google ما تفعّل للحين من لوحة Supabase.', "Google sign-in isn't enabled in the Supabase dashboard yet.");
    if (m.includes('email address not authorized')) return L('هذا الإيميل ما يقدر يستقبل رسائل التأكيد للحين. استخدم إيميل حسابك في Supabase، أو اربط خدمة إيميل (SMTP) من لوحة Supabase.', "This email can't receive confirmation messages yet. Use your Supabase account email, or connect an email service (SMTP) in the Supabase dashboard.");
    if (m.includes('redirect') && m.includes('not allowed')) return L('رابط الموقع مو مضاف في إعدادات Supabase (Redirect URLs).', "The site's link isn't added in the Supabase settings (Redirect URLs).");
    if (m.includes('fetch') || m.includes('network') || !navigator.onLine) return L('ما فيه اتصال بالإنترنت. تأكد وحاول مرة ثانية.', 'No internet connection. Check it and try again.');
    return L('صار خطأ: ', 'Something went wrong: ') + ((e && e.message) || L('غير معروف', 'unknown'));
  }

  const WAIT = L('لحظة…', 'One moment…');
  async function submit(e) {
    e.preventDefault();
    const email = $('aEmail').value.trim();
    const pw = $('aPw').value;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (mode !== 'reset' && !emailOk) { setErr(L('اكتب إيميل صحيح، مثل name@example.com', 'Enter a valid email, like name@example.com')); $('aEmail').focus(); return; }
    if ((mode === 'up' || mode === 'reset') && pw.length < 8) { setErr(L('كلمة المرور لازم تكون 8 أحرف على الأقل.', 'The password must be at least 8 characters.')); $('aPw').focus(); return; }
    if (mode === 'in' && !pw) { setErr(L('اكتب كلمة المرور.', 'Enter your password.')); $('aPw').focus(); return; }
    if (!enabled) { setErr(L('الحسابات غير مفعلة: ملف config.js ناقص.', 'Accounts are off: config.js is missing.')); return; }
    const btn = $('authSubmit'); const label = btn.textContent;
    btn.disabled = true; btn.textContent = WAIT; setErr('');
    try {
      if (mode === 'in') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        $('aPw').value = '';
        await onSignedIn(data.user);
      } else if (mode === 'up') {
        const name = $('aName').value.trim().slice(0, 18);
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: here(), data: name ? { name } : {} } });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw { code: 'user_already_exists' };
        if (name && !state.name) { state.name = name; store.set(STORE_KEYS.nameAsked, '1'); save(); }
        $('aPw').value = '';
        if (data.session) await onSignedIn(data.user); else setMode('verify');
      } else if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() });
        if (error) throw error;
        setMode('sent');
      } else if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password: pw });
        if (error) throw error;
        $('aPw').value = '';
        toast(L('تغيّرت كلمة المرور', 'Password changed'), '', 'gold');
        const { data } = await sb.auth.getUser();
        if (data && data.user) { user = null; await onSignedIn(data.user); } else hideAuth();
      }
    } catch (err) {
      setErr(arError(err));
    } finally {
      btn.disabled = false;
      if (btn.textContent === WAIT) btn.textContent = label;
    }
  }

  async function google() {
    if (!enabled) return;
    if (googleOn === false) { setErr(L('الدخول بـ Google ما تفعّل للحين. لازم تفعّله من لوحة Supabase (الخطوات في README).', "Google sign-in isn't enabled yet. Turn it on in the Supabase dashboard (steps in the README).")); return; }
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } });
    if (error) setErr(arError(error));
  }

  function guest() {
    if (pendingAccount()) { pendingNotice(); return; }
    store.set(GUEST_KEY, '1');
    hideAuth();
    setStatus('guest');
    renderAccount();
    afterEntry();
  }

  /* ============ 4. قائمة الحساب ============ */
  function renderAccount() {
    $('accWho').textContent = user ? (user.email || L('حسابك', 'Your account')) : L('أنت تستخدم النظام كضيف', "You're using the System as a guest");
    $('accSync').hidden = !user;
    $('accOut').hidden = !user;
    $('accIn').hidden = Boolean(user);
  }

  function bindUI() {
    $('authForm').addEventListener('submit', submit);
    $('tabIn').addEventListener('click', () => setMode('in'));
    $('tabUp').addEventListener('click', () => setMode('up'));
    $('forgotLink').addEventListener('click', () => setMode('forgot'));
    $('backToIn').addEventListener('click', () => setMode('in'));
    $('msgBack').addEventListener('click', () => setMode('in'));
    $('googleBtn').addEventListener('click', google);
    $('guestBtn').addEventListener('click', guest);
    $('aPw').addEventListener('input', updateStrength);
    $('pwToggle').addEventListener('click', () => {
      const show = $('aPw').type === 'password';
      $('aPw').type = show ? 'text' : 'password';
      $('pwToggle').setAttribute('aria-label', show ? L('إخفاء كلمة المرور', 'Hide password') : L('إظهار كلمة المرور', 'Show password'));
      $('pwToggle').setAttribute('aria-pressed', String(show));
    });
    // قائمة الحساب
    const menu = $('accountMenu');
    const close = () => { menu.hidden = true; $('cloudBtn').setAttribute('aria-expanded', 'false'); };
    $('cloudBtn').addEventListener('click', (e) => { e.stopPropagation(); renderAccount(); menu.hidden = !menu.hidden; $('cloudBtn').setAttribute('aria-expanded', String(!menu.hidden)); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { close(); $('cloudBtn').focus(); } });
    $('accSync').addEventListener('click', async () => { close(); setStatus('saving'); if (meta.dirty) await push(); else await pull(); if (status === 'synced') toast(L('متزامن', 'Synced'), L('بياناتك محدّثة في حسابك', 'Your account is up to date')); });
    $('accOut').addEventListener('click', () => { close(); signOut(); });
    $('accIn').addEventListener('click', () => { close(); showAuth('up'); });

    window.addEventListener('online', () => { if (user && meta.dirty) push(); });
    window.addEventListener('offline', () => { if (user) setStatus('offline'); });
    // تبويب ثاني رفع أو عدّل: ناخذ حالة المزامنة منه، عشان ما يطلع تعارض وهمي بين نافذتين جنب بعض
    window.addEventListener('storage', (e) => { if (e.key === META_KEY) meta = readMeta(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && user && !meta.dirty && !pushing) pull(); });
  }

  function renderAuthTally() {
    const box = $('authTally');
    if (!box) return;
    box.replaceChildren();
    const lines = [[35, 4, 35, 30], [27, 3, 27.5, 31], [19, 4, 19, 30], [11, 3, 11.5, 31], [39, 8, 6, 26]];
    for (let g = 0; g < 6; g++) {
      box.append(sv('svg', { viewBox: '0 0 40 34', width: 40, height: 34, class: 'tg', style: 'animation-delay:' + (g * 0.08).toFixed(2) + 's' },
        ...lines.map((c, k) => sv('line', { x1: c[0], y1: c[1], x2: c[2], y2: c[3], class: g * 5 + k + 1 <= 17 ? 'on' : '' }))));
    }
  }

  /* ============ 5. التشغيل ============ */
  async function init() {
    bindUI();
    renderAuthTally();
    if (!enabled) {
      if (pendingAccount()) { setStatus('off'); $('cloudBtn').hidden = true; pendingNotice(); return; }
      hideAuth(); setStatus('off'); $('cloudBtn').hidden = true;
      if (document.documentElement.classList.contains('need-auth')) afterEntry();
      return;
    }
    // هل الدخول بـ Google مفعل؟
    fetch(cfg.supabaseUrl + '/auth/v1/settings', { headers: { apikey: cfg.supabaseKey } })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { googleOn = j && j.external ? Boolean(j.external.google) : null; $('googleNote').hidden = googleOn !== false; })
      .catch(() => {});

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setTimeout(() => showAuth('reset'), 0); return; }
      if (event === 'SIGNED_IN' && session && session.user && mode !== 'reset') setTimeout(() => onSignedIn(session.user), 0);
    });

    // رابط استعادة كلمة المرور من الإيميل
    if (/type=recovery/.test(location.hash)) showAuth('reset');
    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user && mode !== 'reset') { await onSignedIn(data.session.user); return; }
    if (mode === 'reset') return;
    if (pendingAccount()) { pendingNotice(); return; } // ضيف أو لا: مقفول لين يدخل نفس الحساب
    if (store.get(GUEST_KEY)) { setStatus('guest'); renderAccount(); if (document.documentElement.classList.contains('need-auth')) { hideAuth(); afterEntry(); } return; }
    showAuth('in');
  }

  init();
  return { changed, get user() { return user; }, get status() { return status; }, showAuth };
})();
