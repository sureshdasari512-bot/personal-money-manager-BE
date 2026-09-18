import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { EMAIL_QUEUE_NAME, type EmailJobData } from '../queues/emailQueue.js';
import { getEmailChannel } from '../services/smtpEmailChannel.js';
import { logger } from '../utils/logger.js';

let worker: Worker<EmailJobData> | undefined;

/**
 * Starts the BullMQ worker that delivers queued mail through EmailChannel.
 *
 * @returns The running worker
 */
export function startEmailWorker(): Worker<EmailJobData> {
  if (worker) {
    return worker;
  }

  worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const channel = getEmailChannel();
      await channel.send(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 2,
    },
  );

  worker.on('ready', () => {
    logger.info({ queue: EMAIL_QUEUE_NAME }, 'Email worker ready');
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, jobName: job.name, to: job.data.to }, 'Email job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name, to: job?.data.to }, 'Email job failed');
  });

  return worker;
}

/**
 * Stops the email worker on process shutdown.
 */
export async function closeEmailWorker(): Promise<void> {
  if (!worker) {
    return;
  }
  await worker.close();
  worker = undefined;
}
