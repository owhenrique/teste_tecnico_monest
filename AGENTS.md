# AGENTS.md

API de consulta de CEP (`GET /cep/{cep}`) em NestJS + TypeScript.

## Referências

- [DESAFIO.md](DESAFIO.md): enunciado do teste (requisitos).
- [README.md](README.md): como executar, contrato e resumo da solução.
- `docs.md` de cada módulo: regras e decisões do módulo. Leia antes de alterar o módulo.
- [docs/agents/module-docs.md](docs/agents/module-docs.md): formato do `docs.md`. Leia ao criar ou alterar um.
- [docs/plans/README.md](docs/plans/README.md): planos de implementação, em ordem. Leia antes de implementar.

## Comandos

- Teste de um arquivo: `npx vitest run <arquivo>.spec.ts`
- Todos os unitários: `npm test` · E2E: `npm run test:e2e`
- Tipos: `npx tsc --noEmit` (o Vitest não checa tipos)
- Lint: `npx oxlint <arquivo>` · Formatação: `npx prettier --write <arquivo>`

## Regras

1. **TDD.** Todo comportamento novo ou alterado: teste falhando pelo motivo esperado (RED) → mínimo de código para passar (GREEN) → refatorar com os testes verdes. Um comportamento por ciclo.
2. **`docs.md` por módulo.** Todo diretório com `*.module.ts` tem um `docs.md`, atualizado na mesma alteração que muda regra de negócio, estrutura ou decisão do módulo.
3. **Status HTTP.** Use o enum `HttpStatus` de `@nestjs/common`, nunca número literal, no código e nos testes.
4. **Enums para valores fixos.** Resultados, tipos de falha, eventos de log e códigos de erro são `enum` (um por arquivo, `<nome>.enum.ts`, membros `UPPER_SNAKE_CASE`), nunca strings soltas no código. Nos testes, entradas passadas a APIs tipadas usam o enum; asserções sobre a saída (corpo HTTP, logs) usam a string literal, para detectar mudança de valor.