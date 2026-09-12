import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  await app.listen(port);
  Logger.log(`Aplicação ouvindo em http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
