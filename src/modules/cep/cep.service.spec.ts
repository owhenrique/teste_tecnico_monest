import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CepService } from './cep.service.js';
import { InvalidCepException } from './exceptions/invalid-cep.exception.js';
import { CepProviderName } from './enums/cep-provider-name.enum.js';
import { Address } from './interfaces/address.interface.js';
import { CepProvider } from './interfaces/cep-provider.interface.js';
import { ProviderRoundRobin } from './provider-round-robin.js';

const ADDRESS: Address = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  cidade: 'São Paulo',
  estado: 'SP',
};

describe('CepService', () => {
  it('devolve o endereço do provedor entregue pelo seletor', async () => {
    const findOne = vi.fn().mockResolvedValue(ADDRESS);
    const provider: CepProvider = { name: CepProviderName.VIACEP, findOne };
    const selector = { next: () => provider } as unknown as ProviderRoundRobin;
    const service = new CepService(selector);

    await expect(service.findOne('01001000')).resolves.toEqual(ADDRESS);
    expect(findOne).toHaveBeenCalledWith('01001000');
  });

  it.each(['01001-000', '1234567', '123456789', 'abcdefgh', ''])(
    'rejeita %j com InvalidCepException, sem consultar provedor',
    async (invalid) => {
      const next = vi.fn();
      const selector = { next } as unknown as ProviderRoundRobin;
      const service = new CepService(selector);

      const error = await service.findOne(invalid).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(InvalidCepException);
      expect((error as InvalidCepException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as InvalidCepException).getResponse()).toMatchObject({
        code: 'INVALID_CEP',
        cep: invalid,
      });
      expect(next).not.toHaveBeenCalled();
    },
  );
});
