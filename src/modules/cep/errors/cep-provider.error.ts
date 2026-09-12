import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';

export class CepProviderError extends Error {
  constructor(
    readonly provider: CepProviderName,
    readonly failure: CepFailureType,
    readonly detail?: string,
  ) {
    super(detail ? `${provider}: ${failure} (${detail})` : `${provider}: ${failure}`);
    this.name = 'CepProviderError';
  }
}

export function isDefinitive(failure: CepFailureType): boolean {
  return failure === CepFailureType.NOT_FOUND;
}
