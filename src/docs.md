# App

Módulo raiz da aplicação: compõe os módulos de funcionalidade e registra o que vale para
a aplicação inteira. Não tem controller nem regra de negócio própria.

## Contrato

Expõe a classe `AppModule`, consumida por `main.ts` (produção) e pelos testes e2e.

## Decisões

- **`ValidationPipe` como `APP_PIPE`, não `app.useGlobalPipes` no `main.ts`** — o
  `main.ts` não roda nos testes e2e, então a validação ficava desligada neles: o teste de
  `400` passava sem validar nada. Registrado no módulo, o e2e exercita a mesma
  configuração da produção. Usa `transform: true` e `whitelist: true`.
- **Bootstrap separado do módulo raiz** (`main.ts` × `app.module.ts`) — os testes e2e
  montam `AppModule` via `Test.createTestingModule` sem abrir socket. Descartado colocar
  `NestFactory.create` junto do módulo, que obrigaria o teste a subir um servidor HTTP real.
- **Ambiente validado na partida, por Zod** — `loadEnv` roda antes de
  `NestFactory.create` e lança se `PORT` ou `NODE_ENV` estiverem inválidas. Descartado ler
  `process.env` direto onde precisa: o erro apareceria só quando aquele trecho rodasse, e
  sem dizer qual variável estava errada. Schema e tipos em `src/shared/env/`.
- **`.env` opcional, lido pelo Node** — `process.loadEnvFile()` em `main.ts`, com a
  ausência do arquivo tratada como caso normal (em produção as variáveis vêm do
  ambiente). Descartado `dotenv` e `@nestjs/config`: nenhum dos dois é necessário para
  ler um arquivo e validar duas variáveis.

## Arquivos

| arquivo | papel |
| --- | --- |
| `main.ts` | bootstrap: lê o `.env`, valida o ambiente, cria a aplicação e escuta |
| `app.module.ts` | composição dos módulos e registro do `ValidationPipe` global |
