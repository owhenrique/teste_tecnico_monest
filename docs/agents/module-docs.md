# Formato do `docs.md` de módulo

Todo diretório com `*.module.ts` tem um `docs.md` ao lado. Ele descreve **o que o módulo
decide**, não o que o código já diz. Se a informação é óbvia lendo os arquivos, não entra.

Atualize o `docs.md` na mesma alteração que muda regra de negócio, estrutura ou decisão
do módulo — nunca em um commit separado.

## Seções

```markdown
# <Nome do módulo>

<Uma ou duas frases: responsabilidade do módulo e sua fronteira.>

## Contrato

<O que o módulo expõe para fora: rotas, portas (interfaces), tokens de injeção.
Entrada e saída, com os tipos relevantes.>

## Regras

<Regras de negócio numeradas, cada uma verificável por um teste.>

## Decisões

<Escolhas com alternativa real descartada, no formato: decisão — porquê — o que foi
descartado. Só o que não se deduz do código.>

## Arquivos

<Tabela `arquivo | papel`, apenas para os arquivos que não se explicam pelo nome.>
```

Seção sem conteúdo é omitida, não deixada vazia.
