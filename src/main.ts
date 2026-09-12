import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { loadEnv } from './shared/env/env.js';
import { setupApiDocs } from './shared/openapi/setup-api-docs.js';

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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);

  app.useLogger(logger);

  const withDocs = setupApiDocs(app, env);

  await app.listen(env.PORT);
  logger.log(`Aplicação ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');

  if (withDocs) {
    logger.log(`Documentação em http://localhost:${env.PORT}/docs`, 'Bootstrap');
  }
}

void bootstrap();
