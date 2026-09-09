alter table repayments
  add column if not exists allocation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'repayments_allocation_id_fkey'
  ) then
    alter table repayments
      add constraint repayments_allocation_id_fkey
      foreign key (allocation_id) references repayment_allocations(id);
  end if;
end $$;

comment on column repayments.allocation_id is
  'Groups slices created by one person-level FIFO payment (see repayment_allocations). Null for a repayment recorded against a single transaction.';

create index if not exists idx_repayments_allocation_id
  on repayments (allocation_id)
  where deleted_at is null and allocation_id is not null;
