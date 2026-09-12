import { IncomingMessage, ServerResponse } from 'node:http';

import { Params } from 'nestjs-pino';

import { Env } from '../env/env.schema.js';
import { NodeEnv } from '../env/node-env.enum.js';
import { buildRequestId } from './request-id.js';
import { requestLogLevel } from './request-log-level.js';

export function buildLoggerOptions(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: buildRequestId,
      customLogLevel: (_request, response, error) => requestLogLevel(response.statusCode, error),
      autoLogging: {
        // Navegador pede favicon em toda visita; é ruído, não tráfego de API.
        ignore: (request) => request.url === '/favicon.ico',
      },
      serializers: {
        req: (request: IncomingMessage & { id: string }) => ({
          id: request.id,
          method: request.method,
          url: request.url,
        }),
        res: (response: ServerResponse) => ({ statusCode: response.statusCode }),
      },
      transport: env.NODE_ENV === NodeEnv.DEVELOPMENT ? { target: 'pino-pretty' } : undefined,
    },
  };
}
