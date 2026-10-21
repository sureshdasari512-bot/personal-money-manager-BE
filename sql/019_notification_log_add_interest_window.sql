-- Remove the reminder_window check constraint entirely.
-- It was too rigid — every new notification type required a migration.
-- The column is already self-documenting via the application code.

alter table notification_log
  drop constraint notification_log_reminder_window_check;

comment on column notification_log.reminder_window is
  'Identifies the notification type: due_minus_2 | due_minus_1 | due_today for due-date reminders; interest_period_end for interest period digest emails. No DB check constraint — enforced at the application layer.';
