import { Injectable } from '@nestjs/common';

import { assertIsValidCep } from './validators/cep.validator.js';
import { Address } from './interfaces/address.interface.js';
import { ProviderRoundRobin } from './provider-round-robin.js';

@Injectable()
export class CepService {
  constructor(private readonly providers: ProviderRoundRobin) {}

  async findOne(cep: string): Promise<Address> {
    assertIsValidCep(cep);

    return this.providers.next().findOne(cep);
  }
}
