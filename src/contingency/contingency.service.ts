import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

/**
 * Contingency Module
 *
 * Handles the scenario when DGII services are unavailable.
 * Per DGII regulations, businesses can continue invoicing in contingency mode
 * and must submit within 72 hours once services are restored.
 *
 * Flow:
 * 1. Invoice creation fails to reach DGII → status = CONTINGENCY
 * 2. Contingency service periodically checks for pending invoices
 * 3. When DGII is available, resubmits pending invoices
 * 4. Updates status based on DGII response
 */
@Injectable()
export class ContingencyService {
  private readonly logger = new Logger(ContingencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all invoices in contingency status.
   */
  async getPendingInvoices(tenantId?: string) {
    const where: any = { status: InvoiceStatus.CONTINGENCY };
    if (tenantId) where.tenantId = tenantId;

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        company: { select: { rnc: true, businessName: true, dgiiEnv: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Add time warnings
    return invoices.map((inv) => {
      const hoursInContingency = Math.floor(
        (Date.now() - inv.createdAt.getTime()) / (1000 * 60 * 60),
      );
      const hoursRemaining = Math.max(0, 72 - hoursInContingency);

      return {
        id: inv.id,
        encf: inv.encf,
        ecfType: inv.ecfType,
        totalAmount: inv.totalAmount,
        company: inv.company,
        createdAt: inv.createdAt,
        hoursInContingency,
        hoursRemaining,
        urgent: hoursRemaining < 12,
        expired: hoursRemaining === 0,
      };
    });
  }

  /**
   * Get contingency statistics for a tenant.
   */
  async getStats(tenantId: string) {
    const [contingencyCount, errorCount, totalToday] = await Promise.all([
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.CONTINGENCY },
      }),
      this.prisma.invoice.count({
        where: { tenantId, status: InvoiceStatus.ERROR },
      }),
      this.prisma.invoice.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    // Get oldest contingency invoice
    const oldest = await this.prisma.invoice.findFirst({
      where: { tenantId, status: InvoiceStatus.CONTINGENCY },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });

    const oldestHours = oldest
      ? Math.floor((Date.now() - oldest.createdAt.getTime()) / (1000 * 60 * 60))
      : 0;

    return {
      contingencyCount,
      errorCount,
      totalToday,
      oldestContingencyHours: oldestHours,
      urgentAction: oldestHours > 60, // Less than 12h remaining
    };
  }

  /**
   * Mark an ERROR invoice as CONTINGENCY for retry.
   */
  async markForRetry(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, status: InvoiceStatus.ERROR },
    });

    if (!invoice) {
      return { message: 'Factura no encontrada o no está en estado ERROR' };
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CONTINGENCY },
    });

    this.logger.log(`Invoice ${invoiceId} marked for retry (CONTINGENCY)`);
    return { message: 'Factura marcada para reintento', invoiceId };
  }

  /**
   * Bulk mark ERROR invoices as CONTINGENCY.
   */
  async markAllForRetry(tenantId: string) {
    const result = await this.prisma.invoice.updateMany({
      where: { tenantId, status: InvoiceStatus.ERROR },
      data: { status: InvoiceStatus.CONTINGENCY },
    });

    this.logger.log(`${result.count} invoices marked for retry`);
    return { markedCount: result.count };
  }

  /**
   * Process contingency queue.
   * This would be called by a cron job or BullMQ worker.
   * Returns count of successfully resubmitted invoices.
   *
   * Note: Actual DGII resubmission requires the DgiiService
   * which will be wired when BullMQ/Redis is available.
   */
  async processQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
    const pending = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.CONTINGENCY },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
      take: 10, // Process in batches
    });

    let processed = 0;
    let failed = 0;

    for (const invoice of pending) {
      try {
        // TODO: When DgiiService is wired with BullMQ:
        // 1. Get certificate for company
        // 2. Sign the stored unsigned XML
        // 3. Authenticate with DGII
        // 4. Submit signed XML
        // 5. Update status based on response

        this.logger.debug(`Would resubmit invoice ${invoice.id} (${invoice.encf})`);
        // For now, just log - actual resubmission will happen with full pipeline

        processed++;
      } catch (error: any) {
        this.logger.error(`Failed to process contingency invoice ${invoice.id}: ${error.message}`);
        failed++;
      }
    }

    const remaining = await this.prisma.invoice.count({
      where: { status: InvoiceStatus.CONTINGENCY },
    });

    return { processed, failed, remaining };
  }
}
