create table repayments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id),
  amount_cents bigint not null,
  paid_on date not null,
  notes text,

  deleted_at timestamptz,
  deleted_by uuid references users(id),

  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint repayments_amount_positive check (amount_cents > 0)
);

comment on table repayments is
  'A partial or full repayment recorded against a transaction. Sum of active repayments must never exceed the parent transaction amount — enforced at the application/service layer via a DB transaction, not by a CHECK constraint here.';

create trigger trg_repayments_updated_at
before update on repayments
for each row
execute function set_updated_at();

create index idx_repayments_transaction_id
  on repayments (transaction_id)
  where deleted_at is null;
