import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { ISSUE_REPORTER, IssueReporter } from '../../shared/sentry/issue-reporter.interface.js';
import { IssueLevel } from '../../shared/sentry/issue-level.enum.js';
import { CepErrorCode } from './enums/cep-error-code.enum.js';
import { CepLogEvent } from './enums/cep-log-event.enum.js';
import { CepProviderError, isDefinitive } from './errors/cep-provider.error.js';
import { FAILURE_ISSUE } from './errors/failure-issue.dictionary.js';
import { CepException } from './exceptions/cep.exception.js';
import { Address } from './interfaces/address.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';
import { assertIsValidCep } from './validators/cep.validator.js';

@Injectable()
export class CepService {
  constructor(
    private readonly providers: ProviderRoundRobin,
    private readonly logger: PinoLogger,
    @Inject(ISSUE_REPORTER) private readonly issues: IssueReporter,
  ) {
    this.logger.setContext(CepService.name);
  }

  async findOne(cep: string): Promise<Address> {
    assertIsValidCep(cep);

    const failures: CepProviderError[] = [];
    const lookupStartedAt = Date.now();

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

        // Definitiva vale para todos os provedores: parar aqui é a regra, e não é falha
        // do provedor — por isso nenhum PROVIDER_FAILED.
        if (isDefinitive(error.failure)) {
          this.logger.info({
            event: CepLogEvent.CEP_NOT_FOUND,
            provider: error.provider,
            cep,
            durationMs: Date.now() - startedAt,
          });

          throw new CepException(CepErrorCode.CEP_NOT_FOUND);
        }

        const durationMs = Date.now() - startedAt;

        this.logger.warn({
          event: CepLogEvent.PROVIDER_FAILED,
          provider: error.provider,
          failure: error.failure,
          cep,
          durationMs,
        });

        this.reportFailure(error, cep, durationMs);
        failures.push(error);
      }
    }

    const failuresSummary = failures.map(({ provider, failure }) => ({ provider, failure }));
    const durationMs = Date.now() - lookupStartedAt;
    const code =
      failures.length > 1 ? CepErrorCode.ALL_PROVIDERS_FAILED : CepErrorCode.PROVIDER_UNAVAILABLE;

    this.logger.error({
      event: CepLogEvent.LOOKUP_EXHAUSTED,
      cep,
      durationMs,
      failures: failuresSummary,
    });

    // Issue própria: as falhas por provedor já viraram `warning`, mas devolver erro ao
    // cliente é outra severidade. Fingerprint pelo código para 504 e 503 não se misturarem.
    this.issues.report({
      level: IssueLevel.ERROR,
      message: `consulta de CEP falhou: ${code}`,
      fingerprint: [code],
      context: { cep, durationMs, failures: failuresSummary },
    });

    throw new CepException(code);
  }

  /** O dicionário decide se vira issue; fingerprint por provedor e falha agrupa a rajada. */
  private reportFailure(error: CepProviderError, cep: string, durationMs: number): void {
    const level = FAILURE_ISSUE[error.failure];

    if (level === null) {
      return;
    }

    this.issues.report({
      level,
      message: `${error.provider}: ${error.failure}`,
      fingerprint: [error.provider, error.failure],
      context: { provider: error.provider, failure: error.failure, cep, durationMs },
    });
  }
}
