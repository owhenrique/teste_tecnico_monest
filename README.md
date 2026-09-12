# API de consulta de CEP

API que consulta CEP em múltiplos provedores externos e devolve um contrato único,
tolerando indisponibilidade e lentidão de qualquer um deles.

Enunciado do teste: [DESAFIO.md](DESAFIO.md) · Convenções de desenvolvimento: [AGENTS.md](AGENTS.md)

> **Status:** `GET /cep/{cep}` implementado, alternando entre ViaCEP e BrasilAPI em
> round-robin. Ainda **sem tolerância a falha**: se o provedor da vez falhar, a exceção
> sobe — não há fallback para o outro, timeout nem distinção entre tipos de erro.

## Stack

NestJS 12 (ESM) · TypeScript 6 · Zod · Vitest · oxlint · Prettier

## Executando

```bash
npm install
cp .env.example .env     # opcional; sem ele valem os defaults
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

O `.env` é opcional e lido pelo próprio Node (`process.loadEnvFile`) na partida — em
produção as variáveis vêm do ambiente. `.env.example` lista todas.

| variável | default | descrição |
| --- | --- | --- |
| `PORT` | `3000` | porta HTTP; inteiro entre 1 e 65535 |
| `NODE_ENV` | `development` | `development`, `test` ou `production` |

As duas são validadas por Zod na partida, em `src/shared/env/`. Configuração inválida
**derruba a aplicação na hora**, nomeando a variável e o motivo:

```
Error: Variáveis de ambiente inválidas:
  PORT: Invalid input: expected number, received NaN
```

É deliberado: melhor não subir do que subir com configuração quebrada e o erro aparecer
sabe-se lá quando.

## Contrato

### `GET /cep/:cep`

`:cep` são exatamente 8 dígitos, sem máscara. `01001-000` é recusado.

**200**

```json
{
  "cep": "01001000",
  "logradouro": "Praça da Sé",
  "complemento": "lado ímpar",
  "bairro": "Sé",
  "cidade": "São Paulo",
  "estado": "SP"
}
```

O formato é o mesmo venha de qual provedor vier. `complemento` é `null` quando o provedor
que atendeu não expõe o campo — é o caso da BrasilAPI.

**400** — CEP fora do formato:

```json
{
  "message": ["cep deve ter exatamente 8 dígitos, sem máscara"],
  "error": "Bad Request",
  "statusCode": 400
}
```

## Como funciona

```
GET /cep/:cep
  → ValidationPipe + GetCepParamsDto   valida a entrada
      → CepController.get()
          → CepService.findOne()           revalida e orquestra
              → ProviderRoundRobin.next()  escolhe o provedor da vez
                  → CepProvider.findOne()  porta
                      → ViaCepAdapter | BrasilApiAdapter
```

O controller não conhece provedor; o service conhece só a porta `CepProvider`. Os
adaptadores são os únicos que sabem o formato de cada API externa.

**Adicionar uma terceira API** é escrever um adaptador que implemente `CepProvider` e
incluí-lo na lista do token `CEP_PROVIDERS`, em `cep.module.ts`. Controller, service e
seletor não mudam.

## Limitações conhecidas

- **Sem fallback.** Se o provedor sorteado falhar, a request falha — mesmo com o outro
  provedor no ar.
- **Sem timeout.** Uma API lenta segura a request pelo tempo que quiser.
- **CEP inexistente não é tratado.** O ViaCEP responde `HTTP 200` com corpo
  `{"erro": "true"}`; o adaptador não reconhece isso e a request estoura em 500. Pela
  BrasilAPI o mesmo CEP pode responder 200. Ou seja, hoje a resposta depende de quem
  atendeu.

Tudo isso é o escopo do próximo plano de implementação.
