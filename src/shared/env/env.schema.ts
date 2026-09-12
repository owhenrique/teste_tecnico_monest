import { z } from 'zod';

import { LogLevel } from '../logger/log-level.enum.js';
import { NodeEnv } from './node-env.enum.js';

const MAX_PORT = 65535;

const positiveInt = z.coerce.number().int().positive();

export const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv),
  PORT: positiveInt.max(MAX_PORT),
  PROVIDER_TIMEOUT_MS: positiveInt,
  CIRCUIT_FAILURE_THRESHOLD: positiveInt,
  CIRCUIT_RESET_MS: positiveInt,
  LOG_LEVEL: z.enum(LogLevel),
});

export type Env = z.infer<typeof envSchema>;
