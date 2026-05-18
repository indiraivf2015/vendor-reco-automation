import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  const config = new DocumentBuilder()
    .setTitle('Vendor Master Reconciliation API')
    .setDescription('P2P ↔ Oracle ERP Vendor Master Reconciliation • Indira IVF GenAI')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`🚀 API live → http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`📚 Swagger → http://localhost:${port}/api/docs`, 'Bootstrap');
}
bootstrap();
