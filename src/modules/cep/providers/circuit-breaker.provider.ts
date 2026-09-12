import { CircuitBreaker } from '../../../shared/circuit-breaker/circuit-breaker.js';
import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProviderError, isDefinitive } from '../errors/cep-provider.error.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';

/**
 * Adapta o `CircuitBreaker` compartilhado à porta `CepProvider`: como continua sendo um
 * `CepProvider`, o service e o round-robin não sabem que ele existe.
 *
 * O que este arquivo acrescenta é só o que é do domínio de CEP — `NOT_FOUND` não conta
 * como falha (é resposta válida, não sintoma de saúde), e o circuito aberto se anuncia
 * como `CepProviderError`.
 */
export class CircuitBreakerProvider implements CepProvider {
  readonly name: CepProviderName;

  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly provider: CepProvider,
    threshold: number,
    resetMs: number,
  ) {
    this.name = provider.name;
    this.breaker = new CircuitBreaker({
      threshold,
      resetMs,
      openError: () => new CepProviderError(this.name, CepFailureType.CIRCUIT_OPEN),
      ignoreFailure: (error) => error instanceof CepProviderError && isDefinitive(error.failure),
    });
  }

  findOne(cep: string): Promise<Address> {
    return this.breaker.run(() => this.provider.findOne(cep));
  }
}
