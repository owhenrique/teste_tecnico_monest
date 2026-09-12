import { ApiProperty } from '@nestjs/swagger';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';

export class ErrorResponseDto {
  @ApiProperty({ enum: CepErrorCode, example: CepErrorCode.CEP_NOT_FOUND })
  code!: CepErrorCode;

  @ApiProperty({ example: 'CEP não encontrado.' })
  message!: string;
}
