# Planos de implementação

Em ordem. Cada plano é escrito **antes** de codar e registra, no fim, os **desvios** — o que
a implementação fez diferente e por quê. Ler o plano correspondente antes de mexer na área
dele evita reabrir decisão já tomada.

| # | plano | status |
| --- | --- | --- |
| 01 | [Fluxo de consulta de CEP](01-fluxo-consulta-cep.md) | ✅ feito |
| 02 | [Tratamento de erros e resiliência](02-tratamento-de-erros-e-resiliencia.md) | ✅ feito |
| 03 | [Log estruturado por requisição](03-log-por-requisicao.md) | ✅ feito |
| 04 | [Documentação da API](04-documentacao-da-api.md) | ✅ feito |
| 05 | [Issues no GlitchTip](05-issues-no-glitchtip.md) | ✅ feito · 1 item adiado |

---

### 01 — Fluxo de consulta de CEP · ✅ feito

Caminho feliz ponta a ponta: request validada, provedor escolhido em round-robin e
resposta traduzida para um contrato único, igual venha do ViaCEP ou da BrasilAPI.

### 02 — Tratamento de erros e resiliência · ✅ feito

Taxonomia de falhas com `NOT_FOUND` como única definitiva, fallback para o próximo
provedor, timeout por provedor e circuit breaker. Define o contrato de erro 400/404/503/504.

### 03 — Log estruturado por requisição · ✅ feito

Log JSON correlacionado por `requestId`, com duração e provedor em todo evento. É o que
responde "o que aconteceu em produção" sem depender de reproduzir o problema.

### 04 — Documentação da API · ✅ feito

OpenAPI servido pela interface do Scalar, só em `development`, com exemplo de corpo para
cada erro derivado do dicionário `CEP_ERRORS` — nenhuma mensagem digitada duas vezes.

### 05 — Issues no GlitchTip · ✅ feito · 1 item adiado

Manda para o rastreador mais do que `500`: contrato quebrado vira `error`, rajada de
timeout vira **uma** issue com contador. Adiado: amostragem dos eventos `warning`.

---

## Itens em aberto

Pequenos e sem plano próprio até agora:

- **URLs dos provedores fixas no adaptador** (plano 01). Externalizar puxa configuração por
  ambiente para dois valores que nunca mudaram.
- **Amostragem dos eventos `warning`** (plano 05). A fila do SDK é limitada e descarta
  quando cheia; o circuit breaker já limita a rajada na origem, o que reduziu a urgência.
- **`autoLogging` ignorando rotas de health** (plano 03). Só passa a importar quando
  existirem rotas de health.

## Convenções

- Numeração sequencial, sem reaproveitar número.
- Todo plano tem **Escopo** dizendo o que fica de fora, **Decisões** com a alternativa
  descartada, e **Ciclos de TDD**.
- Plano implementado ganha o aviso `> **Implementado.**` no topo e a seção
  **Desvios da implementação** no fim. Plano nunca é reescrito para "ficar certo": o
  desvio é o registro de que a realidade discordou.
