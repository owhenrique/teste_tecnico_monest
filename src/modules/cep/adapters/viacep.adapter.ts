import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

import { CepFailureType } from '../enums/cep-failure-type.enum.js';
import { CepProviderName } from '../enums/cep-provider-name.enum.js';
import { CepProviderError } from '../errors/cep-provider.error.js';
import { Address } from '../interfaces/address.interface.js';
import { CepProvider } from '../interfaces/cep-provider.interface.js';
import { requestProvider } from '../utils/provider-request.js';

interface ViaCepResponse {
  erro?: string;
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

  constructor(private readonly http: HttpService) {}

  async findOne(cep: string): Promise<Address> {
    const data = await requestProvider<ViaCepResponse>(
      this.http,
      this.name,
      `https://viacep.com.br/ws/${cep}/json/`,
    );

    // O ViaCEP sinaliza "não existe" com HTTP 200 e o campo `erro` (string "true", não
    // booleano), então o axios não lança e a detecção precisa ser feita aqui.
    if (data.erro !== undefined) {
      throw new CepProviderError(this.name, CepFailureType.NOT_FOUND);
    }

    return {
      cep: data.cep.replace('-', ''),
      logradouro: data.logradouro,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };
  }
}
