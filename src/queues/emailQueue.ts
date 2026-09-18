import { Queue } from 'bullmq';
import { EMAIL_JOB, type EmailJobName } from '../config/jobs.js';
import { createRedisConnection } from '../config/redis.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

export const EMAIL_QUEUE_NAME = EMAIL_JOB.queueName;

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let queue: Queue<EmailJobData> | undefined;

/**
 * Returns the singleton outbound-email queue.
 *
 * @returns BullMQ email queue
 */
function getEmailQueue(): Queue<EmailJobData> {
  if (!queue) {
    queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return queue;
}

/**
 * Enqueues one transactional email for the worker to send via EmailChannel.
 *
 * @param data - Recipient and message
 * @param jobName - Catalog name so Upstash/Bull shows invitation, password-reset, etc.
 * @param jobId - Optional idempotency key (duplicate ids are ignored; colons stripped)
 * @throws {AppError} If Redis is unavailable
 */
export async function enqueueEmail(
  data: EmailJobData,
  jobName: EmailJobName,
  jobId?: string,
): Promise<void> {
  try {
    const options = jobId ? { jobId: jobId.replaceAll(':', '-') } : {};
    await getEmailQueue().add(jobName, data, options);
    logger.info({ to: data.to, jobName, jobId }, 'Email enqueued');
  } catch (err) {
    logger.error({ err, to: data.to, jobName, jobId }, 'Failed to enqueue email');
    throw new AppError('Email queue is unavailable', 503);
  }
}

/**
 * Closes the email queue on process shutdown.
 */
export async function closeEmailQueue(): Promise<void> {
  if (!queue) {
    return;
  }
  await queue.close();
  queue = undefined;
}
