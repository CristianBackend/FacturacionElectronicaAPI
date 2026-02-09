import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/scopes.decorator';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';
import { ApiKeyScope } from '@prisma/client';

@ApiTags('companies')
@Controller('companies')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @RequireScopes(ApiKeyScope.COMPANIES_WRITE)
  @ApiOperation({ summary: 'Registrar empresa emisora' })
  async create(
    @CurrentTenant() tenant: RequestTenant,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(tenant.id, dto);
  }

  @Get()
  @RequireScopes(ApiKeyScope.COMPANIES_READ)
  @ApiOperation({ summary: 'Listar empresas del tenant' })
  async findAll(@CurrentTenant() tenant: RequestTenant) {
    return this.companiesService.findAll(tenant.id);
  }

  @Get(':id')
  @RequireScopes(ApiKeyScope.COMPANIES_READ)
  @ApiOperation({ summary: 'Ver detalle de una empresa' })
  async findOne(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') companyId: string,
  ) {
    return this.companiesService.findOne(tenant.id, companyId);
  }

  @Patch(':id')
  @RequireScopes(ApiKeyScope.COMPANIES_WRITE)
  @ApiOperation({ summary: 'Actualizar empresa' })
  async update(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') companyId: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(tenant.id, companyId, dto);
  }

  @Delete(':id')
  @RequireScopes(ApiKeyScope.COMPANIES_WRITE)
  @ApiOperation({ summary: 'Desactivar empresa' })
  async deactivate(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') companyId: string,
  ) {
    return this.companiesService.deactivate(tenant.id, companyId);
  }
}
