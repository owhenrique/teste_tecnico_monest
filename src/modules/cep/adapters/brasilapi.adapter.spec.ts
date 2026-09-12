import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderError } from '../errors/cep-provider.error.js';
import { BrasilApiAdapter } from './brasilapi.adapter.js';

const BRASILAPI_RESPONSE = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'open-cep',
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

describe('BrasilApiAdapter', () => {
  it('traduz a resposta da BrasilAPI para o contrato único', async () => {
    const { http, get } = httpReturning(BRASILAPI_RESPONSE);

    await expect(new BrasilApiAdapter(http).findOne('01001000')).resolves.toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      complemento: null,
      bairro: 'Sé',
      cidade: 'São Paulo',
      estado: 'SP',
    });
    expect(get).toHaveBeenCalledWith('https://brasilapi.com.br/api/cep/v1/01001000');
  });

  it('identifica-se como brasilapi', () => {
    const { http } = httpReturning(BRASILAPI_RESPONSE);

    expect(new BrasilApiAdapter(http).name).toBe('brasilapi');
  });

  it.each([
    ['404', { response: { status: 404 } }, CepFailureType.NOT_FOUND],
    ['timeout', { code: 'ECONNABORTED' }, CepFailureType.TIMEOUT],
    ['5xx', { response: { status: 503 } }, CepFailureType.UNAVAILABLE],
    ['429', { response: { status: 429 } }, CepFailureType.RATE_LIMITED],
    ['400', { response: { status: 400 } }, CepFailureType.INVALID_RESPONSE],
    ['erro de rede', { code: 'ECONNREFUSED' }, CepFailureType.UNAVAILABLE],
  ])('traduz %s em %s', async (_caso, partial, expected) => {
    const http = httpFailingWith(axiosFailure(partial as Partial<AxiosError>));

    const error = await new BrasilApiAdapter(http)
      .findOne('01001000')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CepProviderError);
    expect((error as CepProviderError).failure).toBe(expected);
    expect((error as CepProviderError).provider).toBe('brasilapi');
  });
});
