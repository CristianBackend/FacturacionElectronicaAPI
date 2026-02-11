import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadCertificateDto } from './dto/certificate.dto';
import * as crypto from 'crypto';

/**
 * Certificate info extracted from .p12 file
 */
interface CertificateInfo {
  fingerprint: string;
  issuer: string;
  subject: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  /**
   * Encryption key derived from JWT_SECRET for local dev.
   * In production, this would use AWS KMS envelope encryption.
   */
  private readonly encryptionKey: Buffer;

  constructor(private readonly prisma: PrismaService) {
    // Derive a 256-bit key from environment secret
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      const fallback = process.env.NODE_ENV === 'production' ? null : 'dev-secret-do-not-use-in-prod';
      if (!fallback) {
        throw new Error('JWT_SECRET environment variable is required in production for certificate encryption');
      }
      this.encryptionKey = crypto.createHash('sha256').update(fallback).digest();
    } else {
      this.encryptionKey = crypto.createHash('sha256').update(secret).digest();
    }
  }

  /**
   * Upload and store a .p12 certificate.
   * The certificate is encrypted at rest using AES-256-GCM.
   * In production, AWS KMS envelope encryption would be used instead.
   */
  async upload(tenantId: string, dto: UploadCertificateDto) {
    // Verify company belongs to tenant
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, tenantId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Decode base64
    let p12Buffer: Buffer;
    try {
      p12Buffer = Buffer.from(dto.p12Base64, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 encoding for .p12 file');
    }

    if (p12Buffer.length < 100) {
      throw new BadRequestException('File too small to be a valid .p12 certificate');
    }

    if (p12Buffer.length > 50 * 1024) {
      throw new BadRequestException('File too large (max 50KB for .p12)');
    }

    // Extract certificate info
    // Note: In production, use node-forge to properly parse the .p12
    // For now, generate a fingerprint from the file content
    const certInfo = this.extractCertInfo(p12Buffer, dto.passphrase);

    // Encrypt the .p12 file
    const encryptedP12 = this.encrypt(p12Buffer);

    // Encrypt the passphrase
    const encryptedPass = this.encryptString(dto.passphrase);

    // Deactivate previous certificates for this company
    await this.prisma.certificate.updateMany({
      where: { companyId: dto.companyId, tenantId, isActive: true },
      data: { isActive: false },
    });

    // Store encrypted certificate
    const certificate = await this.prisma.certificate.create({
      data: {
        tenantId,
        companyId: dto.companyId,
        encryptedP12: encryptedP12,
        encryptedPass: encryptedPass,
        fingerprint: certInfo.fingerprint,
        issuer: certInfo.issuer,
        subject: certInfo.subject,
        serialNumber: certInfo.serialNumber,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        isActive: true,
      },
    });

    this.logger.log(
      `Certificate uploaded for company ${dto.companyId}: ${certInfo.fingerprint}`,
    );

    return {
      id: certificate.id,
      fingerprint: certificate.fingerprint,
      issuer: certificate.issuer,
      subject: certificate.subject,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo,
      isActive: certificate.isActive,
      message: 'Certificado almacenado y encriptado exitosamente',
    };
  }

  /**
   * Get active certificate for a company (metadata only)
   */
  async getActive(tenantId: string, companyId: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { tenantId, companyId, isActive: true },
      select: {
        id: true,
        fingerprint: true,
        issuer: true,
        subject: true,
        serialNumber: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!cert) {
      throw new NotFoundException('No active certificate found for this company');
    }

    // Add expiration warning
    const daysToExpiry = Math.ceil(
      (cert.validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    return {
      ...cert,
      daysToExpiry,
      expiryWarning: daysToExpiry <= 30 ? '⚠️ Certificado próximo a vencer' : null,
    };
  }

  /**
   * List all certificates for a company
   */
  async findAll(tenantId: string, companyId: string) {
    return this.prisma.certificate.findMany({
      where: { tenantId, companyId },
      select: {
        id: true,
        fingerprint: true,
        issuer: true,
        subject: true,
        validFrom: true,
        validTo: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Decrypt and return the .p12 buffer + passphrase for signing.
   * Used internally by the signing module - never exposed to API.
   */
  async getDecryptedCertificate(
    tenantId: string,
    companyId: string,
  ): Promise<{ p12Buffer: Buffer; passphrase: string }> {
    const cert = await this.prisma.certificate.findFirst({
      where: { tenantId, companyId, isActive: true },
    });

    if (!cert) {
      throw new NotFoundException('No active certificate found');
    }

    // Check expiration
    if (cert.validTo < new Date()) {
      throw new BadRequestException('Certificate has expired');
    }

    const p12Buffer = this.decrypt(cert.encryptedP12);
    const passphrase = this.decryptString(cert.encryptedPass);

    return { p12Buffer, passphrase };
  }

  // ========================
  // Private helper methods
  // ========================

  /**
   * Extract certificate metadata from .p12 file using node-forge.
   * Parses the PKCS#12 to get real issuer, subject, serial, and validity dates.
   */
  private extractCertInfo(p12Buffer: Buffer, passphrase: string): CertificateInfo {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const forge = require('node-forge');

    let p12: any;
    try {
      const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
    } catch (error: any) {
      throw new BadRequestException(
        `No se pudo abrir el certificado .p12. Verifique la contraseña. Error: ${error.message}`,
      );
    }

    // Extract certificate
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || certBag.length === 0) {
      throw new BadRequestException('El archivo .p12 no contiene un certificado válido');
    }

    const cert = certBag[0].cert;

    // Verify private key exists
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

    if (!keyBag || keyBag.length === 0) {
      throw new BadRequestException('El archivo .p12 no contiene una llave privada');
    }

    // Extract real metadata
    const fingerprint = forge.md.sha256
      .create()
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
      .digest()
      .toHex()
      .substring(0, 40);

    const getAttr = (attrs: any[], shortName: string): string => {
      const attr = attrs.find((a: any) => a.shortName === shortName);
      return attr ? attr.value : '';
    };

    const issuerAttrs = cert.issuer.attributes;
    const subjectAttrs = cert.subject.attributes;

    const issuer = [
      getAttr(issuerAttrs, 'CN'),
      getAttr(issuerAttrs, 'O'),
    ].filter(Boolean).join(', ') || 'Unknown Issuer';

    const subject = [
      getAttr(subjectAttrs, 'CN'),
      getAttr(subjectAttrs, 'O'),
    ].filter(Boolean).join(', ') || 'Unknown Subject';

    const serialNumber = cert.serialNumber || 'Unknown';

    this.logger.log(
      `Certificate parsed: subject="${subject}", issuer="${issuer}", ` +
      `valid ${cert.validity.notBefore.toISOString()} → ${cert.validity.notAfter.toISOString()}`,
    );

    return {
      fingerprint,
      issuer,
      subject,
      serialNumber,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
    };
  }

  /**
   * Encrypt binary data with AES-256-GCM
   */
  private encrypt(data: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: iv (16) + authTag (16) + encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt binary data with AES-256-GCM
   */
  private decrypt(encryptedData: Buffer): Buffer {
    const iv = encryptedData.subarray(0, 16);
    const authTag = encryptedData.subarray(16, 32);
    const data = encryptedData.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  /**
   * Encrypt a string and return base64
   */
  private encryptString(text: string): string {
    const encrypted = this.encrypt(Buffer.from(text, 'utf8'));
    return encrypted.toString('base64');
  }

  /**
   * Decrypt a base64 string
   */
  private decryptString(encryptedBase64: string): string {
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decrypted = this.decrypt(encrypted);
    return decrypted.toString('utf8');
  }
}
