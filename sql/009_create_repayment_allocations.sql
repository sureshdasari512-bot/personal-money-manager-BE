create table if not exists repayment_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  person_id uuid not null references people(id),
  total_amount_cents bigint not null,
  paid_on date not null,
  notes text,
  unallocated_cents bigint not null default 0,

  deleted_at timestamptz,
  deleted_by uuid references users(id),

  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),

  constraint repayment_allocations_amount_positive check (total_amount_cents > 0),
  constraint repayment_allocations_unallocated_non_negative check (unallocated_cents >= 0)
);

comment on table repayment_allocations is
  'A single person-level payment that is split FIFO across that person''s outstanding lends. Slices live in repayments.';

comment on column repayment_allocations.unallocated_cents is
  'Leftover cents if a payment exceeded outstanding. The app currently rejects overpayment, so this stays 0.';

drop trigger if exists trg_repayment_allocations_updated_at on repayment_allocations;
create trigger trg_repayment_allocations_updated_at
before update on repayment_allocations
for each row
execute function set_updated_at();

create index if not exists idx_repayment_allocations_person_id
  on repayment_allocations (user_id, person_id)
  where deleted_at is null;
