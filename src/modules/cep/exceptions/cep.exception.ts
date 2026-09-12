import { HttpException } from '@nestjs/common';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CEP_ERRORS } from '../errors/cep-error.dictionary.js';

export class CepException extends HttpException {
  constructor(readonly code: CepErrorCode) {
    const { status, message } = CEP_ERRORS[code];

    super({ code, message }, status);
  }
}
