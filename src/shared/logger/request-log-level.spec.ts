import { describe, expect, it } from 'vitest';

import { LogLevel } from './log-level.enum.js';
import { requestLogLevel } from './request-log-level.js';

describe('requestLogLevel', () => {
  it.each([200, 201, 304])('registra %i como info', (status) => {
    expect(requestLogLevel(status)).toBe(LogLevel.INFO);
  });

  it('registra 404 como info: CEP inexistente é resposta normal desta API', () => {
    expect(requestLogLevel(404)).toBe(LogLevel.INFO);
  });

  it.each([400, 422, 429])('registra %i como warn', (status) => {
    expect(requestLogLevel(status)).toBe(LogLevel.WARN);
  });

  it.each([500, 503, 504])('registra %i como error', (status) => {
    expect(requestLogLevel(status)).toBe(LogLevel.ERROR);
  });

  it('registra como error quando a requisição estourou', () => {
    expect(requestLogLevel(200, new Error('boom'))).toBe(LogLevel.ERROR);
  });
});
