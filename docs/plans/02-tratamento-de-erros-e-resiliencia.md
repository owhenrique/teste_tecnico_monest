# 02 — Tratamento de erros e resiliência

> **Implementado.** Desvios em "Desvios da implementação", no fim.

## Problema

Hoje qualquer falha vira `500`. CEP inexistente, provedor lento e provedor fora do ar são
indistinguíveis para quem chama, e não há fallback: o provedor sorteado decide o resultado
sozinho. Um CEP que existe pode falhar só porque calhou de cair no provedor que está fora.

## Escopo

**Neste plano:** taxonomia de falhas, captura do erro de cada provedor, fallback para o
próximo, timeout por provedor, circuit breaker e o contrato de erro HTTP.

**Fora deste plano:** log estruturado e observabilidade (plano 03), cache de resposta e
retry dentro do mesmo provedor — o fallback já cobre o caso de uma falha isolada.

## Comportamento real das APIs

Medido em 2026-09-12, chamando as duas diretamente. É a base do mapeamento; sem isso o
adaptador vira adivinhação.

| caso | ViaCEP | BrasilAPI v1 |
| --- | --- | --- |
| CEP existente | `200` + JSON | `200` + JSON |
| CEP inexistente | **`200`** + `{"erro": "true"}` | `404` + JSON `type: "service_error"` |
| CEP malformado | `400` + **`text/html`** | `400` + JSON `type: "validation_error"` |
| latência típica | ~0,48 s | ~0,12 s |

Três armadilhas que saem daí:

1. **ViaCEP sinaliza "não encontrado" com `HTTP 200`.** O axios não lança, e é exatamente
   por isso que hoje o adaptador estoura ao ler `data.cep`. O campo é a *string* `"true"`,
   não o booleano `true`.
2. **O `400` do ViaCEP devolve HTML, não JSON.** Qualquer código que assuma corpo JSON
   produz lixo. Não deveria acontecer, porque o DTO já barra CEP malformado — se
   acontecer, é bug nosso.
3. **O `404` da BrasilAPI é ambíguo.** A mensagem é "Todos os serviços de CEP retornaram
   erro", com `type: "service_error"` e um array `errors[]` por serviço consultado. Para
   um CEP inexistente os itens dizem "CEP não encontrado"; mas o mesmo `404` apareceria se
   os upstreams dela estivessem fora. Ver "Pendências a decidir".

## Taxonomia de falhas

Enum `CepFailureType` (regra 4 do AGENTS.md), com uma distinção que governa todo o resto:

| tipo | definitiva? | significado |
| --- | --- | --- |
| `NOT_FOUND` | **sim** | o provedor respondeu que o CEP não existe |
| `TIMEOUT` | não | não respondeu dentro do prazo |
| `UNAVAILABLE` | não | erro de rede, ou `5xx` |
| `RATE_LIMITED` | não | `429` |
| `INVALID_RESPONSE` | não | respondeu fora do formato esperado |
| `CIRCUIT_OPEN` | não | circuito aberto; nem chegou a chamar |

**Definitiva** quer dizer: a resposta vale para todos os provedores, e consultar o próximo
só gastaria latência. Só `NOT_FOUND` é definitiva. Toda falha não-definitiva manda o
service tentar o próximo provedor.

Mapeamento de cada adaptador:

| situação | ViaCEP | BrasilAPI |
| --- | --- | --- |
| `200`, corpo válido | sucesso | sucesso |
| `200` + `erro: "true"` | `NOT_FOUND` | — |
| `404` | — | `NOT_FOUND` |
| `400` | `INVALID_RESPONSE` | `INVALID_RESPONSE` |
| `429` | `RATE_LIMITED` | `RATE_LIMITED` |
| `5xx` | `UNAVAILABLE` | `UNAVAILABLE` |
| timeout do axios (`ECONNABORTED`) | `TIMEOUT` | `TIMEOUT` |
| erro sem `response` (DNS, recusa) | `UNAVAILABLE` | `UNAVAILABLE` |

## Contrato de erro HTTP

| status | código | quando |
| --- | --- | --- |
| `400` | `INVALID_CEP` | formato inválido (já existe) |
| `404` | `CEP_NOT_FOUND` | algum provedor respondeu que o CEP não existe |
| `503` | `PROVIDER_UNAVAILABLE` | só **um** provedor pôde ser tentado, e ele falhou |
| `504` | `ALL_PROVIDERS_FAILED` | **todos** os provedores tentados falharam |

O status sai da contagem de provedores efetivamente tentados que falharam: mais de um →
`504`; exatamente um → `503`.

Com dois provedores, o `503` só aparece quando o circuito do outro está aberto — aí houve
uma tentativa só. É a diferença entre "os upstreams não entregaram" (`504`) e "não
tínhamos a quem recorrer" (`503`).

O corpo é sempre o mesmo par:

```json
{
  "code": "ALL_PROVIDERS_FAILED",
  "message": "Nenhum provedor de CEP respondeu."
}
```

O service **continua coletando** a falha de cada provedor — ela decide `503` × `504` e
alimenta o log do plano 03. O que ela não faz é entrar na resposta.

## Erros: dicionário, não uma classe por caso

Duas famílias, com papéis diferentes — e **nenhuma delas cresce uma classe por erro**.

### Fronteira: um dicionário + uma exceção

O código do erro é a chave; o dicionário diz status e mensagem. Adicionar um erro novo é
acrescentar um membro no enum e uma linha no dicionário — nenhum arquivo novo.

```ts
// enums/cep-error-code.enum.ts
export enum CepErrorCode {
  INVALID_CEP = 'INVALID_CEP',
  CEP_NOT_FOUND = 'CEP_NOT_FOUND',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  ALL_PROVIDERS_FAILED = 'ALL_PROVIDERS_FAILED',
}

// errors/cep-error.dictionary.ts
export const CEP_ERRORS: Record<CepErrorCode, { status: HttpStatus; message: string }> = {
  [CepErrorCode.INVALID_CEP]: {
    status: HttpStatus.BAD_REQUEST,
    message: 'CEP deve ter exatamente 8 dígitos, sem máscara.',
  },
  [CepErrorCode.CEP_NOT_FOUND]: {
    status: HttpStatus.NOT_FOUND,
    message: 'CEP não encontrado.',
  },
  [CepErrorCode.PROVIDER_UNAVAILABLE]: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'O provedor de CEP disponível não respondeu.',
  },
  [CepErrorCode.ALL_PROVIDERS_FAILED]: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    message: 'Nenhum provedor de CEP respondeu.',
  },
};

// exceptions/cep.exception.ts
export class CepException extends HttpException {
  constructor(code: CepErrorCode) {
    const { status, message } = CEP_ERRORS[code];

    super({ code, message }, status);
  }
}
```

Uso:

```ts
throw new CepException(CepErrorCode.INVALID_CEP);
throw new CepException(CepErrorCode.CEP_NOT_FOUND);
throw new CepException(CepErrorCode.ALL_PROVIDERS_FAILED);
```

**O corpo do erro é só `code` e `message`.** Nada de `cep` nem de lista de falhas: o
diagnóstico — qual provedor falhou e por quê — vai para o log por requisição (plano 03),
não para a resposta.

O `Record<CepErrorCode, ...>` faz o compilador exigir uma entrada para cada membro do
enum: membro novo sem entrada no dicionário não compila.

A mensagem do `@Matches` no `GetCepParamsDto` passa a sair do dicionário também, em vez da
string literal que está lá hoje.

### Provedor: um erro carregando o tipo

Interno, insumo para a decisão de fallback. Não é `HttpException` — não é uma resposta
HTTP, é um fato sobre uma tentativa. Também é classe única: o que varia é o
`CepFailureType`.

```ts
class CepProviderError extends Error {
  constructor(
    readonly provider: CepProviderName,
    readonly failure: CepFailureType,
    readonly detail?: string,
  ) { ... }
}
```

### Migração: `InvalidCepException` sai

Já está implementada e some neste plano. `assertIsValidCep` passa a lançar
`new CepException(CepErrorCode.INVALID_CEP)`.

**Isto muda o contrato**, não só a implementação: hoje o corpo é `{ code, message, cep }` e
passa a ser `{ code, message }`. O teste em `cep.service.spec.ts` que hoje afirma
`toMatchObject({ code: 'INVALID_CEP', cep: invalid })` precisa perder a asserção do `cep`
— e isso é mudança deliberada de contrato, não asserção afrouxada para fazer o código
passar. Registrar no commit.

## A porta muda

`CepProvider.findOne` continua devolvendo `Address`, mas passa a ter um contrato de falha
explícito: **lança `CepProviderError`, nunca `AxiosError`**. Traduzir o erro do cliente
HTTP é trabalho do adaptador — é a única camada que sabe o que cada API significa.

O service então fica:

```
para cada provedor na ordem do round-robin:
  try:
    return await provider.findOne(cep)
  catch (CepProviderError e):
    se e.failure é definitiva:  ->  lança CepNotFoundException
    senão:                      ->  registra a falha e tenta o próximo
lança AllProvidersFailedException(falhas)
```

## Timeout

`HttpModule.registerAsync` com `timeout: env.PROVIDER_TIMEOUT_MS`. O axios aborta e lança
`ECONNABORTED`, que o adaptador traduz em `TIMEOUT`.

**Default 2500 ms.** As medições dão ~0,48 s para o ViaCEP e ~0,12 s para a BrasilAPI, ou
seja ~5× de folga sobre o mais lento.

**Orçamento total:** o timeout é *por provedor*. Com dois provedores e ambos pendurados, a
request do cliente demora até 2 × `PROVIDER_TIMEOUT_MS` antes do `503`. Com 5 s no pior
caso isso é aceitável; se um terceiro provedor entrar, vira 7,5 s e passa a pedir um
orçamento global. Registrar agora para não descobrir depois.

## Circuit breaker

Decorator sobre cada adaptador — `CircuitBreakerProvider implements CepProvider`, embrulha
um `CepProvider` e continua sendo um. O service e o round-robin não mudam nada.

Dois estados (enum `CircuitState`) — sem half-open:

```
CLOSED  --(N falhas seguidas)-->  OPEN
OPEN    --(passou o cooldown)-->  CLOSED
```

- **CLOSED**: passa tudo adiante; conta falhas consecutivas.
- **OPEN**: lança `CepProviderError(CIRCUIT_OPEN)` na hora, **sem tocar na rede**. É o que
  evita pagar o timeout de novo num provedor que já se sabe fora.

Passado o cooldown, o circuito volta a fechar e o contador zera; se o provedor ainda
estiver fora, as próximas N falhas abrem de novo.

**`NOT_FOUND` não conta como falha.** É resposta válida do provedor, não sintoma de saúde:
uma sequência de consultas a CEPs inexistentes não pode derrubar o circuito.

Um sucesso zera o contador — o gatilho é falhas *consecutivas*, não acumuladas.

## Configuração

Somam-se ao schema Zod em `src/shared/env/` e ao `.env.example`:

| variável | default | descrição |
| --- | --- | --- |
| `PROVIDER_TIMEOUT_MS` | `2500` | timeout por provedor |
| `CIRCUIT_FAILURE_THRESHOLD` | `3` | falhas consecutivas para abrir |
| `CIRCUIT_RESET_MS` | `30000` | tempo aberto antes do half-open |

## Arquivos

```
src/modules/cep/
  cep.service.ts                        (altera: try/catch + fallback)
  cep.module.ts                         (altera: timeout + embrulha adaptadores)
  circuit-breaker.provider.ts           (novo)
  adapters/
    viacep.adapter.ts                   (altera: traduz erro)
    brasilapi.adapter.ts                (altera: traduz erro)
  enums/
    cep-failure-type.enum.ts            (novo)
    circuit-state.enum.ts               (novo)
    cep-error-code.enum.ts              (altera: + CEP_NOT_FOUND, ALL_PROVIDERS_FAILED)
  errors/
    cep-error.dictionary.ts             (novo: código -> status + mensagem)
    cep-provider.error.ts               (novo)
  exceptions/
    cep.exception.ts                    (novo: exceção única, lê o dicionário)
    invalid-cep.exception.ts            (REMOVIDO: vira uma entrada do dicionário)
```

## Regras

1. Adaptador nunca deixa `AxiosError` escapar: traduz para `CepProviderError` com um
   `CepFailureType`.
2. `NOT_FOUND` interrompe a busca e vira `404` — nenhum outro provedor é consultado.
3. Falha não-definitiva faz o service tentar o próximo provedor.
4. Esgotados os provedores sem resposta definitiva, a resposta é `504` com a falha de cada
   um — ou `503`, se só um provedor pôde ser tentado.
5. Provedor que não responde em `PROVIDER_TIMEOUT_MS` conta como `TIMEOUT`.
6. Após `CIRCUIT_FAILURE_THRESHOLD` falhas consecutivas não-definitivas, o circuito do
   provedor abre e as chamadas seguintes falham na hora, sem rede.
7. `NOT_FOUND` não incrementa o contador do circuito; um sucesso zera o contador.
8. Passado `CIRCUIT_RESET_MS`, o circuito fecha e o contador zera.

## Decisões

- **Erro de provedor não é `HttpException`** — `CepProviderError` é um fato sobre uma
  tentativa, e a maior parte deles nunca vira resposta (viram fallback). Se fosse
  `HttpException`, a tentação seria deixar vazar direto, e o cliente receberia o `429` de
  um provedor como se fosse nosso.
- **Dicionário de erros, não uma classe por erro** — `CepException` é a única exceção de
  fronteira, e o `CepErrorCode` escolhe status e mensagem no dicionário. Erro novo é uma
  linha, não um arquivo. Descartada uma subclasse de `HttpException` por caso
  (`CepNotFoundException`, `AllProvidersFailedException`, …): eram três arquivos com um
  construtor cada e nenhum comportamento próprio. `InvalidCepException`, que já existe
  nesse formato, é removida na mesma leva.
- **Mensagem e status fora do código** — ficam no dicionário, num lugar só. Hoje a
  mensagem do CEP inválido está duplicada entre `InvalidCepException` e o `@Matches` do
  DTO; as duas passam a ler a mesma entrada.
- **Corpo do erro só com `code` e `message`** — o porquê de cada provedor ter falhado é
  dado de operação, não de cliente: vai para o log por requisição (plano 03), onde tem
  contexto de tempo e correlação. Descartado devolver `failures[]` e `cep` no corpo, que
  expõe topologia interna (quais provedores existem, quem falhou) a quem só precisa saber
  que a consulta não deu certo. Efeito colateral bom: some a necessidade de tipar payload
  por código — `CepException` recebe só o enum.
- **Um tipo de falha em `enum`, não uma classe por falha** — mesma lógica do lado do
  provedor: o service ramifica por definitiva × não-definitiva, não por classe.
- **Circuit breaker como decorator, não dentro do seletor** — embrulhando o adaptador, ele
  continua sendo um `CepProvider`, e o round-robin segue sem saber que existe. Descartado
  ensinar o seletor a pular provedores abertos, que juntaria escolha e saúde na mesma
  classe e mudaria a assinatura dele.
- **`NOT_FOUND` fora da contagem do circuito** — misturar "o CEP não existe" com "o
  provedor está doente" derrubaria o circuito numa rajada de consultas a CEP inexistente,
  que é justamente quando os dois provedores estão funcionando bem.
- **Timeout por provedor, não global** — cabe na configuração do `HttpModule` e mantém o
  adaptador sem lógica de tempo. O custo é o orçamento total crescer com o número de
  provedores; documentado acima.
- **`404` da BrasilAPI é `NOT_FOUND`** — apesar de o corpo dizer "Todos os serviços de CEP
  retornaram erro" (`type: service_error`). Acerta o caso comum sem acoplar ao formato
  interno do `errors[]` deles. **Limitação aceita:** se os upstreams da BrasilAPI caírem, a
  resposta vira `404` e o ViaCEP nem chega a ser consultado. Se aparecer na prática, o
  conserto é inspecionar `errors[]`.
- **Circuit breaker sem half-open** — dois estados só. O ganho do half-open é limitar a
  reabertura a uma sondagem; o custo é um terceiro estado, controle de concorrência da
  sondagem e mais testes. **Custo de não ter:** ao fim do cooldown, todas as requests
  simultâneas vão para o provedor de uma vez em vez de uma sondar por todas. Com o timeout
  segurando cada uma, é aceitável.
- **Estado do circuito em memória** — instância única por processo, como o contador do
  round-robin. Com várias réplicas cada uma tem a sua visão, o que é aceitável aqui.
  Estado compartilhado exigiria Redis, e o desafio exclui banco.

## Ciclos de TDD

Um comportamento por ciclo, de dentro para fora:

| # | RED | unidade |
| --- | --- | --- |
| 0 | `CepException` monta status e mensagem a partir do código | `CepException` + dicionário |
| 1 | `200` + `erro: "true"` vira `CepProviderError(NOT_FOUND)` | `ViaCepAdapter` |
| 2 | `5xx` vira `UNAVAILABLE`; timeout vira `TIMEOUT` | `ViaCepAdapter` |
| 3 | `404` vira `NOT_FOUND` | `BrasilApiAdapter` |
| 4 | `5xx` vira `UNAVAILABLE`; timeout vira `TIMEOUT` | `BrasilApiAdapter` |
| 5 | falha não-definitiva cai para o próximo provedor | `CepService` |
| 6 | `NOT_FOUND` vira `404` sem consultar o próximo | `CepService` |
| 7 | todos falhando vira `503` com a lista de falhas | `CepService` |
| 8 | abre depois de N falhas consecutivas | `CircuitBreakerProvider` |
| 9 | aberto, lança `CIRCUIT_OPEN` sem chamar o provedor | `CircuitBreakerProvider` |
| 10 | `NOT_FOUND` não conta; sucesso zera o contador | `CircuitBreakerProvider` |
| 11 | passado o cooldown, volta a chamar o provedor | `CircuitBreakerProvider` |
| 12 | `GET /cep/:cep` com todos fora responde `504` | e2e |

O ciclo 0 é preparatório: com ele verde, `assertIsValidCep` troca `InvalidCepException`
por `CepException` e o arquivo antigo é apagado, com os testes de validação existentes
servindo de rede.

O ciclo 11 precisa controlar o relógio — `vi.useFakeTimers()`, para não dormir 30 s no
teste.

## Pendências

Nenhuma. As quatro que existiam foram decididas e viraram entradas em "Decisões": `404` da
BrasilAPI como `NOT_FOUND`, `504`/`503` por número de provedores tentados, circuit breaker
sem half-open, e corpo de erro só com `code` e `message`.

O plano está pronto para implementar.

## Desvios da implementação

1. **Ciclo extra no seletor.** `ProviderRoundRobin.next()` virou `order()`, devolvendo a
   rotação inteira: o fallback precisa da lista, não de um provedor. Os dois testes antigos
   (sequência e volta ao primeiro) foram substituídos por um só, que cobre ambos — o
   comportamento foi trocado, não afrouxado.
2. **Ciclos 8 e 9 do plano viraram um.** "Abre depois de N falhas" só é observável por
   "passa a falhar sem chamar o provedor": é um comportamento, um ciclo.
3. **`NodeEnv` precisou recuperar `TEST`.** O enum tinha sido editado à mão para
   `development | Staging | production`; como o Vitest define `NODE_ENV=test` e o
   `CepModule` passou a validar a env na construção, todo o e2e quebrava.
4. **Status literais trocados por `HttpStatus`.** `500`, `429` e `404` tinham entrado como
   número, violando a regra 3 do AGENTS.md.
5. **O `400` ficou fora do formato novo.** Continua vindo do `ValidationPipe`; uniformizar
   exige `exceptionFactory`. Registrado como pendência no `docs.md` do módulo.
