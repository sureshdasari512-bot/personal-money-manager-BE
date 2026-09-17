/**
 * BullMQ job catalog. Names and schedules live here; workers stay in queues/.
 */

export const EMAIL_JOB = {
  queueName: 'email',
  name: 'send',
} as const;

export const DUE_REMINDER_JOB = {
  queueName: 'due-reminders',
  schedulerId: 'due-reminder-daily',
  name: 'scan',
  pattern: '0 8 * * *',
  tz: 'Asia/Kolkata',
} as const;
