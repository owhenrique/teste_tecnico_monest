import { HttpException, HttpStatus } from '@nestjs/common';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';

export class InvalidCepException extends HttpException {
  constructor(cep: string) {
    super(
      {
        code: CepErrorCode.INVALID_CEP,
        message: 'CEP deve ter exatamente 8 dígitos, sem máscara.',
        cep,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
