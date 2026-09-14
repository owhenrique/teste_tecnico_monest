# API de consulta de CEP

Consulta CEP em [ViaCEP](https://viacep.com.br/) e [BrasilAPI](https://brasilapi.com.br/) e devolve **um contrato único**, independente de qual das duas respondeu.

O ponto do problema não é consultar CEP — é continuar funcionando quando as APIs externas caem, demoram ou mudam de contrato. Então a API alterna entre os provedores, cai para o outro quando um falha, desiste de quem está lento, para de chamar quem já se sabe fora, e registra tudo de um jeito que dá para descobrir o que aconteceu depois.

Enunciado do teste: [DESAFIO.md](DESAFIO.md) · Convenções de desenvolvimento:
[AGENTS.md](AGENTS.md) · Planos de implementação: [docs/plans](docs/plans/README.md)

---

## Instalação e como rodar

Requer **Node 22.12+ ou 24+**.

```bash
npm install
cp .env.example .env      # obrigatório: nenhuma variável tem default
npm run start:dev         # http://localhost:3000
```

Testando:

```bash
curl localhost:3000/cep/01001000     # 200 com o endereço
curl localhost:3000/cep/00000000     # 404, CEP não existe
curl localhost:3000/cep/1            # 400, formato inválido
```

Em `development`, a documentação interativa (Scalar) fica em
**http://localhost:3000/docs** — dá para disparar a rota pela própria página.

### Testes

```bash
npm test           # 91 unitários
npm run test:e2e   #  7 e2e
npm run typecheck  # o Vitest não checa tipos
npm run lint
```

---

## Funcionalidades

### `GET /cep/:cep`

`:cep` são exatamente 8 dígitos, sem máscara. `01001-000` é recusado.

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

Erros levam sempre `code` e `message`, nunca detalhe interno:

| status | `code` | quando |
| --- | --- | --- |
| `400` | `INVALID_CEP` | formato inválido |
| `404` | `CEP_NOT_FOUND` | algum provedor respondeu que o CEP não existe |
| `503` | `PROVIDER_UNAVAILABLE` | só um provedor pôde ser tentado, e ele falhou |
| `504` | `ALL_PROVIDERS_FAILED` | todos os provedores tentados falharam |

### Resiliência

- **Fallback.** Falha não-definitiva faz a consulta seguir para o próximo provedor. Só
  `NOT_FOUND` interrompe, porque essa resposta vale para todos.
- **Timeout por provedor** (`PROVIDER_TIMEOUT_MS`). Uma API pendurada não segura a request
  indefinidamente.
- **Circuit breaker por provedor.** Após N falhas consecutivas, o provedor para de ser
  chamado por `CIRCUIT_RESET_MS` — não se paga o timeout de novo em quem já se sabe fora.
  `NOT_FOUND` não conta: é resposta válida, não sintoma de saúde.

### Observabilidade

Log JSON, uma linha por evento, todas correlacionadas pelo id da requisição. O
`X-Request-Id` de entrada é reaproveitado quando vem de um proxy; na ausência, um id é
gerado.

```json
{"level":30,"req":{"id":"id-do-gateway-abc","method":"GET","url":"/cep/01001000"},
 "context":"CepService","event":"CEP_FOUND","provider":"viacep","cep":"01001000","durationMs":471}
```

`durationMs` acompanha todo evento — nos de tentativa é o tempo daquele provedor; no
`LOOKUP_EXHAUSTED` é o total antes de desistir. O nível reflete a severidade: `5xx` é
`error`, `4xx` é `warn`, e `404` fica em `info` de propósito, porque "CEP não existe" é
resposta correta a uma pergunta válida e encheria de ruído qualquer alerta.

Diagnosticar uma falha é filtrar pelo id e ler a sequência: qual provedor foi tentado, por
que falhou, quanto demorou, se algum circuito abriu.

### Issues no GlitchTip

Nem só `500` vira issue. Um provedor que muda o contrato responde `200` e o fallback
esconde a quebra; uma rajada de timeouts não é um erro, é um incidente.

| situação | issue | nível |
| --- | --- | --- |
| provedor devolveu formato inesperado | sim | `error` |
| timeout, indisponibilidade, `429` | sim, **agrupados** | `warning` |
| circuito de um provedor abriu | sim | `error` |
| consulta inteira falhou (`503`/`504`) | sim | `error` |
| CEP inexistente ou formato inválido | **não** | — |

Agrupamento por `[provedor, falha]`: mil timeouts viram **uma** issue com mil eventos, e o
contador é a métrica.

Cada evento traz:

- a tag **`request_id`** — filtre por ela na interface e ache a mesma sequência no log pelo
  `req.id`;
- método e URL da requisição, e um **`curl` pronto** em *Contexts → reproduce* para
  reexecutar a consulta.

Nada de sensível sai: cookies, headers, corpo, IP, query string e variáveis locais da pilha
são removidos antes do envio.

```bash
docker compose -f docker-compose.glitchtip.yml up -d   # http://localhost:8989
# crie usuário e projeto, copie a DSN para SENTRY_DSN no .env
```

Sem `SENTRY_DSN`, nada disso precisa estar no ar — a API funciona por inteiro.

---

## Arquitetura

```
GET /cep/:cep
  → ValidationPipe + GetCepParamsDto   valida a entrada
      → CepController.getCep()
          → CepService.findOne()           orquestra e decide o desfecho
              → ProviderRoundRobin.order() rotação: quem tenta primeiro, quem é fallback
                  → CircuitBreakerProvider  pula provedor que vem falhando
                      → CepProvider.findOne()  ← a porta
                          → ViaCepAdapter | BrasilApiAdapter
```

A peça central é a porta **`CepProvider`**. O controller não conhece provedor; o service
conhece só a porta e o seletor; os adaptadores são os únicos que sabem o formato de cada
API externa, e nenhum `AxiosError` escapa deles — tudo vira `CepProviderError` com um tipo
de falha do domínio.

**Adicionar uma terceira API** é escrever um adaptador que implemente `CepProvider` e
incluí-lo na lista do token `CEP_PROVIDERS`, em `cep.module.ts`. Controller, service,
seletor e circuit breaker não mudam — o breaker embrulha qualquer provedor igual.

```
src/
  modules/cep/
    cep.controller.ts        rota
    cep.service.ts           orquestra: fallback, definitivo × retentável, log e issue
    adapters/                ViaCEP e BrasilAPI: só eles sabem o formato externo
    providers/               round-robin e circuit breaker
    interfaces/              Address e a porta CepProvider
    errors/ exceptions/      dicionário de erro e a exceção única de fronteira
    enums/ dto/ validators/ openapi/ utils/
  shared/
    circuit-breaker/         máquina de estados genérica, sem nada de CEP
    env/                     schema Zod do ambiente
    logger/                  nível por status, requestId
    sentry/                  porta de reporte; só ela importa o SDK
    openapi/                 documentação, montada só em development
```

O que está em `shared/` não conhece o domínio: o `CircuitBreaker` recebe *qual erro lançar*
e *quais falhas ignorar* por parâmetro, em vez de importar tipos de CEP. É o que permite
outro módulo reusá-lo sem copiar nada.

### Decisões e desvios

Cada funcionalidade nasceu de um plano escrito antes do código, e cada plano registra no
fim os **desvios** — onde a implementação discordou do planejado e por quê. Estão em
[docs/plans](docs/plans/README.md). Decisões por módulo ficam no `docs.md` de cada um.

---

## Configuração

**Todas as variáveis são obrigatórias**, exceto `SENTRY_DSN`. O `.env` é carregado pelo
`@nestjs/config`; em container ele não existe e as variáveis vêm do ambiente — o que a
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

Validadas por Zod na partida. Configuração ausente ou inválida **derruba a aplicação**,
listando o que falta:

```
Error: Variáveis de ambiente inválidas:
  NODE_ENV: Invalid option: expected one of "development"|"test"|"staging"|"production"
  LOG_LEVEL: Invalid option: expected one of "fatal"|"error"|"warn"|"info"|"debug"|"trace"
```

É deliberado: melhor não subir do que subir com configuração quebrada e o erro aparecer
sabe-se lá quando.

## Stack

NestJS 12 (ESM) · TypeScript 6 · Axios (`@nestjs/axios`) · Zod · Pino · OpenAPI + Scalar ·
Sentry SDK · Vitest · oxlint · Prettier

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

## Limitações conhecidas

- **`404` da BrasilAPI é tratado como CEP inexistente.** O corpo dela diz "Todos os serviços
  de CEP retornaram erro", o que também aconteceria se os upstreams *dela* caíssem — nesse
  caso responderíamos `404` sem consultar o ViaCEP.
- **Estado em memória.** Round-robin e circuito vivem no processo; com várias réplicas, cada
  uma tem a sua visão. Compartilhar exigiria Redis, e o desafio exclui banco.
- **URLs dos provedores fixas no adaptador.** Externalizar puxaria configuração por ambiente
  para dois valores que nunca mudaram.

## Quem fez

**owhenrique** — https://github.com/owhenrique

