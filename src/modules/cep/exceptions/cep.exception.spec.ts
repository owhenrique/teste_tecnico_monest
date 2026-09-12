import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CepException } from './cep.exception.js';

describe('CepException', () => {
  it.each([
    [CepErrorCode.INVALID_CEP, HttpStatus.BAD_REQUEST, 'INVALID_CEP'],
    [CepErrorCode.CEP_NOT_FOUND, HttpStatus.NOT_FOUND, 'CEP_NOT_FOUND'],
    [CepErrorCode.PROVIDER_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_UNAVAILABLE'],
    [CepErrorCode.ALL_PROVIDERS_FAILED, HttpStatus.GATEWAY_TIMEOUT, 'ALL_PROVIDERS_FAILED'],
  ])('traduz %s no status do dicionário', (code, status, expectedCode) => {
    const exception = new CepException(code);

    expect(exception.getStatus()).toBe(status);
    expect(exception.getResponse()).toMatchObject({ code: expectedCode });
  });

  it('expõe apenas código e mensagem no corpo', () => {
    const body = new CepException(CepErrorCode.ALL_PROVIDERS_FAILED).getResponse();

    expect(Object.keys(body as object).sort()).toEqual(['code', 'message']);
    expect((body as { message: string }).message).not.toBe('');
  });
});
