create table notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  transaction_id uuid not null references transactions(id),
  window text not null,
  due_date date not null,
  status text not null default 'pending',
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),

  constraint notification_log_window_check check (
    window in ('due_minus_2', 'due_minus_1', 'due_today')
  ),
  constraint notification_log_status_check check (
    status in ('pending', 'sent', 'failed')
  ),
  constraint notification_log_unique_send unique (user_id, transaction_id, window, due_date)
);

comment on table notification_log is
  'Idempotent send log for due-date reminder emails (T-2, T-1, due day). One row per user, transaction, window, and due date.';

create index idx_notification_log_user_window
  on notification_log (user_id, window, due_date);
