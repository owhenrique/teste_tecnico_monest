import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { Address } from './address.interface.js';

export interface CepProvider {
  readonly name: CepProviderName;
  findOne(cep: string): Promise<Address>;
}

export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');
