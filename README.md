# API de consulta de CEP

API que consulta CEP em múltiplos provedores externos e devolve um contrato único,
tolerando indisponibilidade e lentidão de qualquer um deles.

Enunciado do teste: [DESAFIO.md](DESAFIO.md) · Convenções de desenvolvimento: [AGENTS.md](AGENTS.md)

> **Status:** `GET /cep/{cep}` implementado, alternando entre ViaCEP e BrasilAPI em
> round-robin, com fallback, timeout por provedor e circuit breaker. Falta log estruturado
> por requisição (plano 03).

## Stack

NestJS 12 (ESM) · TypeScript 6 · Axios (`@nestjs/axios`) · Zod · Pino · OpenAPI + Scalar ·
Vitest · oxlint · Prettier

## Documentação interativa

Com a aplicação em `development`, a interface do Scalar fica em
**http://localhost:3000/docs**, e a especificação OpenAPI em `/openapi.json`. Dá para
disparar a rota pela própria página e ver o exemplo de corpo de cada um dos quatro erros.

Fora de `development` as duas rotas não existem — a spec nem chega a ser gerada.

## Executando

```bash
npm install
cp .env.example .env     # obrigatório: nenhuma variável tem default
npm run start:dev        # http://localhost:3000
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

**Todas as variáveis são obrigatórias** — nenhuma tem default. O `.env` é carregado pelo
`@nestjs/config`; em container ele não existe e as variáveis vêm do ambiente. O que a
aplicação exige são as *variáveis*, não o arquivo.

| variável | descrição |
| --- | --- |
| `PORT` | porta HTTP; inteiro entre 1 e 65535 |
| `NODE_ENV` | `development`, `test`, `staging` ou `production` |
| `PROVIDER_TIMEOUT_MS` | timeout de cada provedor; a request leva até 2× isso |
| `CIRCUIT_FAILURE_THRESHOLD` | falhas consecutivas que abrem o circuito |
| `CIRCUIT_RESET_MS` | tempo que o circuito fica aberto |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info`, `debug` ou `trace` |
| `SENTRY_DSN` | **opcional** — DSN do GlitchTip; ausente, nada é enviado |

Todas são validadas por Zod na partida. Configuração ausente ou inválida **derruba a
aplicação**, listando o que falta:

```
Error: Variáveis de ambiente inválidas:
  NODE_ENV: Invalid option: expected one of "development"|"test"|"staging"|"production"
  PROVIDER_TIMEOUT_MS: Invalid input: expected number, received NaN
  LOG_LEVEL: Invalid option: expected one of "fatal"|"error"|"warn"|"info"|"debug"|"trace"
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

Erros levam sempre `code` e `message`:

| status | `code` | quando |
| --- | --- | --- |
| `400` | `INVALID_CEP` | formato inválido |
| `404` | `CEP_NOT_FOUND` | algum provedor respondeu que o CEP não existe |
| `503` | `PROVIDER_UNAVAILABLE` | só um provedor pôde ser tentado, e ele falhou |
| `504` | `ALL_PROVIDERS_FAILED` | todos os provedores tentados falharam |

```json
{ "code": "CEP_NOT_FOUND", "message": "CEP não encontrado." }
```

Qual provedor falhou e por quê não entra no corpo: é dado de operação, não de cliente.

## Como funciona

```
GET /cep/:cep
  → ValidationPipe + GetCepParamsDto   valida a entrada
      → CepController.get()
          → CepService.findOne()           revalida e orquestra
              → ProviderRoundRobin.order() rotação: quem tenta primeiro, quem é fallback
                  → CircuitBreakerProvider  pula provedor que vem falhando
                      → CepProvider.findOne()  porta
                          → ViaCepAdapter | BrasilApiAdapter
```

O controller não conhece provedor; o service conhece só a porta `CepProvider`. Os
adaptadores são os únicos que sabem o formato de cada API externa.

**Adicionar uma terceira API** é escrever um adaptador que implemente `CepProvider` e
incluí-lo na lista do token `CEP_PROVIDERS`, em `cep.module.ts`. Controller, service e
seletor não mudam.

## Resiliência

- **Fallback.** Falha não-definitiva num provedor faz a consulta seguir para o próximo da
  rotação. Só `NOT_FOUND` interrompe, porque a resposta vale para todos.
- **Timeout por provedor** (`PROVIDER_TIMEOUT_MS`). Uma API pendurada não segura a request
  indefinidamente.
- **Circuit breaker por provedor.** Depois de N falhas consecutivas, o provedor para de ser
  chamado por `CIRCUIT_RESET_MS` — não se paga o timeout de novo em quem já se sabe fora.
  `NOT_FOUND` não conta: é resposta válida, não sintoma de saúde.

## Observabilidade

Log estruturado em JSON, uma linha por evento, todas correlacionadas pelo id da requisição.
O `X-Request-Id` de entrada é reaproveitado quando vem de um proxy ou gateway; na ausência,
um id é gerado.

```json
{"level":30,"req":{"id":"id-do-gateway-abc","method":"GET","url":"/cep/01001000"},
 "context":"CepService","event":"CEP_FOUND","provider":"viacep","cep":"01001000","durationMs":471}
```

`durationMs` acompanha todo evento: nos eventos de tentativa é o tempo daquele provedor;
no `LOOKUP_EXHAUSTED` é o total gasto antes de desistir. É a métrica mais direta para
comparar provedores e perceber degradação.

O nível reflete a severidade: `5xx` é `error`, `4xx` é `warn`, e `404` fica em `info` de
propósito — "CEP não existe" é resposta correta a uma pergunta válida, e como `warn`
encheria de ruído previsível qualquer alerta montado sobre o nível.

Diagnosticar uma falha é filtrar pelo id e ler a sequência: qual provedor foi tentado, por
que falhou, quanto demorou, e se algum circuito abriu. Em desenvolvimento a saída é
formatada por `pino-pretty`; nos demais ambientes, JSON puro em `stdout`.

## Issues no GlitchTip

Nem só `500` vira issue. Um provedor que muda o contrato responde `200` e o fallback
esconde a quebra; uma rajada de timeouts não é um erro, é um incidente. Então:

| situação | issue | nível |
| --- | --- | --- |
| provedor devolveu formato inesperado | sim | `error` |
| timeout, indisponibilidade, `429` | sim, **agrupados** | `warning` |
| circuito de um provedor abriu | sim | `error` |
| CEP inexistente ou formato inválido | **não** | — |

Timeouts são agrupados por `[provedor, falha]`: mil deles viram **uma** issue com mil
eventos, e o contador é a métrica. Todo evento leva o `requestId`, que liga a issue à
sequência de log da requisição.

Para experimentar:

```bash
docker compose -f docker-compose.glitchtip.yml up -d   # http://localhost:8989
# crie usuário e projeto, copie a DSN para SENTRY_DSN no .env
```

Sem `SENTRY_DSN`, nada disso precisa estar no ar — a API funciona por inteiro.

## Limitações conhecidas

- **`404` da BrasilAPI é tratado como CEP inexistente.** O corpo dela diz "Todos os serviços
  de CEP retornaram erro", o que também aconteceria se os upstreams *dela* caíssem — nesse
  caso responderíamos `404` sem consultar o ViaCEP.
- **Estado em memória.** Round-robin e circuito vivem no processo; com várias réplicas, cada
  uma tem a sua visão.
