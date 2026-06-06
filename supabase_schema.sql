-- Brain MRI Turing Test — Supabase schema.
-- Paste this whole file into the Supabase SQL Editor and click "Run".

create table if not exists raters (
  id             text primary key,
  created_at     timestamptz not null default now(),
  full_name      text not null,
  order_indices  jsonb not null,
  progress       integer not null default 0,
  completed      boolean not null default false
);

-- If you already ran an earlier version of this schema (with hospital /
-- specialization columns), drop them so inserts don't fail on NOT NULL:
alter table raters drop column if exists hospital;
alter table raters drop column if exists specialization;

create table if not exists responses (
  rater_id        text not null references raters(id) on delete cascade,
  sequence_index  integer not null,
  image_filename  text not null,
  true_class      text not null,
  decision        text not null,
  correct         boolean not null,
  confidence      integer not null,
  tumor_visibility integer,
  notes           text not null default '',
  response_time_ms integer not null default 0,
  submitted_at    timestamptz not null default now(),
  primary key (rater_id, sequence_index)
);

-- Enable Row Level Security on both tables. The app connects with the
-- service_role key (server-side only), which BYPASSES RLS, so it keeps full
-- read/write access. With RLS enabled and no policies defined, the public
-- anon/authenticated keys cannot read or write these tables — exactly what a
-- blinded study needs. This also clears Supabase's "RLS not enabled" warning.
alter table raters    enable row level security;
alter table responses enable row level security;
