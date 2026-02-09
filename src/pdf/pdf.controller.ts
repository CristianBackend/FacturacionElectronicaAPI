import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/scopes.decorator';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';
import { ApiKeyScope } from '@prisma/client';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth('api-key')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  @Get(':id/preview')
  @RequireScopes(ApiKeyScope.INVOICES_READ)
  @ApiOperation({ summary: 'Vista previa HTML de la Representación Impresa' })
  async preview(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.pdfService.generateHtml(tenant.id, id);
    res.set('Content-Type', 'text/html');
    res.send(html);
  }

  @Get(':id/pdf')
  @RequireScopes(ApiKeyScope.INVOICES_READ)
  @ApiOperation({ summary: 'Descargar PDF — abre vista de impresión para guardar como PDF' })
  async downloadPdf(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.pdfService.generatePrintableHtml(tenant.id, id);
    res.set('Content-Type', 'text/html');
    res.send(html);
  }
}
