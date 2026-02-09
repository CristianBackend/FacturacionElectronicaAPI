import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReceptionService } from './reception.service';
import { ApproveReceptionDto } from './dto/reception.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';

@ApiTags('reception')
@Controller('received')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class ReceptionController {
  constructor(private readonly receptionService: ReceptionService) {}

  @Get()
  @ApiOperation({ summary: 'Listar documentos recibidos de otros emisores' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending_approval', 'approved', 'rejected'] })
  async findAll(
    @CurrentTenant() tenant: RequestTenant,
    @Query('status') status?: string,
  ) {
    return this.receptionService.findAll(tenant.id, status);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Aprobar/rechazar documento recibido (ACECF)' })
  async processApproval(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') id: string,
    @Body() dto: ApproveReceptionDto,
  ) {
    return this.receptionService.processApproval(
      tenant.id,
      id,
      dto.approved,
      dto.rejectionReason,
    );
  }
}
