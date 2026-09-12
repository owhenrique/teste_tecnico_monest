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
- **Porta via `PORT`, default 3000** — o ambiente define a porta; o default mantém
  `npm run start` utilizável sem configuração.

## Arquivos

| arquivo | papel |
| --- | --- |
| `main.ts` | bootstrap HTTP: cria a aplicação, lê `PORT` e escuta |
| `app.module.ts` | composição dos módulos e registro do `ValidationPipe` global |
