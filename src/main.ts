import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  app.enableCors({
    origin: configService.get('CORS_ORIGIN', '*'),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global prefix
  const prefix = configService.get('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ECF API')
    .setDescription(
      'API SaaS de Facturación Electrónica (e-CF) para República Dominicana. ' +
      'Integra emisión, firma digital y comunicación con la DGII.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'API Key' },
      'api-key',
    )
    .addTag('auth', 'Autenticación y API Keys')
    .addTag('tenants', 'Gestión de tenants')
    .addTag('companies', 'Empresas emisoras')
    .addTag('certificates', 'Certificados digitales (.p12)')
    .addTag('sequences', 'Secuencias de eNCF')
    .addTag('invoices', 'Facturación electrónica')
    .addTag('health', 'Estado del servicio')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'ECF API - Documentación',
   customfavIcon: undefined,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
    },
  });

  const port = configService.get('PORT', 3000);
  await app.listen(port);

  console.log(`🚀 ECF API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  console.log(`🔧 Environment: ${configService.get('NODE_ENV', 'development')}`);
  console.log(`🏛️  DGII Environment: ${configService.get('DGII_ENVIRONMENT', 'DEV')}`);
}

bootstrap();
