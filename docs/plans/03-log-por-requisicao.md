# 03 — Log estruturado por requisição

> **Implementado.** Desvios em "Desvios da implementação", no fim.

## Problema

Quando uma consulta falha em produção, hoje não há como saber o que aconteceu. O corpo do
erro leva só `code` e `message` — por decisão do plano 02, que mandou o diagnóstico para o
log. Só que o log ainda não existe: qual provedor foi tentado, qual falhou, por quê, quanto
demorou e se algum circuito abriu são informações que o processo tem e joga fora.

## Escopo

**Neste plano:** log estruturado em JSON, uma linha por requisição correlacionada por
`requestId`, mais os eventos de domínio que explicam o desfecho — falha de provedor,
provedor que atendeu, esgotamento e transição de circuito.

**Fora deste plano:** métricas (contadores, histogramas), tracing distribuído, envio para
coletor externo. O log sai em `stdout`; quem coleta é problema do deploy.

## Decisão de base: `nestjs-pino`

Verificado em 2026-09-12: `nestjs-pino@5.1.0` declara `@nestjs/core: ^11.0.8 || ^12.0.0`.

O `ConsoleLogger` do Nest 12 já faz JSON (`{ json: true }`), então a dependência **não** é
por causa do formato. É por causa da correlação:

| | à mão | `nestjs-pino` |
| --- | --- | --- |
| `requestId` por request | gerar e propagar | pronto |
| propagar sem sujar assinatura | `AsyncLocalStorage` nosso | interno |
| linha por request (método, rota, status, duração) | montar | pronto |
| campos na raiz do JSON | não, ficam sob `message` | sim |
| código nosso | ~60–80 linhas + testes | ~10 de config |

A parte cara não é o interceptor: é o `AsyncLocalStorage`. Perder contexto atravessando
fronteira assíncrona é falha silenciosa — o log sai sem o id — e chata de testar.

**Custo aceito:** o formato de log da aplicação inteira muda, inclusive o bootstrap, porque
o logger do Nest é substituído pelo do pino (`app.useLogger`). Em desenvolvimento,
`pino-pretty` devolve a legibilidade.

## Formato

Uma linha JSON por evento, com `requestId` em todas as da mesma requisição:

```json
{"level":30,"time":1789189119434,"reqId":"c7a1…","event":"PROVIDER_FAILED",
 "provider":"viacep","failure":"TIMEOUT","cep":"01001000","durationMs":2501}
```

```json
{"level":30,"time":1789189119940,"reqId":"c7a1…","req":{"method":"GET","url":"/cep/01001000"},
 "res":{"statusCode":200},"responseTime":506,"msg":"request completed"}
```

## Eventos

Enum `CepLogEvent` (regra 4 do AGENTS.md), um arquivo, membros `UPPER_SNAKE_CASE`:

| evento | nível | quando | campos |
| --- | --- | --- | --- |
| `PROVIDER_FAILED` | `warn` | cada tentativa que falha | `provider`, `failure`, `cep`, `durationMs` |
| `CEP_FOUND` | `info` | consulta atendida | `provider`, `cep`, `durationMs` |
| `CEP_NOT_FOUND` | `info` | provedor disse que não existe | `provider`, `cep` |
| `LOOKUP_EXHAUSTED` | `error` | nenhum provedor entregou | `cep`, `failures[]` |
| `CIRCUIT_OPENED` | `error` | circuito de um provedor abriu | `provider`, `consecutiveFailures` |
| `CIRCUIT_CLOSED` | `info` | circuito voltou a fechar | `provider` |

**Uma linha por tentativa que falha, não por tentativa.** A tentativa bem-sucedida já
aparece em `CEP_FOUND`; registrar também o "vou tentar" dobraria o volume sem acrescentar
diagnóstico.

`failures[]` no `LOOKUP_EXHAUSTED` é exatamente a lista que o `CepService` já acumula hoje e
não usa para nada além de escolher entre `503` e `504`.

## `requestId`

Respeitamos `X-Request-Id` de entrada quando vier; senão, geramos. É o comportamento
esperado atrás de proxy ou gateway, e permite casar nosso log com o de quem chamou.

**Ressalva:** o header é de quem chama, portanto forjável. Serve para correlacionar, nunca
para autorizar, deduplicar ou indexar como identidade.

## Configuração

Soma-se ao schema Zod em `src/shared/env/` e ao `.env.example`:

| variável | default | descrição |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

Formatação legível (`pino-pretty`) liga quando `NODE_ENV` é `development`; nos demais, JSON
puro. O enum `NodeEnv` já existe.

## Arquivos

```
src/modules/cep/
  cep.service.ts                  (altera: loga desfecho e falhas)
  enums/cep-log-event.enum.ts     (novo)
  providers/circuit-breaker.provider.ts  (altera: loga transição)
src/shared/circuit-breaker/
  circuit-breaker.ts              (altera: ganha onStateChange)
src/
  main.ts                         (altera: app.useLogger)
  app.module.ts                   (altera: importa LoggerModule)
```

## Regras

1. Toda linha de log emitida durante uma requisição carrega o `requestId` dela.
2. `X-Request-Id` de entrada é reaproveitado; na ausência, um id é gerado.
3. Cada tentativa de provedor que falha gera uma linha `PROVIDER_FAILED` com provedor, tipo
   de falha e duração.
4. Toda consulta termina com exatamente uma linha de desfecho: `CEP_FOUND`, `CEP_NOT_FOUND`
   ou `LOOKUP_EXHAUSTED`.
5. Abertura e fechamento de circuito são registrados, com o provedor.
6. Log não carrega segredo nem credencial. O CEP entra — é a chave da consulta e sem ele o
   log não diagnostica nada.

## Decisões

- **`nestjs-pino` em vez de `AsyncLocalStorage` próprio** — justificada acima. Mesmo critério
  que recusou `@nestjs/config` (duas variáveis não pagavam) e aceitou `@nestjs/axios`
  (timeout e interceptor pagavam).
- **O `CircuitBreaker` de `shared/` não conhece logger** — ganha `onStateChange?: (state) =>
  void` nas opções, e quem loga é o `CircuitBreakerProvider`, que já é o lugar do que é
  específico de CEP. Mesmo padrão de `openError` e `ignoreFailure`. Descartado injetar logger
  no genérico, que o amarraria ao Nest e o tornaria inútil fora dele.
- **Nível de log por evento, não tudo em `info`** — `PROVIDER_FAILED` é `warn` porque é
  esperado e tratado (existe fallback); `LOOKUP_EXHAUSTED` e `CIRCUIT_OPENED` são `error`
  porque exigem ação. Alerta deve poder ser montado em cima do nível.
- **`CEP_FOUND` em `info`, não `debug`** — é o que mostra a distribuição do round-robin e qual
  provedor sustenta o tráfego. Se o volume incomodar, desce para `debug` sem mudar nada mais.

## Ciclos de TDD

| # | RED | unidade |
| --- | --- | --- |
| 1 | loga `PROVIDER_FAILED` com provedor, falha e duração | `CepService` |
| 2 | loga `CEP_FOUND` com provedor e duração | `CepService` |
| 3 | loga `CEP_NOT_FOUND` quando a falha é definitiva | `CepService` |
| 4 | loga `LOOKUP_EXHAUSTED` com a lista de falhas | `CepService` |
| 5 | chama `onStateChange` ao abrir e ao fechar | `CircuitBreaker` (shared) |
| 6 | loga `CIRCUIT_OPENED` e `CIRCUIT_CLOSED` | `CircuitBreakerProvider` |
| 7 | `LOG_LEVEL` tem default e recusa nível desconhecido | `loadEnv` |
| 8 | `genReqId` reaproveita `X-Request-Id` e gera na ausência | config do logger |

Os ciclos 1–4 e 6 usam um logger falso injetado; nenhum teste lê `stdout`. O ciclo 8 testa a
função de configuração isolada, sem subir a aplicação.

**Impacto nos testes existentes:** o `CepService` ganha um logger no construtor, e os 11
testes de `cep.service.spec.ts` passam a construí-lo com um falso. É mudança mecânica, mas
aparece grande no diff — vale um commit separado do resto se ficar ruidoso.

## Pendências

- **Verificar na ligação** o formato exato da linha automática do `pino-http` e se `genReqId`
  lê `X-Request-Id` por padrão ou precisa ser escrito. O plano assume que precisa.
- **`autoLogging` para rotas de health**, quando existirem: hoje não há, mas quando houver
  vale excluí-las para não afogar o log.

## Desvios da implementação

1. **As duas pendências se confirmaram.** O `pino-http` gera `req.id` por **contador**
   (`1`, `2`, …), que zera a cada restart e colide entre réplicas, e **não** lê
   `X-Request-Id`. `buildRequestId` foi escrito, como o plano previa.
2. **Serializers enxutos entraram sem estar no plano.** O padrão do `pino-http` despeja
   todos os headers de requisição e resposta — aqui inofensivo, mas em qualquer contexto com
   autenticação levaria `Authorization` e cookies para o log. `req` ficou em
   `{ id, method, url }` e `res` em `{ statusCode }`.
3. **`NOT_FOUND` deixou de gerar `PROVIDER_FAILED`** (ciclo extra). O log da aplicação
   rodando mostrou duas linhas para um CEP inexistente, uma delas rotulando como falha do
   provedor o que é resposta válida — o oposto da regra que já valia no circuito.
4. **O `requestId` não fica na raiz do JSON**, e sim em `req.id`. A correlação funciona
   (verificado com a aplicação no ar), então não valeu um logger customizado só para mover o
   campo.
5. **`LogLevel` virou enum em `shared/logger/`**, pela regra 4 do AGENTS.md, e o
   `LOG_LEVEL` entrou no schema Zod.
6. **`customLogLevel` faltou no plano.** Sem ele o `pino-http` registra a linha de
   requisição sempre em `info`, e `400`, `404` e `504` ficam indistinguíveis de `200` —
   alerta montado sobre nível não funciona. `requestLogLevel` mapeia `5xx` para `error` e
   `4xx` para `warn`, com `404` mantido em `info`. Também entrou `autoLogging.ignore` para
   `/favicon.ico`, que o navegador pede em toda visita.
