-- Global leaderboard for timed trials and free-run completions.
create table if not exists leaderboard_scores (
  id          serial primary key,
  name        text not null,
  mode        text not null,
  score       integer not null,
  duration_ms integer,
  created_at  timestamptz not null default now()
);

create index if not exists leaderboard_scores_mode_score_idx
  on leaderboard_scores (mode, score desc, created_at asc);

create index if not exists leaderboard_scores_mode_duration_idx
  on leaderboard_scores (mode, duration_ms asc, created_at asc)
  where duration_ms is not null;
