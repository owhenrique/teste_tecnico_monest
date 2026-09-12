import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';
import { NodeEnv } from './node-env.enum.js';

describe('loadEnv', () => {
  it('aplica os defaults quando as variáveis não estão definidas', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      PROVIDER_TIMEOUT_MS: 2500,
      CIRCUIT_FAILURE_THRESHOLD: 3,
      CIRCUIT_RESET_MS: 30000,
    });
  });

  it('lê os valores informados e converte PORT em número', () => {
    const env = loadEnv({ NODE_ENV: NodeEnv.PRODUCTION, PORT: '8080', PROVIDER_TIMEOUT_MS: '900' });

    expect(env).toMatchObject({ NODE_ENV: 'production', PORT: 8080, PROVIDER_TIMEOUT_MS: 900 });
    expect(typeof env.PORT).toBe('number');
    expect(typeof env.PROVIDER_TIMEOUT_MS).toBe('number');
  });

  it('falha com mensagem que nomeia a variável inválida e o motivo', () => {
    const error = (() => {
      try {
        loadEnv({ PORT: 'oito-mil' });
        return undefined;
      } catch (caught: unknown) {
        return caught as Error;
      }
    })();

    expect(error?.message).toContain('Variáveis de ambiente inválidas');
    expect(error?.message).toContain('PORT');
  });

  it('falha quando NODE_ENV não é um ambiente conhecido', () => {
    expect(() => loadEnv({ NODE_ENV: 'homolog' })).toThrow(/NODE_ENV/);
  });

  it('recusa timeout de provedor não positivo', () => {
    expect(() => loadEnv({ PROVIDER_TIMEOUT_MS: '0' })).toThrow(/PROVIDER_TIMEOUT_MS/);
  });
});
