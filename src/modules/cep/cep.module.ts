import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { ConfigService } from '@nestjs/config';

import { envOf } from '../../shared/env/env.js';
import { ISSUE_REPORTER } from '../../shared/sentry/issue-reporter.interface.js';
import { SentryIssueReporter } from '../../shared/sentry/sentry-issue-reporter.js';
import { Env } from '../../shared/env/env.schema.js';
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
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        timeout: envOf(config).PROVIDER_TIMEOUT_MS,
      }),
    }),
  ],
  controllers: [CepController],
  providers: [
    CepService,
    ProviderRoundRobin,
    { provide: ISSUE_REPORTER, useClass: SentryIssueReporter },
    ViaCepAdapter,
    BrasilApiAdapter,
    SentryIssueReporter,
    {
      provide: CEP_PROVIDERS,
      useFactory: (
        viaCep: ViaCepAdapter,
        brasilApi: BrasilApiAdapter,
        logger: PinoLogger,
        config: ConfigService<Env, true>,
        issues: SentryIssueReporter,
      ): CepProvider[] => {
        const env = envOf(config);

        return [viaCep, brasilApi].map(
          (provider) =>
            new CircuitBreakerProvider(
              provider,
              env.CIRCUIT_FAILURE_THRESHOLD,
              env.CIRCUIT_RESET_MS,
              logger,
              issues,
            ),
        );
      },
      inject: [ViaCepAdapter, BrasilApiAdapter, PinoLogger, ConfigService, SentryIssueReporter],
    },
  ],
})
export class CepModule {}
