import { ConfigService } from '@nestjs/config';

import { type Env, envSchema } from './env.schema.js';

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problemas = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Variáveis de ambiente inválidas:\n${problemas}`);
  }

  return result.data;
}

export function envOf(config: ConfigService<Env, true>): Env {
  return {
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    PORT: config.get('PORT', { infer: true }),
    PROVIDER_TIMEOUT_MS: config.get('PROVIDER_TIMEOUT_MS', { infer: true }),
    CIRCUIT_FAILURE_THRESHOLD: config.get('CIRCUIT_FAILURE_THRESHOLD', { infer: true }),
    CIRCUIT_RESET_MS: config.get('CIRCUIT_RESET_MS', { infer: true }),
    LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
  };
}
