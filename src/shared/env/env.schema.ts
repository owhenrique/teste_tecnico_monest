import { z } from 'zod';

import { NodeEnv } from './node-env.enum.js';

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
/** ~5x a latência do provedor mais lento medido (ViaCEP, ~0,48 s). */
const DEFAULT_PROVIDER_TIMEOUT_MS = 2500;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_RESET_MS = 30_000;

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  // Variável de ambiente chega string; coerce converte antes de validar a faixa.
  PORT: z.coerce.number().int().positive().max(MAX_PORT).default(DEFAULT_PORT),
  /** Timeout por provedor. Com N provedores, a request leva até N x este valor. */
  PROVIDER_TIMEOUT_MS: positiveInt(DEFAULT_PROVIDER_TIMEOUT_MS),
  /** Falhas consecutivas não-definitivas que abrem o circuito de um provedor. */
  CIRCUIT_FAILURE_THRESHOLD: positiveInt(DEFAULT_CIRCUIT_FAILURE_THRESHOLD),
  /** Tempo que o circuito fica aberto antes de voltar a fechar. */
  CIRCUIT_RESET_MS: positiveInt(DEFAULT_CIRCUIT_RESET_MS),
});

export type Env = z.infer<typeof envSchema>;
