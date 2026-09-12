import { Controller, Get, Param } from '@nestjs/common';

import { CepService } from './cep.service.js';
import { ApiGetCep } from './openapi/cep.openapi.js';
import { GetCepParamsDto } from './dto/get-cep-params.dto.js';
import { Address } from './interfaces/address.interface.js';

@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  @ApiGetCep()
  get(@Param() params: GetCepParamsDto): Promise<Address> {
    return this.cepService.findOne(params.cep);
  }
}
