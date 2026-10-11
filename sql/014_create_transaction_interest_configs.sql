create type interest_period as enum (
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly'
);

comment on type interest_period is
  'Frequency at which simple interest accrues. monthly = 12 periods/year, quarterly = 4, half_yearly = 2, yearly = 1.';

create table transaction_interest_configs (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  user_id        uuid not null references users(id),

  interest_rate_bps  integer         not null,
  interest_period    interest_period not null,

  deleted_at  timestamptz,
  deleted_by  uuid references users(id),

  created_at  timestamptz not null default now(),
  created_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id),

  constraint transaction_interest_configs_rate_non_negative
    check (interest_rate_bps >= 0),

  constraint transaction_interest_configs_rate_max
    check (interest_rate_bps <= 100000),

  constraint transaction_interest_configs_transaction_unique
    unique (transaction_id)
);

comment on table transaction_interest_configs is
  'Optional simple-interest contract for a transaction. One row per transaction that carries interest.
   Transactions without a row here are interest-free. Kept separate from transactions so the core
   ledger table stays clean and interest rules can evolve independently.';

comment on column transaction_interest_configs.transaction_id is
  'One-to-one FK with transactions. A transaction can have at most one active interest config.';

comment on column transaction_interest_configs.interest_rate_bps is
  'Annual interest rate in basis points (1 bps = 0.01%). e.g. 1250 = 12.5%. Max 100000 = 1000%.';

comment on column transaction_interest_configs.interest_period is
  'Compounding frequency. Interest is computed on the opening balance of each completed period.';

create trigger trg_transaction_interest_configs_updated_at
before update on transaction_interest_configs
for each row
execute function set_updated_at();

create index idx_transaction_interest_configs_transaction_id
  on transaction_interest_configs (transaction_id)
  where deleted_at is null;

create index idx_transaction_interest_configs_user_id
  on transaction_interest_configs (user_id)
  where deleted_at is null;
