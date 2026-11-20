# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

Extensão do Chrome (Manifest V3, Chrome ≥ 111, JS puro, sem build nem dependências) que confere os itens da página de resumo da contratação do Compras.gov (`/comprasnet-artefatos-web/execucao/resume?id=...`) com uma planilha colada do Excel. Código, comentários, mensagens e testes são em português; mantenha assim.

- `verificador-itens-compras/` — a extensão (é a pasta carregada em `chrome://extensions` → "Carregar sem compactação"). `LEIAME.md` é a documentação do usuário e, a partir da próxima versão, o changelog (seção "Novidades da vX"; a v0.1 é a inicial e não tem); atualize-o e a `version` do `manifest.json` juntos quando o comportamento mudar.
- `testes/` — testes `node:test`; `testes/capturas/` são screenshots geradas pelos testes do painel; `testes/dados-reais/` (fora do git) tem requisições e respostas reais do Compras.gov, sem tokens/cookies e com dados pessoais anonimizados (ver o `README.txt` da pasta), para servir de referência aos mocks.
- `docs/` — `spec.md` (requisitos RF-n e critérios de aceite), `arquitetura.md` (inclui o contrato com a API do site), `decisoes.md` (D-nn), `manutencao.md` (fluxo, checklist de revisão, receitas, publicação). Mudança de comportamento: spec → teste falhando → código → LEIAME; consulte as receitas de `manutencao.md` antes de mexer em colunas, endpoints ou motivos de "incompleta".

Proibições: nada de `innerHTML`/`eval` com qualquer dado; nada de requisições, `storage` ou permissões novas no manifesto; nada de dependência de execução; não alterar teste para fazê-lo passar.

## Comandos

Rodar da raiz (a pasta que contém `testes/` e `verificador-itens-compras/`):

```
node --test testes/verificacao.test.js          # lógica pura, sem navegador
node --test testes/*.test.js                    # também o painel no Chromium (requer o pacote playwright)
node --test --test-name-pattern="grupos" testes/verificacao.test.js   # um teste só
EXT=/outra/pasta node --test testes/*.test.js   # roda contra outra cópia da extensão
```

Os testes de `painel.test.js` rodam em sequência na mesma página e dependem do estado deixado pelos anteriores; filtrar um teste isolado ali pode falhar.

## Arquitetura

Três scripts, em dois mundos de execução (ver `manifest.json`):

1. **`interceptor.js`** (world `MAIN`, `document_start`): faz monkey-patch de `XMLHttpRequest.prototype.open` e `window.fetch` para **observar** (só GET, só status 2xx) as respostas de três endpoints — itens fora de grupo, lista de grupos e itens de um grupo expandido — e repassa via `window.postMessage({ origem: 'verificador-itens-ext', contratacao, lista, dados, total })`. `lista` é `'item'`, `'grupos'` ou `'grupo/{idGrupo}'`. Nunca faz requisições próprias e engole qualquer erro: não pode quebrar o site.
2. **`verificacao.js`** (mundo isolado): lógica pura — `COLUNAS`, leitura de números pt-BR (`numeroBR`), parsing do TSV colado, `juntarSite`, `analisar`, `relatorio`. UMD simples: exporta via `module.exports` no Node e `globalThis.VerificadorItens` no navegador. Toda regra de conferência deve morar aqui para ser testável sem navegador.
3. **`painel.js`** (mundo isolado): UI em Shadow DOM `closed` (o teste troca para `open` por substituição de texto — não renomeie a string `mode: 'closed'`), estado em memória (`estado.recebidos` por id de contratação, `grade`, `padroes` da linha "Todos", `desativadas`). Ouve o `message` do interceptor e chama `sincronizar()` a cada 1 s, porque o site é SPA: troca de contratação recomeça; sair da página de resumo descarta o que o site exibiu, mas mantém a planilha.

Princípio central (cabeçalho de `verificacao.js`): **o que não foi conferido nunca conta como "confere"**. Coluna/célula vazia, padrão não reconhecido, linha com item inválido/repetido, item não exibido pelo site, grupo não expandido por completo — tudo deixa a conferência *incompleta*, nunca verde. Coluna desativada é a única exceção (não verifica e não deixa incompleta, mas é listada). Mudanças devem preservar isso; boa parte dos testes existe para fechar casos de falso "confere".

Outras invariantes que já viraram teste:
- Números só no formato brasileiro (`1.234,56`); notação científica, formato americano e `%` → "valor não reconhecido".
- Resposta atrasada de outra contratação não pode sobrescrever a atual (dados guardados por id).
- Grupos acumulam entre respostas (paginados); listas de itens valem pela última resposta.
- A grade só aceita colagem (Ctrl+V); só a linha "Todos" é editável. Nada é persistido.

## Testes do painel

`painel.test.js` sobe Chromium com Playwright, intercepta `https://cnetmobile.estaleiro.serpro.gov.br/**` com `context.route` servindo uma página falsa e respostas simuladas da API (contratações 123, 456 e 777 com grupos; respostas de grupo em array com status 206, como no site real), e injeta os três scripts como `addInitScript`. Ao mudar formato de resposta suportado pelo interceptor, atualize esses mocks.
