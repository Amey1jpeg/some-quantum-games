-- ═══════════════════════════════════════════════════════
--  LEADERBOARD ↔ ACCOUNTS
--  Run this once in the Supabase SQL Editor. Safe to re-run.
--
--  A signed-in player can post each score under any name they
--  like (their display name, a nickname, a sibling's name on the
--  same laptop…). Every one of those rows still carries the
--  account's id in user_id, so the site can show the board either
--  per name or per account.
--
--  Guests keep posting exactly as before; their rows get a null
--  user_id.
-- ═══════════════════════════════════════════════════════

alter table public.leaderboard
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists leaderboard_game_user_idx
  on public.leaderboard (game, user_id);

-- user_id is never trusted from the client. Whatever the request
-- sends, the row is stamped with the caller's own id (null for the
-- anon key), so nobody can post a score into someone else's account
-- by calling the REST API directly. A trigger rather than an RLS
-- check so it holds whatever insert policies the table already has.
create or replace function public.leaderboard_stamp_user()
returns trigger
language plpgsql
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists leaderboard_stamp_user on public.leaderboard;
create trigger leaderboard_stamp_user
  before insert on public.leaderboard
  for each row execute function public.leaderboard_stamp_user();

-- Signed-in players now insert with their session (the authenticated
-- role) instead of the anon key. If the table's existing insert policy
-- was written for anon only, this lets them through as well. Harmless
-- if RLS is off on the table.
grant insert on public.leaderboard to authenticated;
drop policy if exists "leaderboard insert signed in" on public.leaderboard;
create policy "leaderboard insert signed in"
  on public.leaderboard
  for insert to authenticated
  with check (true);

-- ── Linking guest scores to an account ─────────────────
-- Scores posted as a guest (user_id null) can be claimed later by a
-- signed-in player: every guest row under that name, in every game,
-- moves to their account. Refused when the name already belongs to a
-- different account, as a display name or as a name it posts under,
-- so nobody can take over someone else's scores this way.
-- security definer because players have no update rights on the table.
create or replace function public.link_name_to_account(p_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  linked  integer;
begin
  if me is null then
    raise exception 'Sign in to link scores to an account';
  end if;
  if exists (select 1 from public.profiles
             where lower(display_name) = lower(p_name) and id <> me)
     or exists (select 1 from public.leaderboard
                where lower(name) = lower(p_name) and user_id is not null and user_id <> me) then
    raise exception 'That name belongs to another account';
  end if;
  update public.leaderboard
     set user_id = me
   where lower(name) = lower(p_name) and user_id is null;
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke all on function public.link_name_to_account(text) from public, anon;
grant execute on function public.link_name_to_account(text) to authenticated;
