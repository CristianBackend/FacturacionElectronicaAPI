import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';
import { DgiiService } from '../dgii/dgii.service';
import { SigningService } from '../signing/signing.service';
import { CertificatesService } from '../certificates/certificates.service';
import { ContingencyService } from '../contingency/contingency.service';
import { DGII_STATUS } from '../xml-builder/ecf-types';

/**
 * Scheduler Service
 *
 * Runs periodic tasks:
 * 1. Poll DGII for status of invoices in PROCESSING/SENT state
 * 2. Process contingency queue when DGII is available
 * 3. Clean up expired DGII tokens
 *
 * Uses simple setInterval instead of @nestjs/schedule to avoid
 * extra dependency. In production, consider using BullMQ repeatable jobs.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private pollInterval: NodeJS.Timeout | null = null;
  private contingencyInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dgiiService: DgiiService,
    private readonly signingService: SigningService,
    private readonly certificatesService: CertificatesService,
    private readonly contingencyService: ContingencyService,
  ) {}

  onModuleInit() {
    // Poll DGII every 2 minutes for invoices awaiting status
    this.pollInterval = setInterval(() => this.pollPendingInvoices(), 2 * 60 * 1000);

    // Try contingency queue every 5 minutes
    this.contingencyInterval = setInterval(() => this.processContingency(), 5 * 60 * 1000);

    // Clean expired tokens every hour
    this.cleanupInterval = setInterval(() => this.cleanupTokens(), 60 * 60 * 1000);

    this.logger.log('Scheduler started: polling (2min), contingency (5min), cleanup (1hr)');
  }

  onModuleDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.contingencyInterval) clearInterval(this.contingencyInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.logger.log('Scheduler stopped');
  }

  /**
   * Poll DGII for invoices stuck in PROCESSING or SENT status.
   */
  private async pollPendingInvoices() {
    try {
      const pending = await this.prisma.invoice.findMany({
        where: {
          status: { in: [InvoiceStatus.PROCESSING, InvoiceStatus.SENT] },
          trackId: { not: null },
        },
        include: {
          company: { select: { rnc: true, dgiiEnv: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      if (pending.length === 0) return;

      this.logger.debug(`Polling ${pending.length} pending invoice(s)...`);

      for (const invoice of pending) {
        try {
          // Authenticate with DGII to get token
          const { p12Buffer, passphrase } = await this.certificatesService.getDecryptedCertificate(
            invoice.tenantId, invoice.companyId,
          );
          const { privateKey, certificate } = this.signingService.extractFromP12(p12Buffer, passphrase);
          const token = await this.dgiiService.getToken(
            invoice.tenantId, invoice.companyId,
            privateKey, certificate, invoice.company.dgiiEnv,
          );

          const result = await this.dgiiService.queryStatus(
            invoice.trackId!, token, invoice.company.dgiiEnv,
          );

          const newStatus = this.mapStatus(result.status);
          if (newStatus !== invoice.status) {
            await this.prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                status: newStatus,
                dgiiResponse: result as any,
                dgiiMessage: result.message,
                dgiiTimestamp: new Date(),
              },
            });
            this.logger.log(`Poll: ${invoice.encf} → ${newStatus}`);
          }
        } catch (error: any) {
          // Don't fail the whole batch for one invoice
          this.logger.debug(`Poll failed for ${invoice.encf}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Poll cycle error: ${error.message}`);
    }
  }

  /**
   * Process contingency queue.
   */
  private async processContingency() {
    try {
      const count = await this.prisma.invoice.count({
        where: { status: InvoiceStatus.CONTINGENCY },
      });

      if (count === 0) return;

      this.logger.debug(`Processing ${count} contingency invoice(s)...`);
      const result = await this.contingencyService.processQueue();
      
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Contingency: ${result.processed} OK, ${result.failed} failed, ${result.remaining} remaining`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Contingency cycle error: ${error.message}`);
    }
  }

  /**
   * Clean up expired DGII tokens.
   */
  private async cleanupTokens() {
    try {
      const result = await this.prisma.dgiiToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (result.count > 0) {
        this.logger.debug(`Cleaned ${result.count} expired DGII token(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Token cleanup error: ${error.message}`);
    }
  }

  private mapStatus(dgiiStatus: any): InvoiceStatus {
    // Map DGII numeric status to our enum
    if (dgiiStatus === 1) return InvoiceStatus.ACCEPTED;
    if (dgiiStatus === 2) return InvoiceStatus.REJECTED;
    if (dgiiStatus === 3) return InvoiceStatus.CONDITIONAL;
    return InvoiceStatus.PROCESSING;
  }
}
