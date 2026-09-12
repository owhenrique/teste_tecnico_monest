import { describe, expect, it } from 'vitest';

import { IssueLevel } from '../../../shared/sentry/issue-level.enum.js';
import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { FAILURE_ISSUE } from './failure-issue.dictionary.js';

describe('FAILURE_ISSUE', () => {
  it.each([CepFailureType.NOT_FOUND, CepFailureType.CIRCUIT_OPEN])('não reporta %s', (failure) => {
    expect(FAILURE_ISSUE[failure]).toBeNull();
  });

  it('reporta INVALID_RESPONSE como error: é o provedor mudando o contrato', () => {
    expect(FAILURE_ISSUE[CepFailureType.INVALID_RESPONSE]).toBe('error');
  });

  it.each([CepFailureType.TIMEOUT, CepFailureType.UNAVAILABLE, CepFailureType.RATE_LIMITED])(
    'reporta %s como warning: o sinal é o volume, não a ocorrência',
    (failure) => {
      expect(FAILURE_ISSUE[failure]).toBe('warning');
    },
  );

  it('decide sobre todo membro de CepFailureType', () => {
    const decididos = Object.keys(FAILURE_ISSUE).sort();

    expect(decididos).toEqual(Object.values(CepFailureType).sort());

    const niveisValidos: (IssueLevel | null)[] = [null, ...Object.values(IssueLevel)];

    for (const nivel of Object.values(FAILURE_ISSUE)) {
      expect(niveisValidos).toContain(nivel);
    }
  });
});
