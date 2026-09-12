import { Inject, Injectable } from '@nestjs/common';

import { CEP_PROVIDERS, CepProvider } from '../interfaces/cep-provider.interface.js';

@Injectable()
export class ProviderRoundRobin {
  private index = 0;

  constructor(@Inject(CEP_PROVIDERS) private readonly providers: readonly CepProvider[]) {}

  /**
   * Rotação desta consulta: o round-robin define quem tenta primeiro, e os demais seguem
   * como fallback na sequência. Avança uma casa a cada chamada.
   */
  order(): readonly CepProvider[] {
    const start = this.index;
    this.index = (this.index + 1) % this.providers.length;

    return this.providers.map(
      (_, offset) => this.providers[(start + offset) % this.providers.length]!,
    );
  }
}
