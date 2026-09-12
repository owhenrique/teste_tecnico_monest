import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

import { Env } from '../env/env.schema.js';
import { NodeEnv } from '../env/node-env.enum.js';

const DOCS_PATH = '/docs';
const SPEC_PATH = '/openapi.json';

export function setupApiDocs(app: INestApplication, env: Env): boolean {
  if (env.NODE_ENV !== NodeEnv.DEVELOPMENT) {
    return false;
  }

  const config = new DocumentBuilder()
    .setTitle('API de consulta de CEP')
    .setDescription(
      'Consulta CEP em múltiplos provedores externos e devolve um contrato único, ' +
        'tolerando indisponibilidade e lentidão de qualquer um deles.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  app.use(SPEC_PATH, (_request: unknown, response: { json: (body: unknown) => void }) => {
    response.json(document);
  });
  app.use(DOCS_PATH, apiReference({ content: document }));

  return true;
}
