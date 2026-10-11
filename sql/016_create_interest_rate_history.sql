-- ---------------------------------------------------------------------------
-- 016_create_interest_rate_history.sql
--
-- Tracks every interest rate that was ever active on a transaction and the
-- exact date range it applied.  One row per rate segment.
--
-- Why this table exists
-- ─────────────────────
-- transaction_interest_configs holds the CURRENT config only.  When a user
-- changes 2 % → 3 % on Oct 20, the old rate must still be used to calculate
-- interest for Sept 5 – Oct 19.  Without this table that history is lost.
--
-- Lifecycle of a row
-- ──────────────────
--   INSERT  when interest is first configured OR rate is changed.
--           effective_to is NULL  →  this is the active segment.
--   UPDATE  only to set effective_to when a newer rate takes over.
--           All other columns are immutable after insert.
--
-- effective_from is INCLUSIVE, effective_to is EXCLUSIVE.
-- Example: effective_from 2026-09-05, effective_to 2026-10-20
--          means the rate applied on every day in [Sep 5, Oct 19].
-- ---------------------------------------------------------------------------

create table interest_rate_history (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid    not null references transactions(id),
  user_id        uuid    not null references users(id),

  interest_rate_bps  integer not null,
  effective_from     date    not null,
  effective_to       date,              -- null = currently active segment

  created_at  timestamptz not null default now(),
  created_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id),

  -- ── domain constraints ────────────────────────────────────────────────
  constraint interest_rate_history_rate_non_negative
    check (interest_rate_bps >= 0),

  constraint interest_rate_history_rate_max
    check (interest_rate_bps <= 100000),

  constraint interest_rate_history_dates_valid
    check (effective_to is null or effective_to > effective_from),

  -- Only one open (active) segment per transaction at any point in time.
  -- effective_to is null on the active row; partial unique index enforces
  -- at most one such row per transaction.
  constraint interest_rate_history_one_active_segment_unique
    unique (transaction_id, effective_to)   -- nulls are distinct in PG unique,
                                            -- but we enforce via the index below
);

-- The partial unique index is the real guard: at most one NULL effective_to
-- per transaction (i.e. at most one currently-active segment).
create unique index idx_interest_rate_history_active_segment
  on interest_rate_history (transaction_id)
  where effective_to is null;

comment on table interest_rate_history is
  'Append-only log of every interest rate segment for a transaction.
   Each row records the rate that was active between effective_from (inclusive)
   and effective_to (exclusive).  effective_to IS NULL on the currently-active
   row.  Rows are immutable after insert except for setting effective_to when
   a rate change closes the segment.  Use this table — not
   transaction_interest_configs.interest_rate_bps — whenever you need to know
   what rate applied on a specific past date.';

comment on column interest_rate_history.interest_rate_bps is
  'Monthly rate in basis points (1 bps = 0.01%).  e.g. 200 = 2 %/month.
   Daily rate = interest_rate_bps / 10000 / 30  (30-day-month convention).';

comment on column interest_rate_history.effective_from is
  'First calendar day (inclusive) this rate applies.  Set to the transaction
   date when interest is first configured, or to today when the rate is changed.';

comment on column interest_rate_history.effective_to is
  'First calendar day (exclusive) this rate NO LONGER applies.
   NULL means this is the currently-active segment.
   Set to the new effective_from when a rate change supersedes this row.';

create trigger trg_interest_rate_history_updated_at
before update on interest_rate_history
for each row
execute function set_updated_at();

create index idx_interest_rate_history_transaction_id
  on interest_rate_history (transaction_id, effective_from);

create index idx_interest_rate_history_user_id
  on interest_rate_history (user_id);

-- ---------------------------------------------------------------------------
-- Back-fill existing interest configs into the history table.
--
-- Every transaction_interest_configs row that is currently active (not
-- soft-deleted) gets its first history segment starting from the transaction
-- date.  effective_to is left NULL because it is the still-active segment.
-- ---------------------------------------------------------------------------

insert into interest_rate_history (
  transaction_id,
  user_id,
  interest_rate_bps,
  effective_from,
  effective_to,
  created_by,
  updated_by
)
select
  tic.transaction_id,
  tic.user_id,
  tic.interest_rate_bps,
  t.transaction_date::date  as effective_from,
  null                      as effective_to,
  tic.created_by,
  tic.updated_by
from transaction_interest_configs tic
join transactions t on t.id = tic.transaction_id
where tic.deleted_at is null;
