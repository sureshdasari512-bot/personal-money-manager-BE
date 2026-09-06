alter table transactions
  add column if not exists status text not null default 'pending';

comment on column transactions.status is
  'Ledger state maintained by the app: pending, partially_paid, paid, or cancelled. Not set by the client.';

alter table transactions
  drop constraint if exists transactions_status_check;

alter table transactions
  add constraint transactions_status_check
  check (status in ('pending', 'partially_paid', 'paid', 'cancelled'));

update transactions t
set status = case
  when t.deleted_at is not null then 'cancelled'
  when repaid.total is null or repaid.total = 0 then 'pending'
  when repaid.total >= t.amount_cents then 'paid'
  else 'partially_paid'
end
from (
  select transaction_id, sum(amount_cents) as total
  from repayments
  where deleted_at is null
  group by transaction_id
) repaid
where repaid.transaction_id = t.id;

update transactions
set status = 'cancelled'
where deleted_at is not null
  and status is distinct from 'cancelled';

create index if not exists idx_transactions_status
  on transactions (user_id, status)
  where deleted_at is null;
