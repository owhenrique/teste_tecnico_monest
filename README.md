# API de consulta de CEP

API que consulta CEP em múltiplos provedores externos e devolve um contrato único,
tolerando indisponibilidade e lentidão de qualquer um deles.

Enunciado do teste: [DESAFIO.md](DESAFIO.md) · Convenções de desenvolvimento: [AGENTS.md](AGENTS.md)

> **Status:** `GET /cep/{cep}` implementado, alternando entre ViaCEP e BrasilAPI em
> round-robin, com fallback, timeout por provedor e circuit breaker. Falta log estruturado
> por requisição (plano 03).

## Stack

NestJS 12 (ESM) · TypeScript 6 · Axios (`@nestjs/axios`) · Zod · Vitest · oxlint · Prettier

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
| `NODE_ENV` | `development` | `development`, `test`, `Staging` ou `production` |
| `PROVIDER_TIMEOUT_MS` | `2500` | timeout de cada provedor; a request leva até 2× isso |
| `CIRCUIT_FAILURE_THRESHOLD` | `3` | falhas consecutivas que abrem o circuito |
| `CIRCUIT_RESET_MS` | `30000` | tempo que o circuito fica aberto |

Todas são validadas por Zod na partida, em `src/shared/env/`. Configuração inválida
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

## Limitações conhecidas

- **Sem log estruturado.** É o que falta para responder "o que aconteceu em produção", e é
  o plano 03.
- **`404` da BrasilAPI é tratado como CEP inexistente.** O corpo dela diz "Todos os serviços
  de CEP retornaram erro", o que também aconteceria se os upstreams *dela* caíssem — nesse
  caso responderíamos `404` sem consultar o ViaCEP.
- **`400` tem formato diferente dos demais erros.** Vem do `ValidationPipe`
  (`{ message: [...], error, statusCode }`), não de `CepException`.
- **Estado em memória.** Round-robin e circuito vivem no processo; com várias réplicas, cada
  uma tem a sua visão.
