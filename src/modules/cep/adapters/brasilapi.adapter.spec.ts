import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrasilApiAdapter } from './brasilapi.adapter.js';

const BRASILAPI_RESPONSE = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'open-cep',
};

describe('BrasilApiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('traduz a resposta da BrasilAPI para o contrato único', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => BRASILAPI_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    await expect(new BrasilApiAdapter().findOne('01001000')).resolves.toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      complemento: null,
      bairro: 'Sé',
      cidade: 'São Paulo',
      estado: 'SP',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://brasilapi.com.br/api/cep/v1/01001000');
  });

  it('identifica-se como brasilapi', () => {
    expect(new BrasilApiAdapter().name).toBe('brasilapi');
  });
});
