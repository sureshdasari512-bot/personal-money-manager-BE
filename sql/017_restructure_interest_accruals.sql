-- ---------------------------------------------------------------------------
-- 017_restructure_interest_accruals.sql
--
-- Replaces the whole-period accrual model with a daily segment model.
--
-- OLD model (015)
-- ───────────────
--   One row per completed calendar period (monthly / quarterly / …).
--   Interest only posted when a full period elapsed.
--   Rate change mid-period silently applied the new rate to the whole period.
--
-- NEW model
-- ─────────
--   One row per contiguous segment where BOTH the rate AND the outstanding
--   principal are constant.  A new segment starts whenever:
--     • the interest rate is changed  (rate_history drives this)
--     • a repayment is made           (principal drops)
--     • the transaction is settled    (segment closed at that date)
--
--   Daily interest = opening_balance_cents × interest_rate_bps / 10000 / 30
--   (30-day-month convention — February and 31-day months use the same divisor)
--
--   segment_interest_cents = daily_interest_cents × days_count
--   where days_count = period_end_date - period_start_date  (integer days)
--
--   period_start_date  INCLUSIVE  (interest accrues on this day)
--   period_end_date    EXCLUSIVE  (interest does NOT accrue on this day)
--                      NULL on the currently-open segment
--
-- Migration safety
-- ────────────────
--   Existing accrual rows used period_number as the natural key.  The new
--   schema has no period_number column.  We:
--     1. Drop the old unique constraint and check constraints that reference it.
--     2. Drop columns that no longer exist in the model.
--     3. Add new columns.
--     4. Migrate existing rows into the closest segment equivalent.
--     5. Add new constraints and indexes.
-- ---------------------------------------------------------------------------


-- ── Step 1: drop obsolete constraints ────────────────────────────────────────

alter table interest_accruals
  drop constraint if exists interest_accruals_transaction_period_unique,
  drop constraint if exists interest_accruals_period_positive,
  drop constraint if exists interest_accruals_period_dates_valid,
  drop constraint if exists interest_accruals_opening_balance_positive,
  drop constraint if exists interest_accruals_accrued_non_negative,
  drop constraint if exists interest_accruals_rate_non_negative;


-- ── Step 2: drop obsolete columns ────────────────────────────────────────────

alter table interest_accruals
  drop column if exists period_number,
  drop column if exists interest_period;     -- frequency (monthly/quarterly/…) no longer stored here
                                             -- it still lives in transaction_interest_configs


-- ── Step 3: add new columns ──────────────────────────────────────────────────

-- period_end_date becomes nullable: NULL = segment still open (accruing today)
alter table interest_accruals
  alter column period_end_date drop not null;

-- How many calendar days this segment covers.
-- Computed on write: period_end_date - period_start_date  (or today - period_start_date for open).
-- Stored explicitly so queries don't need to recompute and open segments still
-- show a meaningful day count.
alter table interest_accruals
  add column if not exists days_count integer not null default 0;

-- Daily interest in cents for this segment (constant within a segment).
-- daily_interest_cents = floor(opening_balance_cents × interest_rate_bps / 10000 / 30)
alter table interest_accruals
  add column if not exists daily_interest_cents bigint not null default 0;

-- Rename accrued_interest_cents → segment_interest_cents for clarity.
-- This is the total for the whole segment: daily_interest_cents × days_count.
-- We keep the old name as an alias view-side for backward compat with existing
-- queries that reference accrued_interest_cents.
-- (No rename here — too many downstream references; we populate both below.)


-- ── Step 4: migrate existing rows ────────────────────────────────────────────
--
-- Old rows stored one row per completed whole period.  Each had:
--   period_start_date, period_end_date, opening_balance_cents,
--   interest_rate_bps, accrued_interest_cents
--
-- These map cleanly to the new model — each old row becomes one closed segment.
-- We back-fill days_count and daily_interest_cents from the existing data.

update interest_accruals
set
  days_count = (period_end_date - period_start_date)::integer,
  daily_interest_cents = case
    when (period_end_date - period_start_date)::integer > 0
    then floor(
           opening_balance_cents::numeric
           * interest_rate_bps::numeric
           / 10000
           / 30
         )::bigint
    else 0
  end
where period_end_date is not null;


-- ── Step 5: add new constraints ───────────────────────────────────────────────

alter table interest_accruals
  add constraint interest_accruals_dates_valid
    check (period_end_date is null or period_end_date > period_start_date),

  add constraint interest_accruals_opening_balance_positive
    check (opening_balance_cents > 0),

  add constraint interest_accruals_accrued_non_negative
    check (accrued_interest_cents >= 0),

  add constraint interest_accruals_rate_non_negative
    check (interest_rate_bps >= 0),

  add constraint interest_accruals_days_count_non_negative
    check (days_count >= 0),

  add constraint interest_accruals_daily_interest_non_negative
    check (daily_interest_cents >= 0);

-- Natural key: a transaction can only have one segment starting on any given date.
create unique index if not exists idx_interest_accruals_transaction_start_unique
  on interest_accruals (transaction_id, period_start_date);

-- Only one open (NULL period_end_date) segment per transaction at a time.
create unique index if not exists idx_interest_accruals_open_segment_unique
  on interest_accruals (transaction_id)
  where period_end_date is null;


-- ── Step 6: update comments ───────────────────────────────────────────────────

comment on table interest_accruals is
  'Append-only ledger of interest segments for a transaction.
   One row covers a contiguous date range during which BOTH the interest rate
   AND the outstanding principal were constant.  A new segment is opened
   whenever the rate changes or a repayment is made.
   period_start_date is INCLUSIVE; period_end_date is EXCLUSIVE (NULL = still open).
   Daily interest = floor(opening_balance_cents * interest_rate_bps / 10000 / 30).
   Denominator is always 30 regardless of actual month length (30/360 convention).
   Rows are immutable after period_end_date is set — only the open segment
   (period_end_date IS NULL) is ever updated in place.';

comment on column interest_accruals.period_start_date is
  'First calendar day (inclusive) of this segment.  Interest accrues on this day.';

comment on column interest_accruals.period_end_date is
  'First calendar day (exclusive) where this segment ends — interest does NOT
   accrue on this day.  NULL means the segment is still open and growing.';

comment on column interest_accruals.days_count is
  'Number of calendar days in this segment: period_end_date - period_start_date.
   For an open segment this is refreshed on every accrual run to reflect today.';

comment on column interest_accruals.daily_interest_cents is
  'Interest earned per calendar day in this segment.
   Formula: floor(opening_balance_cents * interest_rate_bps / 10000 / 30).
   Constant within a segment — does not change even if the calendar month changes.';

comment on column interest_accruals.accrued_interest_cents is
  'Total interest for this segment: daily_interest_cents * days_count.
   Updated on every accrual run for the open segment.';

comment on column interest_accruals.opening_balance_cents is
  'Outstanding principal at period_start_date after all repayments up to that date.
   Snapshotted on segment open — never changes after that.';

comment on column interest_accruals.interest_rate_bps is
  'Monthly rate in basis points snapshotted from interest_rate_history when this
   segment was opened.  Preserved here so history stays correct even after
   subsequent rate changes.  1 bps = 0.01 %, e.g. 200 = 2 %/month.';
