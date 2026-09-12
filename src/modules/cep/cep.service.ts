import { Injectable } from '@nestjs/common';

import { CepErrorCode } from './enums/cep-error-code.enum.js';
import { CepProviderError, isDefinitive } from './errors/cep-provider.error.js';
import { CepException } from './exceptions/cep.exception.js';
import { Address } from './interfaces/address.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';
import { assertIsValidCep } from './validators/cep.validator.js';

@Injectable()
export class CepService {
  constructor(private readonly providers: ProviderRoundRobin) {}

  async findOne(cep: string): Promise<Address> {
    assertIsValidCep(cep);

    const failures: CepProviderError[] = [];

    for (const provider of this.providers.order()) {
      try {
        return await provider.findOne(cep);
      } catch (error: unknown) {
        if (!(error instanceof CepProviderError)) {
          throw error;
        }

        if (isDefinitive(error.failure)) {
          throw new CepException(CepErrorCode.CEP_NOT_FOUND);
        }

        failures.push(error);
      }
    }

    throw new CepException(
      failures.length > 1 ? CepErrorCode.ALL_PROVIDERS_FAILED : CepErrorCode.PROVIDER_UNAVAILABLE,
    );
  }
}
