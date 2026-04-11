create table public.achievements (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  key text not null,
  unlocked_at timestamptz default now(),
  unique(user_id, key)
);
alter table public.achievements enable row level security;
create policy "Users can view their own achievements"
  on public.achievements for select using (auth.uid() = user_id);
create policy "Users can insert their own achievements"
  on public.achievements for insert with check (auth.uid() = user_id);
