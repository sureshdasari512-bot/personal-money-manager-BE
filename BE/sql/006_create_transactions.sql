create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  person_id uuid not null references people(id),

  type text not null,
  status text not null default 'pending',
  amount_cents bigint not null,
  transaction_date date not null,
  due_date date,
  notes text,

  deleted_at timestamptz,
  deleted_by uuid references users(id),

  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint transactions_type_check check (type in ('lend', 'borrow')),
  constraint transactions_status_check check (
    status in ('pending', 'partially_paid', 'paid', 'cancelled')
  ),
  constraint transactions_amount_positive check (amount_cents > 0),
  constraint transactions_due_after_transaction check (
    due_date is null or due_date >= transaction_date
  )
);

comment on table transactions is
  'A single lend or borrow event against a person. Amounts stored as integer cents to avoid floating-point rounding errors.';

create trigger trg_transactions_updated_at
before update on transactions
for each row
execute function set_updated_at();

create index idx_transactions_user_id on transactions (user_id);
create index idx_transactions_person_id on transactions (person_id);

create index idx_transactions_active
  on transactions (user_id, person_id)
  where deleted_at is null;

create index idx_transactions_due_date
  on transactions (due_date)
  where deleted_at is null and due_date is not null;
