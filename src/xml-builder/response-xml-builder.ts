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
 * Per DGII Descripción Técnica v1.6 p.55-58:
 * - ARECF uses namespaces xsi and xsd
 * - FechaHoraAcuseRecibo format: dd-MM-yyyy HH:mm:ss
 * - Estado: 0 = Recibido, 1 = No Recibido
 * - No empty tags allowed
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
   * Per DGII Descripción Técnica p.55-56:
   * - Must include xsi and xsd namespaces
   * - FechaHoraAcuseRecibo in dd-MM-yyyy HH:mm:ss format
   * - Estado: 0 = e-CF Recibido
   * - No DetalleValidacion field (not in official example)
   */
  buildArecfXml(input: ArecfInput): string {
    const now = new Date();

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
      '  <DetalleAcusedeRecibo>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${input.emitterRnc}</RNCEmisor>`,
      `    <RNCComprador>${input.receiverRnc}</RNCComprador>`,
      `    <eNCF>${input.encf}</eNCF>`,
      `    <Estado>0</Estado>`,
      `    <FechaHoraAcuseRecibo>${this.formatDateTime(now)}</FechaHoraAcuseRecibo>`,
      '  </DetalleAcusedeRecibo>',
      '</ARECF>',
    ].join('\n');

    this.logger.debug(`ARECF built for ${input.encf} from ${input.emitterRnc}`);
    return xml;
  }

  /**
   * Build ARECF XML with Estado=1 (No Recibido).
   *
   * Per DGII protocol, validation errors should return a proper ARECF
   * instead of HTTP exceptions. Error codes:
   * 1 = Error de especificación
   * 2 = Error Firma Digital
   * 3 = Envío duplicado
   * 4 = RNC Comprador no corresponde
   */
  buildArecfErrorXml(input: {
    emitterRnc: string;
    receiverRnc: string;
    encf: string;
    errorCode: number;
    errorDetail?: string;
  }): string {
    const now = new Date();

    const lines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
      '  <DetalleAcusedeRecibo>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${input.emitterRnc}</RNCEmisor>`,
      `    <RNCComprador>${input.receiverRnc}</RNCComprador>`,
      `    <eNCF>${input.encf}</eNCF>`,
      `    <Estado>1</Estado>`,
      `    <CodigoMotivoNoRecibido>${input.errorCode}</CodigoMotivoNoRecibido>`,
    ];

    if (input.errorDetail) {
      lines.push(`    <FechaHoraAcuseRecibo>${this.formatDateTime(now)}</FechaHoraAcuseRecibo>`);
    } else {
      lines.push(`    <FechaHoraAcuseRecibo>${this.formatDateTime(now)}</FechaHoraAcuseRecibo>`);
    }

    lines.push(
      '  </DetalleAcusedeRecibo>',
      '</ARECF>',
    );

    const xml = lines.join('\n');
    this.logger.debug(`ARECF error built for ${input.encf}: code ${input.errorCode}`);
    return xml;
  }

  /**
   * Build ACECF XML (Aprobación Comercial Electrónica)
   *
   * Per DGII Descripción Técnica p.28-29, 57-58:
   * - Must include xsi and xsd namespaces
   * - Estado: 1 = Aprobado, 2 = Rechazado
   * - DetalleMotivoRechazo only included when rejected (no empty tags)
   * - Types that DO NOT apply: 32, 41, 43, 46, 47
   */
  buildAcecfXml(input: AcecfInput): string {
    const now = new Date();
    const estado = input.approved ? '1' : '2';

    const lines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<ACECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
      '  <DetalleAprobacionComercial>',
      '    <Version>1.0</Version>',
      `    <RNCEmisor>${input.emitterRnc}</RNCEmisor>`,
      `    <RNCComprador>${input.receiverRnc}</RNCComprador>`,
      `    <eNCF>${input.encf}</eNCF>`,
      `    <Estado>${estado}</Estado>`,
    ];

    // Only include DetalleMotivoRechazo when rejected — DGII rejects empty tags
    if (!input.approved) {
      lines.push(`    <DetalleMotivoRechazo>${input.rejectionReason || 'Rechazado por el comprador'}</DetalleMotivoRechazo>`);
    }

    lines.push(
      `    <MontoTotal>${input.totalAmount.toFixed(2)}</MontoTotal>`,
      `    <MontoITBIS>${input.totalItbis.toFixed(2)}</MontoITBIS>`,
      `    <FechaHoraAprobacionComercial>${this.formatDateTime(now)}</FechaHoraAprobacionComercial>`,
      '  </DetalleAprobacionComercial>',
      '</ACECF>',
    );

    const xml = lines.join('\n');

    this.logger.debug(`ACECF built for ${input.encf}: ${input.approved ? 'APPROVED' : 'REJECTED'}`);
    return xml;
  }

  /**
   * Format datetime as dd-MM-yyyy HH:mm:ss per DGII official example.
   * Example: 17-12-2020 11:19:06
   */
  private formatDateTime(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
  }
}
