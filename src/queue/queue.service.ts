import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from './queue.constants';
import { EcfProcessingJobData } from './ecf-processing.processor';
import { StatusPollJobData } from './status-poll.processor';
import { WebhookDeliveryJobData } from './webhook-delivery.processor';
import { CertificateCheckJobData } from './certificate-check.processor';
import { WebhookEvent } from '@prisma/client';

/**
 * Queue Service
 *
 * Provides type-safe methods to enqueue jobs with appropriate
 * retry strategies, backoff, and deduplication.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUES.ECF_PROCESSING) private readonly ecfQueue: Queue,
    @InjectQueue(QUEUES.ECF_STATUS_POLL) private readonly pollQueue: Queue,
    @InjectQueue(QUEUES.WEBHOOK_DELIVERY) private readonly webhookQueue: Queue,
    @InjectQueue(QUEUES.CERTIFICATE_CHECK) private readonly certQueue: Queue,
  ) {}

  /**
   * Enqueue an invoice for async processing (sign + submit to DGII).
   * Uses invoiceId as jobId for deduplication.
   */
  async enqueueEcfProcessing(data: EcfProcessingJobData) {
    const job = await this.ecfQueue.add('process', data, {
      jobId: `ecf-${data.invoiceId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: { age: 86400 }, // keep 24h
      removeOnFail: { age: 604800 },    // keep 7 days
    });

    this.logger.log(`Enqueued ECF processing: ${job.id} for invoice ${data.invoiceId}`);
    return job;
  }

  /**
   * Enqueue a status poll for an invoice.
   * Uses exponential delay: 30s → 1m → 2m → 5m → 10m → 30m → 1h
   */
  async enqueueStatusPoll(data: StatusPollJobData, delayMs?: number) {
    const attempt = data.attempt || 1;
    const delay = delayMs || this.getPollDelay(attempt);

    const job = await this.pollQueue.add('poll', data, {
      jobId: `poll-${data.invoiceId}-${attempt}`,
      delay,
      attempts: 1, // each poll is its own job; we create new jobs for retries
      removeOnComplete: { age: 3600 },  // keep 1h
      removeOnFail: { age: 86400 },     // keep 24h
    });

    this.logger.log(
      `Enqueued status poll #${attempt} for ${data.invoiceId} (delay: ${Math.round(delay / 1000)}s)`,
    );
    return job;
  }

  /**
   * Fire a webhook event to all subscribed endpoints.
   */
  async fireWebhookEvent(tenantId: string, event: WebhookEvent, payload: Record<string, any>) {
    const data: WebhookDeliveryJobData = { tenantId, event, payload };

    const job = await this.webhookQueue.add(event, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000, // 10s, 20s, 40s
      },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    });

    this.logger.debug(`Webhook event queued: ${event} (job ${job.id})`);
    return job;
  }

  /**
   * Schedule a certificate expiration check.
   * Call this from a cron job or manually.
   */
  async scheduleCertificateCheck(data: CertificateCheckJobData = {}) {
    const job = await this.certQueue.add('check', data, {
      jobId: `cert-check-${Date.now()}`,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(`Certificate check scheduled: ${job.id}`);
    return job;
  }

  /**
   * Get queue health/stats for monitoring.
   */
  async getQueueStats() {
    const [ecf, poll, webhook, cert] = await Promise.all([
      this.getStats(this.ecfQueue),
      this.getStats(this.pollQueue),
      this.getStats(this.webhookQueue),
      this.getStats(this.certQueue),
    ]);

    return { ecfProcessing: ecf, statusPoll: poll, webhookDelivery: webhook, certificateCheck: cert };
  }

  private async getStats(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Exponential backoff for status polling:
   * attempt 1: 30s, 2: 1m, 3: 2m, 4: 5m, 5: 10m, 6+: 30m
   */
  private getPollDelay(attempt: number): number {
    const delays = [
      30_000,    // 30 seconds
      60_000,    // 1 minute
      120_000,   // 2 minutes
      300_000,   // 5 minutes
      600_000,   // 10 minutes
      1_800_000, // 30 minutes
    ];

    return delays[Math.min(attempt - 1, delays.length - 1)];
  }
}
