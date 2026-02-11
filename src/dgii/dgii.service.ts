import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SigningService } from '../signing/signing.service';
import { DGII_ENDPOINTS, DGII_SERVICES, DGII_STATUS } from '../xml-builder/ecf-types';

/**
 * DGII Communication Service
 *
 * Handles ALL web services per DGII Descripción Técnica v1.6:
 *
 * 1. Autenticación: semilla → firma → token JWT (1 hour)
 * 2. Recepción e-CF: submit signed XML → TrackId
 * 3. Recepción RFCE: submit FC < 250K summary
 * 4. Consulta Resultado: poll TrackId for status
 * 5. Consulta Estado: check e-CF validity (for receivers)
 * 6. Consulta TrackId: get all TrackIds for an eNCF
 * 7. Anulación e-NCF: void unused sequences (ANECF)
 * 8. Aprobación Comercial: send/receive commercial approval
 * 9. Directorio Facturadores: list authorized electronic invoicers
 * 10. Estatus Servicios: check DGII service availability
 */
@Injectable()
export class DgiiService {
  private readonly logger = new Logger(DgiiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly signingService: SigningService,
  ) {}

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  async getToken(
    tenantId: string,
    companyId: string,
    privateKey: string,
    certificate: string,
    environment: string,
  ): Promise<string> {
    // Check cached token
    const cached = await this.prisma.dgiiToken.findFirst({
      where: {
        tenantId,
        companyId,
        environment: environment as any,
        expiresAt: { gt: new Date() },
      },
    });

    if (cached) {
      this.logger.debug(`Using cached DGII token for company ${companyId}`);
      return cached.token;
    }

    const baseUrl = this.getBaseUrl(environment);

    // Step 1: Request seed
    this.logger.debug(`Requesting seed from DGII (${environment})...`);
    const seedResponse = await this.httpGet(`${baseUrl}${DGII_SERVICES.SEED}`);

    if (!seedResponse.ok) {
      throw new ServiceUnavailableException(
        `DGII seed request failed: ${seedResponse.status} ${seedResponse.statusText}`,
      );
    }

    const seedXml = await seedResponse.text();

    // Step 2: Sign seed
    const { signedXml: signedSeed } = this.signingService.signXml(seedXml, privateKey, certificate);

    // Step 3: Validate signed seed → JWT
    this.logger.debug('Validating signed seed with DGII...');
    const tokenResponse = await this.httpPost(
      `${baseUrl}${DGII_SERVICES.VALIDATE_SEED}`,
      signedSeed,
      'application/xml',
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      throw new ServiceUnavailableException(
        `DGII token validation failed: ${tokenResponse.status} - ${errorBody}`,
      );
    }

    const tokenData = await tokenResponse.text();
    const token = this.extractToken(tokenData);

    if (!token) {
      throw new ServiceUnavailableException('Could not extract token from DGII response');
    }

    // Cache token (expires in 1 hour, cache for 55 min)
    const expiresAt = new Date(Date.now() + 55 * 60 * 1000);

    // Clean up expired tokens for this company
    await this.prisma.dgiiToken.deleteMany({
      where: { companyId, expiresAt: { lt: new Date() } },
    });

    await this.prisma.dgiiToken.create({
      data: { tenantId, companyId, token, environment: environment as any, expiresAt },
    });

    this.logger.log(`DGII token obtained for company ${companyId} (${environment})`);
    return token;
  }

  // ============================================================
  // SUBMIT e-CF (standard, full XML)
  // ============================================================

  async submitEcf(
    signedXml: string,
    fileName: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.SEND_ECF}`;

    this.logger.debug(`Submitting e-CF to DGII: ${fileName}`);

    const response = await this.httpPostMultipart(url, signedXml, token);
    const responseText = await response.text();

    if (!response.ok) {
      this.logger.error(`DGII submission failed: ${response.status} - ${responseText}`);
      return {
        success: false,
        trackId: null,
        status: DGII_STATUS.REJECTED,
        message: responseText,
        rawResponse: responseText,
      };
    }

    const trackId = this.extractTrackId(responseText);
    this.logger.log(`e-CF submitted. TrackId: ${trackId}`);

    return {
      success: true,
      trackId,
      status: DGII_STATUS.IN_PROCESS,
      message: 'Documento enviado, en proceso de validación',
      rawResponse: responseText,
    };
  }

  // ============================================================
  // SUBMIT RFCE (Resumen Factura Consumo < 250K)
  // ============================================================

  async submitRfce(
    rfceXml: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    const endpoints = DGII_ENDPOINTS[environment as keyof typeof DGII_ENDPOINTS];
    if (!endpoints) throw new BadRequestException(`Invalid DGII environment: ${environment}`);

    const url = `${endpoints.fc}${DGII_SERVICES.FC_RECEIVE}`;
    this.logger.debug('Submitting RFCE to DGII FC service...');

    const response = await this.httpPostMultipart(url, rfceXml, token);
    const responseText = await response.text();

    // Parse RFCE response (Aceptado, Rechazado, Aceptado Condicional)
    const status = this.parseRfceStatus(responseText);

    return {
      success: status !== DGII_STATUS.REJECTED,
      trackId: null, // RFCE doesn't return TrackId
      status,
      message: status === DGII_STATUS.ACCEPTED ? 'RFCE aceptado' :
               status === DGII_STATUS.CONDITIONAL ? 'RFCE aceptado condicional' :
               responseText,
      rawResponse: responseText,
    };
  }

  // ============================================================
  // ANULACIÓN DE SECUENCIAS (ANECF)
  // ============================================================

  /**
   * Submit ANECF (Anulación de e-NCF) to void unused sequences
   * or e-CF that were signed but not sent.
   */
  async submitAnecf(
    anecfXml: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.VOID}`;

    this.logger.debug('Submitting ANECF (void sequences) to DGII...');

    const response = await this.httpPostMultipart(url, anecfXml, token);
    const responseText = await response.text();

    return {
      success: response.ok,
      trackId: null,
      status: response.ok ? DGII_STATUS.ACCEPTED : DGII_STATUS.REJECTED,
      message: response.ok ? 'Secuencias anuladas exitosamente' : responseText,
      rawResponse: responseText,
    };
  }

  // ============================================================
  // QUERY STATUS (Consulta Resultado - for emisors)
  // ============================================================

  async queryStatus(
    trackId: string,
    token: string,
    environment: string,
  ): Promise<DgiiStatusResult> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.QUERY_TRACK}?trackid=${trackId}`;

    const response = await this.httpGet(url, {
      Authorization: `bearer ${token}`,
    });

    const responseText = await response.text();

    if (!response.ok) {
      this.logger.warn(`DGII status query failed: ${response.status}`);
      return {
        trackId,
        status: DGII_STATUS.NOT_FOUND,
        message: `Query failed: ${response.status}`,
        rawResponse: responseText,
      };
    }

    return this.parseStatusResponse(trackId, responseText);
  }

  // ============================================================
  // QUERY STATE (Consulta Estado - for receivers)
  // ============================================================

  async queryState(
    rncEmisor: string,
    encf: string,
    token: string,
    environment: string,
  ): Promise<DgiiStatusResult> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.QUERY_STATUS}?rnc=${rncEmisor}&encf=${encf}`;

    const response = await this.httpGet(url, {
      Authorization: `bearer ${token}`,
    });

    const responseText = await response.text();

    return {
      trackId: '',
      status: response.ok ? this.extractStatusCode(responseText) : DGII_STATUS.NOT_FOUND,
      message: responseText,
      rawResponse: responseText,
    };
  }

  // ============================================================
  // COMMERCIAL APPROVAL (Aprobación Comercial)
  // ============================================================

  async sendCommercialApproval(
    approvalXml: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.COMMERCIAL_APPROVAL}`;

    this.logger.debug('Submitting commercial approval to DGII...');

    const response = await this.httpPostMultipart(url, approvalXml, token);
    const responseText = await response.text();

    return {
      success: response.ok,
      trackId: null,
      status: response.ok ? DGII_STATUS.ACCEPTED : DGII_STATUS.REJECTED,
      message: responseText,
      rawResponse: responseText,
    };
  }

  /**
   * Send ARECF (Acuse de Recibo Electrónico) to DGII.
   */
  async sendArecf(
    arecfXml: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    // ARECF uses the same commercial approval endpoint
    return this.sendCommercialApproval(arecfXml, token, environment);
  }

  /**
   * Send ACECF (Aprobación Comercial Electrónica) to DGII.
   */
  async sendAcecf(
    acecfXml: string,
    token: string,
    environment: string,
  ): Promise<DgiiSubmissionResult> {
    return this.sendCommercialApproval(acecfXml, token, environment);
  }

  // ============================================================
  // DIRECTORY (Consulta Directorio Facturadores)
  // ============================================================

  async queryDirectory(
    token: string,
    environment: string,
    rnc?: string,
  ): Promise<DgiiDirectoryResult> {
    const baseUrl = this.getBaseUrl(environment);
    let url = `${baseUrl}${DGII_SERVICES.DIRECTORY}`;
    if (rnc) url += `?rnc=${rnc}`;

    const response = await this.httpGet(url, {
      Authorization: `bearer ${token}`,
    });

    const responseText = await response.text();

    return {
      success: response.ok,
      data: responseText,
      rawResponse: responseText,
    };
  }

  // ============================================================
  // STATUS CHECK (Consulta Estatus Servicios)
  // ============================================================

  /**
   * Check DGII service availability before submitting.
   * Recommended to call before batch operations.
   */
  async checkServiceStatus(environment: string): Promise<DgiiServiceStatus> {
    const baseUrl = this.getBaseUrl(environment);
    const url = `${baseUrl}${DGII_SERVICES.STATUS_CHECK}`;

    try {
      const response = await this.httpGet(url);
      const responseText = await response.text();

      return {
        available: response.ok,
        message: responseText,
        environment,
        checkedAt: new Date(),
      };
    } catch (error: any) {
      return {
        available: false,
        message: error.message,
        environment,
        checkedAt: new Date(),
      };
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private getBaseUrl(environment: string): string {
    const endpoints = DGII_ENDPOINTS[environment as keyof typeof DGII_ENDPOINTS];
    if (!endpoints) throw new BadRequestException(`Invalid DGII environment: ${environment}`);
    return endpoints.base;
  }

  private extractToken(responseText: string): string | null {
    const tokenMatch = responseText.match(/<token>([\s\S]*?)<\/token>/i);
    if (tokenMatch) return tokenMatch[1].trim();

    // Try JSON
    try {
      const json = JSON.parse(responseText);
      return json.token || json.Token || null;
    } catch {}

    const trimmed = responseText.trim();
    if (trimmed.length > 20 && !trimmed.includes('<')) return trimmed;
    return null;
  }

  private extractTrackId(responseText: string): string | null {
    const match = responseText.match(/<trackId>([\s\S]*?)<\/trackId>/i);
    if (match) return match[1].trim();

    try {
      const json = JSON.parse(responseText);
      return json.trackId || json.TrackId || null;
    } catch {}

    return responseText.trim() || null;
  }

  private extractStatusCode(responseText: string): number {
    try {
      const json = JSON.parse(responseText);
      return json.estado ?? json.status ?? DGII_STATUS.NOT_FOUND;
    } catch {}

    const match = responseText.match(/<estado>(\d+)<\/estado>/i);
    return match ? parseInt(match[1], 10) : DGII_STATUS.NOT_FOUND;
  }

  private parseRfceStatus(responseText: string): number {
    // RFCE returns: Aceptado, Rechazado, Aceptado Condicional
    const lower = responseText.toLowerCase();
    if (lower.includes('aceptado condicional')) return DGII_STATUS.CONDITIONAL;
    if (lower.includes('aceptado')) return DGII_STATUS.ACCEPTED;
    if (lower.includes('rechazado')) return DGII_STATUS.REJECTED;
    return this.extractStatusCode(responseText);
  }

  private parseStatusResponse(trackId: string, responseText: string): DgiiStatusResult {
    try {
      const json = JSON.parse(responseText);
      return {
        trackId,
        status: json.estado ?? json.status ?? DGII_STATUS.NOT_FOUND,
        message: json.mensaje || json.message || '',
        encf: json.encf,
        secuenciaUtilizada: json.secuenciaUtilizada,
        rawResponse: responseText,
      };
    } catch {
      const statusMatch = responseText.match(/<estado>(\d+)<\/estado>/i);
      const msgMatch = responseText.match(/<mensaje>([\s\S]*?)<\/mensaje>/i);
      const seqMatch = responseText.match(/<secuenciaUtilizada>(true|false)<\/secuenciaUtilizada>/i);

      return {
        trackId,
        status: statusMatch ? parseInt(statusMatch[1], 10) : DGII_STATUS.NOT_FOUND,
        message: msgMatch ? msgMatch[1].trim() : responseText,
        secuenciaUtilizada: seqMatch ? seqMatch[1] === 'true' : undefined,
        rawResponse: responseText,
      };
    }
  }

  /**
   * HTTP POST as multipart/form-data (how DGII expects XML submissions).
   */
  private async httpPostMultipart(
    url: string,
    xmlContent: string,
    token: string,
  ): Promise<Response> {
    try {
      // DGII expects multipart/form-data with 'xml' field
      const boundary = `----ECFBoundary${Date.now()}`;
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="xml"; filename="ecf.xml"',
        'Content-Type: text/xml',
        '',
        xmlContent,
        `--${boundary}--`,
      ].join('\r\n');

      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `bearer ${token}`,
          Accept: 'application/json',
        },
        body,
      });
    } catch (error: any) {
      this.logger.error(`HTTP POST failed: ${url} - ${error.message}`);
      throw new ServiceUnavailableException(
        `No se pudo conectar con DGII: ${error.message}`,
      );
    }
  }

  private async httpGet(url: string, headers?: Record<string, string>): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/xml, application/json',
          ...headers,
        },
      });
    } catch (error: any) {
      this.logger.error(`HTTP GET failed: ${url} - ${error.message}`);
      throw new ServiceUnavailableException(
        `No se pudo conectar con DGII: ${error.message}`,
      );
    }
  }

  private async httpPost(
    url: string,
    body: string,
    contentType: string,
    headers?: Record<string, string>,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          Accept: 'application/xml, application/json',
          ...headers,
        },
        body,
      });
    } catch (error: any) {
      this.logger.error(`HTTP POST failed: ${url} - ${error.message}`);
      throw new ServiceUnavailableException(
        `No se pudo conectar con DGII: ${error.message}`,
      );
    }
  }
}

// ============================================================
// RESULT TYPES
// ============================================================

export interface DgiiSubmissionResult {
  success: boolean;
  trackId: string | null;
  status: number;
  message: string;
  rawResponse: string;
}

export interface DgiiStatusResult {
  trackId: string;
  status: number;
  message: string;
  encf?: string;
  secuenciaUtilizada?: boolean;
  rawResponse: string;
}

export interface DgiiDirectoryResult {
  success: boolean;
  data: string;
  rawResponse: string;
}

export interface DgiiServiceStatus {
  available: boolean;
  message: string;
  environment: string;
  checkedAt: Date;
}
