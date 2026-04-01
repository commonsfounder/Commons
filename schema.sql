-- ============================================================
-- Commons – run this entire file in your Supabase SQL Editor
-- ============================================================

-- ── TABLES ───────────────────────────────────────────────────

create table public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  name         text not null,
  handle       text unique not null,
  bio          text not null default '',
  avatar_url   text,
  balance      integer not null default 50,
  total_earned integer not null default 0,
  total_helped integer not null default 0,
  created_at   timestamptz default now()
);

create table public.posts (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles on delete cascade not null,
  type        text not null check (type in ('need', 'offer')),
  title       text not null,
  description text default '',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table public.groups (
  id            uuid default gen_random_uuid() primary key,
  creator_id    uuid references public.profiles on delete cascade not null,
  title         text not null,
  description   text default '',
  activity_type text default 'Group',
  created_at    timestamptz default now()
);

create table public.group_members (
  group_id  uuid references public.groups  on delete cascade,
  user_id   uuid references public.profiles on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table public.messages (
  id          uuid default gen_random_uuid() primary key,
  post_id     uuid references public.posts    on delete cascade not null,
  sender_id   uuid references public.profiles on delete cascade not null,
  sender_name text not null,
  content     text not null,
  created_at  timestamptz default now()
);

create table public.transactions (
  id                 uuid default gen_random_uuid() primary key,
  post_id            uuid references public.posts    on delete set null,
  provider_id        uuid references public.profiles not null,
  receiver_id        uuid references public.profiles not null,
  token_amount       integer not null check (token_amount > 0),
  multiplier_applied numeric not null default 1.0,
  created_at         timestamptz default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

alter table public.profiles     enable row level security;
alter table public.posts        enable row level security;
alter table public.groups       enable row level security;
alter table public.group_members enable row level security;
alter table public.messages     enable row level security;
alter table public.transactions enable row level security;

-- profiles
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- storage: avatars bucket
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
create policy "avatars_select" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_insert" on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_update" on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_delete" on storage.objects for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- posts
create policy "posts_select" on public.posts for select using (true);
create policy "posts_insert" on public.posts for insert with check (auth.uid() = user_id);
create policy "posts_update" on public.posts for update using (auth.uid() = user_id);
create policy "posts_delete" on public.posts for delete using (auth.uid() = user_id);

-- groups
create policy "groups_select" on public.groups for select using (true);
create policy "groups_insert" on public.groups for insert with check (auth.uid() = creator_id);
create policy "groups_update" on public.groups for update using (auth.uid() = creator_id);

-- group_members
create policy "gm_select" on public.group_members for select using (true);
create policy "gm_insert" on public.group_members for insert with check (auth.uid() = user_id);
create policy "gm_delete" on public.group_members for delete using (auth.uid() = user_id);

-- messages
create policy "messages_select" on public.messages for select using (true);
create policy "messages_insert" on public.messages for insert with check (auth.uid() = sender_id);

-- transactions: read own only; writes go through the function only
create policy "transactions_select" on public.transactions
  for select using (auth.uid() = provider_id or auth.uid() = receiver_id);

-- ── CONFIRM_DEAL FUNCTION ────────────────────────────────────
-- Rules enforced here (server-side, cannot be bypassed):
--   1. Tokens are minted for provider / burned from receiver — no direct transfer
--   2. Cannot transact with yourself
--   3. Diminishing returns for the same pair within a rolling 30-day window:
--      transaction 1 → 100%, 2 → 75%, 3 → 50%, 4 → 25%, 5+ → blocked

create or replace function public.confirm_deal(
  p_post_id      uuid,
  p_token_amount integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post        posts%rowtype;
  v_provider_id uuid;
  v_receiver_id uuid;
  v_uid         uuid := auth.uid();
  v_pair_count  integer;
  v_multiplier  numeric;
  v_actual      integer;
  v_recv_bal    integer;
begin
  if v_uid is null then
    return json_build_object('error', 'Not authenticated');
  end if;

  if p_token_amount < 1 then
    return json_build_object('error', 'Amount must be at least 1');
  end if;

  select * into v_post from posts where id = p_post_id and is_active = true;
  if not found then
    return json_build_object('error', 'Post not found');
  end if;

  -- need post  → current user is providing help (earns), post owner receives (burns)
  -- offer post → post owner is providing (earns), current user receives (burns)
  if v_post.type = 'need' then
    v_provider_id := v_uid;
    v_receiver_id := v_post.user_id;
  else
    v_provider_id := v_post.user_id;
    v_receiver_id := v_uid;
  end if;

  if v_provider_id = v_receiver_id then
    return json_build_object('error', 'Cannot transact with yourself');
  end if;

  -- Count transactions between this exact pair (either direction) in last 30 days
  select count(*) into v_pair_count
  from transactions
  where (
    (provider_id = v_provider_id and receiver_id = v_receiver_id) or
    (provider_id = v_receiver_id and receiver_id = v_provider_id)
  )
  and created_at > now() - interval '30 days';

  v_multiplier := case
    when v_pair_count = 0 then 1.0
    when v_pair_count = 1 then 0.75
    when v_pair_count = 2 then 0.5
    when v_pair_count = 3 then 0.25
    else 0.0
  end;

  if v_multiplier = 0 then
    return json_build_object('error', 'Too many transactions with this user this month. Try again after 30 days.');
  end if;

  v_actual := greatest(1, round(p_token_amount * v_multiplier)::integer);

  -- Lock receiver row to prevent race condition
  select balance into v_recv_bal from profiles where id = v_receiver_id for update;
  if v_recv_bal < v_actual then
    return json_build_object('error', 'Not enough tokens');
  end if;

  -- Burn from receiver (tokens destroyed)
  update profiles set balance = balance - v_actual where id = v_receiver_id;

  -- Mint for provider (tokens created)
  update profiles set
    balance      = balance      + v_actual,
    total_earned = total_earned + v_actual,
    total_helped = total_helped + 1
  where id = v_provider_id;

  insert into transactions (post_id, provider_id, receiver_id, token_amount, multiplier_applied)
  values (p_post_id, v_provider_id, v_receiver_id, v_actual, v_multiplier);

  return json_build_object(
    'success',           true,
    'tokens_actual',     v_actual,
    'tokens_requested',  p_token_amount,
    'multiplier',        v_multiplier
  );
end;
$$;

-- ── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table messages;
