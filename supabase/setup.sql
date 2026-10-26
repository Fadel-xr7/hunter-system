-- =====================================================================
-- نظام الصياد: إعداد قاعدة البيانات في Supabase (كل شي في ملف واحد)
-- شغّله من لوحة Supabase ← SQL Editor.
-- ينفع لمشروع جديد من الصفر، وتشغيله مرة ثانية على نفس المشروع ما يضر.
--
-- الفكرة: جدول واحد hunter_state، صف لكل حساب، فيه كل بيانات الموقع (jsonb).
-- الحماية: RLS = كل حساب يقرأ ويعدّل صفه بس. والزوار بدون دخول (anon) ما لهم أي وصول.
-- =====================================================================

-- 1) الجدول
create table if not exists public.hunter_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) شكل البيانات وحجمها: لازم تكون كائن JSON، وحدها 5 ميغا لكل حساب.
--    الاستخدام الكثيف جداً (6 مهام يومية + 3 بوابات + 4 جلسات تركيز كل يوم) يوصل تقريباً 0.9 ميغا بالسنة.
alter table public.hunter_state drop constraint if exists hunter_state_data_is_object;
alter table public.hunter_state add constraint hunter_state_data_is_object check (jsonb_typeof(data) = 'object');
alter table public.hunter_state drop constraint if exists hunter_state_data_size;
alter table public.hunter_state add constraint hunter_state_data_size check (octet_length(data::text) <= 5000000);

-- 3) وقت آخر تعديل يتحدّث تلقائياً (الموقع يستخدمه عشان يعرف إذا تعدّلت بياناتك من جهاز ثاني)
create or replace function public.hunter_state_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists hunter_state_touch on public.hunter_state;
create trigger hunter_state_touch before insert or update on public.hunter_state
  for each row execute function public.hunter_state_touch();

-- 4) RLS: كل حساب يوصل لصفه بس
alter table public.hunter_state enable row level security;
drop policy if exists "read own state" on public.hunter_state;
create policy "read own state" on public.hunter_state for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "insert own state" on public.hunter_state;
create policy "insert own state" on public.hunter_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "update own state" on public.hunter_state;
create policy "update own state" on public.hunter_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "delete own state" on public.hunter_state;
create policy "delete own state" on public.hunter_state for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 5) الصلاحيات: بس اللي يحتاجه الموقع (بدون TRUNCATE وTRIGGER وREFERENCES)
revoke all on table public.hunter_state from anon, authenticated;
grant select, insert, update, delete on table public.hunter_state to authenticated;

-- 6) الدوال الداخلية: ما أحد يقدر يناديها من الموقع
revoke execute on function public.hunter_state_touch() from public, anon, authenticated;
do $$
begin
  -- rls_auto_enable تجي من Supabase لو فعّلت «RLS تلقائي» وقت إنشاء المشروع
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
