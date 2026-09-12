# 05 — Issues no GlitchTip

> **Implementado.** Desvios em "Desvios da implementação", no fim.

## Problema

O log já conta o que aconteceu, mas ninguém o lê antes de alguém reclamar. Dois casos
concretos passam despercebidos hoje:

1. **Provedor muda o contrato.** Se o ViaCEP renomear `localidade`, o adaptador começa a
   devolver `cidade: undefined` ou a estourar — vira um `INVALID_RESPONSE` em `warn`, o
   fallback cobre, e a API continua respondendo `200`. Quebra silenciosa.
2. **Provedor fica lento.** Um timeout isolado é irrelevante: o fallback resolveu. Mil
   timeouts em uma hora são um incidente. A diferença é volume, e volume não aparece
   olhando linha por linha.

Nenhum dos dois é `500`. Mandar só `5xx` para o rastreador deixaria os dois de fora.

## Escopo

**Neste plano:** envio de eventos para o GlitchTip, a taxonomia do que vira issue e em que
nível, agrupamento que transforma repetição em contador, e contexto suficiente para saltar
da issue para o log.

**Fora deste plano:** tracing e performance (o GlitchTip cobre parcialmente e nosso
diagnóstico não depende disso), source maps, profiling, regras de alerta.

## Dependência: `@sentry/node`, não `@sentry/nestjs`

Verificado em 2026-09-12:

| pacote | versão | `@nestjs/core` no peer |
| --- | --- | --- |
| `@sentry/nestjs` | 10.74.0 (latest) | `^8 \|\| ^9 \|\| ^10 \|\| ^11` — **sem o 12** |
| `@sentry/nestjs` | 11.0.0-beta.2 | inclui `^12`, mas é prerelease |
| `@sentry/node` | 10.74.0 | nenhum peer de framework |

O projeto está em Nest 12. Usar o SDK de Nest exigiria um beta ou forçar resolução de
peer. **Decisão: `@sentry/node` direto.**

Não é só contornar incompatibilidade — o valor do SDK de Nest é capturar exceção
automaticamente e instrumentar, e este plano quer exatamente o oposto: **curadoria** do que
vira issue. O que sobraria dele nós não usaríamos.

O GlitchTip fala o protocolo de ingestão do Sentry, então o SDK é o mesmo; o que muda é a
DSN.

## Ambiente local

Um `docker-compose.glitchtip.yml` separado, **só para desenvolvimento** — não é a aplicação
e não entra em nenhum deploy. O desafio exclui banco e deploy do que avalia; isto é
ferramenta de quem desenvolve.

Quatro serviços:

| serviço | papel | porta no host |
| --- | --- | --- |
| `web` | interface e ingestão de eventos | **8989** → `8000` do contêiner |
| `worker` | processa os eventos da fila | — |
| `postgres` | onde as issues ficam guardadas | — (só rede interna) |
| `redis` | fila entre web e worker | — (só rede interna) |

**Só o `web` é publicado.** Postgres e Redis ficam na rede do compose: `5432` e `6379` são
as portas que a máquina de quem desenvolve mais tem chance de já estar usando, e nada fora
do compose precisa falar com eles. Para inspecionar o banco, `docker compose exec postgres
psql` resolve sem abrir porta.

**`8989` no host, `8000` dentro do contêiner.** O `8000` interno é o padrão da imagem e não
muda; o que se escolhe é o lado de fora. Evitado `8000` no host por ser a porta mais
disputada em ambiente de desenvolvimento, e `9090` por ser a convenção do Prometheus — se
um dia entrarem métricas, colidiria.

A aplicação continua em `3000`; nenhuma das duas encosta na outra.

**Armadilha:** a variável `GLITCHTIP_DOMAIN` precisa bater com a URL publicada
(`http://localhost:8989`). Se ficar apontando para `8000`, a interface sobe normalmente mas
a DSN que ela gera aponta para a porta errada, e os eventos não chegam — falha silenciosa,
porque o SDK não reclama de destino inalcançável.

**Por que não o Sentry self-hosted:** a stack oficial sobe Postgres, Redis, Kafka,
ClickHouse, Snuba, Relay, Symbolicator, workers e cron — mais de vinte contêineres, com
mínimo documentado na casa de 4 CPUs e 16 GB de RAM. O GlitchTip cobre o que este plano
precisa (ingestão, agrupamento por fingerprint, contagem de eventos, níveis) em quatro
contêineres e ~1 GB.

### Ordem de partida

`web` e `worker` só sobem depois de o banco estar **pronto para aceitar conexão**, não
apenas iniciado:

```yaml
postgres:
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U glitchtip']
    interval: 5s
    timeout: 5s
    retries: 10
web:
  depends_on:
    postgres: { condition: service_healthy }
    redis: { condition: service_healthy }
```

`depends_on` sozinho espera o contêiner **iniciar**, não o serviço ficar utilizável — é a
armadilha clássica. O GlitchTip roda migração na partida do `web`; sem o `service_healthy`,
ele tenta conectar antes de o Postgres aceitar, morre, e o compose sobe com um serviço em
reinício que parece funcionar até alguém abrir a interface.

Fluxo de uso: sobe o compose, abre `http://localhost:8989`, cria o primeiro usuário e um
projeto, copia a DSN para o `SENTRY_DSN` do `.env`. Com a DSN vazia, nada disso precisa estar rodando.

## Taxonomia: o que vira issue

O ponto central. Uma tabela decide tudo:

| situação | vira issue? | nível | por quê |
| --- | --- | --- | --- |
| `INVALID_CEP` (400) | **não** | — | erro de quem chamou, não nosso |
| `CEP_NOT_FOUND` (404) | **não** | — | resposta correta a pergunta válida |
| `INVALID_RESPONSE` | **sim** | `error` | o provedor mudou o contrato |
| `TIMEOUT` | sim | `warning` | isolado é irrelevante; o contador é o sinal |
| `UNAVAILABLE` | sim | `warning` | idem |
| `RATE_LIMITED` | sim | `warning` | idem, e indica que passamos do limite |
| `CIRCUIT_OPEN` | **não** | — | consequência, não causa: quem abriu já reportou |
| circuito abriu | sim | `error` | provedor fora; exige ação |
| `504` / `503` | sim | `error` | ninguém entregou |
| exceção não tratada | sim | `error` | bug nosso |

Três decisões embutidas aí, que são o plano inteiro:

- **`INVALID_RESPONSE` é `error` mesmo quando a request deu `200`.** O fallback esconde o
  problema do cliente, não de nós. É o caso "provedor mudou o contrato", e é o mais caro de
  descobrir tarde.
- **Timeout não é suprimido nem tratado como erro grave: é agrupado.** Com fingerprint por
  provedor e tipo, mil timeouts viram **uma** issue com mil eventos. O número na issue é a
  métrica; suprimir perderia isso, e reportar solto afogaria o painel.
- **`CIRCUIT_OPEN` não vira issue.** Ele é efeito de falhas que já foram reportadas; contá-lo
  duplicaria o mesmo incidente.

## Mecanismo

Dicionário, no mesmo molde de `CEP_ERRORS`:

```ts
// Record<CepFailureType, ...> obriga entrada para todo membro: tipo novo de falha sem
// decisão de reporte não compila.
export const FAILURE_ISSUE: Record<CepFailureType, IssueLevel | null> = {
  [CepFailureType.INVALID_RESPONSE]: IssueLevel.ERROR,
  [CepFailureType.TIMEOUT]: IssueLevel.WARNING,
  [CepFailureType.UNAVAILABLE]: IssueLevel.WARNING,
  [CepFailureType.RATE_LIMITED]: IssueLevel.WARNING,
  [CepFailureType.NOT_FOUND]: null,
  [CepFailureType.CIRCUIT_OPEN]: null,
};
```

`null` é "não reporta", explícito. A pergunta "isso vira issue?" tem um lugar só para ser
respondida.

## O domínio não conhece o Sentry

`shared/sentry/` expõe `reportIssue({ level, fingerprint, message, context })`, e só esse
arquivo importa o SDK. O `CepService` e o `CircuitBreakerProvider` chamam a porta, como já
fazem com o logger.

Mesmo princípio que mantém o `CircuitBreaker` de `shared/` sem conhecer logger: trocar
GlitchTip por outro destino não deve tocar em regra de negócio.

## Contexto do evento

Todo evento leva:

| campo | para quê |
| --- | --- |
| `requestId` | **salta da issue para o log**: é o mesmo id do `req.id` |
| `provider` | qual provedor |
| `failure` | tipo da falha |
| `durationMs` | separa "caiu" de "ficou lento" |
| `cep` | reproduzir |
| `environment` | vem de `NODE_ENV` |

O `requestId` é o que faz a ferramenta valer: a issue diz *o quê*, o log diz a sequência
inteira daquela requisição.

## Configuração

| variável | obrigatória? | descrição |
| --- | --- | --- |
| `SENTRY_DSN` | **não** | DSN do GlitchTip. Ausente ou vazia, nada é enviado. |

```ts
SENTRY_DSN: z.string().optional(),
```

**Esta é a única variável opcional do projeto, e é exceção deliberada.** A regra vale para
configuração de que a aplicação depende: sem `PORT` não existe default sensato, então faltar
é erro. O GlitchTip é *integração opcional* — quem só quer rodar a API não deveria precisar
subir contêiner nenhum, nem descobrir isso por um `exit 1` na cara.

Sem a variável, `reportIssue` vira no-op e o resto funciona igual: nenhum caminho de código
muda, nenhum log some, nenhuma rota se comporta diferente. No `.env.example` ela aparece
comentada, com a instrução de descomentar só se for usar.

Escolhido `.optional()` em vez de `.default('')`: ausência é o estado natural aqui, e um
default reintroduziria exatamente o padrão que a correção anterior removeu.

## Arquivos

```
docker-compose.glitchtip.yml (novo: só desenvolvimento)
src/shared/sentry/
  issue-level.enum.ts        (novo)
  report-issue.ts            (novo: única porta; só ele importa o SDK)
  report-issue.spec.ts       (novo)
  sentry.setup.ts            (novo: init, chamado no main.ts)
src/modules/cep/
  errors/failure-issue.dictionary.ts   (novo: falha -> nível ou null)
  cep.service.ts                       (altera: reporta ao lado do log)
  providers/circuit-breaker.provider.ts (altera: reporta ao abrir)
src/shared/env/env.schema.ts           (altera: + SENTRY_DSN)
src/main.ts                            (altera: init antes do NestFactory)
vitest.config.e2e.ts                   (altera: SENTRY_DSN vazia)
```

## Regras

1. `INVALID_CEP` e `CEP_NOT_FOUND` nunca viram issue.
2. Toda falha de provedor com nível definido em `FAILURE_ISSUE` vira evento, com
   fingerprint `[provider, failure]` — repetição vira contador, não issues novas.
3. `INVALID_RESPONSE` é reportado em `error` mesmo quando o fallback atendeu a request.
4. Abertura de circuito vira evento `error`; `CIRCUIT_OPEN` em si não.
5. Todo evento carrega o `requestId` da requisição.
6. `SENTRY_DSN` ausente ou vazia desliga o envio sem que nenhum outro código mude de
   caminho — a aplicação sobe e funciona por inteiro sem GlitchTip.

## Decisões

- **`@sentry/node` em vez de `@sentry/nestjs`** — justificada acima: o SDK de Nest não
  declara Nest 12 fora de um beta, e sua principal vantagem (captura automática) é o oposto
  do que este plano quer.
- **Timeout agrupado, não suprimido** — o volume *é* a informação. Fingerprint por provedor
  e tipo transforma repetição no contador da issue.
- **`INVALID_RESPONSE` em `error`** — o único sinal de que um provedor mudou o contrato. Sem
  ele, a quebra só apareceria quando os dois provedores mudassem no mesmo dia.
- **Dicionário em vez de `if` espalhado** — `Record<CepFailureType, …>` faz o compilador
  exigir decisão para tipo de falha novo.
- **DSN opcional, e é a única do projeto** — quem avalia o teste deve conseguir rodar a API
  sem subir contêiner de observabilidade. Exceção consciente à regra de que toda variável é
  obrigatória, que vale para configuração de que a aplicação depende, não para integração
  opcional. Descartado um `SENTRY_ENABLED` separado, que permitiria o estado incoerente
  "ligado sem DSN".

## Ciclos de TDD

| # | RED | unidade |
| --- | --- | --- |
| 1 | `NOT_FOUND` e `CIRCUIT_OPEN` não têm nível de issue | `FAILURE_ISSUE` |
| 2 | `INVALID_RESPONSE` é `error`; timeout e afins, `warning` | `FAILURE_ISSUE` |
| 3 | `reportIssue` não envia nada com DSN ausente ou vazia | `reportIssue` |
| 4 | `reportIssue` envia com fingerprint e contexto | `reportIssue` |
| 5 | falha de provedor reportável vira evento com `requestId` | `CepService` |
| 6 | `NOT_FOUND` não gera evento | `CepService` |
| 7 | abertura de circuito gera evento `error` | `CircuitBreakerProvider` |

Os ciclos 5–7 usam um dublê da porta `reportIssue`; nenhum teste fala com a rede.

## Verificação manual

Com um GlitchTip local e `SENTRY_DSN` apontando para ele: forçar timeout (baixar
`PROVIDER_TIMEOUT_MS` para `1`) e confirmar que **uma** issue acumula eventos em vez de
abrir várias; consultar CEP inexistente e confirmar que **nada** aparece.

## Pendências

- **`Sentry.init` antes dos demais imports.** O SDK v10 recomenda carregar via
  `--import ./instrument.mjs` para instrumentar automaticamente. Como aqui o envio é
  explícito, `init()` no topo do `main.ts` deve bastar — **verificar**, e não assumir.
- **Nível `warning` no GlitchTip.** Confirmar que ele agrupa e lista eventos de nível
  `warning` como issue, e não só `error`.
- **`cep` no corpo do evento.** É dado de entrada do usuário e ajuda a reproduzir; CEP
  sozinho não identifica ninguém, mas se algum dia o log carregar endereço completo, revisar.
- **Amostragem dos eventos `warning`.** A fila do transporte do Sentry é em memória e
  limitada: cheia, ela descarta. Numa rajada de mil timeouts, os `warning` podem empurrar
  para fora os `error`, que são os que exigem ação — quanto pior o incidente, menos
  confiável o painel. A correção é enviar 1 em cada N `warning`, já que o valor deles é a
  tendência. Muda o significado do contador da issue, que vira amostra e não total, e isso
  precisa ficar registrado. **Confirmar o tamanho padrão da fila** antes de escolher o N.
- **Variáveis do compose** (nomes de imagem e de env do GlitchTip) conferidas contra a
  documentação publicada na hora de escrever o arquivo, não de memória.

## Desvios da implementação

1. **`Sentry.init` no `main.ts` basta.** A pendência se resolveu contra a suposição: com
   envio explícito, sem instrumentação automática, não é preciso `--import instrument.mjs`.
   Verificado com `beforeSend` disparando num módulo comum.
2. **`flushIssues` entrou fora do plano.** O `beforeSend` roda no processamento assíncrono
   do evento, então o teste assertava antes de o evento existir. A função que faltava é a
   mesma que o encerramento precisa: sem drenar a fila, o evento capturado nos últimos
   instantes se perde — justamente o do incidente que derrubou a aplicação.
3. **Ciclo 2 não teve RED.** No GREEN do ciclo 1 escrevi o dicionário inteiro em vez do
   mínimo, então o ciclo seguinte nasceu verde. Os testes valem como caracterização, mas
   não guiaram código.
4. **Faltou o passo de migração.** A imagem do GlitchTip não migra o banco na partida: o
   `web` subia, servia a interface e respondia `400` em todo login porque as tabelas não
   existiam — e o front não mostra erro, então parecia interface quebrada. Entrou um serviço
   `migrate` rodando uma vez, com `web` e `worker` em
   `condition: service_completed_successfully`. O plano já mandava conferir o compose contra
   a documentação publicada em vez de escrevê-lo de memória; foi escrito de memória.
5. **`504`/`503` não viravam issue.** A taxonomia previa, mas a implementação só reportava
   falha por provedor — a consulta inteira falhando ficava só no log. Descoberto rodando a
   aplicação de verdade, não pelos testes, que cobriam só o que fora implementado.
6. **Compose verificado no ar.** A ordem de partida foi confirmada nos logs
   (`Waiting` → `Healthy` → `web`), e o caminho do evento também: o SDK entregou em
   `/api/1/envelope/` e o GlitchTip respondeu `Forbidden` com chave falsa, o que prova
   conectividade ponta a ponta. Depois da correção acima, subida do zero com volume limpo
   deixa a interface em `200`, a tabela `users_user` criada e `enableUserRegistration: true`.

## Pendências restantes

- **Amostragem dos eventos `warning`** — a fila do transporte é limitada e descarta quando
  cheia; numa rajada os `warning` poderiam empurrar os `error` para fora. **Menos urgente do
  que parecia:** o circuit breaker já limita a rajada na origem. Medido com DSN real — dez
  requisições em falha total geraram só 3 eventos `TIMEOUT` por provedor, porque na terceira
  falha consecutiva o circuito abre e as seguintes viram `CIRCUIT_OPEN`, que não é
  reportado. O breaker funciona como limitador natural do fluxo de issues, de graça.

## Verificado com projeto real

Agrupamento confirmado em 2026-09-12, com DSN do GlitchTip local. Dez requisições sob
falha total produziram ~28 eventos e **5 issues**:

| issue | nível | eventos |
| --- | --- | --- |
| `consulta de CEP falhou: ALL_PROVIDERS_FAILED` | `error` | 10 |
| `brasilapi: TIMEOUT` | `warning` | 3 |
| `viacep: TIMEOUT` | `warning` | 3 |
| `viacep: circuito aberto` | `error` | 1 |
| `brasilapi: circuito aberto` | `error` | 1 |

O fingerprint entrega o que o plano prometia: repetição vira contador, não issue nova.
