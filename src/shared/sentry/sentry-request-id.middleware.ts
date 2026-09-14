import { Injectable, NestMiddleware } from '@nestjs/common';
import * as Sentry from '@sentry/node';

/**
 * Precisa rodar depois do pino-http, que é quem atribui o `req.id` — verificado que o
 * middleware registrado no AppModule enxerga o id já definido. O escopo de isolamento é por
 * requisição, então a tag vale para todo evento capturado durante ela.
 */
@Injectable()
export class SentryRequestIdMiddleware implements NestMiddleware {
  use(request: { id?: string }, _response: unknown, next: () => void): void {
    if (request.id !== undefined) {
      Sentry.getIsolationScope().setTag('request_id', request.id);
    }

    next();
  }
}
