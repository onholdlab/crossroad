-- 十字路口排行榜(求生 survive / 撞人賽 bump)
-- 用法:Supabase 後台 → SQL Editor → New query → 整段貼上 → Run。重跑也安全。

create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  game       text        not null check (game in ('survive', 'bump')),
  name       text        not null check (char_length(name) between 1 and 12),
  score      numeric     not null check (
               (game = 'survive' and score between 1 and 3600) or
               (game = 'bump'    and score between 1 and 500)),
  device     text        not null check (char_length(device) between 8 and 40),
  created_at timestamptz not null default now()
);
create index if not exists scores_game_score on public.scores (game, score desc);
create index if not exists scores_device_time on public.scores (device, created_at desc);

alter table public.scores enable row level security;

drop policy if exists "scores insert" on public.scores;
create policy "scores insert" on public.scores for insert to anon, authenticated with check (true);
drop policy if exists "scores read" on public.scores;
create policy "scores read" on public.scores for select to anon, authenticated using (true);

grant select, insert on public.scores to anon, authenticated;

-- 同一台裝置 5 秒內只能送一筆,擋掉連發
create or replace function public.scores_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.scores
             where device = new.device and created_at > now() - interval '5 seconds') then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
drop trigger if exists scores_rate_limit on public.scores;
create trigger scores_rate_limit before insert on public.scores
  for each row execute function public.scores_rate_limit();

-- 排行榜:每台裝置只留最好的一筆
create or replace view public.leaderboard with (security_invoker = on) as
  select distinct on (game, device) game, name, score, device, created_at
  from public.scores
  order by game, device, score desc, created_at asc;
grant select on public.leaderboard to anon, authenticated;
