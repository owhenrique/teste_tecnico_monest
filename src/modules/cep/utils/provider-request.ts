import { HttpService } from '@nestjs/axios';
import { HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProviderError } from '../errors/cep-provider.error.js';

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/** Regra da porta: nenhum `AxiosError` escapa do adaptador; tudo vira `CepProviderError`. */
export async function requestProvider<T>(
  http: HttpService,
  provider: CepProviderName,
  url: string,
  notFoundStatus?: HttpStatus,
): Promise<T> {
  try {
    const { data } = await firstValueFrom(http.get<T>(url));

    return data;
  } catch (error: unknown) {
    throw new CepProviderError(
      provider,
      failureFromAxios(error, notFoundStatus),
      error instanceof Error ? error.message : undefined,
    );
  }
}

/** `notFoundStatus` é opcional porque o ViaCEP não usa status para "não existe": responde `200`. */
function failureFromAxios(error: unknown, notFoundStatus?: HttpStatus): CepFailureType {
  if (!(error instanceof AxiosError)) {
    return CepFailureType.UNAVAILABLE;
  }

  if (error.code !== undefined && TIMEOUT_CODES.has(error.code)) {
    return CepFailureType.TIMEOUT;
  }

  const status = error.response?.status;

  if (status === undefined) {
    return CepFailureType.UNAVAILABLE;
  }

  if (status === notFoundStatus) {
    return CepFailureType.NOT_FOUND;
  }

  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return CepFailureType.RATE_LIMITED;
  }

  return status >= HttpStatus.INTERNAL_SERVER_ERROR
    ? CepFailureType.UNAVAILABLE
    : CepFailureType.INVALID_RESPONSE;
}
