import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';

const REQUEST_ID_HEADER = 'x-request-id';

export function buildRequestId(request: IncomingMessage): string {
  const received = request.headers[REQUEST_ID_HEADER];

  if (typeof received === 'string' && received.length > 0) {
    return received;
  }

  return randomUUID();
}
