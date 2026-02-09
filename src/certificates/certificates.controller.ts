import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { UploadCertificateDto } from './dto/certificate.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/scopes.decorator';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';
import { ApiKeyScope } from '@prisma/client';

@ApiTags('certificates')
@Controller('companies/:companyId/certificates')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  @RequireScopes(ApiKeyScope.CERTIFICATES_WRITE)
  @ApiOperation({ summary: 'Subir certificado .p12 (encriptado en Base64)' })
  async upload(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
    @Body() dto: UploadCertificateDto,
  ) {
    // Override companyId from URL param
    dto.companyId = companyId;
    return this.certificatesService.upload(tenant.id, dto);
  }

  @Get()
  @RequireScopes(ApiKeyScope.COMPANIES_READ)
  @ApiOperation({ summary: 'Listar certificados de una empresa' })
  async findAll(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
  ) {
    return this.certificatesService.findAll(tenant.id, companyId);
  }

  @Get('active')
  @RequireScopes(ApiKeyScope.COMPANIES_READ)
  @ApiOperation({ summary: 'Ver certificado activo de una empresa' })
  async getActive(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
  ) {
    return this.certificatesService.getActive(tenant.id, companyId);
  }
}
