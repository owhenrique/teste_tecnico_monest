import { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { buildRequestId } from './request-id.js';

function requestWith(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('buildRequestId', () => {
  it('reaproveita o X-Request-Id recebido', () => {
    expect(buildRequestId(requestWith({ 'x-request-id': 'id-do-gateway-123' }))).toBe(
      'id-do-gateway-123',
    );
  });

  it('gera um id quando o header não vem', () => {
    const id = buildRequestId(requestWith({}));

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gera ids diferentes a cada requisição sem header', () => {
    expect(buildRequestId(requestWith({}))).not.toBe(buildRequestId(requestWith({})));
  });

  it('ignora header vazio e gera um id', () => {
    expect(buildRequestId(requestWith({ 'x-request-id': '' }))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
