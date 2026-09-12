import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadEnv } from './shared/env/env.js';

/**
 * O `.env` é opcional: em produção as variáveis vêm do ambiente, não de arquivo.
 * Ausência do arquivo é caso normal, então o erro de leitura é ignorado.
 */
function readDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    return;
  }
}

async function bootstrap(): Promise<void> {
  readDotEnv();

  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule);

  await app.listen(env.PORT);
  Logger.log(`Aplicação ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');
}

void bootstrap();
