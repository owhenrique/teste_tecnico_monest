import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import { CepResponseDto } from '../dto/cep-response.dto.js';
import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CEP_ERRORS } from '../errors/cep-error.dictionary.js';


export const DOCUMENTED_ERROR_CODES: readonly CepErrorCode[] = Object.values(CepErrorCode);

interface ErrorResponseOptions {
  status: HttpStatus;
  description: string;
  schema: { example: { code: CepErrorCode; message: string } };
}

export function errorResponseOptions(code: CepErrorCode): ErrorResponseOptions {
  const { status, message } = CEP_ERRORS[code];

  return {
    status,
    description: message,
    schema: { example: { code, message } },
  };
}

export function ApiGetCep(): MethodDecorator {
  return applyDecorators(
    ApiOperation({
      summary: 'Consulta um CEP',
      description:
        'Alterna entre ViaCEP e BrasilAPI em round-robin. Se o provedor da vez falhar, ' +
        'cai para o próximo; a resposta tem o mesmo formato venha de qual vier.',
    }),
    ApiParam({
      name: 'cep',
      example: '01001000',
      description: 'Exatamente 8 dígitos, sem máscara.',
    }),
    ApiOkResponse({ type: CepResponseDto }),
    ...DOCUMENTED_ERROR_CODES.map((code) => ApiResponse(errorResponseOptions(code))),
  );
}
