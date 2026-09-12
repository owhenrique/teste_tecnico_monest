import { z } from 'zod';

import { NodeEnv } from './node-env.enum.js';

const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

export const envSchema = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  PORT: z.coerce.number().int().positive().max(MAX_PORT).default(DEFAULT_PORT),
});

export type Env = z.infer<typeof envSchema>;
