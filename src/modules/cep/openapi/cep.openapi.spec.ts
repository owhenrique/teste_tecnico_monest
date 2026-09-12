import { describe, expect, it } from 'vitest';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CEP_ERRORS } from '../errors/cep-error.dictionary.js';
import { DOCUMENTED_ERROR_CODES, errorResponseOptions } from './cep.openapi.js';

describe('errorResponseOptions', () => {
  it.each(Object.values(CepErrorCode))(
    'monta a resposta de %s com status e mensagem do dicionário',
    (code) => {
      const options = errorResponseOptions(code);

      expect(options.status).toBe(CEP_ERRORS[code].status);
      expect(options.schema).toMatchObject({
        example: { code, message: CEP_ERRORS[code].message },
      });
    },
  );
});

describe('DOCUMENTED_ERROR_CODES', () => {
  it('documenta todo membro de CepErrorCode', () => {
    expect([...DOCUMENTED_ERROR_CODES].sort()).toEqual(Object.values(CepErrorCode).sort());
  });
});
