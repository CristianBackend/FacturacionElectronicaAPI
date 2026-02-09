import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * Public endpoint - no auth required.
   * Creates a new tenant and returns initial API keys.
   */
  @Post('register')
  @ApiOperation({ summary: 'Registrar nuevo tenant (público)' })
  @ApiResponse({
    status: 201,
    description: 'Tenant creado con API keys iniciales (test + live)',
  })
  async register(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get('me')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Ver información del tenant actual' })
  async getMe(@CurrentTenant() tenant: RequestTenant) {
    return this.tenantsService.findOne(tenant.id);
  }

  @Patch('me')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Actualizar tenant actual' })
  async updateMe(
    @CurrentTenant() tenant: RequestTenant,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(tenant.id, dto);
  }

  @Get('me/stats')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Estadísticas de uso del tenant' })
  async getStats(@CurrentTenant() tenant: RequestTenant) {
    return this.tenantsService.getStats(tenant.id);
  }
}
