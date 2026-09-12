import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { CepFailureType } from '../src/modules/cep/enums/cep-failure-type.enum.js';
import { CepProviderName } from '../src/modules/cep/enums/cep-provider-name.enum.js';
import { CepProviderError } from '../src/modules/cep/errors/cep-provider.error.js';
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

function providerFailing(name: CepProviderName, failure: CepFailureType): CepProvider {
  return {
    name,
    findOne: async () => {
      throw new CepProviderError(name, failure);
    },
  };
}

async function appWith(providers: CepProvider[]): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CEP_PROVIDERS)
    .useValue(providers)
    .compile();
  const created = moduleRef.createNestApplication();

  await created.init();

  return created;
}

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

  it('responde 404 quando o provedor diz que o CEP não existe', async () => {
    const notFound = await appWith([
      providerFailing(CepProviderName.VIACEP, CepFailureType.NOT_FOUND),
    ]);

    try {
      const response = await request(notFound.getHttpServer()).get('/cep/00000000');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body).toEqual({
        code: 'CEP_NOT_FOUND',
        message: 'CEP não encontrado.',
      });
    } finally {
      await notFound.close();
    }
  });

  it('responde 504 quando todos os provedores falham', async () => {
    const allDown = await appWith([
      providerFailing(CepProviderName.VIACEP, CepFailureType.TIMEOUT),
      providerFailing(CepProviderName.BRASILAPI, CepFailureType.UNAVAILABLE),
    ]);

    try {
      const response = await request(allDown.getHttpServer()).get('/cep/01001000');

      expect(response.status).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(response.body).toEqual({
        code: 'ALL_PROVIDERS_FAILED',
        message: 'Nenhum provedor de CEP respondeu.',
      });
    } finally {
      await allDown.close();
    }
  });
});
