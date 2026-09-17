import { Queue, Worker } from 'bullmq';
import { DUE_REMINDER_JOB } from '../config/jobs.js';
import { createRedisConnection } from '../config/redis.js';
import { processDueReminders } from '../services/dueReminderService.js';
import { logger } from '../utils/logger.js';

export const DUE_REMINDER_QUEUE_NAME = DUE_REMINDER_JOB.queueName;

let queue: Queue | undefined;
let worker: Worker | undefined;

/**
 * Returns the singleton due-reminder scan queue.
 *
 * @returns BullMQ queue
 */
function getDueReminderQueue(): Queue {
  if (!queue) {
    queue = new Queue(DUE_REMINDER_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return queue;
}

/**
 * Starts the worker that scans due dates and enqueues digest emails.
 *
 * @returns The running worker
 */
export function startDueReminderWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    DUE_REMINDER_QUEUE_NAME,
    async () => {
      return processDueReminders();
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('ready', () => {
    logger.info({ queue: DUE_REMINDER_QUEUE_NAME }, 'Due reminder worker ready');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Due reminder job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Due reminder job failed');
  });

  return worker;
}

/**
 * Registers the daily 08:00 Asia/Kolkata scan. Idempotent across restarts (BullMQ 6).
 */
export async function scheduleDueReminderScan(): Promise<void> {
  await getDueReminderQueue().upsertJobScheduler(
    DUE_REMINDER_JOB.schedulerId,
    {
      pattern: DUE_REMINDER_JOB.pattern,
      tz: DUE_REMINDER_JOB.tz,
    },
    {
      name: DUE_REMINDER_JOB.name,
      data: {},
    },
  );
  logger.info(
    { tz: DUE_REMINDER_JOB.tz, pattern: DUE_REMINDER_JOB.pattern },
    'Due reminder schedule registered',
  );
}

/**
 * Closes the due-reminder worker and queue.
 */
export async function closeDueReminderJobs(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
