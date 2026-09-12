# API de consulta de CEP

API que consulta CEP em múltiplos provedores externos e devolve um contrato único,
tolerando indisponibilidade e lentidão de qualquer um deles.

Enunciado do teste: [DESAFIO.md](DESAFIO.md) · Convenções de desenvolvimento: [AGENTS.md](AGENTS.md)

> **Status:** projeto inicializado. O endpoint `GET /cep/{cep}` ainda não foi implementado.

## Stack

NestJS 12 (ESM) · TypeScript 6 · Vitest · oxlint · Prettier

## Executando

```bash
npm install
npm run start:dev        # http://localhost:3000 (ou $PORT)
```

## Scripts

| script | o que faz |
| --- | --- |
| `npm run start:dev` | sobe a API em modo watch |
| `npm run build` | compila para `dist/` |
| `npm run start:prod` | executa o build |
| `npm test` | testes unitários (`src/**/*.spec.ts`) |
| `npm run test:e2e` | testes e2e (`test/**/*.e2e-spec.ts`) |
| `npm run typecheck` | `tsc --noEmit` — o Vitest não checa tipos |
| `npm run lint` | oxlint |
| `npm run format` | Prettier |

## Configuração

| variável | default | descrição |
| --- | --- | --- |
| `PORT` | `3000` | porta HTTP da aplicação |

## Contrato

A ser documentado com a implementação do endpoint.
