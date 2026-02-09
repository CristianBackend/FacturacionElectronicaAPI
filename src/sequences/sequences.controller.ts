import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SequencesService } from './sequences.service';
import { CreateSequenceDto } from './dto/sequence.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/scopes.decorator';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';
import { ApiKeyScope, EcfType } from '@prisma/client';

@ApiTags('sequences')
@Controller('sequences')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class SequencesController {
  constructor(private readonly sequencesService: SequencesService) {}

  @Post()
  @RequireScopes(ApiKeyScope.INVOICES_WRITE)
  @ApiOperation({ summary: 'Registrar nueva secuencia eNCF autorizada por DGII' })
  async create(
    @CurrentTenant() tenant: RequestTenant,
    @Body() dto: CreateSequenceDto,
  ) {
    return this.sequencesService.create(tenant.id, dto);
  }

  @Get(':companyId')
  @RequireScopes(ApiKeyScope.SEQUENCES_READ)
  @ApiOperation({ summary: 'Ver secuencias de una empresa' })
  async findAll(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
  ) {
    return this.sequencesService.findAll(tenant.id, companyId);
  }

  @Get(':companyId/available')
  @RequireScopes(ApiKeyScope.SEQUENCES_READ)
  @ApiOperation({ summary: 'Verificar disponibilidad de secuencia por tipo' })
  @ApiQuery({ name: 'type', enum: EcfType, example: 'E31' })
  async getAvailable(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
    @Query('type') ecfType: EcfType,
  ) {
    return this.sequencesService.getAvailable(tenant.id, companyId, ecfType);
  }

  @Post(':companyId/annul')
  @RequireScopes(ApiKeyScope.INVOICES_WRITE)
  @ApiOperation({ summary: 'Anular rangos de eNCF no utilizados (ANECF)' })
  async annulSequences(
    @CurrentTenant() tenant: RequestTenant,
    @Param('companyId') companyId: string,
    @Body() body: { ranges: Array<{ encfFrom: string; encfTo: string }> },
  ) {
    return this.sequencesService.annulSequences(tenant.id, companyId, body.ranges);
  }
}
