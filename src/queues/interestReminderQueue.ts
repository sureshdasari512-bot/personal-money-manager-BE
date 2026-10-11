import { Queue, Worker } from 'bullmq';
import { INTEREST_REMINDER_JOB } from '../config/jobs.js';
import { createRedisConnection } from '../config/redis.js';
import { processInterestReminders } from '../services/interestReminderService.js';
import { logger } from '../utils/logger.js';

export const INTEREST_REMINDER_QUEUE_NAME = INTEREST_REMINDER_JOB.queueName;

let queue: Queue | undefined;
let worker: Worker | undefined;

// Returns the singleton interest-reminder scan queue.
function getInterestReminderQueue(): Queue {
  if (!queue) {
    queue = new Queue(INTEREST_REMINDER_QUEUE_NAME, {
      connection: createRedisConnection(),
    });
  }
  return queue;
}

/**
 * Starts the worker that scans for period-end dates and enqueues interest
 * digest emails for each eligible user.
 *
 * @returns The running worker
 */
export function startInterestReminderWorker(): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    INTEREST_REMINDER_QUEUE_NAME,
    async () => {
      return processInterestReminders();
    },
    {
      connection: createRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on('ready', () => {
    logger.info({ queue: INTEREST_REMINDER_QUEUE_NAME }, 'Interest reminder worker ready');
  });

  worker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, result: job.returnvalue },
      'Interest reminder job completed',
    );
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Interest reminder job failed');
  });

  return worker;
}

/**
 * Registers the daily 08:30 Asia/Kolkata interest-period scan.
 * Runs 30 minutes after the due-reminder scan to avoid Redis contention.
 * Idempotent across restarts — upsertJobScheduler deduplicates by schedulerId.
 */
export async function scheduleInterestReminderScan(): Promise<void> {
  await getInterestReminderQueue().upsertJobScheduler(
    INTEREST_REMINDER_JOB.schedulerId,
    {
      pattern: INTEREST_REMINDER_JOB.pattern,
      tz: INTEREST_REMINDER_JOB.tz,
    },
    {
      name: INTEREST_REMINDER_JOB.name,
      data: {},
    },
  );
  logger.info(
    { tz: INTEREST_REMINDER_JOB.tz, pattern: INTEREST_REMINDER_JOB.pattern },
    'Interest reminder schedule registered',
  );
}

/**
 * Closes the interest-reminder worker and queue on process shutdown.
 */
export async function closeInterestReminderJobs(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
