import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateApiKeyDto, LoginDto } from './dto/auth.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CurrentTenant, RequestTenant } from '../common/decorators/tenant.decorator';
import { ApiKeyScope } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Public endpoint - login with email + password.
   * Returns a JWT token for dashboard access.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email y contraseña (dashboard)' })
  @ApiResponse({ status: 200, description: 'JWT token para acceso al dashboard' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('keys')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Crear nueva API key' })
  @ApiResponse({ status: 201, description: 'API key creada. El valor completo solo se muestra una vez.' })
  async createApiKey(
    @CurrentTenant() tenant: RequestTenant,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.authService.generateApiKey(
      tenant.id,
      dto.name,
      dto.isLive,
      dto.scopes || [ApiKeyScope.FULL_ACCESS],
    );
  }

  @Get('keys')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Listar API keys del tenant' })
  async listApiKeys(@CurrentTenant() tenant: RequestTenant) {
    return this.authService.listApiKeys(tenant.id);
  }

  @Delete('keys/:id')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revocar una API key' })
  async revokeApiKey(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') apiKeyId: string,
  ) {
    return this.authService.revokeApiKey(tenant.id, apiKeyId);
  }

  @Post('keys/:id/rotate')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth('api-key')
  @ApiOperation({ summary: 'Rotar una API key (revoca la actual y genera nueva)' })
  async rotateApiKey(
    @CurrentTenant() tenant: RequestTenant,
    @Param('id') apiKeyId: string,
  ) {
    return this.authService.rotateApiKey(tenant.id, apiKeyId);
  }
}
