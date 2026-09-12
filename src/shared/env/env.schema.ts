import { z } from 'zod';

import { LogLevel } from '../logger/log-level.enum.js';
import { NodeEnv } from './node-env.enum.js';

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const DEFAULT_PROVIDER_TIMEOUT_MS = 2500;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_RESET_MS = 30_000;

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

export const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  PORT: z.coerce.number().int().positive().max(MAX_PORT).default(DEFAULT_PORT),
  PROVIDER_TIMEOUT_MS: positiveInt(DEFAULT_PROVIDER_TIMEOUT_MS),
  CIRCUIT_FAILURE_THRESHOLD: positiveInt(DEFAULT_CIRCUIT_FAILURE_THRESHOLD),
  CIRCUIT_RESET_MS: positiveInt(DEFAULT_CIRCUIT_RESET_MS),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.INFO),
});

export type Env = z.infer<typeof envSchema>;
