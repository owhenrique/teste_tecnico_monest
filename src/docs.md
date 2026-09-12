# App

Módulo raiz da aplicação. Hoje só compõe os módulos de funcionalidade — não tem
controller, provider nem regra própria, e a intenção é que continue assim.

## Contrato

Expõe a classe `AppModule`, consumida por `main.ts` (produção) e pelos testes e2e.

## Decisões

- **Bootstrap separado do módulo raiz** (`main.ts` × `app.module.ts`) — os testes e2e
  montam `AppModule` via `Test.createTestingModule` sem abrir socket. Descartado colocar
  `NestFactory.create` junto do módulo, que obrigaria o teste a subir um servidor HTTP real.
- **Porta via `PORT`, default 3000** — o ambiente define a porta; o default mantém
  `npm run start` utilizável sem configuração.

## Arquivos

| arquivo | papel |
| --- | --- |
| `main.ts` | bootstrap HTTP: cria a aplicação, lê `PORT` e escuta |
| `app.module.ts` | composição dos módulos de funcionalidade |
