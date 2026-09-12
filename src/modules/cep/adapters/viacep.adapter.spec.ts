import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderError } from '../errors/cep-provider.error.js';
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

function httpReturning(data: unknown): { http: HttpService; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn().mockReturnValue(of({ data }));

  return { http: { get } as unknown as HttpService, get };
}

function httpFailingWith(error: AxiosError): HttpService {
  return { get: vi.fn().mockReturnValue(throwError(() => error)) } as unknown as HttpService;
}

function axiosFailure(partial: Partial<AxiosError>): AxiosError {
  return Object.assign(new AxiosError('falha simulada'), partial);
}

describe('ViaCepAdapter', () => {
  it('traduz a resposta do ViaCEP para o contrato único', async () => {
    const { http, get } = httpReturning(VIACEP_RESPONSE);

    await expect(new ViaCepAdapter(http).findOne('01001000')).resolves.toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      complemento: 'lado ímpar',
      bairro: 'Sé',
      cidade: 'São Paulo',
      estado: 'SP',
    });
    expect(get).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/');
  });

  it('identifica-se como viacep', () => {
    const { http } = httpReturning(VIACEP_RESPONSE);

    expect(new ViaCepAdapter(http).name).toBe('viacep');
  });

  it('trata 200 com erro: "true" como NOT_FOUND', async () => {
    const { http } = httpReturning({ erro: 'true' });

    const error = await new ViaCepAdapter(http)
      .findOne('00000000')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CepProviderError);
    expect((error as CepProviderError).failure).toBe(CepFailureType.NOT_FOUND);
    expect((error as CepProviderError).provider).toBe('viacep');
  });

  it.each([
    ['timeout', { code: 'ECONNABORTED' }, CepFailureType.TIMEOUT],
    ['5xx', { response: { status: 500 } }, CepFailureType.UNAVAILABLE],
    ['429', { response: { status: 429 } }, CepFailureType.RATE_LIMITED],
    ['400', { response: { status: 400 } }, CepFailureType.INVALID_RESPONSE],
    ['erro de rede', { code: 'ENOTFOUND' }, CepFailureType.UNAVAILABLE],
  ])('traduz %s em %s', async (_caso, partial, expected) => {
    const http = httpFailingWith(axiosFailure(partial as Partial<AxiosError>));

    const error = await new ViaCepAdapter(http)
      .findOne('01001000')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CepProviderError);
    expect((error as CepProviderError).failure).toBe(expected);
  });
});
