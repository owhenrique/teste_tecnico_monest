import { describe, expect, it, vi } from 'vitest';

import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProviderError } from '../errors/cep-provider.error.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';
import { CircuitBreakerProvider } from './circuit-breaker.provider.js';

/**
 * A máquina de estados é testada em `shared/circuit-breaker`. Aqui ficam só as três
 * coisas que este adaptador acrescenta: delegar ao provedor embrulhado, ignorar
 * NOT_FOUND e anunciar o circuito aberto como CepProviderError.
 */
const ADDRESS = { cep: '01001000' } as Address;
const THRESHOLD = 3;
const RESET_MS = 30_000;

function breakerOver(provider: CepProvider): CircuitBreakerProvider {
  return new CircuitBreakerProvider(provider, THRESHOLD, RESET_MS);
}

function failing(failure: CepFailureType): CepProvider {
  return {
    name: CepProviderName.VIACEP,
    findOne: vi.fn().mockRejectedValue(new CepProviderError(CepProviderName.VIACEP, failure)),
  };
}

async function failTimes(breaker: CircuitBreakerProvider, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await breaker.findOne('01001000').catch(() => undefined);
  }
}

describe('CircuitBreakerProvider', () => {
  it('delega ao provedor embrulhado e mantém o nome dele', async () => {
    const provider: CepProvider = {
      name: CepProviderName.BRASILAPI,
      findOne: vi.fn().mockResolvedValue(ADDRESS),
    };
    const breaker = breakerOver(provider);

    await expect(breaker.findOne('01001000')).resolves.toEqual(ADDRESS);
    expect(provider.findOne).toHaveBeenCalledWith('01001000');
    expect(breaker.name).toBe('brasilapi');
  });

  it('não abre com NOT_FOUND: é resposta válida, não sintoma de saúde', async () => {
    const provider = failing(CepFailureType.NOT_FOUND);
    const breaker = breakerOver(provider);

    await failTimes(breaker, THRESHOLD + 2);

    expect(provider.findOne).toHaveBeenCalledTimes(THRESHOLD + 2);
  });

  it('anuncia o circuito aberto como CepProviderError(CIRCUIT_OPEN)', async () => {
    const breaker = breakerOver(failing(CepFailureType.UNAVAILABLE));

    await failTimes(breaker, THRESHOLD);
    const error = await breaker.findOne('01001000').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CepProviderError);
    expect((error as CepProviderError).failure).toBe(CepFailureType.CIRCUIT_OPEN);
    expect((error as CepProviderError).provider).toBe('viacep');
  });
});
