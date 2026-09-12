import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';
import { NodeEnv } from './node-env.enum.js';

describe('loadEnv', () => {
  it('aplica os defaults quando as variáveis não estão definidas', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('lê os valores informados e converte PORT em número', () => {
    const env = loadEnv({ NODE_ENV: NodeEnv.PRODUCTION, PORT: '8080' });

    expect(env).toEqual({ NODE_ENV: 'production', PORT: 8080 });
    expect(typeof env.PORT).toBe('number');
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
});
