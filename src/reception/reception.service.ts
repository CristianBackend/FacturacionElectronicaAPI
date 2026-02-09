import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookEvent } from '@prisma/client';

/**
 * Reception Module
 *
 * Handles the flow of receiving e-CF documents from other issuers.
 *
 * DGII flow for receiving:
 * 1. Another issuer sends e-CF to DGII referencing our RNC as buyer
 * 2. We poll/receive notification of the document
 * 3. We validate the document
 * 4. We respond with ARECF (Acuse Recibo Electrónico) - acknowledges receipt
 * 5. We respond with ACECF (Aprobación Comercial) - approves/rejects commercially
 *
 * For MVP, we store received documents and allow commercial approval/rejection.
 * Full DGII polling integration will come with BullMQ workers.
 */
@Injectable()
export class ReceptionService {
  private readonly logger = new Logger(ReceptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooksService: WebhooksService,
  ) {}

  /**
   * Store a received document (from DGII polling or manual upload).
   */
  async storeReceived(tenantId: string, data: {
    companyId: string;
    senderRnc: string;
    senderName: string;
    encf: string;
    ecfType: string;
    totalAmount: number;
    xmlContent?: string;
  }) {
    // Store in received_documents (using invoices table with a special flag)
    // For a complete implementation, a separate received_documents table would be ideal
    // For now, we'll use the audit_log to track received documents

    const entry = await this.prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'received_document',
        entityId: data.encf,
        action: 'received',
        metadata: {
          companyId: data.companyId,
          senderRnc: data.senderRnc,
          senderName: data.senderName,
          encf: data.encf,
          ecfType: data.ecfType,
          totalAmount: data.totalAmount,
          status: 'pending_approval',
          receivedAt: new Date().toISOString(),
        },
      },
    });

    // Dispatch webhook
    await this.webhooksService.dispatch(tenantId, WebhookEvent.DOCUMENT_RECEIVED, {
      encf: data.encf,
      senderRnc: data.senderRnc,
      senderName: data.senderName,
      ecfType: data.ecfType,
      totalAmount: data.totalAmount,
    });

    this.logger.log(`Document received: ${data.encf} from ${data.senderRnc}`);

    return {
      id: entry.id,
      encf: data.encf,
      status: 'pending_approval',
      message: 'Documento recibido. Pendiente de aprobación comercial.',
    };
  }

  /**
   * List received documents for a tenant.
   */
  async findAll(tenantId: string, status?: string) {
    const where: any = {
      tenantId,
      entityType: 'received_document',
    };

    const entries = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return entries
      .filter((e) => {
        if (!status) return true;
        return (e.metadata as any)?.status === status;
      })
      .map((e) => ({
        id: e.id,
        ...(e.metadata as any),
        createdAt: e.createdAt,
      }));
  }

  /**
   * Approve or reject a received document (Commercial Approval - ACECF).
   */
  async processApproval(
    tenantId: string,
    documentId: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    const entry = await this.prisma.auditLog.findFirst({
      where: {
        id: documentId,
        tenantId,
        entityType: 'received_document',
      },
    });

    if (!entry) throw new NotFoundException('Documento recibido no encontrado');

    const metadata = entry.metadata as any;
    const newStatus = approved ? 'approved' : 'rejected';

    // Create approval record
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'received_document',
        entityId: metadata.encf,
        action: approved ? 'commercial_approval' : 'commercial_rejection',
        metadata: {
          ...metadata,
          status: newStatus,
          approvedAt: approved ? new Date().toISOString() : undefined,
          rejectedAt: !approved ? new Date().toISOString() : undefined,
          rejectionReason,
        },
      },
    });

    // Dispatch webhook
    await this.webhooksService.dispatch(
      tenantId,
      WebhookEvent.COMMERCIAL_APPROVAL_RECEIVED,
      {
        encf: metadata.encf,
        senderRnc: metadata.senderRnc,
        approved,
        rejectionReason,
      },
    );

    this.logger.log(
      `Document ${metadata.encf} ${approved ? 'approved' : 'rejected'} commercially`,
    );

    return {
      encf: metadata.encf,
      status: newStatus,
      message: approved
        ? 'Documento aprobado comercialmente (ACECF)'
        : `Documento rechazado: ${rejectionReason}`,
    };
  }
}
