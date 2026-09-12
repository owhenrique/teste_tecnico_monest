import { describe, expect, it } from 'vitest';

import { CepProviderName } from './enums/cep-provider-name.enum.js';
import { CepProvider } from './interfaces/cep-provider.interface.js';
import { ProviderRoundRobin } from './provider-round-robin.js';

function fakeProvider(name: CepProviderName): CepProvider {
  return {
    name,
    findOne: async () => {
      throw new Error('não deve ser chamado neste teste');
    },
  };
}

const VIACEP = fakeProvider(CepProviderName.VIACEP);
const BRASILAPI = fakeProvider(CepProviderName.BRASILAPI);

describe('ProviderRoundRobin', () => {
  it('devolve os provedores em sequência a cada chamada', () => {
    const selector = new ProviderRoundRobin([VIACEP, BRASILAPI]);

    expect(selector.next().name).toBe('viacep');
    expect(selector.next().name).toBe('brasilapi');
  });

  it('volta ao primeiro provedor depois do último', () => {
    const selector = new ProviderRoundRobin([VIACEP, BRASILAPI]);

    const names = [selector.next(), selector.next(), selector.next(), selector.next()].map(
      (provider) => provider.name,
    );

    expect(names).toEqual(['viacep', 'brasilapi', 'viacep', 'brasilapi']);
  });
});
