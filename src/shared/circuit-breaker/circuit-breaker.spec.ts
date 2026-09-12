import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CircuitBreaker } from './circuit-breaker.js';
import { CircuitState } from './circuit-state.enum.js';

const THRESHOLD = 3;
const RESET_MS = 30_000;

class OpenError extends Error {}
class Ignorable extends Error {}

function breaker(): CircuitBreaker {
  return new CircuitBreaker({
    threshold: THRESHOLD,
    resetMs: RESET_MS,
    openError: () => new OpenError('circuito aberto'),
    ignoreFailure: (error) => error instanceof Ignorable,
  });
}

async function runFailing(subject: CircuitBreaker, operation: () => Promise<never>, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await subject.run(operation).catch(() => undefined);
  }
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devolve o resultado da operação enquanto fechado', async () => {
    await expect(breaker().run(async () => 'ok')).resolves.toBe('ok');
  });

  it('abre após N falhas consecutivas e passa a lançar openError sem executar', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('falhou'));
    const subject = breaker();

    await runFailing(subject, operation as () => Promise<never>, THRESHOLD);

    await expect(subject.run(operation as () => Promise<never>)).rejects.toBeInstanceOf(OpenError);
    expect(operation).toHaveBeenCalledTimes(THRESHOLD);
  });

  it('não conta as falhas que ignoreFailure marca', async () => {
    const operation = vi.fn().mockRejectedValue(new Ignorable('não conta'));
    const subject = breaker();

    await runFailing(subject, operation as () => Promise<never>, THRESHOLD + 2);

    expect(operation).toHaveBeenCalledTimes(THRESHOLD + 2);
  });

  it('um sucesso zera o contador de falhas consecutivas', async () => {
    const subject = breaker();
    const failing = vi.fn().mockRejectedValue(new Error('falhou'));

    await runFailing(subject, failing as () => Promise<never>, THRESHOLD - 1);
    await subject.run(async () => 'ok');
    await runFailing(subject, failing as () => Promise<never>, THRESHOLD - 1);

    // Sem o reset, as 4 falhas teriam aberto o circuito na terceira.
    await expect(subject.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('fecha de novo passado o cooldown', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('falhou'));
    const subject = breaker();

    await runFailing(subject, operation as () => Promise<never>, THRESHOLD);

    vi.advanceTimersByTime(RESET_MS - 1);
    await expect(subject.run(operation as () => Promise<never>)).rejects.toBeInstanceOf(OpenError);

    vi.advanceTimersByTime(2);
    await expect(subject.run(operation as () => Promise<never>)).rejects.not.toBeInstanceOf(
      OpenError,
    );
    expect(operation).toHaveBeenCalledTimes(THRESHOLD + 1);
  });

  it('avisa a transição de estado ao abrir e ao fechar', async () => {
    const onStateChange = vi.fn();
    const subject = new CircuitBreaker({
      threshold: THRESHOLD,
      resetMs: RESET_MS,
      openError: () => new OpenError('circuito aberto'),
      onStateChange,
    });
    const operation = vi.fn().mockRejectedValue(new Error('falhou'));

    await runFailing(subject, operation as () => Promise<never>, THRESHOLD);
    expect(onStateChange).toHaveBeenCalledWith(CircuitState.OPEN, THRESHOLD);

    vi.advanceTimersByTime(RESET_MS + 1);
    await subject.run(operation as () => Promise<never>).catch(() => undefined);

    expect(onStateChange).toHaveBeenCalledWith(CircuitState.CLOSED, 0);
  });
});
