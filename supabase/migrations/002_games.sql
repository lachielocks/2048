create table public.games (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  score integer not null default 0,
  highest_tile integer not null default 0,
  moves integer not null default 0,
  duration_seconds integer not null default 0,
  mode text not null default 'classic',
  won boolean not null default false,
  board_state jsonb,
  created_at timestamptz default now()
);
alter table public.games enable row level security;
create policy "Users can insert their own games"
  on public.games for insert with check (auth.uid() = user_id);
create policy "Users can view their own games"
  on public.games for select using (auth.uid() = user_id);
create policy "Leaderboard scores are public"
  on public.games for select using (true);
