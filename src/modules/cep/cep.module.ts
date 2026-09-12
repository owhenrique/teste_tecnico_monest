import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { loadEnv } from '../../shared/env/env.js';
import { BrasilApiAdapter } from './adapters/brasilapi.adapter.js';
import { ViaCepAdapter } from './adapters/viacep.adapter.js';
import { CepController } from './cep.controller.js';
import { CepService } from './cep.service.js';
import { CircuitBreakerProvider } from './providers/circuit-breaker.provider.js';
import { CEP_PROVIDERS, CepProvider } from './interfaces/cep-provider.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';

@Module({
  imports: [
    HttpModule.registerAsync({
      // Lido aqui, e não no import do módulo, para o .env já ter sido carregado.
      useFactory: () => ({ timeout: loadEnv(process.env).PROVIDER_TIMEOUT_MS }),
    }),
  ],
  controllers: [CepController],
  providers: [
    CepService,
    ProviderRoundRobin,
    ViaCepAdapter,
    BrasilApiAdapter,
    {
      // Acrescentar um provedor novo é escrever o adaptador e incluí-lo nesta lista; o
      // circuit breaker vem junto, porque embrulha todo mundo igual.
      provide: CEP_PROVIDERS,
      useFactory: (
        viaCep: ViaCepAdapter,
        brasilApi: BrasilApiAdapter,
        logger: PinoLogger,
      ): CepProvider[] => {
        const env = loadEnv(process.env);

        return [viaCep, brasilApi].map(
          (provider) =>
            new CircuitBreakerProvider(
              provider,
              env.CIRCUIT_FAILURE_THRESHOLD,
              env.CIRCUIT_RESET_MS,
              logger,
            ),
        );
      },
      inject: [ViaCepAdapter, BrasilApiAdapter, PinoLogger],
    },
  ],
})
export class CepModule {}
