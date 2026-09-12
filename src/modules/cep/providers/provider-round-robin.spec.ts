import { describe, expect, it } from 'vitest';

import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';
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
  it('devolve todos os provedores, começando pelo próximo da rotação', () => {
    const selector = new ProviderRoundRobin([VIACEP, BRASILAPI]);

    expect(selector.order().map((p) => p.name)).toEqual(['viacep', 'brasilapi']);
    expect(selector.order().map((p) => p.name)).toEqual(['brasilapi', 'viacep']);
    expect(selector.order().map((p) => p.name)).toEqual(['viacep', 'brasilapi']);
  });

  it('mantém a ordem completa quando há um provedor só', () => {
    const selector = new ProviderRoundRobin([VIACEP]);

    expect(selector.order().map((p) => p.name)).toEqual(['viacep']);
    expect(selector.order().map((p) => p.name)).toEqual(['viacep']);
  });
});
