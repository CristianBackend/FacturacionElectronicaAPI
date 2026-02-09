import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { BuyersService } from './buyers.service';
import { CreateBuyerDto, UpdateBuyerDto } from './dto/buyer.dto';

@ApiTags('buyers')
@Controller('buyers')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Post()
  @ApiOperation({
    summary: 'Crear cliente/comprador',
    description:
      'Crea un cliente con validación DGII automática. ' +
      'Si se proporciona RNC, consulta DGII para auto-llenar datos. ' +
      'El tipo de comprobante (e-CF) se asigna automáticamente según el tipo de comprador.',
  })
  create(@Req() req: any, @Body() dto: CreateBuyerDto) {
    return this.buyersService.create(req.tenant.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes/compradores' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por nombre, RNC o nombre comercial' })
  @ApiQuery({ name: 'buyerType', required: false, description: 'Filtrar por tipo' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Req() req: any,
    @Query('search') search?: string,
    @Query('buyerType') buyerType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.buyersService.findAll(req.tenant.id, {
      search,
      buyerType,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un cliente con facturas recientes' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.buyersService.findOne(req.tenant.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de un cliente' })
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBuyerDto) {
    return this.buyersService.update(req.tenant.id, id, dto);
  }

  @Post(':id/refresh-dgii')
  @ApiOperation({
    summary: 'Re-verificar RNC con DGII',
    description: 'Consulta DGII nuevamente y actualiza los datos del cliente (estado, actividad económica, etc.)',
  })
  refreshDgii(@Req() req: any, @Param('id') id: string) {
    return this.buyersService.refreshDgiiData(req.tenant.id, id);
  }
}
