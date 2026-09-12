import { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { Env } from '../env/env.schema.js';
import { NodeEnv } from '../env/node-env.enum.js';
import { setupApiDocs } from './setup-api-docs.js';

// O createDocument real precisa de um container do Nest. Aqui o que importa é a guarda de
// ambiente e a fiação das duas rotas, não a geração da spec.
vi.mock('@nestjs/swagger', () => ({
  DocumentBuilder: class {
    setTitle = () => this;
    setDescription = () => this;
    setVersion = () => this;
    build = () => ({});
  },
  SwaggerModule: { createDocument: () => ({ openapi: '3.0.0' }) },
}));

vi.mock('@scalar/nestjs-api-reference', () => ({
  apiReference: () => () => undefined,
}));

function fakeApp(): INestApplication {
  return { use: vi.fn() } as unknown as INestApplication;
}

function envWith(nodeEnv: NodeEnv): Env {
  return { NODE_ENV: nodeEnv } as Env;
}

describe('setupApiDocs', () => {
  it('monta a interface e a spec em development', () => {
    const app = fakeApp();

    expect(setupApiDocs(app, envWith(NodeEnv.DEVELOPMENT))).toBe(true);
    expect(app.use).toHaveBeenCalledWith('/openapi.json', expect.any(Function));
    expect(app.use).toHaveBeenCalledWith('/docs', expect.any(Function));
  });

  it.each([NodeEnv.TEST, NodeEnv.STAGING, NodeEnv.PRODUCTION])(
    'não monta nada em %s',
    (nodeEnv) => {
      const app = fakeApp();

      expect(setupApiDocs(app, envWith(nodeEnv))).toBe(false);
      expect(app.use).not.toHaveBeenCalled();
    },
  );
});
