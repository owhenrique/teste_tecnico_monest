import { PinoLogger } from 'nestjs-pino';

import { CircuitBreaker } from '../../../shared/circuit-breaker/circuit-breaker.js';
import { CircuitState } from '../../../shared/circuit-breaker/circuit-state.enum.js';
import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepLogEvent } from '../enums/cep-log-event.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProviderError, isDefinitive } from '../errors/cep-provider.error.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';

/**
 * Adapta o `CircuitBreaker` compartilhado à porta `CepProvider`: como continua sendo um
 * `CepProvider`, o service e o round-robin não sabem que ele existe.
 *
 * O que este arquivo acrescenta é só o que é do domínio de CEP — `NOT_FOUND` não conta
 * como falha (é resposta válida, não sintoma de saúde), o circuito aberto se anuncia como
 * `CepProviderError`, e a transição de estado vira log.
 */
export class CircuitBreakerProvider implements CepProvider {
  readonly name: CepProviderName;

  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly provider: CepProvider,
    threshold: number,
    resetMs: number,
    private readonly logger: PinoLogger,
  ) {
    this.name = provider.name;
    this.breaker = new CircuitBreaker({
      threshold,
      resetMs,
      openError: () => new CepProviderError(this.name, CepFailureType.CIRCUIT_OPEN),
      ignoreFailure: (error) => error instanceof CepProviderError && isDefinitive(error.failure),
      onStateChange: (state, consecutiveFailures) => {
        this.logStateChange(state, consecutiveFailures);
      },
    });
  }

  findOne(cep: string): Promise<Address> {
    return this.breaker.run(() => this.provider.findOne(cep));
  }

  /** Abrir exige ação e é `error`; voltar a fechar é só informação. */
  private logStateChange(state: CircuitState, consecutiveFailures: number): void {
    if (state === CircuitState.OPEN) {
      this.logger.error({
        event: CepLogEvent.CIRCUIT_OPENED,
        provider: this.name,
        consecutiveFailures,
      });

      return;
    }

    this.logger.info({ event: CepLogEvent.CIRCUIT_CLOSED, provider: this.name });
  }
}
