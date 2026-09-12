import { HttpStatus } from '@nestjs/common';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';

interface CepErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const CEP_ERRORS: Record<CepErrorCode, CepErrorDefinition> = {
  [CepErrorCode.INVALID_CEP]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'CEP deve ter exatamente 8 dígitos, sem máscara.',
  },
  [CepErrorCode.CEP_NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: 'CEP não encontrado.',
  },
  [CepErrorCode.PROVIDER_UNAVAILABLE]: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'O provedor de CEP disponível não respondeu.',
  },
  [CepErrorCode.ALL_PROVIDERS_FAILED]: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    message: 'Nenhum provedor de CEP respondeu.',
  },
};
