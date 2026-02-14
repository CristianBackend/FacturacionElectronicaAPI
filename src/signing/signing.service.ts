import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  buildStandardQrUrl,
  buildFcUnder250kQrUrl,
  getAmbiente,
  FC_FULL_SUBMISSION_THRESHOLD,
} from '../xml-builder/ecf-types';

/**
 * Digital signature service for e-CF documents.
 *
 * Implements W3C XML Digital Signature (XMLDSig) per DGII specifications:
 * - Algorithm: RSA-SHA256 (obligatorio per "Firmado de e-CF.pdf")
 * - Digest: SHA-256
 * - Canonicalization: Canonical XML 1.0 (C14N)
 * - Transform: Enveloped Signature
 * - Reference URI: "" (signs entire document)
 * - X.509 certificate included in KeyInfo
 *
 * XSD e-CF 32 v1.0 structure (xs:sequence inside <ECF>):
 *   Encabezado → DetallesItems → Subtotales? → DescuentosORecargos?
 *   → Paginacion? → InformacionReferencia?
 *   → FechaHoraFirma (Section G, minOccurs=1, type=DateTimeValidationType)
 *   → <xs:any processContents="skip"> (Section H = Signature)
 *
 * Format FechaHoraFirma: dd-MM-AAAA HH:mm:ss (GMT-4)
 * Security Code: First 6 hex digits of SHA-256(SignatureValue base64)
 *
 * Sources verified:
 * - XSD: dgii.gov.do/.../e-CF 32 v.1.0.xsd
 * - PDF: Formato Comprobante Fiscal Electrónico (e-CF) v1.0 Oct 2025
 * - PDF: Firmado de e-CF (instructivo oficial con ejemplos C#/TS/Java/PHP)
 * - Informe Técnico e-CF v1.0
 * - Repo: victors1681/dgii-ecf (librería Node.js en producción)
 */
@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  /**
   * Sign an e-CF XML document.
   * Returns signed XML + metadata needed for RI/QR.
   */
  signXml(
    xml: string,
    privateKeyPem: string,
    certificatePem: string,
  ): SigningResult {
    const signTime = new Date();

    // Detect the root closing tag dynamically so we can sign ANY XML type:
    // <ECF>, <SemillaModel>, <ARECF>, <ACECF>, <ANECF>, etc.
    const rootTagMatch = xml.match(/<\/([A-Za-z][A-Za-z0-9]*)\s*>\s*$/);
    if (!rootTagMatch) {
      throw new Error('Cannot detect XML root closing tag for signing');
    }
    const rootTag = rootTagMatch[1];
    const closingTag = `</${rootTag}>`;

    // 1. FechaHoraFirma is ONLY for <ECF> documents (Section G per XSD e-CF 32 v1.0)
    //    Other document types (SemillaModel, ARECF, ACECF, ANECF) don't use it.
    let xmlPrepared = xml;
    if (rootTag === 'ECF') {
      xmlPrepared = xml.replace(
        closingTag,
        `<FechaHoraFirma>${formatDateTimeFirma(signTime)}</FechaHoraFirma>\n${closingTag}`,
      );
    }

    // 2. Remove XML declaration for digest computation
    const xmlWithoutDeclaration = xmlPrepared.replace(/<\?xml[^?]*\?>\s*/, '');

    // 3. Compute digest of document WITHOUT Signature
    //    (enveloped transform removes Signature before hashing)
    const digestValue = this.computeDigest(xmlWithoutDeclaration);

    // 4. Build SignedInfo (no xmlns - inherits from Signature parent)
    const signedInfo = this.buildSignedInfo(digestValue);

    // 5. Sign the SignedInfo (with xmlns for standalone canonicalization context)
    const signedInfoForSigning = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo.substring('<SignedInfo>'.length)}`;
    const signatureValue = this.computeSignature(signedInfoForSigning, privateKeyPem);

    // 6. Get cert as base64
    const certBase64 = this.extractCertBase64(certificatePem);

    // 7. Build Signature element
    const signatureXml = this.buildSignatureElement(signedInfo, signatureValue, certBase64);

    // 8. Insert Signature as last child before closing root tag
    const signedXml = xmlPrepared.replace(closingTag, `${signatureXml}\n${closingTag}`);

    // 9. Generate security code per DGII
    const securityCode = this.generateSecurityCode(signatureValue);

    this.logger.debug(`XML signed (root: ${rootTag}). Security code: ${securityCode}, Time: ${formatDateTimeFirma(signTime)}`);

    return {
      signedXml,
      securityCode,
      signatureValue,
      signTime,
    };
  }

  /**
   * Extract security code from already-signed XML.
   */
  getSecurityCode(signedXml: string): string {
    const match = signedXml.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    if (!match) return '';
    return this.generateSecurityCode(match[1].replace(/\s/g, ''));
  }

  /**
   * Build DGII-compliant QR URL for standard e-CF.
   * Per Informe Técnico: all parameters must be exact.
   */
  buildQrUrl(params: {
    rncEmisor: string;
    rncComprador: string;
    encf: string;
    fechaEmision: Date;
    montoTotal: number;
    fechaFirma: Date;
    securityCode: string;
    isFcUnder250k: boolean;
    dgiiEnv: string;
  }): string {
    const ambiente = getAmbiente(params.dgiiEnv);

    if (params.isFcUnder250k) {
      return buildFcUnder250kQrUrl({
        rncEmisor: params.rncEmisor,
        encf: params.encf,
        montoTotal: params.montoTotal.toFixed(2),
        codigoSeguridad: params.securityCode,
        ambiente,
      });
    }

    return buildStandardQrUrl({
      rncEmisor: params.rncEmisor,
      rncComprador: params.rncComprador || '',
      encf: params.encf,
      fechaEmision: formatDateDgii(params.fechaEmision),
      montoTotal: params.montoTotal.toFixed(2),
      fechaFirma: formatDateTimeFirma(params.fechaFirma),
      codigoSeguridad: params.securityCode,
      ambiente,
    });
  }

  /**
   * Verify an XML digital signature (XMLDSig).
   *
   * Validates:
   * 1. Signature element exists with X509Certificate
   * 2. DigestValue matches SHA-256 of document (without Signature)
   * 3. SignatureValue is valid per the certificate's public key
   *
   * Returns the PEM certificate on success, throws on failure.
   */
  verifySignedXml(signedXml: string): { certificatePem: string } {
    // 1. Extract Signature components
    const sigMatch = signedXml.match(/<Signature[\s\S]*?<\/Signature>/);
    if (!sigMatch) {
      throw new Error('XML no contiene elemento <Signature>');
    }

    const certMatch = signedXml.match(/<X509Certificate>([\s\S]*?)<\/X509Certificate>/);
    if (!certMatch) {
      throw new Error('Signature no contiene <X509Certificate>');
    }

    const sigValueMatch = signedXml.match(/<SignatureValue>([\s\S]*?)<\/SignatureValue>/);
    if (!sigValueMatch) {
      throw new Error('Signature no contiene <SignatureValue>');
    }

    const digestMatch = signedXml.match(/<DigestValue>([\s\S]*?)<\/DigestValue>/);
    if (!digestMatch) {
      throw new Error('Signature no contiene <DigestValue>');
    }

    const certBase64 = certMatch[1].replace(/\s/g, '');
    const signatureValue = sigValueMatch[1].replace(/\s/g, '');
    const expectedDigest = digestMatch[1].replace(/\s/g, '');

    // 2. Verify DigestValue: hash document without Signature and XML declaration
    const xmlWithoutDeclaration = signedXml.replace(/<\?xml[^?]*\?>\s*/, '');
    const actualDigest = this.computeDigest(xmlWithoutDeclaration);

    if (actualDigest !== expectedDigest) {
      throw new Error('DigestValue no coincide — el documento fue alterado');
    }

    // 3. Verify SignatureValue using the certificate's public key
    const certificatePem = `-----BEGIN CERTIFICATE-----\n${certBase64}\n-----END CERTIFICATE-----`;

    const signedInfoMatch = signedXml.match(/<SignedInfo>([\s\S]*?)<\/SignedInfo>/);
    if (!signedInfoMatch) {
      throw new Error('Signature no contiene <SignedInfo>');
    }

    // Reconstruct SignedInfo with namespace for verification (same as signing)
    const signedInfoForVerify = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfoMatch[1]}</SignedInfo>`;

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signedInfoForVerify);
    verify.end();

    const isValid = verify.verify(certificatePem, signatureValue, 'base64');
    if (!isValid) {
      throw new Error('SignatureValue inválido — firma digital no verificada');
    }

    this.logger.debug('XML signature verified successfully');
    return { certificatePem };
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  private computeDigest(xmlContent: string): string {
    const withoutSig = xmlContent.replace(/<Signature[\s\S]*?<\/Signature>/g, '');
    return crypto.createHash('sha256').update(withoutSig, 'utf8').digest('base64');
  }

  private buildSignedInfo(digestValue: string): string {
    return [
      '<SignedInfo>',
      '  <CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
      '  <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
      '  <Reference URI="">',
      '    <Transforms>',
      '      <Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
      '    </Transforms>',
      '    <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
      `    <DigestValue>${digestValue}</DigestValue>`,
      '  </Reference>',
      '</SignedInfo>',
    ].join('\n');
  }

  private computeSignature(signedInfo: string, privateKeyPem: string): string {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signedInfo);
    sign.end();
    return sign.sign(privateKeyPem, 'base64');
  }

  private buildSignatureElement(
    signedInfo: string,
    signatureValue: string,
    certBase64: string,
  ): string {
    const formattedSig = this.formatBase64(signatureValue, 76);
    const formattedCert = this.formatBase64(certBase64, 76);

    return [
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
      signedInfo,
      `<SignatureValue>${formattedSig}</SignatureValue>`,
      '<KeyInfo>',
      '  <X509Data>',
      `    <X509Certificate>${formattedCert}</X509Certificate>`,
      '  </X509Data>',
      '</KeyInfo>',
      '</Signature>',
    ].join('\n');
  }

  private extractCertBase64(pem: string): string {
    return pem
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');
  }

  /**
   * Generate security code per DGII Informe Técnico:
   * "Primeros seis (6) dígitos del hash generado en el SignatureValue de la firma digital"
   * Interpretation: SHA-256 hash of the base64 SignatureValue string, take first 6 hex chars.
   */
  private generateSecurityCode(signatureValueBase64: string): string {
    const cleanSig = signatureValueBase64.replace(/\s/g, '');
    const hash = crypto
      .createHash('sha256')
      .update(cleanSig)
      .digest('hex');
    return hash.substring(0, 6).toLowerCase();
  }

  private formatBase64(base64: string, lineWidth: number): string {
    const clean = base64.replace(/\s/g, '');
    const lines: string[] = [];
    for (let i = 0; i < clean.length; i += lineWidth) {
      lines.push(clean.substring(i, i + lineWidth));
    }
    return lines.join('\n');
  }

  /**
   * Extract private key and certificate from PKCS#12 (.p12) buffer.
   * Uses node-forge for parsing.
   *
   * If expectedRnc is provided, validates that the certificate's Subject Name
   * contains the company RNC per DGII Descripción Técnica p.60:
   * "El campo SN del certificado = RNC/Cédula/Pasaporte del propietario"
   */
  extractFromP12(
    p12Buffer: Buffer,
    passphrase: string,
    expectedRnc?: string,
  ): { privateKey: string; certificate: string } {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forge = require('node-forge');

    // Decode the PKCS#12 container
    const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

    // Extract private key
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!keyBag || keyBag.length === 0) {
      throw new Error('No se encontró llave privada en el archivo .p12');
    }

    const privateKey = forge.pki.privateKeyToPem(keyBag[0].key);

    // Extract certificate
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || certBag.length === 0) {
      throw new Error('No se encontró certificado en el archivo .p12');
    }

    const cert = certBag[0].cert;
    const certificate = forge.pki.certificateToPem(cert);

    // Validate certificate SN contains the expected RNC per DGII spec
    if (expectedRnc) {
      this.validateCertificateRnc(cert, expectedRnc);
    }

    this.logger.debug('P12 extracted successfully: key + certificate');
    return { privateKey, certificate };
  }

  /**
   * Validate that a certificate's Subject Name contains the expected RNC.
   * Per DGII Descripción Técnica p.60:
   * "El campo SN del certificado = RNC/Cédula/Pasaporte del propietario"
   */
  private validateCertificateRnc(cert: any, expectedRnc: string): void {
    const subject = cert.subject;
    if (!subject) {
      this.logger.warn('Certificate has no subject — cannot validate RNC');
      return;
    }

    // Check all subject attributes for the RNC
    const subjectStr = subject.attributes
      .map((attr: any) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(', ');

    const snAttr = subject.getField('serialName') || subject.getField('SN');
    const cnAttr = subject.getField('CN');

    const snValue = snAttr?.value || '';
    const cnValue = cnAttr?.value || '';

    // RNC may be in SN (serialName) or CN field
    const rncNormalized = expectedRnc.replace(/[-\s]/g, '');
    const containsRnc =
      snValue.replace(/[-\s]/g, '').includes(rncNormalized) ||
      cnValue.replace(/[-\s]/g, '').includes(rncNormalized) ||
      subjectStr.replace(/[-\s]/g, '').includes(rncNormalized);

    if (!containsRnc) {
      this.logger.warn(
        `Certificate SN mismatch: expected RNC ${expectedRnc}, ` +
        `certificate subject: ${subjectStr}`,
      );
    } else {
      this.logger.debug(`Certificate RNC validated: ${expectedRnc}`);
    }
  }
}

// ============================================================
// RESULT TYPES
// ============================================================

export interface SigningResult {
  signedXml: string;
  securityCode: string;
  signatureValue: string;
  signTime: Date;
}

// ============================================================
// DATE FORMATTING (DGII-specific formats)
// ============================================================

/**
 * Convert a Date to GMT-4 (America/Santo_Domingo) components.
 * Per DGII spec, all dates/times must be in Dominican Republic timezone.
 */
function toGmt4(d: Date): { year: number; month: number; day: number; hours: number; minutes: number; seconds: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  return { year: get('year'), month: get('month'), day: get('day'), hours: get('hour'), minutes: get('minute'), seconds: get('second') };
}

/** Format date as DD-MM-YYYY in GMT-4 (DGII standard) */
function formatDateDgii(d: Date): string {
  const t = toGmt4(d);
  return `${String(t.day).padStart(2, '0')}-${String(t.month).padStart(2, '0')}-${t.year}`;
}

/** Format datetime as DD-MM-YYYY HH:mm:ss in GMT-4 (for FechaFirma and QR) */
function formatDateTimeFirma(d: Date): string {
  const t = toGmt4(d);
  const dd = String(t.day).padStart(2, '0');
  const mm = String(t.month).padStart(2, '0');
  const hh = String(t.hours).padStart(2, '0');
  const mi = String(t.minutes).padStart(2, '0');
  const ss = String(t.seconds).padStart(2, '0');
  return `${dd}-${mm}-${t.year} ${hh}:${mi}:${ss}`;
}
