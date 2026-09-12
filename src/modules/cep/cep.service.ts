import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { CepErrorCode } from './enums/cep-error-code.enum.js';
import { CepLogEvent } from './enums/cep-log-event.enum.js';
import { CepProviderError, isDefinitive } from './errors/cep-provider.error.js';
import { CepException } from './exceptions/cep.exception.js';
import { Address } from './interfaces/address.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';
import { assertIsValidCep } from './validators/cep.validator.js';

@Injectable()
export class CepService {
  constructor(
    private readonly providers: ProviderRoundRobin,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CepService.name);
  }

  async findOne(cep: string): Promise<Address> {
    assertIsValidCep(cep);

    const failures: CepProviderError[] = [];

    for (const provider of this.providers.order()) {
      const startedAt = Date.now();

      try {
        const address = await provider.findOne(cep);

        this.logger.info({
          event: CepLogEvent.CEP_FOUND,
          provider: provider.name,
          cep,
          durationMs: Date.now() - startedAt,
        });

        return address;
      } catch (error: unknown) {
        if (!(error instanceof CepProviderError)) {
          throw error;
        }

        // Resposta definitiva vale para todos: consultar o próximo só gastaria latência.
        // E não é falha do provedor — por isso sai só o desfecho, sem PROVIDER_FAILED.
        if (isDefinitive(error.failure)) {
          this.logger.info({
            event: CepLogEvent.CEP_NOT_FOUND,
            provider: error.provider,
            cep,
          });

          throw new CepException(CepErrorCode.CEP_NOT_FOUND);
        }

        this.logger.warn({
          event: CepLogEvent.PROVIDER_FAILED,
          provider: error.provider,
          failure: error.failure,
          cep,
          durationMs: Date.now() - startedAt,
        });

        failures.push(error);
      }
    }

    this.logger.error({
      event: CepLogEvent.LOOKUP_EXHAUSTED,
      cep,
      failures: failures.map(({ provider, failure }) => ({ provider, failure })),
    });

    // Mais de um provedor tentado e nenhum entregou: os upstreams é que falharam (504).
    // Um só: não havia a quem recorrer (503).
    throw new CepException(
      failures.length > 1 ? CepErrorCode.ALL_PROVIDERS_FAILED : CepErrorCode.PROVIDER_UNAVAILABLE,
    );
  }
}
