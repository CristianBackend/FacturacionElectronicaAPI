import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class ApproveReceptionDto {
  @ApiProperty({ description: 'Aprobar (true) o rechazar (false) el documento recibido' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Motivo de rechazo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
