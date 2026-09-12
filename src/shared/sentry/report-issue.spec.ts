import { afterEach, describe, expect, it } from 'vitest';

import { IssueLevel } from './issue-level.enum.js';
import { flushIssues, isSentryEnabled, reportIssue, setupSentry } from './report-issue.js';

const capturados: unknown[] = [];

function ligarSentry(): void {
  setupSentry({
    dsn: 'https://exemplo@localhost:8989/1',
    environment: 'test',
    beforeSend: (event) => {
      capturados.push(event);

      return null;
    },
  });
}

describe('reportIssue', () => {
  afterEach(() => {
    capturados.length = 0;
    setupSentry({ dsn: undefined, environment: 'test' });
  });

  it('fica desligado quando a DSN não é informada', () => {
    setupSentry({ dsn: undefined, environment: 'test' });

    expect(isSentryEnabled()).toBe(false);
  });

  it('fica desligado quando a DSN é string vazia', () => {
    setupSentry({ dsn: '', environment: 'test' });

    expect(isSentryEnabled()).toBe(false);
  });

  it('não envia nada quando está desligado', async () => {
    setupSentry({ dsn: undefined, environment: 'test' });

    reportIssue({
      level: IssueLevel.ERROR,
      message: 'provedor mudou o contrato',
      fingerprint: ['viacep', 'INVALID_RESPONSE'],
      context: { provider: 'viacep' },
    });

    expect(capturados).toHaveLength(0);
  });

  it('envia com nível, fingerprint e contexto quando ligado', async () => {
    ligarSentry();

    reportIssue({
      level: IssueLevel.WARNING,
      message: 'provedor falhou',
      fingerprint: ['viacep', 'TIMEOUT'],
      context: { provider: 'viacep', failure: 'TIMEOUT', requestId: 'req-1', durationMs: 2501 },
    });

    await flushIssues();

    const evento = capturados[0] as {
      level: string;
      fingerprint: string[];
      contexts: { cep: Record<string, unknown> };
    };

    expect(evento.level).toBe('warning');
    expect(evento.fingerprint).toEqual(['viacep', 'TIMEOUT']);
    expect(evento.contexts.cep).toMatchObject({
      provider: 'viacep',
      failure: 'TIMEOUT',
      requestId: 'req-1',
      durationMs: 2501,
    });
  });
});
