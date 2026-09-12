# Cep

Consulta de CEP em provedores externos, devolvendo um contrato único de endereço.
O módulo termina na tradução da resposta: resiliência a falha de provedor ainda não
está aqui.

## Contrato

`GET /cep/:cep` — `:cep` é validado por `GetCepParamsDto`.

- `200` → `Address`
- `400` → CEP fora do formato (corpo padrão do `ValidationPipe`)

Chamadores que não passam pelo HTTP recebem `InvalidCepException` do `CepService`, com
corpo `{ code: 'INVALID_CEP', message, cep }` e `HttpStatus.BAD_REQUEST`.

```ts
interface Address {
  cep: string; // 8 dígitos, sem máscara
  logradouro: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string; // UF
}
```

Porta dos provedores e token de injeção:

```ts
interface CepProvider {
  readonly name: CepProviderName;
  findOne(cep: string): Promise<Address>;
}

const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');
```

## Regras

1. O CEP aceito é exatamente 8 dígitos, sem máscara. `01001-000` é rejeitado com
   `HttpStatus.BAD_REQUEST`.
2. A validação acontece no DTO, na borda: entrada inválida não chega ao service nem
   consulta provedor.
3. O `CepService` revalida o CEP e lança `InvalidCepException` antes de pedir provedor ao
   seletor — o service não confia em quem o chama.
4. Cada consulta usa o próximo provedor do round-robin; depois do último, volta ao
   primeiro.
5. A resposta tem o mesmo formato independente do provedor que atendeu — inclusive
   `complemento`, que a BrasilAPI não expõe e vem `null`.

## Decisões

- **Sem camada de domínio** — não há banco nem modelo de negócio para isolar. `Address` e
  `CepProvider` são contratos e ficam em `interfaces/`; os tradutores das APIs externas,
  em `adapters/`.
- **Validação em duas camadas, com uma fonte de formato só** — `validators/cep.validator.ts`
  exporta a regex `CEP_FORMAT` e a função `assertIsValidCep`. O DTO valida a request com
  `@Matches(CEP_FORMAT)`; o `CepService` chama `assertIsValidCep` porque é a fronteira do
  domínio e nem todo chamador vem do HTTP. Descartado repetir a regex nas duas camadas, o
  que faria uma aceitar o que a outra recusa assim que uma mudasse.
- **`InvalidCepException` estende `HttpException`** — o Nest já traduz a exceção em
  resposta, sem filtro próprio. O corpo carrega `code` (enum `CepErrorCode`) além da
  mensagem, para o cliente ramificar por código e não por texto.
- **`ValidationPipe` como `APP_PIPE` no `AppModule`**, não `app.useGlobalPipes` no
  `main.ts` — o `main.ts` não roda nos testes e2e, então a validação ficava desligada
  neles e o teste de `400` passava sem validar nada. Registrado no módulo, o e2e exercita
  a mesma configuração da produção.
- **Seletor separado do service (`ProviderRoundRobin`)** — a estratégia de escolha é
  decisão do enunciado ("aleatório ou round-robin"); isolá-la permite trocá-la sem tocar
  no service. É singleton com estado: o contador só alterna porque o escopo padrão do
  Nest mantém a instância viva entre requests.
- **Falha de provedor não é tratada** — `findOne` devolve `Address` e deixa a exceção
  subir. Fallback, timeout e distinção entre tipos de erro são o próximo plano, e vão
  mudar a assinatura da porta.
- **`fetch` global do Node** — sem dependência nova. Descartado `@nestjs/axios` enquanto
  não houver interceptor ou retry.
- **URLs fixas no adaptador** — externalizar para ambiente puxa `@nestjs/config`, que
  hoje não é dependência.

## Arquivos

| arquivo | papel |
| --- | --- |
| `provider-round-robin.ts` | decide qual provedor atende cada chamada |
| `interfaces/cep-provider.interface.ts` | porta `CepProvider` + token `CEP_PROVIDERS` |
| `cep.module.ts` | monta a lista de `CEP_PROVIDERS`; é aqui que um provedor novo entra |
| `validators/cep.validator.ts` | formato do CEP: `CEP_FORMAT` para o DTO, `assertIsValidCep` para o service |
| `exceptions/invalid-cep.exception.ts` | `HttpException` com `code: INVALID_CEP` e status 400 |
