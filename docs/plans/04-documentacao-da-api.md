# 04 — Documentação da API

> **Implementado.** Desvios em "Desvios da implementação", no fim.

## Problema

O contrato da API só existe no README e no `docs.md` do módulo — prosa, que envelhece sem
avisar. Quem consome não tem como experimentar a rota, e os quatro formatos de erro
(`400`, `404`, `503`, `504`) não estão em lugar nenhum que uma ferramenta consiga ler.

## Escopo

**Neste plano:** especificação OpenAPI gerada pelo `@nestjs/swagger`, com exemplo de corpo
para a resposta de sucesso e para **cada** tipo de erro; interface do Scalar servindo essa
spec; decorators de documentação fora do controller; e tudo isso disponível **apenas em
desenvolvimento**.

**Fora deste plano:** versionamento da API, autenticação na documentação, publicação da
spec em portal externo, cliente gerado.

## Dependências

Verificado em 2026-09-12:

| pacote | versão | observação |
| --- | --- | --- |
| `@nestjs/swagger` | 12.0.1 | declara `@nestjs/core: ^12.0.0`; peers `class-validator` e `class-transformer` já estão no projeto |
| `@scalar/nestjs-api-reference` | 1.2.18 | ESM, como o projeto |

## Exemplos de erro saem do dicionário

`CEP_ERRORS` já mapeia código → status + mensagem. A documentação **lê esse mapa**, em vez
de repetir os textos:

```ts
apiErrorResponse(CepErrorCode.CEP_NOT_FOUND)
// devolve @ApiResponse({ status: 404, schema: { example: { code, message } } })
// com status e message vindos de CEP_ERRORS
```

É o ponto mais importante do plano. Exemplo escrito à mão vira mentira no dia em que
alguém ajusta uma mensagem — e mentira em documentação é pior que ausência, porque
ninguém desconfia.

O que a spec vai mostrar, sem nada digitado duas vezes:

| status | exemplo |
| --- | --- |
| `400` | `{"code":"INVALID_CEP","message":"CEP deve ter exatamente 8 dígitos, sem máscara."}` |
| `404` | `{"code":"CEP_NOT_FOUND","message":"CEP não encontrado."}` |
| `503` | `{"code":"PROVIDER_UNAVAILABLE","message":"O provedor de CEP disponível não respondeu."}` |
| `504` | `{"code":"ALL_PROVIDERS_FAILED","message":"Nenhum provedor de CEP respondeu."}` |

## Decorators fora do controller

O controller volta a ter só a rota:

```ts
@Get(':cep')
@ApiGetCep()
get(@Param() params: GetCepParamsDto): Promise<Address> {
  return this.cepService.findOne(params.cep);
}
```

`ApiGetCep` é um decorator composto com `applyDecorators()`, morando em
`openapi/cep.openapi.ts`. Junta `@ApiOperation`, `@ApiParam`, o `@ApiOkResponse` e os
quatro `@ApiResponse` de erro.

Pasta `openapi/`, não `docs/`, para não confundir com o `docs.md` do módulo.

## Schema da resposta

`Address` é uma `interface`, e o `@nestjs/swagger` precisa de classe para gerar schema.
Entra `CepResponseDto implements Address`, com `@ApiProperty` em cada campo.

O `implements` não é decoração: é o compilador garantindo que o DTO e o contrato não
divirjam. Campo novo em `Address` sem o correspondente no DTO não compila.

Mesma coisa para o corpo de erro: `ErrorResponseDto` com `code` e `message`.

## Só em desenvolvimento

Montagem condicional, em `setupApiDocs(app, env)`:

```
NODE_ENV === development  →  monta /docs (Scalar) e /openapi.json
qualquer outro            →  não monta nada; as rotas dão 404
```

Em produção a spec sequer é gerada — `SwaggerModule.createDocument` não roda, então não há
custo de partida nem superfície exposta.

**Limitação aceita:** `staging` também fica sem documentação. Se incomodar, é acrescentar
um valor à condição; deixar aberto por padrão é que não.

## Arquivos

```
src/modules/cep/
  cep.controller.ts              (altera: ganha @ApiGetCep)
  openapi/cep.openapi.ts         (novo: ApiGetCep + apiErrorResponse)
  dto/cep-response.dto.ts        (novo: CepResponseDto implements Address)
  dto/error-response.dto.ts      (novo: ErrorResponseDto)
src/shared/openapi/
  setup-api-docs.ts              (novo: monta Scalar e a spec, só em development)
  setup-api-docs.spec.ts         (novo)
src/main.ts                      (altera: chama setupApiDocs)
```

## Regras

1. A interface do Scalar responde em `/docs` e a spec em `/openapi.json`.
2. Fora de `development`, nenhuma das duas rotas existe, e a spec não é gerada.
3. Todo membro de `CepErrorCode` aparece na documentação da rota, com status e mensagem
   vindos de `CEP_ERRORS`.
4. Nenhum texto de erro é digitado na documentação: sai do dicionário.
5. O controller não carrega decorator de documentação além do composto `@ApiGetCep`.

## Decisões

- **Exemplos derivados de `CEP_ERRORS`** — descrito acima. Descartado escrever os exemplos
  no decorator, que duplicaria quatro mensagens e as deixaria divergir em silêncio.
- **Scalar no lugar do Swagger UI** — pedido do projeto; a spec continua sendo a do
  `@nestjs/swagger`, então trocar de interface depois não mexe em nada do código.
- **`CepResponseDto implements Address`** — o `implements` transforma divergência entre
  contrato e documentação em erro de compilação. Descartado declarar o schema inline no
  decorator, que não tem como ser verificado pelo compilador.
- **Um decorator composto, não vários no controller** — `applyDecorators()` tira sete
  linhas de metadata de cima do método e deixa a documentação evoluir sem tocar no
  controller.
- **Sem o plugin de CLI do `@nestjs/swagger`** — ele infere schema a partir dos tipos, mas
  exige configuração no `nest-cli.json` e não roda no SWC dos testes, criando divergência
  entre o que o build e o teste enxergam. Decorators explícitos são mais verbosos e
  previsíveis.

## Ciclos de TDD

Documentação é metadata; testar texto de `@ApiOperation` não paga. Vale testar o que
quebra em silêncio:

| # | RED | unidade |
| --- | --- | --- |
| 1 | `apiErrorResponse` usa status e mensagem do dicionário | `cep.openapi.ts` |
| 2 | todo membro de `CepErrorCode` tem resposta documentada | `cep.openapi.ts` |
| 3 | monta a documentação quando `NODE_ENV` é `development` | `setupApiDocs` |
| 4 | não monta nos demais ambientes | `setupApiDocs` |

O ciclo 2 é a rede de proteção real: código de erro novo sem documentação quebra o teste,
em vez de virar uma spec incompleta que ninguém nota.

Os ciclos 3 e 4 usam um dublê de `INestApplication` e verificam se `use` foi chamado —
sem subir servidor.

## Verificação manual

Depois dos ciclos, com a aplicação em `development`: abrir `/docs`, conferir se os quatro
erros aparecem com exemplo, e disparar a rota pela própria interface. Em seguida subir com
`NODE_ENV=production` e confirmar `404` em `/docs` e `/openapi.json`.

## Pendências

Nenhuma. A rota da spec ficou em `/openapi.json`, a opção mais convencional.

## Desvios da implementação

1. **`errorResponseOptions` precisou de tipo de retorno próprio.** `ApiResponseOptions` do
   `@nestjs/swagger` é união, e `schema` não existe em todos os membros — o teste não
   compilava. Uma interface explícita resolveu.
2. **O teste de `setupApiDocs` mocka `@nestjs/swagger`.** O `createDocument` real exige um
   container do Nest; com dublê fino ele estoura em `getType`. O teste segue exercitando o
   que importa: a guarda de ambiente e as duas rotas registradas.
3. **Ciclos 1 e 2 viraram um arquivo só de spec.** São a mesma unidade e o `it.each` sobre
   `Object.values(CepErrorCode)` já cobre os dois.
