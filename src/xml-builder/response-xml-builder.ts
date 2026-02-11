import { Injectable, Logger } from '@nestjs/common';

/**
 * ARECF / ACECF XML Builder
 *
 * Generates the XML for:
 * - ARECF (Acuse de Recibo Electrónico de Comprobante Fiscal):
 *   Acknowledgment that an e-CF was received.
 *
 * - ACECF (Aprobación Comercial Electrónica de Comprobante Fiscal):
 *   Commercial approval or rejection of a received e-CF.
 *
 * Per DGII spec, these are required responses when receiving e-CFs
 * from other electronic emitters.
 */

export interface ArecfInput {
  receiverRnc: string;
  receiverName: string;
  emitterRnc: string;
  emitterName: string;
  ecfType: string;      // E31, E32, etc
  encf: string;         // eNCF being acknowledged
  totalAmount: number;
  totalItbis: number;
  receivedDate: Date;
  securityCode?: string;
}

export interface AcecfInput {
  receiverRnc: string;
  receiverName: string;
  emitterRnc: string;
  emitterName: string;
  ecfType: string;
  encf: string;
  totalAmount: number;
  totalItbis: number;
  approvalDate: Date;
  approved: boolean;         // true = approved, false = rejected
  rejectionReason?: string;  // Required if rejected
}

@Injectable()
export class ResponseXmlBuilder {
  private readonly logger = new Logger(ResponseXmlBuilder.name);

  /**
   * Build ARECF XML (Acuse de Recibo Electrónico)
   *
   * Per DGII Descripción Técnica:
   * The receiver must send an ARECF within 72 hours of receiving the e-CF.
   */
  buildArecfXml(input: ArecfInput): string {
    const typeCode = this.extractTypeCode(input.ecfType);
    const now = new Date();

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ARECF>',
      '  <DetalleAcusedeRecibo>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${input.emitterRnc}</RNCEmisor>`,
      `    <RNCComprador>${input.receiverRnc}</RNCComprador>`,
      `    <eNCF>${input.encf}</eNCF>`,
      `    <Estado>0</Estado>`, // 0 = Recibido
      `    <DetalleValidacion>Documento recibido correctamente</DetalleValidacion>`,
      `    <FechaHoraAcuseRecibo>${this.formatDateTime(now)}</FechaHoraAcuseRecibo>`,
      '  </DetalleAcusedeRecibo>',
      '</ARECF>',
    ].join('\n');

    this.logger.debug(`ARECF built for ${input.encf} from ${input.emitterRnc}`);
    return xml;
  }

  /**
   * Build ACECF XML (Aprobación Comercial Electrónica)
   *
   * Per DGII Descripción Técnica:
   * The receiver must send an ACECF to indicate commercial approval or rejection.
   * This applies to: E31 (Crédito Fiscal), E33 (NC), E34 (ND), E44, E45
   */
  buildAcecfXml(input: AcecfInput): string {
    const now = new Date();
    const estado = input.approved ? '1' : '2'; // 1 = Aprobado, 2 = Rechazado

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ACECF>',
      '  <DetalleAprobacionComercial>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${input.emitterRnc}</RNCEmisor>`,
      `    <RNCComprador>${input.receiverRnc}</RNCComprador>`,
      `    <eNCF>${input.encf}</eNCF>`,
      `    <Estado>${estado}</Estado>`,
      `    <DetalleMotivoRechazo>${input.approved ? '' : (input.rejectionReason || 'Rechazado por el comprador')}</DetalleMotivoRechazo>`,
      `    <MontoTotal>${input.totalAmount.toFixed(2)}</MontoTotal>`,
      `    <MontoITBIS>${input.totalItbis.toFixed(2)}</MontoITBIS>`,
      `    <FechaHoraAprobacionComercial>${this.formatDateTime(now)}</FechaHoraAprobacionComercial>`,
      '  </DetalleAprobacionComercial>',
      '</ACECF>',
    ].join('\n');

    this.logger.debug(`ACECF built for ${input.encf}: ${input.approved ? 'APPROVED' : 'REJECTED'}`);
    return xml;
  }

  private extractTypeCode(ecfType: string): number {
    return parseInt(ecfType.replace('E', ''), 10);
  }

  private formatDateTime(date: Date): string {
    return date.toISOString().replace('Z', '');
  }
}
