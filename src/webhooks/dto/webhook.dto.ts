import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsEnum,
  IsUrl,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { WebhookEvent } from '@prisma/client';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'URL que recibirá los eventos (debe ser HTTPS en producción)',
    example: 'https://mi-app.com/webhooks/ecf',
  })
@IsUrl({ require_protocol: false })  url: string;

  @ApiProperty({
    description: 'Eventos a los que suscribirse',
    enum: WebhookEvent,
    isArray: true,
    example: ['INVOICE_ACCEPTED', 'INVOICE_REJECTED'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(WebhookEvent, { each: true })
  events: WebhookEvent[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({ description: 'URL actualizada' })
  @IsOptional()
@IsUrl({ require_protocol: false })
  url?: string;

  @ApiPropertyOptional({ description: 'Eventos actualizados', enum: WebhookEvent, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  events?: WebhookEvent[];

  @ApiPropertyOptional({ description: 'Activar/desactivar' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
