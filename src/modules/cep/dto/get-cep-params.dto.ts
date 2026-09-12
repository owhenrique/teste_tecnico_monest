import { Matches } from 'class-validator';

import { CEP_FORMAT } from '../validators/cep.validator.js';

export class GetCepParamsDto {
  @Matches(CEP_FORMAT, { message: 'cep deve ter exatamente 8 dígitos, sem máscara' })
  cep!: string;
}
