import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { CepProviderName } from '../src/modules/cep/enums/cep-provider-name.enum.js';
import { Address } from '../src/modules/cep/interfaces/address.interface.js';
import {
  CEP_PROVIDERS,
  CepProvider,
} from '../src/modules/cep/interfaces/cep-provider.interface.js';

const ADDRESS: Address = {
  cep: '01001000',
  logradouro: 'Praça da Sé',
  complemento: 'lado ímpar',
  bairro: 'Sé',
  cidade: 'São Paulo',
  estado: 'SP',
};

/** Provedor falso: o e2e verifica a fiação da aplicação, não as APIs externas. */
const fakeProvider: CepProvider = {
  name: CepProviderName.VIACEP,
  findOne: async () => ADDRESS,
};

describe('GET /cep/:cep (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CEP_PROVIDERS)
      .useValue([fakeProvider])
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com o contrato único', async () => {
    const response = await request(app.getHttpServer()).get('/cep/01001000');

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body).toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      complemento: 'lado ímpar',
      bairro: 'Sé',
      cidade: 'São Paulo',
      estado: 'SP',
    });
  });

  it('responde 400 para CEP com máscara', async () => {
    const response = await request(app.getHttpServer()).get('/cep/01001-000');

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
