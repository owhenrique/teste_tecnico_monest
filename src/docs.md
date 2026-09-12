# App

Módulo raiz da aplicação: compõe os módulos de funcionalidade e registra o que vale para
a aplicação inteira. Não tem controller nem regra de negócio própria.

## Contrato

Expõe a classe `AppModule`, consumida por `main.ts` (produção) e pelos testes e2e.

## Decisões

- **Logger do pino substitui o do Nest** (`app.useLogger`) — evita dois formatos
  convivendo, um para o bootstrap e outro para a aplicação. `bufferLogs: true` segura as
  linhas de partida até o logger estar de pé.
- **Nível da linha de requisição vem de `requestLogLevel`** — o `pino-http` registra tudo
  em `info` por padrão, e aí um `504` fica indistinguível de um `200`. `5xx` é `error`,
  `4xx` é `warn`, com `404` mantido em `info` de propósito: nesta API significa "CEP não
  existe", resposta correta a pergunta válida, e como `warn` encheria o alerta de ruído
  previsível.
- **Documentação só em `development`** — `setupApiDocs` monta `/docs` e `/openapi.json`
  apenas nesse ambiente; nos demais a spec sequer é gerada, então não há custo de partida
  nem superfície exposta. Limitação aceita: `staging` também fica sem. Deixar aberto por
  padrão é que não.
- **`/favicon.ico` fora do log** — navegador pede em toda visita; é ruído, não tráfego.
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
| `app.module.ts` | composição dos módulos, `ValidationPipe` global e configuração do logger |
