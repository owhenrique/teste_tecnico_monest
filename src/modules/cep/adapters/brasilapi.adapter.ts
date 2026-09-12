import { Injectable } from '@nestjs/common';

import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';

/** Resposta da BrasilAPI, nos campos que o contrato único usa. */
interface BrasilApiResponse {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

@Injectable()
export class BrasilApiAdapter implements CepProvider {
  readonly name = CepProviderName.BRASILAPI;

  async findOne(cep: string): Promise<Address> {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`);
    const body = (await response.json()) as BrasilApiResponse;

    return {
      cep: body.cep,
      logradouro: body.street,
      // A BrasilAPI não expõe complemento; o contrato mantém o campo para não variar
      // de formato conforme o provedor que atendeu.
      complemento: null,
      bairro: body.neighborhood,
      cidade: body.city,
      estado: body.state,
    };
  }
}
