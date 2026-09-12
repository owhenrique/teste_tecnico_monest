import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { GetCepParamsDto } from './get-cep-params.dto.js';

async function validateCep(cep: unknown): Promise<string[]> {
  const dto = plainToInstance(GetCepParamsDto, { cep });
  const errors = await validate(dto);

  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('GetCepParamsDto', () => {
  it('aceita oito dígitos sem máscara', async () => {
    await expect(validateCep('01001000')).resolves.toEqual([]);
  });

  it.each(['01001-000', '1234567', '123456789', 'abcdefgh', '', '0100100a'])(
    'rejeita %j',
    async (invalid) => {
      await expect(validateCep(invalid)).resolves.not.toEqual([]);
    },
  );
});
