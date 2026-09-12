import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Nenhuma variável tem default, então o e2e precisa de um ambiente completo para o
    // ConfigModule validar. Declarado aqui em vez de num .env de teste em disco.
    env: {
      NODE_ENV: 'test',
      PORT: '3000',
      PROVIDER_TIMEOUT_MS: '2500',
      CIRCUIT_FAILURE_THRESHOLD: '3',
      CIRCUIT_RESET_MS: '30000',
      LOG_LEVEL: 'error',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
