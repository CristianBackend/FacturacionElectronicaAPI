import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UploadCertificateDto {
  @ApiProperty({
    description: 'ID de la empresa a la que pertenece el certificado',
    example: 'uuid-de-la-empresa',
  })
  @IsString()
  companyId: string;

  @ApiProperty({
    description: 'Contenido del archivo .p12 en Base64',
  })
  @IsString()
  p12Base64: string;

  @ApiProperty({
    description: 'Contraseña del certificado .p12',
    example: 'mi-password-seguro',
  })
  @IsString()
  @MinLength(1)
  passphrase: string;
}
