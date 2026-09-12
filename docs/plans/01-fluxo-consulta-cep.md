# 01 — Fluxo de consulta de CEP

> **Implementado.** O que o código fez diferente do planejado está em
> "Desvios da implementação", no fim.

Caminho feliz da consulta, ponta a ponta:

```
GET /cep/:cep
  → ValidationPipe + GetCepParamsDto    valida a entrada (8 dígitos)
      → CepController.get(params)
          → CepService.findOne(cep)         revalida e orquestra
              → ProviderRoundRobin.next()   escolhe QUAL provedor usar
                  → CepProvider.findOne(cep) porta
                      → ViaCepAdapter | BrasilApiAdapter
                            traduz a resposta externa para Address
```

O controller não conhece provedor. O service não conhece ViaCEP nem BrasilAPI — só a
porta `CepProvider` e o seletor. Os adaptadores são os únicos que sabem o formato de
cada API externa.

## Escopo

**Neste plano:** receber a request, validar a entrada, escolher um provedor em
round-robin, consultar esse provedor e devolver o contrato único.

**Fora deste plano** (cada um vira um plano próprio, depois): fallback para o segundo
provedor quando o primeiro falha, timeout, mapeamento de tipos de erro (404 × timeout ×
indisponível), logging estruturado e filtro global de exceção. Aqui, se o provedor
escolhido falhar, a exceção sobe — é intencional, e é o que o plano 02 vai resolver.

## Pré-requisitos

Nada disso existe hoje no projeto e precisa entrar antes do ciclo 1:

1. `npm i class-validator class-transformer`
2. `ValidationPipe` global em `main.ts`, com `transform: true` e `whitelist: true`.

Uma versão anterior deste plano pedia também um `.swcrc` com `decoratorMetadata: true`,
partindo da ideia de que o SWC não emitiria `design:paramtypes` nos testes — metadata de
que o Nest depende para saber qual DTO validar. **Verificado em 2026-09-11: é
desnecessário**, o `unplugin-swc` já liga `decoratorMetadata` por padrão (um teste-sonda
lendo `design:paramtypes` passou igual com e sem o arquivo). O `.swcrc` foi removido.

O risco original, porém, é real e silencioso: se essa metadata faltar, o metatype chega
`undefined` e o `ValidationPipe` pula a validação sem erro nenhum. É o ciclo 8 que
protege contra isso.

## Arquivos

```
src/modules/cep/
  cep.module.ts
  cep.controller.ts
  cep.service.ts
  provider-round-robin.ts
  docs.md
  dto/
    get-cep-params.dto.ts
  interfaces/
    address.interface.ts
    cep-provider.interface.ts
  adapters/
    viacep.adapter.ts
    brasilapi.adapter.ts
  enums/
    cep-provider-name.enum.ts
```

| arquivo | papel |
| --- | --- |
| `cep.controller.ts` | rota `GET /cep/:cep` no método `get()`, delega ao service |
| `cep.service.ts` | pede um provedor ao seletor e devolve o `Address` |
| `dto/get-cep-params.dto.ts` | valida o parâmetro de rota via class-validator |
| `provider-round-robin.ts` | decide qual provedor atende cada chamada |
| `interfaces/address.interface.ts` | contrato único de saída |
| `interfaces/cep-provider.interface.ts` | porta `CepProvider` + token `CEP_PROVIDERS` |
| `adapters/viacep.adapter.ts` | adaptador ViaCEP |
| `adapters/brasilapi.adapter.ts` | adaptador BrasilAPI |
| `enums/cep-provider-name.enum.ts` | nomes dos provedores (regra 4 do AGENTS.md) |
| `cep.module.ts` | registra controller, service, seletor e a lista de adaptadores |
| `docs.md` | documentação do módulo (regra 2 do AGENTS.md) |

## Contrato de saída

```ts
interface Address {
  cep: string;        // 8 dígitos, sem máscara
  logradouro: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;     // UF
}
```

Tradução que cada adaptador faz. Atenção: a máscara é recusada na **entrada**, mas o
ViaCEP devolve o CEP mascarado na **resposta** — normalizar é trabalho do adaptador, para
que `Address.cep` saia igual venha de onde vier.

| `Address` | ViaCEP | BrasilAPI |
| --- | --- | --- |
| `cep` | `cep` — vem mascarado (`"01001-000"`), o adaptador tira o hífen | `cep` (`"01001000"`) |
| `logradouro` | `logradouro` | `street` |
| `complemento` | `complemento` | — (`null`) |
| `bairro` | `bairro` | `neighborhood` |
| `cidade` | `localidade` | `city` |
| `estado` | `uf` | `state` |

## Porta

```ts
interface CepProvider {
  readonly name: CepProviderName;
  findOne(cep: string): Promise<Address>;
}

const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');
```

Registro no `CepModule`, via factory, para o seletor receber a lista:

```ts
{
  provide: CEP_PROVIDERS,
  useFactory: (viaCep, brasilApi) => [viaCep, brasilApi],
  inject: [ViaCepAdapter, BrasilApiAdapter],
}
```

**Adicionar uma terceira API = escrever o adaptador e acrescentá-lo a essa lista.**
Controller, service e seletor não mudam.

## Regras

1. O CEP aceito é exatamente 8 dígitos, sem máscara (`01001000`). `01001-000` é
   rejeitado com `HttpStatus.BAD_REQUEST`, assim como qualquer outro formato.
2. A validação acontece na borda, no DTO: entrada inválida não chega ao service nem
   consulta provedor.
3. Cada chamada a `findOne` consome o próximo provedor do round-robin; depois do último,
   volta ao primeiro.
4. A resposta tem o mesmo formato independente do provedor que atendeu.

## Decisões

- **Sem camada de domínio; `interfaces/` e `adapters/`** — não há banco nem modelo de
  negócio para isolar. `Address` e `CepProvider` são contratos, e ficam em `interfaces/`;
  os adaptadores das APIs externas em `adapters/`. Descartada uma pasta `domain/`, que
  aqui só renomearia "interface" sem separar nada de fato.
- **Seletor na raiz do módulo, não em `adapters/`** — `ProviderRoundRobin` não adapta
  API externa nenhuma: é colaborador direto do service, e fica ao lado dele.
- **Validação em DTO com class-validator, na borda** — a regra é de formato de request,
  declarada onde a request entra. Descartado validar dentro do `CepService` (decisão
  anterior, revertida): duplicaria em código imperativo o que o decorator já expressa, e
  deixaria o service devolvendo erro de HTTP.
- **Só 8 dígitos, sem máscara** — um único formato aceito significa nada para normalizar:
  o valor que chega no controller já é o que trafega até o adaptador. Descartado aceitar
  `01001-000`, que exigiria uma etapa de normalização só para desfazer a máscara.
- **Seletor como classe própria (`ProviderRoundRobin`)** — a estratégia de escolha é
  explicitamente uma decisão do enunciado ("aleatório ou round-robin"). Isolá-la deixa
  trocar por aleatório/peso sem tocar no service. Descartado um contador privado dentro
  do `CepService`, que misturaria orquestração com estratégia.
- **Seletor é singleton com estado** — o contador só alterna de verdade porque o escopo
  padrão do Nest mantém a instância viva entre requests. Um seletor `REQUEST`-scoped
  começaria do zero toda vez e sempre usaria o mesmo provedor.
- **Falha não é tratada aqui** — `CepProvider.findOne` devolve `Address` e deixa a exceção
  subir. Quando o plano 02 entrar com fallback, o retorno vira um resultado com sucesso
  ou tipo de falha, e a porta muda junto.
- **`fetch` global do Node** — sem dependência nova. Descartado `@nestjs/axios`/`HttpModule`
  enquanto não houver necessidade de interceptor ou retry.
  **Revertido depois da implementação:** ver "Desvios da implementação", item 7.

## Ciclos de TDD

Um comportamento por ciclo (regra 1 do AGENTS.md), de dentro para fora:

| # | RED | unidade |
| --- | --- | --- |
| 1 | aceita 8 dígitos e rejeita qualquer outro formato | `GetCepParamsDto` |
| 2 | devolve o `Address` do provedor entregue pelo seletor | `CepService` |
| 3 | `next()` devolve os provedores em sequência a cada chamada | `ProviderRoundRobin` |
| 4 | `next()` volta ao primeiro depois do último | `ProviderRoundRobin` |
| 5 | traduz resposta do ViaCEP para `Address` | `ViaCepAdapter` |
| 6 | traduz resposta da BrasilAPI para `Address` | `BrasilApiAdapter` |
| 7 | `GET /cep/:cep` responde `HttpStatus.OK` com o contrato | e2e |
| 8 | `GET /cep/01001-000` responde `HttpStatus.BAD_REQUEST` | e2e |

O ciclo 1 roda o `validate()` do class-validator direto sobre o DTO. O 2 usa um
`CepProvider` falso; 3–4, provedores falsos; 5–6, `HttpService` mockado. Os ciclos 7 e 8 sobem
a aplicação — e o 8 é o que prova que o `ValidationPipe` está de fato ligado à rota.

## Pendências a decidir antes de implementar

- Corpo do erro de validação: o `ValidationPipe` já devolve
  `{ statusCode, message: [...], error }` por padrão. Manter esse formato, ou trocar por
  um objeto com código próprio via `exceptionFactory`? A segunda opção puxa um
  `cep-error-code.enum.ts` (regra 4) e cabe melhor no plano de tratamento de erros.
- URLs das APIs: fixas no adaptador, ou por variável de ambiente? Ambiente puxa
  `@nestjs/config`, que hoje não é dependência.

## Desvios da implementação

O que ficou diferente deste plano, e por quê:

1. **Ordem dos ciclos.** `ProviderRoundRobin` veio antes do `CepService`, para o service
   nascer contra uma classe real em vez de um stub.
2. **O `.swcrc` era desnecessário.** O pré-requisito partia da ideia de que o SWC não
   emitiria `design:paramtypes` nos testes. Um teste-sonda mostrou que o `unplugin-swc` já
   liga `decoratorMetadata` por padrão — passou igual com e sem o arquivo.
3. **`ValidationPipe` virou `APP_PIPE` no `AppModule`.** No `main.ts`, como o plano pedia,
   a validação ficava desligada nos testes e2e: o ciclo 8 deu 200 em vez de 400. O risco
   que o plano descrevia era real, só estava na causa errada.
4. **Validação também no service** (ciclo 9, fora do plano original). `assertIsValidCep`
   e `CEP_FORMAT` vivem em `validators/cep.validator.ts`; o service chama a função, o DTO
   usa a regex no `@Matches`. Uma fonte de formato só.
5. **`InvalidCepException`** estende `HttpException` e carrega `code: INVALID_CEP`.
   Inalcançável pela rota HTTP — o `ValidationPipe` barra antes, com o mesmo formato — ela
   protege chamadores que não vêm do HTTP.
6. **Nomes.** `lookup` → `findOne` na porta e no service; `FindCepParamsDto` →
   `GetCepParamsDto`.
7. **`@nestjs/axios` no lugar do `fetch`.** A decisão original evitava a dependência até
   haver interceptor ou retry; como os dois entram no plano 02, os adaptadores migraram
   antes, para não serem reescritos duas vezes. O axios lança em status não-2xx, o que já
   mudou o comportamento com CEP inexistente (ver a pendência abaixo).

## Pendência descoberta na implementação

CEP inexistente termina em **500 pelos dois provedores**, por motivos diferentes: a
BrasilAPI responde `404` e o axios lança; o ViaCEP responde `HTTP 200` com
`{"erro": "true"}` e o adaptador estoura ao ler `data.cep`. O caso certo é `404`, e é o
argumento mais concreto a favor do plano 02.
