import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PinoLogger } from 'nestjs-pino';

import { CepService } from './cep.service.js';
import { CepErrorCode } from './enums/cep-error-code.enum.js';
import { CepFailureType } from './enums/cep-failure-type.enum.js';
import { CepProviderName } from './enums/cep-provider-name.enum.js';
import { CepProviderError } from './errors/cep-provider.error.js';
import { CepException } from './exceptions/cep.exception.js';
import { Address } from './interfaces/address.interface.js';
import { CepProvider } from './interfaces/cep-provider.interface.js';
import { IssueReporter } from '../../shared/sentry/issue-reporter.interface.js';
import { ProviderRoundRobin } from './providers/provider-round-robin.js';

const ADDRESS: Address = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  cidade: 'São Paulo',
  estado: 'SP',
};

function providerFound(name: CepProviderName): CepProvider {
  return { name, findOne: vi.fn().mockResolvedValue(ADDRESS) };
}

function providerFailing(name: CepProviderName, failure: CepFailureType): CepProvider {
  return { name, findOne: vi.fn().mockRejectedValue(new CepProviderError(name, failure)) };
}

function selectorOf(...providers: CepProvider[]): ProviderRoundRobin {
  return { order: () => providers } as unknown as ProviderRoundRobin;
}

function fakeLogger(): PinoLogger {
  return {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as PinoLogger;
}

function fakeReporter(): IssueReporter {
  return { report: vi.fn() };
}

function serviceOf(
  logger: PinoLogger,
  reporter: IssueReporter,
  ...providers: CepProvider[]
): CepService {
  return new CepService(selectorOf(...providers), logger, reporter);
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

describe('CepService', () => {
  it('devolve o endereço do primeiro provedor que responde', async () => {
    const provider = providerFound(CepProviderName.VIACEP);
    const service = serviceOf(fakeLogger(), fakeReporter(), provider);

    await expect(service.findOne('01001000')).resolves.toEqual(ADDRESS);
    expect(provider.findOne).toHaveBeenCalledWith('01001000');
  });

  it.each(['01001-000', '1234567', '123456789', 'abcdefgh', '', '0100100a'])(
    'rejeita %j com CepException(INVALID_CEP), sem consultar provedor',
    async (invalid) => {
      const provider = providerFound(CepProviderName.VIACEP);
      const service = serviceOf(fakeLogger(), fakeReporter(), provider);

      const error = await caught(service.findOne(invalid));

      expect(error).toBeInstanceOf(CepException);
      expect((error as CepException).code).toBe(CepErrorCode.INVALID_CEP);
      expect((error as CepException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(provider.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([CepFailureType.TIMEOUT, CepFailureType.UNAVAILABLE, CepFailureType.RATE_LIMITED])(
    'cai para o próximo provedor quando o primeiro falha com %s',
    async (failure) => {
      const segundo = providerFound(CepProviderName.BRASILAPI);
      const service = serviceOf(
        fakeLogger(),
        fakeReporter(),
        providerFailing(CepProviderName.VIACEP, failure),
        segundo,
      );

      await expect(service.findOne('01001000')).resolves.toEqual(ADDRESS);
      expect(segundo.findOne).toHaveBeenCalledWith('01001000');
    },
  );

  it('trata NOT_FOUND como definitivo: 404 sem consultar o próximo provedor', async () => {
    const segundo = providerFound(CepProviderName.BRASILAPI);
    const service = serviceOf(
      fakeLogger(),
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND),
      segundo,
    );

    const error = await caught(service.findOne('00000000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.CEP_NOT_FOUND);
    expect((error as CepException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(segundo.findOne).not.toHaveBeenCalled();
  });

  it('responde 504 quando todos os provedores tentados falham', async () => {
    const service = serviceOf(
      fakeLogger(),
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFailing(CepProviderName.BRASILAPI, CepFailureType.UNAVAILABLE),
    );

    const error = await caught(service.findOne('01001000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.ALL_PROVIDERS_FAILED);
    expect((error as CepException).getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
  });

  it('responde 503 quando só um provedor pôde ser tentado e ele falhou', async () => {
    const service = serviceOf(
      fakeLogger(),
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.CIRCUIT_OPEN),
    );

    const error = await caught(service.findOne('01001000'));

    expect(error).toBeInstanceOf(CepException);
    expect((error as CepException).code).toBe(CepErrorCode.PROVIDER_UNAVAILABLE);
    expect((error as CepException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('loga PROVIDER_FAILED a cada tentativa que falha', async () => {
    const logger = fakeLogger();
    const service = serviceOf(
      logger,
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFound(CepProviderName.BRASILAPI),
    );

    await service.findOne('01001000');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'PROVIDER_FAILED',
        provider: 'viacep',
        failure: 'TIMEOUT',
        cep: '01001000',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('loga CEP_FOUND com o provedor que atendeu', async () => {
    const logger = fakeLogger();
    const service = serviceOf(logger, fakeReporter(), providerFound(CepProviderName.BRASILAPI));

    await service.findOne('01001000');

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CEP_FOUND',
        provider: 'brasilapi',
        cep: '01001000',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('loga CEP_NOT_FOUND quando a falha é definitiva', async () => {
    const logger = fakeLogger();
    const service = serviceOf(
      logger,
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND),
    );

    await caught(service.findOne('00000000'));

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'CEP_NOT_FOUND',
        provider: 'viacep',
        cep: '00000000',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('loga LOOKUP_EXHAUSTED com a falha de cada provedor', async () => {
    const logger = fakeLogger();
    const service = serviceOf(
      logger,
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFailing(CepProviderName.BRASILAPI, CepFailureType.UNAVAILABLE),
    );

    await caught(service.findOne('01001000'));

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'LOOKUP_EXHAUSTED',
        cep: '01001000',
        // Aqui o tempo é o total gasto até desistir, não o de uma tentativa.
        durationMs: expect.any(Number),
        failures: [
          { provider: 'viacep', failure: 'TIMEOUT' },
          { provider: 'brasilapi', failure: 'UNAVAILABLE' },
        ],
      }),
    );
  });

  it('não loga PROVIDER_FAILED em NOT_FOUND: é resposta válida, não falha do provedor', async () => {
    const logger = fakeLogger();
    const service = serviceOf(
      logger,
      fakeReporter(),
      providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND),
    );

    await caught(service.findOne('00000000'));

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reporta falha de provedor como issue, com requestId e duração', async () => {
    const reporter = fakeReporter();
    const service = serviceOf(
      fakeLogger(),
      reporter,
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFound(CepProviderName.BRASILAPI),
    );

    await service.findOne('01001000');

    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        fingerprint: ['viacep', 'TIMEOUT'],
        context: expect.objectContaining({
          provider: 'viacep',
          failure: 'TIMEOUT',
          cep: '01001000',
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('não reporta issue quando o CEP não existe', async () => {
    const reporter = fakeReporter();
    const service = serviceOf(
      fakeLogger(),
      reporter,
      providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND),
    );

    await caught(service.findOne('00000000'));

    expect(reporter.report).not.toHaveBeenCalled();
  });

  it('reporta issue de error quando a consulta inteira falha', async () => {
    const reporter = fakeReporter();
    const service = serviceOf(
      fakeLogger(),
      reporter,
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFailing(CepProviderName.BRASILAPI, CepFailureType.UNAVAILABLE),
    );

    await caught(service.findOne('01001000'));

    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        fingerprint: ['ALL_PROVIDERS_FAILED'],
        context: expect.objectContaining({
          cep: '01001000',
          durationMs: expect.any(Number),
          failures: [
            { provider: 'viacep', failure: 'TIMEOUT' },
            { provider: 'brasilapi', failure: 'UNAVAILABLE' },
          ],
        }),
      }),
    );
  });

  it('reporta PROVIDER_UNAVAILABLE como issue própria quando só um foi tentado', async () => {
    const reporter = fakeReporter();
    const service = serviceOf(
      fakeLogger(),
      reporter,
      providerFailing(CepProviderName.VIACEP, CepFailureType.UNAVAILABLE),
    );

    await caught(service.findOne('01001000'));

    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', fingerprint: ['PROVIDER_UNAVAILABLE'] }),
    );
  });
});
