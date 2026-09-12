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
