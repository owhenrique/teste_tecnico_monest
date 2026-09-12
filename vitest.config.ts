import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
  },
  // O esbuild do Vite não emite metadata de decorator; o SWC emite,
  // e sem ela a injeção de dependências do Nest não resolve nos testes.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
