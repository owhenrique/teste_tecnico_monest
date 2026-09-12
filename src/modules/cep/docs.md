# Cep

Consulta de CEP em provedores externos, devolvendo um contrato único de endereço e
tolerando falha, lentidão e indisponibilidade de qualquer um deles.

## Contrato

`GET /cep/:cep` — `:cep` é validado por `GetCepParamsDto`.

| status | código | quando |
| --- | --- | --- |
| `200` | — | `Address` |
| `400` | `INVALID_CEP` | formato inválido |
| `404` | `CEP_NOT_FOUND` | algum provedor respondeu que o CEP não existe |
| `503` | `PROVIDER_UNAVAILABLE` | só um provedor pôde ser tentado, e ele falhou |
| `504` | `ALL_PROVIDERS_FAILED` | todos os provedores tentados falharam |

Corpo de erro: `{ code, message }`. Nada de `cep` nem de lista de falhas — o diagnóstico é
dado de operação e vai para o log, não para a resposta.

```ts
interface Address {
  cep: string; // 8 dígitos, sem máscara
  logradouro: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string; // UF
}

interface CepProvider {
  readonly name: CepProviderName;
  findOne(cep: string): Promise<Address>; // lança CepProviderError
}

const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');
```

## Comportamento real das APIs

Medido em 2026-09-12; é a base do mapeamento de erro.

| caso | ViaCEP | BrasilAPI v1 |
| --- | --- | --- |
| existente | `200` + JSON | `200` + JSON |
| inexistente | **`200`** + `{"erro": "true"}` | `404` + JSON |
| malformado | `400` + **`text/html`** | `400` + JSON |
| latência típica | ~0,48 s | ~0,12 s |

O ViaCEP sinaliza "não encontrado" com `200`, então o axios não lança — quem detecta é o
adaptador, olhando o campo `erro` (a *string* `"true"`, não o booleano).

## Regras

1. O CEP aceito é exatamente 8 dígitos, sem máscara.
2. O formato do CEP é validado no `CepService`, por `assertIsValidCep` — dono único da
   regra. O DTO só declara o campo.
3. Adaptador nunca deixa `AxiosError` escapar: traduz para `CepProviderError` com um
   `CepFailureType`.
4. `NOT_FOUND` é a única falha **definitiva**: interrompe a busca e vira `404`, sem
   consultar os demais provedores.
5. Falha não-definitiva faz o service tentar o próximo provedor da rotação.
6. Esgotados os provedores, a resposta é `504` — ou `503`, se só um pôde ser tentado.
7. Provedor que não responde em `PROVIDER_TIMEOUT_MS` conta como `TIMEOUT`.
8. Após `CIRCUIT_FAILURE_THRESHOLD` falhas consecutivas não-definitivas, o circuito do
   provedor abre e as chamadas seguintes falham sem tocar na rede.
9. `NOT_FOUND` não conta para o circuito; um sucesso zera o contador.
10. Passado `CIRCUIT_RESET_MS`, o circuito fecha e o contador zera.

## Documentação

`ApiGetCep()` — decorator composto em `openapi/cep.openapi.ts` — carrega toda a metadata
OpenAPI da rota, e o controller fica só com `@Get`. Os exemplos de erro são **derivados de
`CEP_ERRORS`**: nenhum texto é digitado na documentação, então a spec não tem como divergir
do que a API devolve.

`DOCUMENTED_ERROR_CODES` sai de `Object.values(CepErrorCode)`, com teste garantindo a
cobertura: código de erro novo entra na spec sozinho.

## Log

Uma linha JSON por evento, correlacionada pelo `req.id` da requisição (`X-Request-Id` de
entrada, ou gerado). Eventos no enum `CepLogEvent`:

| evento | nível | quando |
| --- | --- | --- |
| `PROVIDER_FAILED` | `warn` | tentativa que falhou de forma não-definitiva |
| `CEP_FOUND` | `info` | consulta atendida, com o provedor que atendeu |
| `CEP_NOT_FOUND` | `info` | provedor respondeu que o CEP não existe |
| `LOOKUP_EXHAUSTED` | `error` | nenhum provedor entregou, com a falha de cada um |
| `CIRCUIT_OPENED` | `error` | circuito de um provedor abriu |
| `CIRCUIT_CLOSED` | `info` | circuito voltou a fechar |

Toda consulta termina com **exatamente uma** linha de desfecho.

## Decisões

- **Sem camada de domínio** — não há banco nem modelo de negócio para isolar. `Address` e
  `CepProvider` são contratos e ficam em `interfaces/`; os tradutores das APIs externas, em
  `adapters/`.
- **Formato do CEP validado só no service** — `assertIsValidCep` é o dono único da regra.
  O `@IsString()` do DTO não valida formato: existe porque o `ValidationPipe` roda com
  `whitelist: true`, que descarta propriedade sem decorator de validação — sem ele o `cep`
  chegaria `undefined`. Descartado `@Matches` no DTO, que era uma segunda dona da regra e
  fazia o `400` sair no formato do pipe (`{ message: [...], error, statusCode }`), com
  `message` mudando de `string` para `string[]` e sem `code`. Descartado também desligar o
  `whitelist`, que é a defesa contra propriedade não declarada.
- **`NOT_FOUND` não gera `PROVIDER_FAILED`** — é resposta válida do provedor, não falha
  dele. Sai só a linha de desfecho `CEP_NOT_FOUND`. Mesma regra que mantém `NOT_FOUND` fora
  da contagem do circuito; logar as duas rotularia como problema algo que é funcionamento
  normal, e inflaria qualquer alerta montado sobre `warn`.
- **Exemplos da documentação derivados do dicionário** — `errorResponseOptions(code)` lê
  status e mensagem de `CEP_ERRORS`. Descartado escrever os exemplos no decorator, que
  duplicaria as quatro mensagens e as deixaria divergir em silêncio — e documentação errada
  é pior que ausente, porque ninguém desconfia.
- **`CepResponseDto implements Address`** — o `implements` faz o compilador reprovar
  divergência entre contrato e schema documentado. Descartado declarar schema inline, que
  nada verifica.
- **Dicionário de erros, não uma classe por erro** — `CepException` é a única exceção de
  fronteira; `CepErrorCode` escolhe status e mensagem em `CEP_ERRORS`. Erro novo é uma
  linha, não um arquivo. Por ser `Record<CepErrorCode, …>`, código sem definição não
  compila. Descartadas subclasses por caso, que seriam arquivos com um construtor e nenhum
  comportamento.
- **Corpo do erro só com `code` e `message`** — qual provedor falhou e por quê é dado de
  operação, e vai para o log por requisição. Devolver `failures[]` exporia topologia
  interna a quem só precisa saber que a consulta não deu certo.
- **`CepProviderError` não é `HttpException`** — é um fato sobre uma tentativa, e a maior
  parte delas nunca vira resposta: vira fallback. Como `HttpException`, a tentação seria
  deixar vazar, e o cliente receberia o `429` de um provedor como se fosse nosso.
- **`404` da BrasilAPI tratado como `NOT_FOUND`** — apesar de o corpo dizer "Todos os
  serviços de CEP retornaram erro" (`type: service_error`). Acerta o caso comum sem acoplar
  ao formato interno do `errors[]` deles. **Limitação aceita:** se os upstreams da BrasilAPI
  caírem, viramos `404` e o ViaCEP nem é consultado.
- **Circuit breaker como decorator** — `CircuitBreakerProvider implements CepProvider`, então
  service e round-robin não sabem que ele existe. Descartado ensinar o seletor a pular
  provedores abertos, que juntaria escolha e saúde na mesma classe.
- **A máquina de estados mora em `src/shared/circuit-breaker/`** — não tem nada de CEP.
  `CircuitBreakerProvider` só liga o genérico à porta, com os dois pontos que são do
  domínio: `NOT_FOUND` não conta como falha, e o circuito aberto se anuncia como
  `CepProviderError(CIRCUIT_OPEN)`. Outro módulo reusa `CircuitBreaker.run()` direto, sem
  copiar nada.
- **Sem half-open** — dois estados só. Custo aceito: ao fim do cooldown, requests
  simultâneas vão todas ao provedor de uma vez, em vez de uma sondar por todas.
- **`NOT_FOUND` fora da contagem do circuito** — misturar "o CEP não existe" com "o provedor
  está doente" derrubaria o circuito numa rajada de CEPs inexistentes, justamente quando os
  provedores estão saudáveis.
- **Timeout por provedor, não global** — cabe na configuração do `HttpModule`. Custo: com N
  provedores a request leva até N × `PROVIDER_TIMEOUT_MS`. Com 2 e o default de 2500 ms, 5 s
  no pior caso.
- **Estado do circuito e do round-robin em memória** — instância única por processo. Com
  várias réplicas cada uma tem sua visão, o que é aceitável aqui; compartilhar exigiria
  Redis, e o desafio exclui banco.
- **`HttpService` do `@nestjs/axios`** — timeout, e futuros interceptor e retry, entram como
  configuração do módulo. O axios lança em status não-2xx, o que o `fetch` não fazia.

## Arquivos

| arquivo | papel |
| --- | --- |
| `cep.service.ts` | valida, percorre a rotação, decide fallback × `404` × `504`/`503`, loga o desfecho |
| `enums/cep-log-event.enum.ts` | eventos de log do módulo |
| `openapi/cep.openapi.ts` | metadata OpenAPI da rota; exemplos vindos de `CEP_ERRORS` |
| `providers/provider-round-robin.ts` | `order()` — rotação desta consulta, do primeiro ao último fallback |
| `providers/circuit-breaker.provider.ts` | liga o `CircuitBreaker` de `shared/` à porta `CepProvider` |
| `utils/provider-request.ts` | chamada HTTP comum aos provedores; traduz `AxiosError` em `CepFailureType` |
| `errors/cep-error.dictionary.ts` | código → status + mensagem |
| `errors/cep-provider.error.ts` | falha de uma tentativa + `isDefinitive` |
| `exceptions/cep.exception.ts` | única exceção de fronteira; lê o dicionário |
| `validators/cep.validator.ts` | `assertIsValidCep` — dono único do formato do CEP |
| `cep.module.ts` | timeout do `HttpModule` e lista `CEP_PROVIDERS` já embrulhada no breaker |
