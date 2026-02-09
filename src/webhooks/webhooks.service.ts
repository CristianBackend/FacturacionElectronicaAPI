import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';
import { WebhookEvent } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a webhook subscription.
   * Generates an HMAC secret for payload verification.
   */
  async create(tenantId: string, dto: CreateWebhookDto) {
    // Generate HMAC secret for this subscription
    const secret = `whsec_${crypto.randomBytes(32).toString('hex')}`;
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

    const webhook = await this.prisma.webhookSubscription.create({
      data: {
        tenantId,
        url: dto.url,
        events: dto.events,
        secretHash,
        isActive: true,
      },
    });

    this.logger.log(`Webhook created: ${webhook.id} → ${dto.url}`);

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // Only shown once!
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      note: '⚠️ Guarda el secret. No se mostrará de nuevo. Úsalo para verificar la firma HMAC.',
    };
  }

  async findAll(tenantId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { tenantId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const webhook = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            event: true,
            statusCode: true,
            attempts: true,
            deliveredAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!webhook) throw new NotFoundException('Webhook no encontrado');
    return webhook;
  }

  async update(tenantId: string, id: string, dto: UpdateWebhookDto) {
    const webhook = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
    });
    if (!webhook) throw new NotFoundException('Webhook no encontrado');

    return this.prisma.webhookSubscription.update({
      where: { id },
      data: {
        url: dto.url,
        events: dto.events,
        isActive: dto.isActive,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    const webhook = await this.prisma.webhookSubscription.findFirst({
      where: { id, tenantId },
    });
    if (!webhook) throw new NotFoundException('Webhook no encontrado');

    await this.prisma.webhookSubscription.delete({ where: { id } });
    return { message: 'Webhook eliminado' };
  }

  /**
   * Dispatch an event to all matching webhook subscriptions.
   * Creates delivery records and attempts immediate delivery.
   */
  async dispatch(tenantId: string, event: WebhookEvent, payload: any): Promise<void> {
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        tenantId,
        isActive: true,
        events: { has: event },
      },
    });

    if (subscriptions.length === 0) {
      this.logger.debug(`No webhooks for event ${event} (tenant: ${tenantId})`);
      return;
    }

    this.logger.log(`Dispatching ${event} to ${subscriptions.length} webhook(s)`);

    for (const sub of subscriptions) {
      // Create delivery record
      const delivery = await this.prisma.webhookDelivery.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          event,
          payload,
          attempts: 0,
          maxAttempts: 5,
        },
      });

      // Attempt immediate delivery
      this.deliverWebhook(delivery.id, sub.url, sub.secretHash, event, payload)
        .catch((err) => this.logger.warn(`Webhook delivery failed: ${err.message}`));
    }
  }

  /**
   * Retry failed webhook deliveries.
   * Called periodically or on-demand.
   */
  async retryFailed(): Promise<number> {
    const pending = await this.prisma.webhookDelivery.findMany({
      where: {
        deliveredAt: null,
        attempts: { lt: 5 },
        nextRetryAt: { lte: new Date() },
      },
      include: {
        subscription: { select: { url: true, secretHash: true } },
      },
      take: 50,
    });

    let retried = 0;
    for (const delivery of pending) {
      await this.deliverWebhook(
        delivery.id,
        delivery.subscription.url,
        delivery.subscription.secretHash,
        delivery.event,
        delivery.payload,
      ).catch(() => {});
      retried++;
    }

    if (retried > 0) {
      this.logger.log(`Retried ${retried} webhook deliveries`);
    }

    return retried;
  }

  // ============================================================
  // PRIVATE DELIVERY LOGIC
  // ============================================================

  private async deliverWebhook(
    deliveryId: string,
    url: string,
    secretHash: string,
    event: WebhookEvent,
    payload: any,
  ): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(payload);

    // Create HMAC signature: sha256(timestamp.body) using the secret
    const signaturePayload = `${timestamp}.${body}`;
    const signature = crypto
      .createHmac('sha256', secretHash)
      .update(signaturePayload)
      .digest('hex');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ECF-Event': event,
          'X-ECF-Timestamp': String(timestamp),
          'X-ECF-Signature': `sha256=${signature}`,
          'X-ECF-Delivery-Id': deliveryId,
          'User-Agent': 'ECF-API-Webhook/1.0',
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const responseBody = await response.text().catch(() => '');

      if (response.ok) {
        // Success
        await this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000),
            attempts: { increment: 1 },
            deliveredAt: new Date(),
          },
        });
        this.logger.debug(`Webhook delivered: ${deliveryId} → ${response.status}`);
      } else {
        // HTTP error - schedule retry
        await this.scheduleRetry(deliveryId, response.status, responseBody);
      }
    } catch (error: any) {
      // Network error - schedule retry
      await this.scheduleRetry(deliveryId, 0, error.message);
    }
  }

  private async scheduleRetry(
    deliveryId: string,
    statusCode: number,
    responseBody: string,
  ): Promise<void> {
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) return;

    const attempt = delivery.attempts + 1;

    // Exponential backoff: 30s, 2min, 8min, 32min, 2h
    const backoffSeconds = Math.min(30 * Math.pow(4, attempt - 1), 7200);
    const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        statusCode,
        responseBody: responseBody.substring(0, 1000),
        attempts: attempt,
        nextRetryAt: attempt < delivery.maxAttempts ? nextRetry : null,
      },
    });

    this.logger.warn(
      `Webhook ${deliveryId} failed (attempt ${attempt}/${delivery.maxAttempts}). ` +
      `Next retry: ${nextRetry.toISOString()}`,
    );
  }
}
