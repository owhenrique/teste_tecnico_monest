import { Matches } from 'class-validator';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CEP_ERRORS } from '../errors/cep-error.dictionary.js';
import { CEP_FORMAT } from '../validators/cep.validator.js';

export class GetCepParamsDto {
  @Matches(CEP_FORMAT, { message: CEP_ERRORS[CepErrorCode.INVALID_CEP].message })
  cep!: string;
}
