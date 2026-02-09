import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContingencyService } from './contingency.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';

@ApiTags('contingency')
@Controller('contingency')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class ContingencyController {
  constructor(private readonly contingencyService: ContingencyService) {}

  @Get()
  @ApiOperation({ summary: 'Listar facturas en contingencia' })
  async getPending(@CurrentTenant() tenant: RequestTenant) {
    return this.contingencyService.getPendingInvoices(tenant.id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de contingencia' })
  async getStats(@CurrentTenant() tenant: RequestTenant) {
    return this.contingencyService.getStats(tenant.id);
  }

  @Post(':invoiceId/retry')
  @ApiOperation({ summary: 'Marcar factura con error para reintento' })
  async markForRetry(
    @CurrentTenant() tenant: RequestTenant,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.contingencyService.markForRetry(tenant.id, invoiceId);
  }

  @Post('retry-all')
  @ApiOperation({ summary: 'Marcar todas las facturas con error para reintento' })
  async markAllForRetry(@CurrentTenant() tenant: RequestTenant) {
    return this.contingencyService.markAllForRetry(tenant.id);
  }

  @Post('process')
  @ApiOperation({ summary: 'Procesar cola de contingencia (reenviar a DGII)' })
  async processQueue() {
    return this.contingencyService.processQueue();
  }
}
