import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CepService } from './cep.service.js';
import { CepErrorCode } from './enums/cep-error-code.enum.js';
import { CepFailureType } from './enums/cep-failure-type.enum.js';
import { CepProviderName } from './enums/cep-provider-name.enum.js';
import { CepProviderError } from './errors/cep-provider.error.js';
import { CepException } from './exceptions/cep.exception.js';
import { Address } from './interfaces/address.interface.js';
import { CepProvider } from './interfaces/cep-provider.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';

const ADDRESS: Address = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  cidade: 'São Paulo',
  estado: 'SP',
};

function providerFound(name: CepProviderName): CepProvider {
  return { name, findOne: vi.fn().mockResolvedValue(ADDRESS) };
}

function providerFailing(name: CepProviderName, failure: CepFailureType): CepProvider {
  return { name, findOne: vi.fn().mockRejectedValue(new CepProviderError(name, failure)) };
}

function selectorOf(...providers: CepProvider[]): ProviderRoundRobin {
  return { order: () => providers } as unknown as ProviderRoundRobin;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe('CepService', () => {
  it('devolve o endereço do primeiro provedor que responde', async () => {
    const provider = providerFound(CepProviderName.VIACEP);
    const service = new CepService(selectorOf(provider));

    await expect(service.findOne('01001000')).resolves.toEqual(ADDRESS);
    expect(provider.findOne).toHaveBeenCalledWith('01001000');
  });

  it.each(['01001-000', '1234567', 'abcdefgh', ''])(
    'rejeita %j com CepException(INVALID_CEP), sem consultar provedor',
    async (invalid) => {
      const provider = providerFound(CepProviderName.VIACEP);
      const service = new CepService(selectorOf(provider));

      const error = await caught(service.findOne(invalid));

      expect(error).toBeInstanceOf(CepException);
      expect((error as CepException).code).toBe(CepErrorCode.INVALID_CEP);
      expect((error as CepException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(provider.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([CepFailureType.TIMEOUT, CepFailureType.UNAVAILABLE, CepFailureType.RATE_LIMITED])(
    'cai para o próximo provedor quando o primeiro falha com %s',
    async (failure) => {
      const segundo = providerFound(CepProviderName.BRASILAPI);
      const service = new CepService(
        selectorOf(providerFailing(CepProviderName.VIACEP, failure), segundo),
      );

      await expect(service.findOne('01001000')).resolves.toEqual(ADDRESS);
      expect(segundo.findOne).toHaveBeenCalledWith('01001000');
    },
  );

  it('trata NOT_FOUND como definitivo: 404 sem consultar o próximo provedor', async () => {
    const segundo = providerFound(CepProviderName.BRASILAPI);
    const service = new CepService(
      selectorOf(providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND), segundo),
    );

    const error = await caught(service.findOne('00000000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.CEP_NOT_FOUND);
    expect((error as CepException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(segundo.findOne).not.toHaveBeenCalled();
  });

  it('responde 504 quando todos os provedores tentados falham', async () => {
    const service = new CepService(
      selectorOf(
        providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
        providerFailing(CepProviderName.BRASILAPI, CepFailureType.UNAVAILABLE),
      ),
    );

    const error = await caught(service.findOne('01001000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.ALL_PROVIDERS_FAILED);
    expect((error as CepException).getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
  });

  it('responde 503 quando só um provedor pôde ser tentado e ele falhou', async () => {
    const service = new CepService(
      selectorOf(providerFailing(CepProviderName.VIACEP, CepFailureType.CIRCUIT_OPEN)),
    );

    const error = await caught(service.findOne('01001000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.PROVIDER_UNAVAILABLE);
    expect((error as CepException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
