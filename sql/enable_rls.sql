-- ═══════════════════════════════════════════════════════
--  ROW LEVEL SECURITY — leaderboard, mp_wins, profiles
--  Run this once in the Supabase SQL Editor. Safe to re-run.
--
--  These three tables were made in the dashboard rather than from a
--  file in this repo, and RLS was never switched on for them. That is
--  what Supabase emails about, and it matters here because the anon
--  key is published in js/core.js — it has to be, the site is static
--  and every visitor's browser uses it.
--
--  With RLS off, that key is not just a read key. Anyone who opens
--  devtools can send
--
--      DELETE /rest/v1/leaderboard?id=gt.0
--
--  and empty the entire board. Same for mp_wins and profiles. Nothing
--  in the site ever updates or deletes a score, so the fix costs no
--  functionality: turn RLS on, allow exactly what the site does, and
--  everything else is refused by Postgres rather than by nobody.
--
--  What the site actually needs:
--    leaderboard  read by anyone, insert by anyone (guests included)
--    mp_wins      read by anyone, insert/update your own row only
--    profiles     read by anyone (names are public on the boards),
--                 insert your own row only
--  No table needs update or delete from the client, so neither is
--  granted anywhere below.
--
--  level_submissions already has its own policies — see
--  sql/level_submissions.sql. This file leaves it alone.
-- ═══════════════════════════════════════════════════════

-- ── leaderboard ────────────────────────────────────────
-- Scores stay postable without an account: that is how the site has
-- always worked, and a stall player is never signed in. What changes
-- is that a posted score can no longer be edited or removed.
alter table public.leaderboard enable row level security;

drop policy if exists "leaderboard read"   on public.leaderboard;
drop policy if exists "leaderboard insert" on public.leaderboard;

create policy "leaderboard read"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

create policy "leaderboard insert"
  on public.leaderboard for insert
  to anon, authenticated
  with check (
    char_length(name) between 1 and 40
    and char_length(game) between 1 and 40
    and score is not null
  );

-- ── mp_wins ────────────────────────────────────────────
-- The board is public, but a row belongs to one account. user_id is
-- compared against auth.uid() so a signed-in player can only ever
-- write their own, whatever the request claims.
alter table public.mp_wins enable row level security;

drop policy if exists "mp_wins read"   on public.mp_wins;
drop policy if exists "mp_wins insert" on public.mp_wins;
drop policy if exists "mp_wins update" on public.mp_wins;

create policy "mp_wins read"
  on public.mp_wins for select
  to anon, authenticated
  using (true);

create policy "mp_wins insert"
  on public.mp_wins for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "mp_wins update"
  on public.mp_wins for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── profiles ───────────────────────────────────────────
-- Read has to stay open: signup checks whether a display name is
-- already taken, which means reading other people's rows. Display
-- names are shown on the leaderboards anyway, so nothing is exposed
-- that was not already public. Writing is yours alone.
alter table public.profiles enable row level security;

drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;

create policy "profiles read"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── check it worked ────────────────────────────────────
-- rowsecurity should be true for all four. Anything false is still
-- wide open to the anon key.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('leaderboard', 'mp_wins', 'profiles', 'level_submissions')
order by tablename;
