# Confere Itens – conferência de itens para o Compras.gov (v0.2)

Ferramenta **não oficial**, sem vínculo com o Compras.gov ou o Serpro.

Confere os itens de uma contratação com a sua planilha, direto na página de resumo do Compras.gov:

`https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-artefatos-web/execucao/resume?id=...`

## Novidades da v0.2

- A extensão passa a se chamar **Confere Itens** e ganha ícone (antes: "Verificador de Itens - Compras.gov").
- **Corrige um falso "confere"**: o site informa o total de itens só no cabeçalho da resposta, que a v0.1 não lia. Com 10 itens exibidos de 148, uma planilha com aqueles 10 saía verde; agora aparece "O site está exibindo só 10 de 148 itens" e a conferência fica incompleta.
- Se o site não informar o total de itens ou de grupos, a conferência fica **incompleta** ("O site não informou o total…"): recarregue a página.
- A lista de grupos também é paginada: enquanto o site não tiver listado todos os grupos, o painel avisa "O site listou só N de M grupos". Passe pelas páginas da lista de grupos (eles se somam) e expanda cada um.

## Instalação

1. Descompacte o .zip numa pasta permanente.
2. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione a pasta `confere-itens`.

Para atualizar: substitua os arquivos, recarregue a extensão em `chrome://extensions` e atualize a página do Compras.

## Como usar

1. Abra a página de resumo da contratação. A coluna ITEM da grade é preenchida sozinha com os itens que o site exibe.
2. Escolha os padrões na linha "Todos" e/ou, no Excel, selecione a planilha **com o cabeçalho**, copie, clique em qualquer célula da grade do painel e cole (Ctrl+V).
3. A conferência é refeita a cada alteração.

A grade **só recebe valores colados** (Ctrl+V, de um bloco ou de uma célula): não dá para digitar nem apagar nela. Só a linha "Todos" é editável. Para recomeçar, use **Limpar** (zera a grade, a linha Todos e reativa todas as colunas).

**Contratação com grupos**: os itens só aparecem quando você expande cada grupo na página. Expanda todos os grupos; o painel junta os itens de todos os grupos já expandidos. Enquanto faltar algum grupo, o painel mostra a conferência como incompleta e diz quais grupos faltam, por exemplo "GRUPO 2 (0 de 6)". A lista de grupos também tem páginas: se o site ainda não listou todos ("O site listou só 10 de 12 grupos"), passe pelas outras páginas da lista de grupos; os grupos se somam.

A conferência usa os itens que o site está exibindo no momento. Se o site exibe menos itens do que a planilha (por exemplo, 10 de 148), aumente **Quantidade máxima de registros listados** na página. Quando o site exibe itens que ainda não estão na grade (por exemplo, ao mudar de página na lista), a extensão acrescenta uma linha para cada um, em ordem; as linhas existentes não são alteradas. A extensão não faz requisições: só lê a resposta da lista de itens que o próprio site carrega.

**Ao sair da página de resumo** (por exemplo, para corrigir um item) **e voltar**, a planilha colada continua na grade, mas o que o site tinha exibido antes é descartado: o painel espera o site carregar as listas de novo. Em contratação com grupos, expanda os grupos outra vez.

## Colunas

Só **ITEM** é obrigatória. Coluna vazia não é conferida e fica **hachurada** na grade; o mesmo vale para uma célula vazia sem padrão.

No cabeçalho colado, as colunas são reconhecidas também por nomes abreviados: `Nº`, `Nº item`, `Itens`, `Cód.`, `Qtd.`, `Qtd. mín.`, `Valor unit.`, `Interv. mín.`.

Números devem estar no formato brasileiro, como o Excel exibe: `1.234,56`. Notação científica (`1,23E+11`, que o Excel usa em coluna estreita e que arredonda o número), formato americano (`1,234.56`) e porcentagem (`5%`) aparecem como **valor não reconhecido** (célula amarela).

| Coluna | Valores |
|---|---|
| CATMAT | código |
| QUANTIDADE | `300.000` |
| QUANTIDADE MÍNIMA | quantidade mínima de aquisição: `10.000` (se o site não informar a mínima, a célula diverge) |
| VALOR | valor unitário, até 4 casas: `R$ 8,9962` |
| TIPO DE BENEFÍCIO | `Sem benefícios` · `Apenas desempate ficto` · `Subcontratação e Desempate Ficto` · `Cota Reservada e Desempate Ficto` · ou o nome como aparece no site |
| CRITÉRIO DE JULGAMENTO | `Menor preço` · `Maior desconto` |
| INTERVALO MÍNIMO | `0,5` |
| VALOR SIGILOSO | `Sim` · `Não` |

### Desativar uma coluna

Cada coluna tem uma **caixa no cabeçalho**. Desmarcada, a coluna fica hachurada e não é verificada: divergências e valores não reconhecidos nela são ignorados, e o padrão da linha Todos fica bloqueado. Uma coluna desativada **não** deixa a conferência incompleta (o verde pode aparecer), mas fica registrada no painel ("Desativadas: …") e no relatório ("Colunas desativadas (não verificadas): …"). **Limpar** e a troca de contratação reativam todas as colunas; colar não mexe nas caixas.

### Linha "Todos" (padrão da coluna)

Logo abaixo do cabeçalho, a linha **Todos** tem listas suspensas em Benefício, Critério e Sigiloso, e um campo em Intervalo. O valor escolhido ali vale para todas as **células vazias** da coluna; uma célula preenchida sobrescreve o padrão só naquele item. Com o padrão em branco (`—`), só as células preenchidas são conferidas. O mesmo vale para um padrão **não reconhecido** (por exemplo, `1%` no Intervalo): o campo fica amarelo, o padrão não vale para nenhuma célula e a conferência fica incompleta até ele ser corrigido ou apagado.

Colando com cabeçalho, a grade é substituída, as colunas são reconhecidas pelo nome (as desconhecidas, como DESCRIÇÃO ou VALOR TOTAL, são ignoradas) e a linha Todos recebe o primeiro valor preenchido de cada coluna de critério. Sem cabeçalho, cola a partir da célula selecionada e não mexe na linha Todos.

## Leitura do painel

- Linha hachurada com barra amarela: o item da planilha não está na lista exibida pelo site, portanto **não foi conferido**.
- Célula vermelha: diverge do site. Célula amarela: valor não reconhecido. Célula ou coluna **hachurada**: não conferida (ou coluna desativada, com o nome riscado e a caixa desmarcada).
- Barra à esquerda da linha: verde = tudo conferido e sem divergência; amarela = sem divergência, mas com células não conferidas; vermelha = diverge.
- **Conferência incompleta**: quando o site não exibe todos os itens (da planilha, do total que a própria resposta do site informa, dos grupos ainda não listados ou não expandidos), quando o site não informa esse total ou quando alguma coluna ou célula não foi conferida, o painel mostra um aviso amarelo com as colunas e os itens não conferidos, o contador verde vira "sem divergência no que foi conferido" e o relatório copiado traz "ATENÇÃO: CONFERÊNCIA INCOMPLETA".
- **Linha ignorada**: linha da planilha sem número de item válido (`3A`, `TOTAL`, em branco) ou com item repetido (vale a primeira) não é conferida. A célula ITEM fica amarela e a conferência fica **incompleta**, com as linhas listadas no aviso e no relatório. Cole de novo sem essas linhas ou corrija o número.
- **Próximo erro**: vai à próxima célula vermelha ou amarela e mostra o motivo; no último erro, volta ao primeiro. Aparece sempre que houver célula vermelha ou amarela, mesmo sem item divergente.
- Passe o mouse em qualquer célula, cabeçalho ou contador para ver os detalhes.
- Ícone de copiar: relatório em texto. Botão **–**: minimiza.

A planilha fica só na memória da aba; nada é gravado. Ao trocar de contratação ou recarregar a página, cole de novo.

## Arquivos

- `interceptor.js`: observa as respostas (só GET) da lista de itens, da lista de grupos e dos itens de cada grupo, com o total de cada lista (contexto da página).
- `verificacao.js`: colunas, leitura da colagem e conferência (também roda no Node, via `require`).
- `painel.js`: painel e grade.
- `LICENSE`: licença MIT.

## Testes

Na pasta acima de `testes/` (com `confere-itens/` ao lado):

```
node --test testes/verificacao.test.js     # regras de verificação, sem navegador
node --test testes/*.test.js               # também o painel, no Chromium (requer o pacote playwright)
```

## Requisitos

Chrome 111 ou mais novo.

## Licença

Software livre sob a licença MIT (arquivo `LICENSE`): qualquer pessoa ou órgão pode usar, copiar, modificar e redistribuir, inclusive em versões adaptadas, desde que mantenha o aviso de copyright e a licença. É fornecido sem garantia.
