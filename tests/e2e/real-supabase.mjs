// المكتبة الحقيقية (docs/vendor/supabase.js) مع اعتراض طلبات الشبكة.
// ملاحظة: المكتبة ترجع error: null لو /logout رد 401 أو 403 أو 404، فالموقع يشوفه مثل النجاح. هذا يثبت الخروج المحلي بس، مو إلغاء جلسات السيرفر. نستخدمه لما نبي نختبر سلوك المكتبة نفسها
// (مثل ما تمسح الجلسة المحلية لما يفشل /logout)، اللي الـ Supabase الوهمي (fake-supabase.js) ما يعرفه.
// لا طلب يطلع للإنترنت: كل طلبات *.supabase.co ترد من هنا.
import { T0, TODAY } from './harness.mjs';

export const REF = 'rfhkbuopqcevzjfnsgrg'; // نفس مشروع docs/js/config.js
export const TOKEN_KEY = `sb-${REF}-auth-token`;
export const ACCESS = 'test-access-token-AAAA';
export const REFRESH = 'test-refresh-token-BBBB';
const URL_RE = new RegExp(`^https://${REF}\\.supabase\\.co/`);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (exp) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u_test', role: 'authenticated', exp })}.sig`;

/** جلسة مخزنة بالشكل اللي تقرأه المكتبة. expiresInSec بالنسبة لساعة الصفحة (T0) */
export function session({ expiresInSec = 3600, id = 'u_test', email = 'hunter@example.com' } = {}) {
  const exp = Math.floor(T0.getTime() / 1000) + expiresInSec;
  return { access_token: jwt(exp), refresh_token: REFRESH, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id, aud: 'authenticated', role: 'authenticated', email, user_metadata: {}, app_metadata: {}, created_at: '2026-09-01T00:00:00Z' } };
}

/** بيانات localStorage لمستخدم مسجل بالمكتبة الحقيقية، ومزامنته نظيفة (آخر رفع = updated_at للصف) */
export function realUserSeed(state, { updatedAt = 'U0', today = TODAY } = {}) {
  return {
    hunterNameAsked_v6: '1',
    hunterBrief_v6: { morning: today, evening: today, friday: today },
    hunterSystem_v6: state,
    hunterSync_v6: { uid: 'u_test', at: updatedAt, dirty: false },
    [TOKEN_KEY]: session()
  };
}

/**
 * يعترض طلبات Supabase:
 *   rows       { [user_id]: { data, updated_at } } جدول hunter_state (select / insert / update بنفس قواعد الجدول)
 *   logout     كيف يرد /auth/v1/logout: 'ok' (204) | 'abort' (انقطاع) | رقم مثل 500 أو 401
 *   logoutDelayMs  كم ملي ثانية (وقت حقيقي) يتأخر رد /logout
 *   refresh    كيف يرد تجديد الجلسة (/auth/v1/token?grant_type=refresh_token): 'abort' | رقم
 *   password   الدخول بالإيميل (grant_type=password) ينجح بهذي الكلمة ويعطي جلسة جديدة (كل إيميل حساب مستقل)
 *   calls      كل طلب وصل: [{ method, path }]
 * الحقول تتغير أثناء الاختبار (api.logout = 500 …).
 */
export async function mockSupabase(context, { rows = {}, logout = 'ok', refresh = 'abort', logoutDelayMs = 0, password = 'password123' } = {}) {
  const api = { rows, logout, refresh, logoutDelayMs, calls: [] };
  let seq = 0;
  await context.route(URL_RE, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    api.calls.push({ method: req.method(), path: u.pathname });
    const fail = (mode) => mode === 'abort' ? route.abort('failed') : json(mode, { code: mode, message: 'mock failure' });

    if (u.pathname === '/auth/v1/settings') return json(200, { external: { google: false } });
    if (u.pathname === '/auth/v1/logout') {
      if (api.logoutDelayMs) await new Promise((r) => setTimeout(r, api.logoutDelayMs));
      return api.logout === 'ok' ? route.fulfill({ status: 204, headers: CORS }) : fail(api.logout);
    }
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      const b = req.postDataJSON();
      if (b.password !== password) return json(400, { code: 'invalid_credentials', message: 'Invalid login credentials' });
      // كل إيميل حساب مستقل: hunter@example.com = u_test، وغيره u_<أول جزء من الإيميل>
      return json(200, session({ email: b.email, id: b.email === 'hunter@example.com' ? 'u_test' : 'u_' + b.email.split('@')[0] }));
    }
    if (u.pathname === '/auth/v1/token') return fail(api.refresh);
    if (u.pathname === '/rest/v1/hunter_state') {
      const wantObject = /pgrst\.object/.test(req.headers().accept || '');
      const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
      const uid = eq('user_id');
      const body = req.method() === 'GET' ? null : req.postDataJSON();
      if (req.method() === 'GET') {
        const row = api.rows[uid];
        return json(200, wantObject ? (row ? { data: row.data, updated_at: row.updated_at } : null) : (row ? [{ data: row.data, updated_at: row.updated_at }] : []));
      }
      if (req.method() === 'POST') {
        if (api.rows[body.user_id]) return json(409, { code: '23505', message: 'duplicate key' });
        api.rows[body.user_id] = { data: body.data, updated_at: 'U' + (++seq) };
        return json(201, wantObject ? { updated_at: api.rows[body.user_id].updated_at } : [{ updated_at: api.rows[body.user_id].updated_at }]);
      }
      if (req.method() === 'PATCH') {
        const row = api.rows[uid];
        if (!row || (u.searchParams.has('updated_at') && eq('updated_at') !== row.updated_at)) return json(200, []);
        row.data = body.data; row.updated_at = 'U' + (++seq);
        return json(200, [{ updated_at: row.updated_at }]);
      }
    }
    return json(404, { message: 'not mocked: ' + req.method() + ' ' + u.pathname });
  });
  return api;
}
