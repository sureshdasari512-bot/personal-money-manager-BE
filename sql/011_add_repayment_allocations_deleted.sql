alter table repayment_allocations
  add column if not exists deleted_at timestamptz;

alter table repayment_allocations
  add column if not exists deleted_by uuid references users(id);

comment on column repayment_allocations.deleted_at is
  'Soft-delete timestamp. Null means the person-level payment is active.';

drop index if exists idx_repayment_allocations_person_id;
create index idx_repayment_allocations_person_id
  on repayment_allocations (user_id, person_id)
  where deleted_at is null;
