create table interest_accruals (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  user_id        uuid not null references users(id),

  period_number          integer         not null,
  period_start_date      date            not null,
  period_end_date        date            not null,

  opening_balance_cents  bigint          not null,
  interest_rate_bps      integer         not null,
  interest_period        interest_period not null,
  accrued_interest_cents bigint          not null,

  created_at  timestamptz not null default now(),
  created_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id),

  constraint interest_accruals_period_positive
    check (period_number > 0),

  constraint interest_accruals_opening_balance_positive
    check (opening_balance_cents > 0),

  constraint interest_accruals_accrued_non_negative
    check (accrued_interest_cents >= 0),

  constraint interest_accruals_period_dates_valid
    check (period_end_date > period_start_date),

  constraint interest_accruals_rate_non_negative
    check (interest_rate_bps >= 0),

  constraint interest_accruals_transaction_period_unique
    unique (transaction_id, period_number)
);

comment on table interest_accruals is
  'Append-only ledger of interest accrued per completed period per transaction.
   One row is inserted when each period completes. Opening balance is snapshotted
   at period start (after all repayments up to that date) so partial repayments
   mid-way are correctly reflected in subsequent period calculations.
   This table is immutable — rows are never soft-deleted or updated after insert.';

comment on column interest_accruals.period_number is
  'Sequential counter starting at 1. Combined with transaction_id it uniquely identifies the period row and prevents duplicate accruals.';

comment on column interest_accruals.opening_balance_cents is
  'Outstanding principal at the START of this period after all repayments up to period_start_date. Interest is computed on this value, not the original transaction amount.';

comment on column interest_accruals.interest_rate_bps is
  'Snapshot of the annual rate at the time this period was computed (1 bps = 0.01%). Preserved so history stays accurate even if the config is later changed.';

comment on column interest_accruals.interest_period is
  'Snapshot of the period type at the time this row was computed.';

comment on column interest_accruals.accrued_interest_cents is
  'Computed as: floor(opening_balance_cents * interest_rate_bps / 10000 / periods_per_year). Floored to whole cents — never overstates what is owed.';

create trigger trg_interest_accruals_updated_at
before update on interest_accruals
for each row
execute function set_updated_at();

create index idx_interest_accruals_transaction_id
  on interest_accruals (transaction_id);

create index idx_interest_accruals_user_id
  on interest_accruals (user_id);
