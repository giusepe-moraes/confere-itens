# Arquitetura — Confere Itens (Compras.gov)

Descreve **como** a v0.2 atende à [spec.md](spec.md). Reconstruída a partir do código em 16/11/2026, com apoio de IA; contrato com o site revisto em 19/11/2026 com respostas reais (`testes/dados-reais/`).

## 1. Visão geral

```
┌──────────────────────── aba do Compras.gov ────────────────────────┐
│                                                                    │
│  Mundo MAIN (página)                Mundo isolado (extensão)       │
│  ┌───────────────────┐              ┌───────────────────────────┐  │
│  │ site (Angular)    │              │ painel.js                 │  │
│  │  XHR / fetch ─────┼─► API        │  estado em memória        │  │
│  │        │          │              │  UI em Shadow DOM fechado │  │
│  │ interceptor.js    │  postMessage │        │ chama            │  │
│  │  observa GET 2xx ─┼─────────────►│        ▼                  │  │
│  └───────────────────┘              │ verificacao.js            │  │
│                                     │  lógica pura (sem DOM)    │  │
│                                     └───────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

| Arquivo | Mundo | Responsabilidade | Não pode |
|---|---|---|---|
| `interceptor.js` | MAIN, `document_start` | Observar as três listas e repassá-las com o total | Fazer requisição, ler cabeçalho além de `register-count`, lançar erro, conter regra de conferência |
| `verificacao.js` | isolado (e Node) | Colunas, leitura de números e do TSV, `juntarSite`, `analisar`, `relatorio` | Tocar em DOM, `window` ou estado global |
| `painel.js` | isolado | UI, estado, ciclo de vida da SPA | Conter regra de conferência (só apresenta o que `analisar` devolve) |
| `manifest.json` | — | Dois `content_scripts` no mesmo `matches`; nenhuma permissão; ícones em `icones/` (PNG gerados de `icone.svg`) | — |

O interceptor precisa do mundo MAIN porque só ali o monkey-patch alcança o `XMLHttpRequest`/`fetch` que o site usa; por isso o Chrome mínimo é o 111 (`world: "MAIN"` no manifesto). O `matches` cobre todo `/comprasnet-artefatos-web/*` porque o site é SPA: o usuário pode chegar ao resumo por navegação interna, sem recarregar.

## 2. Fluxo de dados

1. O site pede uma lista (GET). O interceptor registra a URL no `open()` (XHR) ou na chamada (`fetch`).
2. Na resposta 2xx, extrai o array de dados e o total (do corpo ou do cabeçalho `register-count`), e publica `postMessage`.
3. O painel valida a mensagem, chama `sincronizar()` e guarda em `estado.recebidos[idContratação]`.
4. Se a mensagem é da contratação da página: `completarItens()` acrescenta linhas; `atualizar()` roda `V.analisar(...)` e redesenha.
5. Colagem, mudança na linha "Todos" ou numa caixa → mesmo `atualizar()`.

A análise é sempre refeita por inteiro a partir do estado; não há resultado incremental guardado.

## 3. Contrato com o site

**Não é API pública.** Tudo aqui foi observado no site e pode mudar sem aviso; é o ponto mais frágil do projeto.

### Endpoints observados (só GET, só 2xx)

| Lista | Caminho (sob `/comprasnet-artefatos/api/v1/`) | `lista` repassada |
|---|---|---|
| Itens fora de grupo | `contratacaoexecucao/contratacao/{id}/item` | `'item'` |
| Grupos | `contratacao-execucao/{id}/grupo` | `'grupos'` |
| Itens de um grupo | `contratacao-execucao/{id}/grupo/{idGrupo}/item` | `'grupo/{idGrupo}'` |

O caminho deve terminar ali ou ser seguido de `?`/`#` (regex `PADRAO` em `interceptor.js`).

### Formato do corpo

- **No site real** (todas as listas, conferido nas respostas gravadas em `testes/dados-reais/`): **array com status 206**; a paginação vem nos cabeçalhos `register-count` (total de registros), `pages-count`, `page` e `page-size`, expostos por `access-control-expose-headers`. Os pedidos levam `tamanhoPagina` e `pagina` (10 por página, inclusive na lista de grupos).
- Também aceito: objeto com o array em `content`, `itens`, `items` ou `data` (a primeira chave que for array).
- Total: no objeto, `totalElements`, `totalRegistros`, `totalItens` ou `total` (o primeiro que for número finito); no array, o cabeçalho `register-count` se for inteiro ≥ 0 (D-15). Sem nenhum dos dois, `total` vai `undefined` e a conferência fica incompleta (RF-8.4).

### Campos consumidos

| Objeto | Campos |
|---|---|
| Item | `numeroItem`, `nomeItem`, `codigoItem`, `quantidadeItens`, `quantidadeMinimaAquisicao`, `valorUnitario`, `intervaloMinimo`, `valorSigiloso`, `tipoBeneficio { id, nome, desempateFicto, cotaReservada, subContratacao }`, `criterioJulgamento { nome, maiorDesconto }`, `nomeCriterioJulgamento` |
| Grupo | `id`, `nomeGrupo`, `sequencialGrupo`, `quantidadeItens` |

No site real, `codigoItem` vem como texto (`"456446"`), `quantidadeMinimaAquisicao`, `intervaloMinimo` e `criterioJulgamento` podem vir `null` (itens de grupo, inexigibilidade) e `tipoBeneficio` traz nomes como `Sem benefícios ME/EPP` e `Não se aplica` (id 5).

### Mensagem interceptor → painel

```js
window.postMessage({
  origem: 'verificador-itens-ext',
  contratacao,   // id (string de dígitos) extraído da URL
  lista,         // 'item' | 'grupos' | 'grupo/{idGrupo}'
  dados,         // array
  total,         // número (do corpo ou do cabeçalho register-count) ou undefined
}, location.origin)
```

O painel aceita só se `ev.source === window`, `origem` confere, `dados` é array e `lista` casa com `^(item|grupos|grupo\/\d+)$`; elementos que não são objeto são descartados.

Modelo de confiança: a página pode forjar essa mensagem, mas ela já é a fonte dos dados conferidos — forjar não lhe dá nada além de mudar o que o painel mostra. O painel nunca executa nem interpreta como HTML o que recebe.

## 4. Estado (`painel.js`)

Tudo em memória, por aba:

| Campo | Conteúdo | Zera quando |
|---|---|---|
| `estado.id` | id da contratação da página | — |
| `estado.recebidos` | `Map id → { listas: { chave: { itens, total } }, grupos: Map idGrupo → grupo, totalGrupos }` | sai do resumo (tudo); troca de contratação (as outras) |
| `estado.grade` | matriz de textos, uma linha por linha da planilha (+ uma vazia no fim) | troca de contratação; "Limpar"; colagem com cabeçalho |
| `estado.padroes` | texto do padrão por coluna (linha "Todos") | idem |
| `estado.desativadas` | `Set` de ids de coluna | troca de contratação; "Limpar" |

## 5. Ciclo de vida

`sincronizar()` roda no carregamento, a cada mensagem e a cada **1 s** (o site é SPA; a extensão não intercepta a navegação):

| Situação | Ação |
|---|---|
| Fora do resumo, estava nele | limpa `recebidos`, remove o painel do DOM, mantém a grade |
| Fora do resumo, já estava fora | nada — o que chegar fica guardado (o site pode pedir a lista antes de trocar a URL) |
| No resumo, id novo | `recomecar()`: grade, padrões e caixas zerados; descarta `recebidos` de outros ids |
| No resumo, mesmo id, voltando | `atualizar()`: mantém a planilha, espera as listas |

## 6. Lógica (`verificacao.js`)

UMD simples: `module.exports` no Node, `globalThis.VerificadorItens` no navegador.

| Função | Papel |
|---|---|
| `COLUNAS` | Definição declarativa de cada coluna: `id`, nomes, `ler(texto)`, `site(item)`, `confere(item, valor)`, e para colunas de critério `padrao`, `opcoes`, `opcao(texto)` |
| `numeroBR` | Texto → número pt-BR ou `null` |
| `lerTSV` | Texto do Excel → matriz |
| `colar` | Colagem com/sem cabeçalho → `{ grade, padroes }` |
| `completarItens` | Acrescenta linhas para itens do site ausentes da grade |
| `juntarSite` | Junta as listas, os grupos e o total de grupos → `{ itens, total, grupos, totaisNaoInformados, gruposNaoListados }` |
| `analisar` | Grade × site × padrões × desativadas → resultado por linha, por coluna e geral (`completa`) |
| `relatorio` | Resultado → texto |
| `faixas`, `textoGrupos`, `textoIgnoradas`, `textoTotais` | Formatação compartilhada entre painel e relatório |

Convenção de `ler(texto)`: devolve o **valor esperado**, ou `undefined` se **não reconhecer**. Texto vazio nunca chega a `ler` (é tratado antes como "não verificar"). Essa distinção sustenta o princípio P0: "não reconhecido" vira célula amarela e conta como falha; "vazio" vira célula hachurada e conta como incompleta.

`analisar` devolve, entre outros: `linhas[]` (`estado`, `celulas[]`, `problemas[]`, `siteItem`), `conferida[]`, `desativada[]`, `padraoInvalido[]`, `conferem`, `divergem`, `incompletos`, `naoExibidos`, `linhasIgnoradas`, `colunasNaoConferidas`, `colunasDesativadas`, `gruposIncompletos`, `gruposNaoListados`, `totaisNaoInformados`, `total`, `temConferencia`, `completa`. O painel e o relatório só leem esse objeto.

## 7. Interface

- Um `<div id="verificador-itens-ext">` no `body`, com Shadow DOM **fechado** e CSS próprio (`:host { all: initial }`): o site não estiliza nem alcança o painel, e vice-versa.
- A grade é feita de `<input readonly>`: recebem foco e o evento `paste`, mas não digitação.
- Elementos criados só com `createElement` + `textContent`; dicas via `data-dica` e um único balão.
- Os testes trocam `mode: 'closed'` por `'open'` por substituição de texto — a string não pode ser renomeada.

## 8. Testes

| Arquivo | O que cobre | Como |
|---|---|---|
| `testes/verificacao.test.js` | Toda a lógica de `verificacao.js` | `node:test`, sem navegador |
| `testes/painel.test.js` | Interceptor + painel de ponta a ponta | Chromium via Playwright; `context.route` serve uma página falsa e a API simulada no formato real (array, 206, cabeçalhos de paginação; a 456 no formato antigo de objeto); os três scripts entram por `addInitScript`; colagem pela área de transferência real |
| `testes/apoio-dados-reais.js` | Leitura de `testes/dados-reais/` (fora do git) | Os dois arquivos de teste têm testes "dados reais" que conferem as respostas gravadas do site; sem a pasta, são pulados |

Os testes do painel rodam em sequência na mesma página e dependem do estado deixado pelos anteriores. Geram capturas em `testes/capturas/`, úteis para revisar a aparência.

Diferença em relação à extensão real: nos testes os scripts são injetados como init scripts, não carregados pelo `manifest.json`. O manifesto (mundos, `matches`, `run_at`) só é exercitado carregando a extensão no Chrome — ver o checklist de versão em [manutencao.md](manutencao.md).

Sem teste encontrado (16/11/2026): chaves alternativas do corpo (`itens`, `items`, `data`, `totalRegistros`, `totalItens`, `total`); falha ao copiar o relatório; cabeçalho `CATSER`; `público` na coluna Sigiloso.
