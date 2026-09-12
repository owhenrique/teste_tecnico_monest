import { IssueLevel } from '../../../shared/sentry/issue-level.enum.js';
import { CepFailureType } from '../enums/cep-failure-type.enum.js';

export const FAILURE_ISSUE: Record<CepFailureType, IssueLevel | null> = {
  [CepFailureType.NOT_FOUND]: null,
  [CepFailureType.CIRCUIT_OPEN]: null,
  [CepFailureType.INVALID_RESPONSE]: IssueLevel.ERROR,
  [CepFailureType.TIMEOUT]: IssueLevel.WARNING,
  [CepFailureType.UNAVAILABLE]: IssueLevel.WARNING,
  [CepFailureType.RATE_LIMITED]: IssueLevel.WARNING,
};
