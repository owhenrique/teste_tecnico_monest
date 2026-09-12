import { Module } from '@nestjs/common';

import { BrasilApiAdapter } from './adapters/brasilapi.adapter.js';
import { ViaCepAdapter } from './adapters/viacep.adapter.js';
import { CepController } from './cep.controller.js';
import { CepService } from './cep.service.js';
import { CEP_PROVIDERS } from './interfaces/cep-provider.interface.js';
import { ProviderRoundRobin } from './provider-round-robin.js';

@Module({
  controllers: [CepController],
  providers: [
    CepService,
    ProviderRoundRobin,
    ViaCepAdapter,
    BrasilApiAdapter,
    {
      // Acrescentar um provedor novo é escrever o adaptador e incluí-lo nesta lista.
      provide: CEP_PROVIDERS,
      useFactory: (viaCep: ViaCepAdapter, brasilApi: BrasilApiAdapter) => [viaCep, brasilApi],
      inject: [ViaCepAdapter, BrasilApiAdapter],
    },
  ],
})
export class CepModule {}
