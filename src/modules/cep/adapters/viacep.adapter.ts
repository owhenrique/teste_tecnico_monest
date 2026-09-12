import { Injectable } from '@nestjs/common';

import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';

/** Resposta do ViaCEP, nos campos que o contrato único usa. */
interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
}

@Injectable()
export class ViaCepAdapter implements CepProvider {
  readonly name = CepProviderName.VIACEP;

  async findOne(cep: string): Promise<Address> {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const body = (await response.json()) as ViaCepResponse;

    return {
      cep: body.cep.replace('-', ''),
      logradouro: body.logradouro,
      complemento: body.complemento,
      bairro: body.bairro,
      cidade: body.localidade,
      estado: body.uf,
    };
  }
}
