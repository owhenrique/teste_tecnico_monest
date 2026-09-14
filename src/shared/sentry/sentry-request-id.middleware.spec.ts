import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SentryRequestIdMiddleware } from './sentry-request-id.middleware.js';

describe('SentryRequestIdMiddleware', () => {
  // Sem o Sentry.init não há contexto assíncrono, e o escopo de isolamento é global: sem
  // limpar, a tag de um teste vaza para o outro. O isolamento por requisição de verdade é
  // provado no e2e, com o SDK inicializado.
  beforeEach(() => {
    Sentry.getIsolationScope().clear();
  });

  it('marca o escopo de isolamento com o request_id', () => {
    const next = vi.fn();

    new SentryRequestIdMiddleware().use({ id: 'req-123' }, {}, next);

    expect(Sentry.getIsolationScope().getScopeData().tags.request_id).toBe('req-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('segue a cadeia sem marcar nada quando não há id', () => {
    const next = vi.fn();

    new SentryRequestIdMiddleware().use({}, {}, next);

    expect(Sentry.getIsolationScope().getScopeData().tags.request_id).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
