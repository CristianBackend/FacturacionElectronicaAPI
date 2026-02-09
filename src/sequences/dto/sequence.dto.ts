import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { EcfType } from '@prisma/client';

export class CreateSequenceDto {
  @ApiProperty({ description: 'ID de la empresa' })
  @IsString()
  companyId: string;

  @ApiProperty({
    description: 'Tipo de e-CF',
    enum: EcfType,
    example: EcfType.E31,
  })
  @IsEnum(EcfType)
  ecfType: EcfType;

  @ApiProperty({
    description: 'Número inicial de la secuencia autorizada por DGII',
    example: 1,
  })
  @IsInt()
  @Min(1, { message: 'El número inicial debe ser mayor a 0' })
  startNumber: number;

  @ApiProperty({
    description: 'Número final de la secuencia autorizada por DGII',
    example: 10000,
  })
  @IsInt()
  @Min(2, { message: 'El número final debe ser al menos 2' })
  endNumber: number;

  @ApiPropertyOptional({
    description: 'Fecha de vencimiento de la secuencia (ISO)',
    example: '2027-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Fecha de vencimiento inválida' })
  expiresAt?: string;
}
