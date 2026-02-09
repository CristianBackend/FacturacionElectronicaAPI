import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  InvoiceInput,
  InvoiceItemInput,
  InvoiceTotals,
} from './invoice-input.interface';
import {
  ECF_TYPE_CODES,
  REQUIRES_BUYER_RNC,
  REQUIRES_REFERENCE,
  ITBIS_RATES,
  FC_FULL_SUBMISSION_THRESHOLD,
  isIscEspecificoAlcohol,
  isIscAdvaloremAlcohol,
  isIscEspecificoCigarrillo,
  isIscAdvaloremCigarrillo,
  isOtrosImpuestos,
  buildStandardQrUrl,
  buildFcUnder250kQrUrl,
} from './ecf-types';
import { ValidationService } from '../validation/validation.service';

const r2 = ValidationService.round2;
const r4 = ValidationService.round4;
const fmt = ValidationService.formatAmount;
const fmtPrice = ValidationService.formatPrice;

/**
 * Builds DGII-compliant XML for all 10 types of e-CF.
 *
 * XML structure follows the official XSD schemas v1.0:
 * <ECF>
 *   <Encabezado>
 *     <IdDoc>...</IdDoc>
 *     <Emisor>...</Emisor>
 *     <Comprador>...</Comprador>
 *     <InformacionesAdicionales>...</InformacionesAdicionales>
 *     <Totales>...</Totales>
 *     <OtraMoneda>...</OtraMoneda>
 *   </Encabezado>
 *   <DetallesItems>
 *     <Item>...</Item>
 *   </DetallesItems>
 *   <SubtotalesInformativos>...</SubtotalesInformativos>  (optional, section C)
 *   <DescuentosORecargos>...</DescuentosORecargos>  (optional, section D)
 *   <Paginacion>...</Paginacion>  (optional, section E)
 *   <InformacionReferencia>...</InformacionReferencia>  (required for 33,34)
 *   <FechaHoraFirma>...</FechaHoraFirma>  (section H, set at signing)
 * </ECF>
 *
 * Updated: Full DGII compliance - rounding, ISC, additional taxes, cuadratura
 */
@Injectable()
export class XmlBuilderService {
  private readonly logger = new Logger(XmlBuilderService.name);

  constructor(private readonly validationService: ValidationService) {}

  /**
   * Build complete e-CF XML from invoice input and emitter data.
   */
  buildEcfXml(
    input: InvoiceInput,
    emitter: EmitterData,
    encf: string,
  ): { xml: string; totals: InvoiceTotals } {
    // Validate input
    this.validationService.validateInvoiceInput(input);

    // Calculate totals with proper rounding
    const totals = this.calculateTotals(input.items, input.indicadorMontoGravado || 0);

    // Validate cuadratura
    const cuadratura = this.validationService.validateCuadratura(input.items, totals);
    if (cuadratura.warnings.length > 0) {
      cuadratura.warnings.forEach(w => this.logger.warn(w));
    }

    const typeCode = ECF_TYPE_CODES[input.ecfType as keyof typeof ECF_TYPE_CODES];

    // Build XML sections
    const idDoc = this.buildIdDoc(typeCode, encf, input, totals.totalAmount);
    const emisor = this.buildEmisor(emitter);
    const comprador = this.buildComprador(typeCode, input.buyer);
    const totalesXml = this.buildTotales(typeCode, totals, input);

    // OtraMoneda within Encabezado
    const otraMoneda = input.currency && input.currency.code !== 'DOP'
      ? this.buildOtraMoneda(input.currency, totals)
      : '';

    // InformacionesAdicionales (optional, E46 exportaciones)
    const infoAdicional = input.additionalInfo
      ? this.buildInformacionesAdicionales(input.additionalInfo)
      : '';

    // Transporte (optional, E46 exportaciones)
    const transporte = input.transport
      ? this.buildTransporte(input.transport)
      : '';

    const detalles = this.buildDetallesItem(input.items, input.indicadorMontoGravado || 0, typeCode);

    // Optional sections
    const descuentos = input.discountsOrSurcharges?.length
      ? this.buildDescuentosORecargos(input.discountsOrSurcharges)
      : '';
    const referencia = REQUIRES_REFERENCE.includes(typeCode) && input.reference
      ? this.buildInformacionReferencia(input.reference)
      : '';

    // Assemble final XML (XSD order: Encabezado[IdDoc,Emisor,Comprador,InfoAdicionales,Transporte,Totales,OtraMoneda] → DetallesItems → DescuentosORecargos → InformacionReferencia)
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ECF xmlns="http://dgii.gov.do/eCF">',
      '  <Encabezado>',
      '    <Version>1.0</Version>',
      idDoc,
      emisor,
      comprador,
      infoAdicional,
      transporte,
      totalesXml,
      otraMoneda,
      '  </Encabezado>',
      detalles,
      descuentos,
      referencia,
      '</ECF>',
    ]
      .filter(Boolean)
      .join('\n');

    this.logger.debug(`Built XML for ${input.ecfType} (${encf}): ${xml.length} chars`);
    return { xml, totals };
  }

  // ============================================================
  // RFCE - Resumen Factura Consumo < RD$250,000
  // ============================================================

  /**
   * Build RFCE XML (Resumen Factura Consumo Electrónica).
   * For E32 invoices with total < RD$250,000.
   * Only the summary is sent to DGII; full XML stored locally.
   */
  buildRfceXml(
    input: InvoiceInput,
    emitter: EmitterData,
    encf: string,
    totals: InvoiceTotals,
    securityCode: string,
  ): string {
    const typeCode = 32;
    const now = new Date();

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<RFCE xmlns="http://dgii.gov.do/RFCE">',
      `  <RNCEmisor>${escapeXml(emitter.rnc)}</RNCEmisor>`,
      `  <eNCF>${escapeXml(encf)}</eNCF>`,
      `  <FechaEmision>${formatDate(now)}</FechaEmision>`,
      `  <MontoTotal>${fmt(totals.totalAmount)}</MontoTotal>`,
      totals.totalItbis > 0 ? `  <TotalITBIS>${fmt(totals.totalItbis)}</TotalITBIS>` : '',
      totals.totalIsc > 0 ? `  <MontoImpuestoAdicional>${fmt(totals.totalIsc)}</MontoImpuestoAdicional>` : '',
      `  <CantidadItems>${input.items.length}</CantidadItems>`,
      `  <CodigoSeguridad>${escapeXml(securityCode)}</CodigoSeguridad>`,
      input.buyer?.rnc ? `  <RNCComprador>${escapeXml(input.buyer.rnc)}</RNCComprador>` : '',
      '</RFCE>',
    ].filter(Boolean).join('\n');

    return xml;
  }

  // ============================================================
  // ANECF - Anulación de Secuencias e-NCF
  // ============================================================

  /**
   * Build ANECF XML for voiding unused sequences or
   * e-CF that were signed but not sent to DGII/receptor.
   */
  buildAnecfXml(
    emitter: EmitterData,
    sequences: Array<{
      encfDesde: string;
      encfHasta: string;
    }>,
  ): string {
    const now = new Date();

    let rangesXml = '';
    sequences.forEach((seq, i) => {
      rangesXml += `    <Rango>\n`;
      rangesXml += `      <NumeroLinea>${i + 1}</NumeroLinea>\n`;
      rangesXml += `      <eNCFDesde>${escapeXml(seq.encfDesde)}</eNCFDesde>\n`;
      rangesXml += `      <eNCFHasta>${escapeXml(seq.encfHasta)}</eNCFHasta>\n`;
      rangesXml += `    </Rango>\n`;
    });

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<ANECF xmlns="http://dgii.gov.do/ANECF">',
      `  <Encabezado>`,
      `    <RNCEmisor>${escapeXml(emitter.rnc)}</RNCEmisor>`,
      `    <FechaAnulacion>${formatDate(now)}</FechaAnulacion>`,
      `    <CantidadRangos>${sequences.length}</CantidadRangos>`,
      `  </Encabezado>`,
      `  <DetalleAnulacion>`,
      rangesXml.trimEnd(),
      `  </DetalleAnulacion>`,
      '</ANECF>',
    ].join('\n');

    return xml;
  }

  // ============================================================
  // TOTALS CALCULATION (with proper DGII rounding)
  // ============================================================

  calculateTotals(items: InvoiceItemInput[], indicadorMontoGravado: number = 0): InvoiceTotals {
    let taxableAmount18 = 0;
    let taxableAmount16 = 0;
    let taxableAmount0 = 0;
    let exemptAmount = 0;
    let itbis18 = 0;
    let itbis16 = 0;
    let itbis0 = 0;
    let totalDiscount = 0;
    let totalIscEspecifico = 0;
    let totalIscAdvalorem = 0;
    let totalOtrosImpuestos = 0;

    for (const item of items) {
      const qty = item.quantity;
      const price = item.unitPrice;
      const discount = item.discount || 0;
      const lineSubtotal = r2(qty * price - discount);
      const rate = item.itbisRate ?? ITBIS_RATES.STANDARD;
      const indicadorFact = item.indicadorFacturacion;

      totalDiscount += discount;

      // Determine taxable amounts based on rate
      if (indicadorFact === 'E' || rate === 0) {
        // Check if truly exempt or gravado at 0%
        if (indicadorFact === 'E') {
          exemptAmount += lineSubtotal;
        } else {
          taxableAmount0 += lineSubtotal;
          itbis0 += 0; // 0% rate
        }
      } else if (rate === 18) {
        taxableAmount18 += lineSubtotal;
        itbis18 += r2(lineSubtotal * 0.18);
      } else if (rate === 16) {
        taxableAmount16 += lineSubtotal;
        itbis16 += r2(lineSubtotal * 0.16);
      }

      // ISC calculations
      if (item.additionalTaxCode) {
        const code = item.additionalTaxCode;
        if (isIscEspecificoAlcohol(code)) {
          totalIscEspecifico += this.validationService.calculateIscEspecificoAlcohol(item);
        } else if (isIscEspecificoCigarrillo(code)) {
          totalIscEspecifico += this.validationService.calculateIscEspecificoCigarrillo(item);
        } else if (isIscAdvaloremAlcohol(code)) {
          const iscEsp = this.validationService.calculateIscEspecificoAlcohol(item);
          totalIscAdvalorem += this.validationService.calculateIscAdvaloremAlcohol(
            item, iscEsp, rate, item.additionalTaxRate || 0,
          );
        } else if (isIscAdvaloremCigarrillo(code)) {
          totalIscAdvalorem += this.validationService.calculateIscAdvaloremCigarrillo(
            item, rate, item.additionalTaxRate || 0,
          );
        } else if (isOtrosImpuestos(code)) {
          totalOtrosImpuestos += this.validationService.calculateOtrosImpuestos(
            lineSubtotal,
            item.additionalTaxRate || 0,
            item.indicadorMontoGravado || indicadorMontoGravado,
            rate,
          );
        }
      }
    }

    const subtotalBeforeTax = r2(taxableAmount18 + taxableAmount16 + taxableAmount0 + exemptAmount);
    const totalItbis = r2(itbis18 + itbis16 + itbis0);
    const totalIsc = r2(totalIscEspecifico + totalIscAdvalorem);
    const totalAmount = r2(subtotalBeforeTax + totalItbis + totalIsc + totalOtrosImpuestos);

    return {
      subtotalBeforeTax: r2(subtotalBeforeTax),
      totalDiscount: r2(totalDiscount),
      taxableAmount18: r2(taxableAmount18),
      taxableAmount16: r2(taxableAmount16),
      taxableAmount0: r2(taxableAmount0),
      exemptAmount: r2(exemptAmount),
      itbis18: r2(itbis18),
      itbis16: r2(itbis16),
      itbis0: r2(itbis0),
      totalItbis: r2(totalItbis),
      totalIscEspecifico: r2(totalIscEspecifico),
      totalIscAdvalorem: r2(totalIscAdvalorem),
      totalIsc: r2(totalIsc),
      totalOtrosImpuestos: r2(totalOtrosImpuestos),
      montoNoFacturable: 0,
      totalAmount: r2(totalAmount),
      toleranciaGlobal: items.length,
    };
  }

  // ============================================================
  // XML SECTION BUILDERS
  // ============================================================

  private buildIdDoc(typeCode: number, encf: string, input: InvoiceInput, totalAmount: number): string {
    const now = new Date();
    const paymentDate = input.payment.date || formatDate(now);

    // ============================================================
    // DGII Obligatoriedad table (Formato e-CF v1.0, Sección A - IdDoc)
    // 0=No corresponde, 1=Obligatorio, 2=Condicional, 3=Opcional
    // Types:          31  32  33  34  41  43  44  45  46  47
    // ============================================================

    let xml = '';
    xml += `    <IdDoc>\n`;
    xml += `      <TipoeCF>${typeCode}</TipoeCF>\n`;
    xml += `      <eNCF>${escapeXml(encf)}</eNCF>\n`;

    // FechaVencimientoSecuencia: 1  0  1  0  1  1  1  1  1  1
    if (typeCode !== 32 && typeCode !== 34) {
      const expiryDate = input.sequenceExpiresAt
        ? formatDate(new Date(input.sequenceExpiresAt))
        : formatDate(new Date(now.getFullYear() + 1, 11, 31)); // fallback
      xml += `      <FechaVencimientoSecuencia>${expiryDate}</FechaVencimientoSecuencia>\n`;
    }

    // IndicadorNotaCredito: 0  0  0  1  0  0  0  0  0  0
    // Value: 0 if ≤ 30 days from original, 1 if > 30 days
    if (typeCode === 34) {
      let indicador = 0;
      if (input.reference?.date) {
        const refDate = this.parseDgiiDate(input.reference.date);
        const diffDays = Math.floor((now.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        indicador = diffDays > 30 ? 1 : 0;
      }
      xml += `      <IndicadorNotaCredito>${indicador}</IndicadorNotaCredito>\n`;
    }

    // IndicadorEnvioDiferido: 2  2  2  2  0  0  2  2  2  0
    // Condicional a que esté autorizado para envíos diferidos. Solo emitir si = 1.
    const noEnvioDiferido = [41, 43, 46, 47];
    if (!noEnvioDiferido.includes(typeCode) && input.indicadorEnvioDiferido === 1) {
      xml += `      <IndicadorEnvioDiferido>1</IndicadorEnvioDiferido>\n`;
    }

    // IndicadorMontoGravado: 2  2  2  2  2  0  0  2  0  0
    // Condicional a que el bien/servicio sea gravado con ITBIS.
    // 0 = precios NO incluyen ITBIS, 1 = precios YA incluyen ITBIS
    // Solo emitir si hay items gravados
    const noMontoGravado = [43, 44, 46, 47];
    if (!noMontoGravado.includes(typeCode)) {
      const hasGravado = input.items.some(i => (i.itbisRate ?? 18) > 0);
      if (hasGravado) {
        xml += `      <IndicadorMontoGravado>${input.indicadorMontoGravado ?? 0}</IndicadorMontoGravado>\n`;
      }
    }

    // TipoIngresos: 1  1  1  1  0  0  1  1  1  0
    const noTipoIngresos = [41, 43, 47];
    if (!noTipoIngresos.includes(typeCode)) {
      const tipoIngreso = input.items[0]?.incomeType || 1;
      xml += `      <TipoIngresos>${String(tipoIngreso).padStart(2, '0')}</TipoIngresos>\n`;
    }

    // TipoPago: 1  1  1  1  1  3  1  1  1  3
    // For E43 and E47 it's optional (code 3), for E34 it's obligatory (code 1)
    const tipoPagoOptional = [43, 47];
    if (tipoPagoOptional.includes(typeCode)) {
      if (input.payment.type) {
        xml += `      <TipoPago>${input.payment.type}</TipoPago>\n`;
      }
    } else {
      xml += `      <TipoPago>${input.payment.type}</TipoPago>\n`;
    }

    // FechaLimitePago: 2  2  2  2  2  0  2  2  2  3
    // Condicional a que TipoPago = 2 (Crédito)
    const noFechaLimite = [43];
    if (!noFechaLimite.includes(typeCode) && input.payment.type === 2) {
      xml += `      <FechaLimitePago>${paymentDate}</FechaLimitePago>\n`;
    }

    // TerminoPago: 3  3  3  0  3  0  3  3  3  3
    const noTerminoPago = [34, 43];
    if (!noTerminoPago.includes(typeCode) && input.payment.termDays) {
      xml += `      <TerminoPago>${input.payment.termDays} dias</TerminoPago>\n`;
    }

    // TablaFormasPago: 3  3  3  0  3  0  3  3  3  3
    const noFormasPago = [34, 43];
    if (!noFormasPago.includes(typeCode)) {
      const formaPago = input.payment.method || input.payment.type; // fallback to type for backward compat
      xml += `      <TablaFormasPago>\n`;
      xml += `        <FormaDePago>\n`;
      xml += `          <FormaPago>${String(formaPago).padStart(2, '0')}</FormaPago>\n`;
      xml += `          <MontoPago>${fmt(totalAmount)}</MontoPago>\n`;
      xml += `        </FormaDePago>\n`;
      xml += `      </TablaFormasPago>\n`;
    }

    xml += `    </IdDoc>`;

    return xml;
  }

  private buildEmisor(emitter: EmitterData): string {
    const now = new Date();
    let xml = '';
    xml += `    <Emisor>\n`;
    xml += `      <RNCEmisor>${escapeXml(emitter.rnc)}</RNCEmisor>\n`;
    xml += `      <RazonSocialEmisor>${escapeXml(emitter.businessName)}</RazonSocialEmisor>\n`;

    if (emitter.tradeName) {
      xml += `      <NombreComercial>${escapeXml(emitter.tradeName)}</NombreComercial>\n`;
    }

    xml += `      <DireccionEmisor>${escapeXml(emitter.address || 'N/A')}</DireccionEmisor>\n`;

    if (emitter.municipality) {
      xml += `      <Municipio>${escapeXml(emitter.municipality)}</Municipio>\n`;
    }

    if (emitter.province) {
      xml += `      <Provincia>${escapeXml(emitter.province)}</Provincia>\n`;
    }

    xml += `      <FechaEmision>${formatDate(now)}</FechaEmision>\n`;
    xml += `    </Emisor>`;

    return xml;
  }

  private buildComprador(typeCode: number, buyer: any): string {
    // E43 (Gastos Menores): Comprador código 0 - NO corresponde
    if (typeCode === 43) {
      return '';
    }

    // E47 (Pagos Exterior): Comprador código 3 - opcional
    // Si se incluye, ciertos sub-campos son código 0
    const isE47 = typeCode === 47;

    if (!buyer || (!buyer.rnc && !REQUIRES_BUYER_RNC.includes(typeCode))) {
      if (typeCode === 32) {
        return [
          '    <Comprador>',
          `      <RazonSocialComprador>${escapeXml(buyer?.name || 'CONSUMIDOR FINAL')}</RazonSocialComprador>`,
          '    </Comprador>',
        ].join('\n');
      }
      // E47 without buyer data - skip entirely (optional)
      if (isE47) return '';
    }

    let xml = '';
    xml += `    <Comprador>\n`;

    if (buyer.rnc) {
      xml += `      <RNCComprador>${escapeXml(buyer.rnc)}</RNCComprador>\n`;
    }

    // IdentificadorExtranjero: for E32>250K, E33/E34 ref E32>250K, E44 diplomáticos, E47
    if (!buyer.rnc && buyer.foreignId) {
      xml += `      <IdentificadorExtranjero>${escapeXml(buyer.foreignId)}</IdentificadorExtranjero>\n`;
    }

    xml += `      <RazonSocialComprador>${escapeXml(buyer.name)}</RazonSocialComprador>\n`;

    // E47: ContactoComprador=0, CorreoComprador=0, DireccionComprador=0, etc
    if (!isE47) {
      if (buyer.email) {
        xml += `      <ContactoComprador>${escapeXml(buyer.email)}</ContactoComprador>\n`;
      }

      if (buyer.address) {
        xml += `      <DireccionComprador>${escapeXml(buyer.address)}</DireccionComprador>\n`;
      }

      if (buyer.municipality) {
        xml += `      <MunicipioComprador>${escapeXml(buyer.municipality)}</MunicipioComprador>\n`;
      }

      if (buyer.province) {
        xml += `      <ProvinciaComprador>${escapeXml(buyer.province)}</ProvinciaComprador>\n`;
      }
    }

    // PaisComprador: solo E46 (opcional, código 3)
    if (typeCode === 46 && buyer.country) {
      xml += `      <PaisComprador>${escapeXml(buyer.country)}</PaisComprador>\n`;
    }

    xml += `    </Comprador>`;
    return xml;
  }

  private buildTotales(typeCode: number, totals: InvoiceTotals, input: InvoiceInput): string {
    let xml = '';
    xml += `    <Totales>\n`;

    // === XSD Totales field order (xs:sequence) ===

    // 1. MontoGravadoTotal
    const montoGravadoTotal = r2(totals.taxableAmount18 + totals.taxableAmount16 + totals.taxableAmount0);
    xml += `      <MontoGravadoTotal>${fmt(montoGravadoTotal)}</MontoGravadoTotal>\n`;

    // 2-4. MontoGravadoI1/I2/I3 (breakdown by rate)
    if (totals.taxableAmount18 > 0) {
      xml += `      <MontoGravadoI1>${fmt(totals.taxableAmount18)}</MontoGravadoI1>\n`;
    }
    if (totals.taxableAmount16 > 0) {
      xml += `      <MontoGravadoI2>${fmt(totals.taxableAmount16)}</MontoGravadoI2>\n`;
    }
    if (totals.taxableAmount0 > 0) {
      xml += `      <MontoGravadoI3>${fmt(totals.taxableAmount0)}</MontoGravadoI3>\n`;
    }

    // 5. MontoExento
    if (totals.exemptAmount > 0) {
      xml += `      <MontoExento>${fmt(totals.exemptAmount)}</MontoExento>\n`;
    }

    // 6-8. ITBIS1/2/3 (rate values)
    if (totals.itbis18 > 0) {
      xml += `      <ITBIS1>18</ITBIS1>\n`;
    }
    if (totals.itbis16 > 0) {
      xml += `      <ITBIS2>16</ITBIS2>\n`;
    }
    if (totals.itbis0 > 0) {
      xml += `      <ITBIS3>0</ITBIS3>\n`;
    }

    // 9-12. TotalITBIS, TotalITBIS1/2/3 (amount values)
    if (totals.totalItbis > 0) {
      xml += `      <TotalITBIS>${fmt(totals.totalItbis)}</TotalITBIS>\n`;
    }
    if (totals.itbis18 > 0) {
      xml += `      <TotalITBIS1>${fmt(totals.itbis18)}</TotalITBIS1>\n`;
    }
    if (totals.itbis16 > 0) {
      xml += `      <TotalITBIS2>${fmt(totals.itbis16)}</TotalITBIS2>\n`;
    }
    if (totals.itbis0 > 0) {
      xml += `      <TotalITBIS3>${fmt(totals.itbis0)}</TotalITBIS3>\n`;
    }

    // 13. MontoImpuestoAdicional (total ISC + otros)
    if (totals.totalIsc > 0) {
      xml += `      <MontoImpuestoAdicional>${fmt(totals.totalIsc)}</MontoImpuestoAdicional>\n`;
    }

    // 14. ImpuestoSelectivoConsumoEspecifico
    if (totals.totalIscEspecifico > 0) {
      xml += `      <ImpuestoSelectivoConsumoEspecifico>${fmt(totals.totalIscEspecifico)}</ImpuestoSelectivoConsumoEspecifico>\n`;
    }

    // 15. ImpuestoSelectivoConsumoAdvalorem
    if (totals.totalIscAdvalorem > 0) {
      xml += `      <ImpuestoSelectivoConsumoAdvalorem>${fmt(totals.totalIscAdvalorem)}</ImpuestoSelectivoConsumoAdvalorem>\n`;
    }

    // 16. OtrosImpuestosAdicionales
    if (totals.totalOtrosImpuestos > 0) {
      xml += `      <OtrosImpuestosAdicionales>${fmt(totals.totalOtrosImpuestos)}</OtrosImpuestosAdicionales>\n`;
    }

    // 17. TotalDescuento
    if (totals.totalDiscount > 0) {
      xml += `      <TotalDescuento>${fmt(totals.totalDiscount)}</TotalDescuento>\n`;
    }

    // 18. MontoTotal (obligatorio)
    xml += `      <MontoTotal>${fmt(totals.totalAmount)}</MontoTotal>\n`;

    // 19-22. Retenciones y Percepciones (para agentes de retención - E41 especialmente)
    if (input.retention?.itbisRetenido || input.retention?.itbisRetenido === 0) {
      xml += `      <TotalITBISRetenido>${fmt(input.retention.itbisRetenido)}</TotalITBISRetenido>\n`;
    }
    if (input.retention?.isrRetencion || input.retention?.isrRetencion === 0) {
      xml += `      <TotalISRRetencion>${fmt(input.retention.isrRetencion)}</TotalISRRetencion>\n`;
    }
    if (input.retention?.itbisPercepcion) {
      xml += `      <TotalITBISPercepcion>${fmt(input.retention.itbisPercepcion)}</TotalITBISPercepcion>\n`;
    }
    if (input.retention?.isrPercepcion) {
      xml += `      <TotalISRPercepcion>${fmt(input.retention.isrPercepcion)}</TotalISRPercepcion>\n`;
    }

    xml += `    </Totales>`;

    return xml;
  }

  private buildDetallesItem(items: InvoiceItemInput[], indicadorMontoGravado: number, typeCode?: number): string {
    let xml = '  <DetallesItems>\n';

    // Types that DON'T have TasaITBIS/MontoITBIS at item level (per their XSD)
    // E41 (Compras), E43 (Gastos Menores), E47 (Pagos Exterior) - no ITBIS fields in Item
    const noItemItbis = [41, 43, 47];
    const emitItbis = !typeCode || !noItemItbis.includes(typeCode);

    // Types that require Retencion block (E41 Compras - obligatorio)
    const requiresRetencion = typeCode === 41;

    items.forEach((item, index) => {
      const lineNum = item.lineNumber || index + 1;
      const qty = item.quantity;
      const price = item.unitPrice;
      const discount = item.discount || 0;
      const lineSubtotal = r2(qty * price - discount);
      const rate = item.itbisRate ?? ITBIS_RATES.STANDARD;
      const isExempt = item.indicadorFacturacion === 'E' || rate === 0;

      // Determine IndicadorFacturacion
      let indicadorFact: string;
      if (item.indicadorFacturacion !== undefined) {
        indicadorFact = String(item.indicadorFacturacion);
      } else if (rate === 0 || isExempt) {
        indicadorFact = 'E';
      } else if (rate === 18) {
        indicadorFact = item.goodService === 2 ? '2' : '1';
      } else if (rate === 16) {
        indicadorFact = item.goodService === 2 ? '4' : '3';
      } else {
        indicadorFact = '1';
      }

      xml += `    <Item>\n`;

      // === XSD FIELD ORDER (xs:sequence is STRICT) ===

      // 1. NumeroLinea
      xml += `      <NumeroLinea>${lineNum}</NumeroLinea>\n`;

      // 2. TablaCodigosItem (optional)
      if (item.code) {
        xml += `      <TablaCodigosItem>\n`;
        xml += `        <CodigosItem>\n`;
        xml += `          <TipoCodigo>${escapeXml(item.codeType || 'INT')}</TipoCodigo>\n`;
        xml += `          <CodigoItem>${escapeXml(item.code)}</CodigoItem>\n`;
        xml += `        </CodigosItem>\n`;
        xml += `      </TablaCodigosItem>\n`;
      }

      // 3. IndicadorFacturacion
      xml += `      <IndicadorFacturacion>${indicadorFact}</IndicadorFacturacion>\n`;

      // 4. Retencion (E41: obligatorio, otros XSD varían)
      if (requiresRetencion) {
        xml += `      <Retencion>\n`;
        xml += `        <IndicadorAgenteRetencionoPercepcion>${item.retencionIndicador || 0}</IndicadorAgenteRetencionoPercepcion>\n`;
        if (item.montoItbisRetenido) {
          xml += `        <MontoITBISRetenido>${fmt(item.montoItbisRetenido)}</MontoITBISRetenido>\n`;
        }
        if (item.montoIsrRetenido) {
          xml += `        <MontoISRRetenido>${fmt(item.montoIsrRetenido)}</MontoISRRetenido>\n`;
        }
        xml += `      </Retencion>\n`;
      }

      // 5. NombreItem
      xml += `      <NombreItem>${escapeXml(item.description)}</NombreItem>\n`;

      // 6. IndicadorBienoServicio (1=Bien, 2=Servicio)
      const bienServicio = item.goodService || 1;
      xml += `      <IndicadorBienoServicio>${bienServicio}</IndicadorBienoServicio>\n`;

      // 7. DescripcionItem (optional - longer description)
      if (item.longDescription) {
        xml += `      <DescripcionItem>${escapeXml(item.longDescription)}</DescripcionItem>\n`;
      }

      // 8. CantidadItem
      xml += `      <CantidadItem>${qty}</CantidadItem>\n`;

      // 9. UnidadMedida (optional)
      if (item.unitMeasureCode) {
        xml += `      <UnidadMedida>${item.unitMeasureCode}</UnidadMedida>\n`;
      } else if (item.unit) {
        xml += `      <UnidadMedida>${escapeXml(item.unit)}</UnidadMedida>\n`;
      }

      // 12. PrecioUnitarioItem (up to 4 decimals per DGII)
      xml += `      <PrecioUnitarioItem>${r4(price).toFixed(4)}</PrecioUnitarioItem>\n`;

      // 13. DescuentoMonto (optional)
      if (discount > 0) {
        xml += `      <DescuentoMonto>${fmt(discount)}</DescuentoMonto>\n`;
      }

      // 17. TablaImpuestoAdicional (ISC, optional)
      if (item.additionalTaxCode) {
        xml += `      <TablaImpuestoAdicional>\n`;
        xml += `        <CodigoImpuestoAdicional>${item.additionalTaxCode}</CodigoImpuestoAdicional>\n`;
        xml += `        <TasaImpuestoAdicional>${item.additionalTaxRate || 0}</TasaImpuestoAdicional>\n`;

        if (item.alcoholDegrees) {
          xml += `        <GradosAlcohol>${item.alcoholDegrees}</GradosAlcohol>\n`;
        }
        if (item.referenceQuantity) {
          xml += `        <CantidadReferencia>${item.referenceQuantity}</CantidadReferencia>\n`;
        }
        if (item.subQuantity) {
          xml += `        <Subcantidad>${ValidationService.formatSubQuantity(item.subQuantity)}</Subcantidad>\n`;
        }
        if (item.referenceUnitPrice) {
          xml += `        <PrecioUnitarioReferencia>${fmt(item.referenceUnitPrice)}</PrecioUnitarioReferencia>\n`;
        }

        const code = item.additionalTaxCode;
        if (isIscEspecificoAlcohol(code)) {
          const iscEsp = this.validationService.calculateIscEspecificoAlcohol(item);
          xml += `        <MontoImpuestoSelectivoConsumoEspecifico>${fmt(iscEsp)}</MontoImpuestoSelectivoConsumoEspecifico>\n`;
        }
        if (isIscEspecificoCigarrillo(code)) {
          const iscEsp = this.validationService.calculateIscEspecificoCigarrillo(item);
          xml += `        <MontoImpuestoSelectivoConsumoEspecifico>${fmt(iscEsp)}</MontoImpuestoSelectivoConsumoEspecifico>\n`;
        }
        if (isIscAdvaloremAlcohol(code)) {
          const iscEsp = this.validationService.calculateIscEspecificoAlcohol(item);
          const iscAdv = this.validationService.calculateIscAdvaloremAlcohol(
            item, iscEsp, rate, item.additionalTaxRate || 0,
          );
          xml += `        <MontoImpuestoSelectivoConsumoAdvalorem>${fmt(iscAdv)}</MontoImpuestoSelectivoConsumoAdvalorem>\n`;
        }
        if (isIscAdvaloremCigarrillo(code)) {
          const iscAdv = this.validationService.calculateIscAdvaloremCigarrillo(
            item, rate, item.additionalTaxRate || 0,
          );
          xml += `        <MontoImpuestoSelectivoConsumoAdvalorem>${fmt(iscAdv)}</MontoImpuestoSelectivoConsumoAdvalorem>\n`;
        }
        if (isOtrosImpuestos(code)) {
          const otros = this.validationService.calculateOtrosImpuestos(
            lineSubtotal, item.additionalTaxRate || 0,
            item.indicadorMontoGravado || indicadorMontoGravado, rate,
          );
          xml += `        <OtrosImpuestosAdicionales>${fmt(otros)}</OtrosImpuestosAdicionales>\n`;
        }

        xml += `      </TablaImpuestoAdicional>\n`;
      }

      // 18-19. TasaITBIS + MontoITBIS (conditional per type - NOT in E41, E43, E47 XSD)
      if (emitItbis && !isExempt && rate > 0) {
        const itbisAmount = r2(lineSubtotal * (rate / 100));
        xml += `      <TasaITBIS>${rate}</TasaITBIS>\n`;
        xml += `      <MontoITBIS>${fmt(itbisAmount)}</MontoITBIS>\n`;

        // 21. MontoItem: subtotal + ITBIS
        xml += `      <MontoItem>${fmt(r2(lineSubtotal + itbisAmount))}</MontoItem>\n`;
      } else {
        // 21. MontoItem: subtotal only (exempt or type without ITBIS fields)
        xml += `      <MontoItem>${fmt(lineSubtotal)}</MontoItem>\n`;
      }

      xml += `    </Item>\n`;
    });

    xml += '  </DetallesItems>';
    return xml;
  }

  private buildDescuentosORecargos(items: any[]): string {
    if (!items || items.length === 0) return '';

    let xml = '  <DescuentosORecargos>\n';

    items.forEach((item, index) => {
      xml += `    <DescuentoORecargo>\n`;
      xml += `      <NumeroLinea>${index + 1}</NumeroLinea>\n`;
      xml += `      <TipoAjuste>${item.isDiscount ? 'D' : 'R'}</TipoAjuste>\n`;
      xml += `      <DescripcionDescuentooRecargo>${escapeXml(item.description)}</DescripcionDescuentooRecargo>\n`;

      if (item.percentage) {
        xml += `      <ValorDescuentooRecargo>${item.percentage}</ValorDescuentooRecargo>\n`;
      }

      xml += `      <MontoDescuentooRecargo>${fmt(item.amount)}</MontoDescuentooRecargo>\n`;

      if (item.indicadorNorma1007) {
        xml += `      <IndicadorNorma1007>${item.indicadorNorma1007}</IndicadorNorma1007>\n`;
      }

      xml += `    </DescuentoORecargo>\n`;
    });

    xml += '  </DescuentosORecargos>';
    return xml;
  }

  private buildInformacionReferencia(ref: any): string {
    let xml = '  <InformacionReferencia>\n';
    xml += `    <NCFModificado>${escapeXml(ref.encf)}</NCFModificado>\n`;

    // RNCOtroContribuyente: when NC/ND references another contributor's e-CF
    if (ref.rncOtroContribuyente) {
      xml += `    <RNCOtroContribuyente>${escapeXml(ref.rncOtroContribuyente)}</RNCOtroContribuyente>\n`;
    }

    xml += `    <FechaNCFModificado>${ref.date}</FechaNCFModificado>\n`;
    xml += `    <CodigoModificacion>${ref.modificationCode}</CodigoModificacion>\n`;

    xml += '  </InformacionReferencia>';
    return xml;
  }

  private buildOtraMoneda(currency: any, totals: InvoiceTotals): string {
    const rate = currency.exchangeRate;

    let xml = '    <OtraMoneda>\n';
    xml += `      <TipoMoneda>${escapeXml(currency.code)}</TipoMoneda>\n`;
    xml += `      <TipoCambio>${ValidationService.formatExchangeRate(rate)}</TipoCambio>\n`;

    // MontoGravadoTotalOtraMoneda
    const gravadoTotal = r2(totals.taxableAmount18 + totals.taxableAmount16);
    xml += `      <MontoGravadoTotalOtraMoneda>${fmt(r2(gravadoTotal / rate))}</MontoGravadoTotalOtraMoneda>\n`;

    // Breakdown by rate
    if (totals.taxableAmount18 > 0) {
      xml += `      <MontoGravado1OtraMoneda>${fmt(r2(totals.taxableAmount18 / rate))}</MontoGravado1OtraMoneda>\n`;
    }
    if (totals.taxableAmount16 > 0) {
      xml += `      <MontoGravado2OtraMoneda>${fmt(r2(totals.taxableAmount16 / rate))}</MontoGravado2OtraMoneda>\n`;
    }
    if (totals.taxableAmount0 > 0) {
      xml += `      <MontoGravado3OtraMoneda>${fmt(r2(totals.taxableAmount0 / rate))}</MontoGravado3OtraMoneda>\n`;
    }

    // MontoExentoOtraMoneda
    if (totals.exemptAmount > 0) {
      xml += `      <MontoExentoOtraMoneda>${fmt(r2(totals.exemptAmount / rate))}</MontoExentoOtraMoneda>\n`;
    }

    // ITBIS totals in other currency
    if (totals.totalItbis > 0) {
      xml += `      <TotalITBISOtraMoneda>${fmt(r2(totals.totalItbis / rate))}</TotalITBISOtraMoneda>\n`;
    }
    if (totals.itbis18 > 0) {
      xml += `      <TotalITBIS1OtraMoneda>${fmt(r2(totals.itbis18 / rate))}</TotalITBIS1OtraMoneda>\n`;
    }
    if (totals.itbis16 > 0) {
      xml += `      <TotalITBIS2OtraMoneda>${fmt(r2(totals.itbis16 / rate))}</TotalITBIS2OtraMoneda>\n`;
    }
    if (totals.itbis0 > 0) {
      xml += `      <TotalITBIS3OtraMoneda>${fmt(r2(totals.itbis0 / rate))}</TotalITBIS3OtraMoneda>\n`;
    }

    // ISC in other currency
    if (totals.totalIsc > 0) {
      xml += `      <MontoImpuestoAdicionalOtraMoneda>${fmt(r2(totals.totalIsc / rate))}</MontoImpuestoAdicionalOtraMoneda>\n`;
    }

    // Total
    xml += `      <MontoTotalOtraMoneda>${fmt(r2(totals.totalAmount / rate))}</MontoTotalOtraMoneda>\n`;
    xml += '    </OtraMoneda>';

    return xml;
  }
  // ============================================================
  // E46 SPECIFIC: InformacionesAdicionales & Transporte
  // ============================================================

  private buildInformacionesAdicionales(info: any): string {
    let xml = '    <InformacionesAdicionales>\n';

    if (info.shipmentDate) {
      xml += `      <FechaEmbarque>${info.shipmentDate}</FechaEmbarque>\n`;
    }
    if (info.shipmentNumber) {
      xml += `      <NumeroEmbarque>${escapeXml(info.shipmentNumber)}</NumeroEmbarque>\n`;
    }
    if (info.containerNumber) {
      xml += `      <NumeroContenedor>${escapeXml(info.containerNumber)}</NumeroContenedor>\n`;
    }
    if (info.referenceNumber) {
      xml += `      <NumeroReferencia>${escapeXml(info.referenceNumber)}</NumeroReferencia>\n`;
    }
    if (info.portOfShipment) {
      xml += `      <NombrePuertoEmbarque>${escapeXml(info.portOfShipment)}</NombrePuertoEmbarque>\n`;
    }
    if (info.deliveryConditions) {
      xml += `      <CondicionesEntrega>${escapeXml(info.deliveryConditions)}</CondicionesEntrega>\n`;
    }
    if (info.totalFob) {
      xml += `      <TotalFob>${fmt(info.totalFob)}</TotalFob>\n`;
    }
    if (info.insurance) {
      xml += `      <Seguro>${fmt(info.insurance)}</Seguro>\n`;
    }
    if (info.freight) {
      xml += `      <Flete>${fmt(info.freight)}</Flete>\n`;
    }
    if (info.otherExpenses) {
      xml += `      <OtrosGastos>${fmt(info.otherExpenses)}</OtrosGastos>\n`;
    }
    if (info.totalCif) {
      xml += `      <TotalCif>${fmt(info.totalCif)}</TotalCif>\n`;
    }
    if (info.customsRegime) {
      xml += `      <RegimenAduanero>${escapeXml(info.customsRegime)}</RegimenAduanero>\n`;
    }
    if (info.departurePort) {
      xml += `      <NombrePuertoSalida>${escapeXml(info.departurePort)}</NombrePuertoSalida>\n`;
    }
    if (info.arrivalPort) {
      xml += `      <NombrePuertoDesembarque>${escapeXml(info.arrivalPort)}</NombrePuertoDesembarque>\n`;
    }

    xml += '    </InformacionesAdicionales>';
    return xml;
  }

  private buildTransporte(transport: any): string {
    let xml = '    <Transporte>\n';

    if (transport.viaTransporte) {
      xml += `      <ViaTransporte>${String(transport.viaTransporte).padStart(2, '0')}</ViaTransporte>\n`;
    }
    if (transport.countryOrigin) {
      xml += `      <PaisOrigen>${escapeXml(transport.countryOrigin)}</PaisOrigen>\n`;
    }
    if (transport.destinationAddress) {
      xml += `      <DireccionDestino>${escapeXml(transport.destinationAddress)}</DireccionDestino>\n`;
    }
    if (transport.countryDestination) {
      xml += `      <PaisDestino>${escapeXml(transport.countryDestination)}</PaisDestino>\n`;
    }
    if (transport.carrierRnc) {
      xml += `      <RNCIdentificacionCompaniaTransportista>${escapeXml(transport.carrierRnc)}</RNCIdentificacionCompaniaTransportista>\n`;
    }
    if (transport.carrierName) {
      xml += `      <NombreCompaniaTransportista>${escapeXml(transport.carrierName)}</NombreCompaniaTransportista>\n`;
    }
    if (transport.tripNumber) {
      xml += `      <NumeroViaje>${escapeXml(transport.tripNumber)}</NumeroViaje>\n`;
    }

    xml += '    </Transporte>';
    return xml;
  }

  /**
   * Parse DGII date format (DD-MM-YYYY) to Date object.
   * Also handles YYYY-MM-DD and ISO formats as fallback.
   */
  private parseDgiiDate(dateStr: string): Date {
    // Try DD-MM-YYYY
    const dgiiMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dgiiMatch) {
      return new Date(parseInt(dgiiMatch[3]), parseInt(dgiiMatch[2]) - 1, parseInt(dgiiMatch[1]));
    }
    // Fallback to native Date parsing (YYYY-MM-DD, ISO, etc.)
    return new Date(dateStr);
  }
}

// ============================================================
// HELPER TYPES AND FUNCTIONS
// ============================================================

export interface EmitterData {
  rnc: string;
  businessName: string;
  tradeName?: string;
  address?: string;
  municipality?: string;
  province?: string;
}

/** Escape XML special characters per DGII spec */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format date as DD-MM-YYYY (FechaValidationType per DGII XSD e-CF v1.0) */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Format time as HH:MM:SS */
function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Format datetime as DD-MM-YYYY HH:mm:ss (for QR/firma) */
export function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}
