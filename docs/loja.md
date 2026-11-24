# Ficha na Chrome Web Store

Textos para copiar no painel de desenvolvedor da Chrome Web Store (chrome.google.com/webstore/devconsole). Mantenha em sincronia com o `manifest.json`, o `LEIAME.md` e o `PRIVACIDADE.md`.

O **nome** e o **resumo** da ficha vêm do `manifest.json` (`name` e `description`); não são digitados no painel.

## Aba "Ficha da loja"

**Categoria:** Produtividade → Ferramentas
**Idioma:** português (Brasil)

**Descrição:**

```
Confere os itens de uma contratação do Compras.gov com a sua planilha, direto na página de resumo da contratação.

Ferramenta não oficial, sem vínculo com o Compras.gov ou o Serpro.

COMO FUNCIONA
1. Abra a página de resumo da contratação no Compras.gov.
2. No Excel, copie a planilha com o cabeçalho e cole (Ctrl+V) na grade do painel.
3. O painel compara, item a item, o que o site exibe com a planilha: CATMAT, quantidade, quantidade mínima, valor unitário, tipo de benefício, critério de julgamento, intervalo mínimo e valor sigiloso.

O QUE O PAINEL MOSTRA
- Quantos itens conferem e quantos divergem, com a célula divergente em vermelho e o botão "Próximo erro".
- Quando a conferência está incompleta: item que o site não exibiu, grupo não expandido, coluna vazia, valor não reconhecido. O que não foi conferido nunca aparece como "confere".
- Contratações com grupos: expanda cada grupo na página e o painel junta os itens.
- O botão "Copiar relatório", com o resultado da conferência em texto.

PRIVACIDADE
- A extensão não faz requisições: só lê as respostas que o próprio site já carrega.
- Não guarda nem envia dados. Tudo fica na memória da aba e some ao fechá-la.
- Não pede permissões e só roda nas páginas do Compras.gov.
```

**Imagens:**

| Campo | Arquivo | Tamanho |
|---|---|---|
| Ícone da loja | `verificador-itens-compras/icones/icone-128.png` | 128×128 |
| Bloco promocional pequeno | `docs/loja/bloco-promocional-440x280.png` | 440×280 |
| Capturas de tela (nesta ordem) | divergência, tudo confere, página inteira | 1280×800 |

As capturas não ficam no repositório (mostram uma contratação real). Ao refazê-las: DevTools → modo responsivo 1280×800 → Ctrl+Shift+P → "Capture screenshot"; recorte sem o cabeçalho do site (logo e avatar).

## Aba "Privacidade"

**Finalidade única:**

```
Conferir os itens exibidos na página de resumo da contratação do Compras.gov com uma planilha colada pelo usuário, apontando divergências e o que não pôde ser conferido.
```

**Justificativa do acesso ao host** (`cnetmobile.estaleiro.serpro.gov.br/comprasnet-artefatos-web/*`):

```
A extensão só funciona na página de resumo da contratação do Compras.gov, que fica neste endereço. Os scripts de conteúdo leem as respostas da lista de itens que a própria página já carrega (sem fazer requisições nem alterá-las) e exibem o painel de conferência. O padrão cobre todo /comprasnet-artefatos-web/* porque o site é uma aplicação de página única: o usuário chega ao resumo por navegação interna, sem recarregar a página.
```

**Por que um script roda no mundo MAIN** (se o revisor perguntar, ou no campo de observações):

```
O interceptor.js roda no mundo MAIN porque só ali consegue observar o XMLHttpRequest e o fetch da página. Ele apenas lê as respostas GET com status 2xx de três endpoints da lista de itens e de grupos, e o cabeçalho register-count, e repassa esses dados ao painel da própria aba via window.postMessage. Não faz requisições, não altera respostas e não envia nada para fora do navegador.
```

**Código remoto:** "Não, não estou usando código remoto."

**Uso de dados:** não marque nenhuma categoria. A extensão lê conteúdo da página e o texto colado, mas tudo fica na aba e nada é transmitido. Se o revisor entender que ler o conteúdo da página é "coleta", marque **Conteúdo do site** e mantenha a explicação acima. Marque as três certificações (não vende nem transfere dados a terceiros, não usa para fins alheios à finalidade única, não usa para crédito ou empréstimo).

**URL da política de privacidade:** o endereço público de `PRIVACIDADE.md` no GitHub (por exemplo, `https://github.com/giusepe-moraes/confere-itens/blob/main/PRIVACIDADE.md`). Só funciona com o repositório público; se ele for privado, publique a política em outro endereço público.

## Aba "Distribuição"

- **Visibilidade:** "Não listada" (só quem tem o link instala) ou "Pública".
- **Regiões:** todas, ou só Brasil.
- **Declaração de comerciante (UE):** não comerciante.
