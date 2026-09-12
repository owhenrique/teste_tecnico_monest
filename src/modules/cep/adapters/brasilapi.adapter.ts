import { HttpService } from '@nestjs/axios';
import { HttpStatus, Injectable } from '@nestjs/common';

import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';
import { requestProvider } from '../utils/provider-request.js';

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

  constructor(private readonly http: HttpService) {}

  async findOne(cep: string): Promise<Address> {
    // A BrasilAPI responde 404 com `type: "service_error"` — "Todos os serviços de CEP
    // retornaram erro". Tratamos como CEP inexistente, que é o caso comum. Limitação
    // aceita: se os upstreams dela caírem, viramos 404 sem consultar o ViaCEP.
    const data = await requestProvider<BrasilApiResponse>(
      this.http,
      this.name,
      `https://brasilapi.com.br/api/cep/v1/${cep}`,
      HttpStatus.NOT_FOUND,
    );

    return {
      cep: data.cep,
      logradouro: data.street,
      complemento: null,
      bairro: data.neighborhood,
      cidade: data.city,
      estado: data.state,
    };
  }
}
