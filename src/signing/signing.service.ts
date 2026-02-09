import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  buildStandardQrUrl,
  buildFcUnder250kQrUrl,
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

    // 1. Add FechaHoraFirma (Section G - OBLIGATORY per XSD e-CF 32 v1.0)
    //    Type: DateTimeValidationType, format: dd-MM-YYYY HH:mm:ss
    const xmlWithTimestamp = xml.replace(
      '</ECF>',
      `<FechaHoraFirma>${formatDateTimeFirma(signTime)}</FechaHoraFirma>\n</ECF>`,
    );

    // 2. Remove XML declaration for digest computation
    const xmlWithoutDeclaration = xmlWithTimestamp.replace(/<\?xml[^?]*\?>\s*/, '');

    // 3. Compute digest of document WITH FechaHoraFirma, WITHOUT Signature
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

    // 8. Insert Signature as last child before </ECF>
    //    XSD order: ... FechaHoraFirma → <xs:any> (Signature) → </ECF>
    const signedXml = xmlWithTimestamp.replace('</ECF>', `${signatureXml}\n</ECF>`);

    // 9. Generate security code per DGII
    const securityCode = this.generateSecurityCode(signatureValue);

    this.logger.debug(`XML signed. Security code: ${securityCode}, Time: ${formatDateTimeFirma(signTime)}`);

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
  }): string {
    if (params.isFcUnder250k) {
      return buildFcUnder250kQrUrl({
        rncEmisor: params.rncEmisor,
        encf: params.encf,
        montoTotal: params.montoTotal.toFixed(2),
        codigoSeguridad: params.securityCode,
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
    });
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
    return hash.substring(0, 6).toUpperCase();
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
   */
  extractFromP12(
    p12Buffer: Buffer,
    passphrase: string,
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

    const certificate = forge.pki.certificateToPem(certBag[0].cert);

    this.logger.debug('P12 extracted successfully: key + certificate');
    return { privateKey, certificate };
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

/** Format date as DD-MM-YYYY (DGII standard) */
function formatDateDgii(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Format datetime as DD-MM-YYYY HH:mm:ss (for FechaFirma and QR) */
function formatDateTimeFirma(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
}
