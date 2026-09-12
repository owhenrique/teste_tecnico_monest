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
- **`@nestjs/config` carrega e o Zod valida** — `ConfigModule.forRoot({ validate: loadEnv })`
  roda na construção do `AppModule`, então variável ausente ou inválida derruba a aplicação
  antes de ela escutar. Descartado ler `process.env` direto onde precisa: o erro apareceria
  só quando aquele trecho rodasse, e sem dizer qual variável estava errada.
- **Nenhuma variável tem default** — subir sem configuração é erro, não comportamento
  silencioso. O preço é que todo deploy precisa definir as seis; o ganho é que "esqueci de
  configurar" falha na partida, com a lista do que falta, em vez de virar surpresa em
  produção.
- **Falha a falta da *variável*, não do arquivo** — em container não existe `.env` e as
  variáveis vêm do ambiente. Exigir o arquivo quebraria produção; exigir as variáveis
  cobre os dois casos.
- **`envFilePath: ['.env.<ambiente>', '.env']`** — permite um `.env` por ambiente sem
  interferir no de desenvolvimento. O e2e não usa arquivo: recebe o ambiente pelo
  `vitest.config.e2e.ts`, para não haver `.env` de teste em disco.
- **`envOf(config)` explícito** — reconstrói o `Env` tipado a partir do `ConfigService`
  campo a campo. Variável nova no schema sem leitura correspondente não compila.

## Arquivos

| arquivo | papel |
| --- | --- |
| `main.ts` | bootstrap: lê o `.env`, valida o ambiente, cria a aplicação e escuta |
| `app.module.ts` | composição dos módulos, `ValidationPipe` global e configuração do logger |
