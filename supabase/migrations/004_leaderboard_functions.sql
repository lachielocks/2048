create or replace function public.leaderboard_top_scores()
returns table(display_name text, best_score bigint, best_tile bigint)
language sql security definer as $$
  select
    p.display_name,
    max(g.score)        as best_score,
    max(g.highest_tile) as best_tile
  from public.games g
  join public.profiles p on p.id = g.user_id
  group by p.id, p.display_name
  order by best_score desc
  limit 10;
$$;

create or replace function public.leaderboard_highest_tile()
returns table(display_name text, best_tile bigint, best_score bigint)
language sql security definer as $$
  select
    p.display_name,
    max(g.highest_tile) as best_tile,
    max(g.score)        as best_score
  from public.games g
  join public.profiles p on p.id = g.user_id
  group by p.id, p.display_name
  order by best_tile desc
  limit 10;
$$;

create or replace function public.leaderboard_this_week()
returns table(display_name text, best_score bigint, best_tile bigint)
language sql security definer as $$
  select
    p.display_name,
    max(g.score)        as best_score,
    max(g.highest_tile) as best_tile
  from public.games g
  join public.profiles p on p.id = g.user_id
  where g.created_at > now() - interval '7 days'
  group by p.id, p.display_name
  order by best_score desc
  limit 10;
$$;
