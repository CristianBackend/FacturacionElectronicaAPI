import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Plan } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ description: 'Nombre del tenant/organización', example: 'Mi Empresa SRL' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ description: 'Email del tenant', example: 'admin@miempresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Contraseña para acceso al dashboard', example: 'MiClave123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ description: 'Plan inicial', enum: Plan, example: Plan.STARTER })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
