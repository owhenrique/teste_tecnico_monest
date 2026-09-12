import { CepErrorCode } from '../enums/cep-error-code.enum.js';
import { CepException } from '../exceptions/cep.exception.js';

/** Oito dígitos, sem máscara. Fonte única do formato: o DTO valida com ela via `@Matches`. */
export const CEP_FORMAT = /^[0-9]{8}$/;

export function assertIsValidCep(cep: string): void {
  if (!CEP_FORMAT.test(cep)) {
    throw new CepException(CepErrorCode.INVALID_CEP);
  }
}
