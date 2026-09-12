import { ApiProperty } from '@nestjs/swagger';

import { Address } from '../interfaces/address.interface.js';

export class CepResponseDto implements Address {
  @ApiProperty({ example: '01001000', description: 'Oito dígitos, sem máscara.' })
  cep!: string;

  @ApiProperty({ example: 'Praça da Sé' })
  logradouro!: string;

  @ApiProperty({
    example: 'lado ímpar',
    nullable: true,
    description: 'Nulo quando o provedor que atendeu não expõe o campo.',
  })
  complemento!: string | null;

  @ApiProperty({ example: 'Sé' })
  bairro!: string;

  @ApiProperty({ example: 'São Paulo' })
  cidade!: string;

  @ApiProperty({ example: 'SP', description: 'UF.' })
  estado!: string;
}
