-- Run in Supabase Dashboard → SQL Editor.
--
-- Audit + accounting table for the "Ask the Data" assistant. One row is
-- written per question by api/assistant-ask.js (via the service-role key),
-- capturing the question, the SQL the model generated, the answer it gave,
-- and token usage / estimated cost. This is what lets Rusti spot a wrong
-- answer before acting on it (build-spec §7, required) and is also the
-- source of truth for the in-app rate limit and monthly spend cap.
--
-- Written and read ONLY by the service role. The read-only assistant_ro
-- role has no grant here and cannot see it.

create table if not exists assistant_log (
  id             bigserial   primary key,
  created_at     timestamptz not null default now(),
  model          text,
  question       text,
  generated_sql  text,        -- may hold several statements if the model ran more than one query
  answer         text,
  input_tokens   integer,
  output_tokens  integer,
  est_cost_usd   numeric(12,6) not null default 0
);

-- Speeds up the "how many questions / how much spend this window" lookups.
create index if not exists assistant_log_created_at_idx on assistant_log (created_at);

alter table assistant_log enable row level security;
-- No policies: default-deny. Service-role key only.
