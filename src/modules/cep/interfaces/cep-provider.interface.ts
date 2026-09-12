import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { Address } from './address.interface.js';

/**
 * Porta que todo provedor externo de CEP implementa. Adicionar um provedor é escrever
 * um adaptador desta interface e acrescentá-lo à lista do token CEP_PROVIDERS.
 */
export interface CepProvider {
  readonly name: CepProviderName;
  findOne(cep: string): Promise<Address>;
}

/** Token de injeção da lista de provedores disponíveis. */
export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');
