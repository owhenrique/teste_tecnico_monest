import { afterEach, describe, expect, it, vi } from 'vitest';

import { ViaCepAdapter } from './viacep.adapter.js';

const VIACEP_RESPONSE = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  unidade: '',
  bairro: 'Sé',
  localidade: 'São Paulo',
  uf: 'SP',
  estado: 'São Paulo',
  regiao: 'Sudeste',
  ibge: '3550308',
  ddd: '11',
};

describe('ViaCepAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('traduz a resposta do ViaCEP para o contrato único', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => VIACEP_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ViaCepAdapter().findOne('01001000')).resolves.toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      complemento: 'lado ímpar',
      bairro: 'Sé',
      cidade: 'São Paulo',
      estado: 'SP',
    });
    expect(fetchMock).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/');
  });

  it('identifica-se como viacep', () => {
    expect(new ViaCepAdapter().name).toBe('viacep');
  });
});
