import { Inject, Injectable } from '@nestjs/common';

import { CEP_PROVIDERS, CepProvider } from './interfaces/cep-provider.interface.js';

@Injectable()
export class ProviderRoundRobin {
  private index = 0;

  constructor(@Inject(CEP_PROVIDERS) private readonly providers: readonly CepProvider[]) {}

  next(): CepProvider {
    const provider = this.providers[this.index]!;
    this.index = (this.index + 1) % this.providers.length;

    return provider;
  }
}
