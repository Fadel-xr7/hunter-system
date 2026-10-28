// Supabase وهمي للاختبارات: يحل محل docs/vendor/supabase.js (الاختبار يبدّل الملف وقت التحميل).
// «السحابة» محفوظة في localStorage نفسه (__fakeRows)، فكل التبويبات في نفس المتصفح تشوف نفس الصف.
// يطبق نفس قواعد الجدول الحقيقي: صف واحد لكل حساب (23505 لو تكرر)، و updated_at يتغيّر مع كل كتابة.
// للتحكم من الاختبار:
//   localStorage.__delay       كم ملي ثانية يتأخر الرفع (insert/update)
//   localStorage.__failWrites  '1' = كل رفع يفشل (مثل انقطاع)
//   localStorage.__writes      سجل كل رفع: [{ op, at }]
(function () {
  const ROWS = '__fakeRows';
  const USERS = '__fakeUsers';
  const TOKEN = 'sb-fake-auth-token'; // boot.js يدور على مفتاح بشكل sb-*-auth-token
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const session = () => read(TOKEN, null);
  function stamp() {
    const n = Number(localStorage.getItem('__seq') || 0) + 1;
    localStorage.setItem('__seq', String(n));
    return new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString();
  }
  function logWrite(op) { const w = read('__writes', []); w.push({ op, at: Date.now() }); write('__writes', w); }

  async function run(q) {
    const s = session();
    if (!s) return { data: null, error: { code: '401', message: 'not signed in' } };
    const uid = s.user.id;
    const f = Object.fromEntries(q.filters);
    if (q.op === 'insert' || q.op === 'update') {
      await wait(Number(localStorage.getItem('__delay') || 0));
      if (localStorage.getItem('__failWrites') === '1') return { data: null, error: { code: 'fetch', message: 'Failed to fetch' } };
      const payload = q.payload || {};
      if (JSON.stringify(payload.data || {}).length > 5 * 1024 * 1024) return { data: null, error: { code: '23514', message: 'too big' } };
      const rows = read(ROWS, {});
      if (q.op === 'insert') {
        if (payload.user_id !== uid) return { data: null, error: { code: '42501', message: 'rls' } };
        if (rows[uid]) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        rows[uid] = { data: payload.data, updated_at: stamp() };
        write(ROWS, rows); logWrite('insert');
        return { data: { updated_at: rows[uid].updated_at }, error: null };
      }
      const row = rows[f.user_id];
      if (f.user_id !== uid || !row || ('updated_at' in f && f.updated_at !== row.updated_at)) return { data: [], error: null };
      row.data = payload.data; row.updated_at = stamp();
      write(ROWS, rows); logWrite('update');
      return { data: [{ updated_at: row.updated_at }], error: null };
    }
    const row = read(ROWS, {})[f.user_id];
    if (f.user_id !== uid || !row) return { data: q.maybe ? null : [], error: null };
    return { data: { data: row.data, updated_at: row.updated_at }, error: null };
  }

  function from() {
    const q = { op: null, filters: [], payload: null, maybe: false };
    const api = {
      select() { if (!q.op) q.op = 'select'; return api; },
      insert(obj) { q.op = 'insert'; q.payload = obj; return api; },
      update(obj) { q.op = 'update'; q.payload = obj; return api; },
      eq(col, val) { q.filters.push([col, val]); return api; },
      single() { return api; },
      maybeSingle() { q.maybe = true; return api; },
      then(ok, bad) { return run(q).then(ok, bad); }
    };
    return api;
  }

  function userOf(email) {
    const u = read(USERS, {})[email];
    return u && { id: u.id, email, user_metadata: u.meta || {}, identities: [{}] };
  }

  const auth = {
    async getSession() { return { data: { session: session() }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword({ email, password }) {
      const u = read(USERS, {})[email];
      if (!u || u.password !== password) return { data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } };
      const s = { user: userOf(email) };
      write(TOKEN, s);
      return { data: { user: s.user, session: s }, error: null };
    },
    async signUp({ email, password, options }) {
      const users = read(USERS, {});
      if (users[email]) return { data: { user: { identities: [] } }, error: null };
      users[email] = { id: 'u_' + Object.keys(users).length, password, meta: (options && options.data) || {} };
      write(USERS, users);
      const s = { user: userOf(email) };
      write(TOKEN, s);
      return { data: { user: s.user, session: s }, error: null };
    },
    async signOut() { localStorage.removeItem(TOKEN); return { error: null }; },
    async getUser() { const s = session(); return { data: { user: s && s.user }, error: null }; },
    async resetPasswordForEmail() { return { error: null }; },
    async updateUser() { return { data: {}, error: null }; },
    async signInWithOAuth() { return { error: { code: 'provider_disabled', message: 'provider is not enabled' } }; }
  };

  window.supabase = { createClient: () => ({ auth, from }) };
})();
