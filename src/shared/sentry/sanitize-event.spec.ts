import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';

import { sanitizeEvent } from './sanitize-event.js';

function eventoCom(request: ErrorEvent['request']): ErrorEvent {
  return { type: undefined, request } as ErrorEvent;
}

describe('sanitizeEvent', () => {
  it('remove os cookies da requisição', () => {
    const evento = sanitizeEvent(
      eventoCom({
        method: 'GET',
        url: 'http://localhost:3000/cep/01001000',
        cookies: { sessionid: 'SEGREDO', csrftoken: 'OUTRO' },
      }),
    );

    expect(evento.request).not.toHaveProperty('cookies');
  });

  it('remove os headers da requisição', () => {
    const evento = sanitizeEvent(
      eventoCom({
        method: 'GET',
        url: 'http://localhost:3000/cep/01001000',
        headers: { authorization: 'Bearer SEGREDO', cookie: 'sessionid=SEGREDO' },
      }),
    );

    expect(evento.request).not.toHaveProperty('headers');
  });

  it('mantém método e URL, que são o que diagnostica', () => {
    const evento = sanitizeEvent(
      eventoCom({ method: 'GET', url: 'http://localhost:3000/cep/01001000' }),
    );

    expect(evento.request).toMatchObject({
      method: 'GET',
      url: 'http://localhost:3000/cep/01001000',
    });
  });

  it('corta a query da URL, que urlQueryParams não limpa', () => {
    const evento = sanitizeEvent(
      eventoCom({
        method: 'GET',
        url: 'http://localhost:3000/cep/01001000?token=SEGREDO',
        query_string: 'token=SEGREDO',
      }),
    );

    expect(evento.request?.url).toBe('http://localhost:3000/cep/01001000');
    expect(evento.request).not.toHaveProperty('query_string');
  });

  it('anexa um curl com método e URL, sem query, header nem cookie', () => {
    const evento = sanitizeEvent(
      eventoCom({
        method: 'GET',
        url: 'http://localhost:3000/cep/01001000?token=SEGREDO',
        headers: { authorization: 'Bearer SEGREDO' },
        cookies: { sessionid: 'SEGREDO' },
      }),
    );

    const curl = (evento.contexts?.reproduce as { curl: string } | undefined)?.curl;

    expect(curl).toBe("curl -X GET 'http://localhost:3000/cep/01001000'");
    expect(curl).not.toContain('SEGREDO');
  });

  it('não anexa curl a evento sem requisição', () => {
    const evento = sanitizeEvent({ type: undefined } as ErrorEvent);

    expect(evento.contexts?.reproduce).toBeUndefined();
  });
});
