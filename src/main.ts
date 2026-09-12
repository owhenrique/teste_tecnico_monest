import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { envOf } from './shared/env/env.js';
import { Env } from './shared/env/env.schema.js';
import { setupApiDocs } from './shared/openapi/setup-api-docs.js';
import { flushIssues, setupSentry } from './shared/sentry/report-issue.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = envOf(app.get<ConfigService<Env, true>>(ConfigService));
  const logger = app.get(Logger);

  app.useLogger(logger);
  setupSentry({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });

  // Sem isto, o evento capturado nos últimos instantes é perdido — justamente o do
  // incidente que derrubou a aplicação.
  app.enableShutdownHooks();
  process.on('beforeExit', () => {
    void flushIssues();
  });

  const withDocs = setupApiDocs(app, env);

  await app.listen(env.PORT);
  logger.log(`Aplicação ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');

  if (withDocs) {
    logger.log(`Documentação em http://localhost:${env.PORT}/docs`, 'Bootstrap');
  }
}

void bootstrap();
