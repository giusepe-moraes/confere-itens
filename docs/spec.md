# Especificação — Confere Itens (Compras.gov)

Versão descrita: **0.2** · Reconstruída a partir do código em 16/11/2026, com apoio de IA (engenharia reversa; não havia documento de planejamento). Revista em 19/11/2026 com respostas reais da API (`testes/dados-reais/`): Q1 resolvida.

Este documento diz **o que** a extensão deve fazer. O **como** está em [arquitetura.md](arquitetura.md), os **porquês** em [decisoes.md](decisoes.md) e o processo de mudança em [manutencao.md](manutencao.md). O manual do usuário é o [LEIAME.md](../verificador-itens-compras/LEIAME.md).

Regra de uso: toda mudança de comportamento altera primeiro este arquivo (requisito e critério de aceite), depois os testes, depois o código.

## 1. Objetivo

Permitir que quem cadastra uma contratação no Compras.gov confira, na página de resumo, se os itens cadastrados batem com a planilha de origem (Excel), sem conferir item a item à mão.

O resultado tem de ser confiável o bastante para ir a um processo: **um "confere" só pode aparecer quando tudo foi de fato comparado**.

## 2. Escopo

Dentro do escopo:

- Página `https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-artefatos-web/execucao/resume?id={id}`.
- Itens fora de grupo e itens de grupos expandidos pelo usuário.
- Planilha colada da área de transferência (texto com tabulações, como o Excel copia).
- Relatório em texto para colar no processo.

Fora do escopo (não-objetivos — não implementar sem rever esta spec):

- Fazer requisições ao Compras.gov ou a qualquer outro servidor.
- Alterar, preencher ou corrigir dados no site.
- Gravar a planilha ou o resultado (disco, `storage`, nuvem).
- Ler arquivos `.xlsx`/`.csv` diretamente.
- Digitação ou edição de células na grade.
- Outros navegadores ou Chrome anterior ao 111.
- Conferir campos além das colunas da seção 5 (ex.: descrição, unidade, valor total).

## 3. Princípio central

**P0. O que não foi conferido nunca conta como "confere".** Qualquer dado que a extensão não conseguiu comparar deixa a conferência *incompleta* (amarelo), nunca *completa* (verde). A única exceção é a coluna desativada pelo usuário (RF-6), que é sempre listada no painel e no relatório.

Todo requisito abaixo se subordina a P0. Na dúvida entre "verde" e "incompleta", é incompleta.

## 4. Entradas e saídas

| | Origem | Conteúdo |
|---|---|---|
| Entrada | Site | Respostas JSON das listas que o próprio site pede: itens fora de grupo, grupos, itens de cada grupo expandido, com o total de registros de cada lista (contrato em [arquitetura.md](arquitetura.md#3-contrato-com-o-site)) |
| Entrada | Usuário | Planilha colada (Ctrl+V); padrões da linha "Todos"; caixas que ativam/desativam colunas |
| Saída | Painel | Grade colorida, contadores, aviso de conferência incompleta, pílula quando minimizado |
| Saída | Área de transferência | Relatório em texto (RF-9) |

## 5. Colunas

Ordem fixa da grade. Só ITEM é obrigatória.

| Coluna | Campo do site | Leitura da célula | Regra de igualdade |
|---|---|---|---|
| ITEM | `numeroItem` | inteiro > 0, só dígitos | chave da linha |
| CATMAT | `codigoItem` | só os dígitos, sem zeros à esquerda | igualdade exata |
| QUANTIDADE | `quantidadeItens` | número pt-BR ≥ 0 | diferença ≤ 1e-9 |
| QUANTIDADE MÍNIMA | `quantidadeMinimaAquisicao` | número pt-BR ≥ 0 | diferença ≤ 1e-9; site sem valor → diverge |
| VALOR | `valorUnitario` | número pt-BR ≥ 0 (aceita `R$`) | diferença ≤ 0,00005 (4 casas) |
| TIPO DE BENEFÍCIO ★ | `tipoBeneficio` | texto | ver RF-4.3 |
| CRITÉRIO DE JULGAMENTO ★ | `criterioJulgamento` / `nomeCriterioJulgamento` | texto | ver RF-4.4 |
| INTERVALO MÍNIMO ★ | `intervaloMinimo` | número pt-BR ≥ 0 | diferença ≤ 1e-9 |
| VALOR SIGILOSO ★ | `valorSigiloso` | sim/não | ver RF-4.5 |

★ = "coluna de critério": tem padrão na linha "Todos" (RF-5).

## 6. Requisitos funcionais

Cada requisito traz os critérios de aceite e os testes que o cobrem (**V** = `testes/verificacao.test.js`, **P** = `testes/painel.test.js`, pelo nome do teste).

### RF-1. Observação do site

1. A extensão só **observa** respostas de requisições que o site faz; nunca faz as suas.
2. Só requisições **GET** com status **2xx** das três listas são lidas, tanto via `XMLHttpRequest` quanto via `fetch`.
3. Nenhum erro da extensão pode afetar o site: resposta inesperada é ignorada em silêncio.
4. Listas de **itens** valem pela **última resposta** de cada lista; a lista de **grupos** **acumula** entre respostas (é paginada), e o total de grupos vale pela última resposta.
5. Os dados são guardados por id de contratação: resposta atrasada de outra contratação não altera a atual.
6. Um XHR reaproveitado não pode ter a resposta atribuída à URL de um `open()` anterior.
7. **Total da lista**: se o corpo é um objeto com o total (`totalElements` etc.), vale ele; se o corpo é um array (como no site real, com status 206), vale o cabeçalho `register-count` (inteiro ≥ 0). Nenhum outro cabeçalho é lido. Sem nenhum dos dois, o total fica desconhecido (RF-8.4).

Testes: P "abre o painel e preenche ITEM… (XHR)"; P "troca de contratação (SPA)… fetch também é observado"; P "resposta atrasada de outra contratação…"; P "só GET é lido como lista; XHR reaproveitado…"; P "Q1: total só no cabeçalho register-count…"; P "dados reais…" (3 testes, só com `testes/dados-reais/`).

### RF-2. Painel e ciclo de vida

1. O painel aparece só quando o caminho termina em `/execucao/resume` e `id` é numérico; em outras páginas do sistema, não aparece.
2. Ao abrir, a coluna ITEM é preenchida com os itens que o site exibe. Quando o site exibe itens novos, entra uma linha para cada um, em ordem numérica, **sem alterar as linhas existentes**.
3. **Trocar de contratação** (o site é SPA) recomeça tudo: grade, linha "Todos" e colunas desativadas.
4. **Sair da página de resumo** descarta o que o site exibiu (inclusive grupos expandidos) e **mantém a planilha**; ao voltar à mesma contratação, o painel espera o site carregar as listas de novo.
5. Nada é persistido: recarregar a página perde a planilha.
6. O painel pode ser minimizado numa pílula que mostra o estado: vermelho "N divergem" > verde "N conferem" > amarelo "Conferência incompleta"; neutra se nada foi conferido.

Testes: P "abre o painel…"; P "ao exibir mais itens…"; P "troca de contratação (SPA)…"; P "sair da página de resumo e voltar…"; P "conferência completa: verde no resumo e na pílula"; V "completarItens…".

### RF-3. Entrada da planilha

1. A grade **só aceita colagem**; não há digitação nem exclusão. Só a linha "Todos" e as caixas do cabeçalho são editáveis. "Limpar" zera grade, linha "Todos" e reativa as colunas, mantendo os itens do site.
2. O texto colado é lido como TSV do Excel: tabulações, CRLF, células entre aspas com quebra de linha e aspas duplicadas; espaços em sequência viram um só.
3. **Com cabeçalho** (primeira linha não começa com número de item e contém uma coluna ITEM reconhecida): a grade é **substituída**; colunas são reconhecidas pelo nome, sem acento/caixa; desconhecidas são ignoradas; linhas totalmente vazias são descartadas; a linha "Todos" recebe o primeiro valor preenchido de cada coluna de critério — convertido na opção da lista correspondente, ou em branco se não casar com nenhuma; no INTERVALO MÍNIMO (campo livre) o texto entra como veio e, se não for número, cai em RF-5.3.
4. **Sem cabeçalho**: cola a partir da célula selecionada, cria linhas se preciso, corta colunas excedentes e **não mexe** na linha "Todos".
5. Reconhecimento de cabeçalhos (ordem de avaliação importa):

   | Contém / casa | Coluna |
   |---|---|
   | `sigilos` | VALOR SIGILOSO |
   | `benefic` | TIPO DE BENEFÍCIO |
   | `criterio`, `julgamento` | CRITÉRIO DE JULGAMENTO |
   | `interv`, `lance` | INTERVALO MÍNIMO |
   | `minim`, palavra `min` | QUANTIDADE MÍNIMA (antes de QUANTIDADE) |
   | `catmat`, `catser`, `codigo`, palavra `cod` | CATMAT |
   | começa com `quant`, `qtd`, `qtde` | QUANTIDADE |
   | `total` | **ignorada** ("valor total" não é o unitário) |
   | `valor`, `preco`, `unitari` | VALOR |
   | `Item`, `Itens`, `Nº`, `N.º`, `Nº do item`, `Núm. item` e variações | ITEM |

   Se dois cabeçalhos casam com a mesma coluna, vale o primeiro.
6. Colar não altera as caixas de ativação das colunas.

Testes: V "lerTSV…"; V "colar com cabeçalho…" (2 testes); V "colar sem cabeçalho…"; V "cabeçalhos abreviados…"; P "a grade não aceita digitação"; P "colar com cabeçalho…"; P "colar sem cabeçalho…"; P "Limpar zera a grade…".

### RF-4. Leitura de valores

1. **Números só em formato brasileiro**: `1.234,56`, `300.000`, `0,5`, `,5`, `R$ 8,9962`. Sem vírgula, ponto é milhar apenas no padrão `d{1,3}(.ddd)+` (`300.000` → 300000); fora dele é decimal (`12.5` → 12,5).
2. **Não reconhecidos** (célula amarela, nunca um valor aproximado): notação científica (`1,23E+11`), formato americano (`1,234.56`), `%`, hexadecimal, `-`, `#####`, texto, e números negativos nas colunas numéricas.
3. **Benefício** confere se o texto for igual ao nome do site (sem acento/caixa) **ou** se casar com uma das quatro opções, verificadas pelas marcas do site:

   | Opção (texto da planilha) | Condição no site |
   |---|---|
   | Sem benefícios (`sem beneficio…`) | `id` = 0 e nenhuma marca |
   | Apenas desempate ficto (`desempate…`, `apenas desempate…`) | só `desempateFicto` |
   | Subcontratação e Desempate Ficto (contém `desempate` e `subcontrat`) | `desempateFicto` e `subContratacao`, sem cota |
   | Cota Reservada e Desempate Ficto (contém `desempate` e `cota`) | `desempateFicto` e `cotaReservada`, sem subcontratação |

4. **Critério** confere se o texto for igual ao nome do site, ou: `menor preço…` ↔ `maiorDesconto` falso; `maior desconto…` ↔ verdadeiro. Sem o campo `maiorDesconto`, deduz-se do nome do site.
5. **Sigiloso**: `sim`, `s`, `x`, `sigiloso` → verdadeiro; `não`, `n`, `público`, `não sigiloso` → falso; outro texto → não reconhecido.
6. **CATMAT**: comparam-se só os dígitos, sem zeros à esquerda; célula sem dígito → não reconhecida.

Testes: V "numeroBR" (2 testes); V "tolerâncias e formatos…"; V "benefício…" (2 testes); V "critério…" (2 testes); V "quantidade mínima…"; V "valor não reconhecido…"; V "cada coluna detecta divergência".

### RF-5. Linha "Todos" (padrão)

1. Nas colunas de critério, o padrão vale para as **células vazias**; célula preenchida prevalece naquele item.
2. Padrão em branco: só as células preenchidas são conferidas.
3. Padrão **não reconhecido** não vale para nenhuma célula, fica sinalizado (amarelo) e deixa a conferência incompleta.
4. Um padrão sozinho (grade só com ITEM) já confere todos os itens exibidos naquela coluna.

Testes: V "padrões da linha Todos valem para as células vazias"; V "padrão não reconhecido na linha Todos…"; P "linha Todos: lista suspensa e campo de intervalo"; P "padrão da linha Todos sozinho confere…".

### RF-6. Coluna desativada

1. Caixa do cabeçalho desmarcada: a coluna não é verificada — divergências, valores não reconhecidos e o padrão dela são ignorados, e o controle da linha "Todos" fica bloqueado.
2. Coluna desativada **não** deixa a conferência incompleta, mas **não** dispensa as outras regras de incompletude.
3. É sempre listada no painel ("Desativadas: …") e no relatório. Só a coluna desativada tem o nome riscado; coluna vazia fica apenas hachurada.
4. "Limpar" e troca de contratação reativam todas.

Testes: V "coluna desativada…" (2 testes); P "caixa do cabeçalho desativa a coluna…"; P "coluna vazia fica hachurada, mas só a desativada tem o nome riscado".

### RF-7. Resultado por linha e por célula

| Estado da linha | Quando | Aparência |
|---|---|---|
| vazia | nenhuma célula preenchida | — |
| inválida | ITEM vazio ou não inteiro > 0 (`3A`, `TOTAL`) | ITEM amarelo; linha ignorada |
| repetida | ITEM já apareceu acima (vale a primeira) | ITEM amarelo, riscada; linha ignorada |
| ausente | item não está entre os exibidos pelo site | hachurada, barra amarela |
| falha | item exibido e alguma célula diverge **ou tem valor não reconhecido** (o item entra em "divergem") | barra vermelha |
| ok | algo conferido e nenhuma falha | barra verde; amarela ("parcial") se houver célula não conferida |
| neutra | item exibido, mas nada conferido | sem barra |

Células: vermelha = diverge (dica "Site: … / Planilha: …"); amarela = valor não reconhecido; hachurada = não conferida.

Sem nenhuma lista do site, nenhum item é dado como ausente (o painel mostra "Aguardando a lista de itens do site…").

Testes: V "linhas especiais…"; V "sem lista do site…"; V "nada conferido: temConferencia falso"; P "dica no hover e Próximo erro".

### RF-8. Conferência completa × incompleta

A conferência é **completa** somente se **todas** as condições valem:

1. Toda coluna ativa é conferida (tem célula preenchida ou padrão válido).
2. Todo item exibido pelo site tem linha na planilha e nenhuma célula não conferida em coluna conferida.
3. Todo item da planilha é exibido pelo site.
4. O site informou o total da lista de itens fora de grupo **e** o da lista de grupos (RF-1.7). Sem um deles não há como saber se tudo está exibido: "o site não informou o total de …". Também vale antes de a lista chegar.
5. O total informado pelo site não é maior que o número de itens exibidos. Com grupos, total = itens fora de grupo + soma de `quantidadeItens` dos grupos.
6. Todos os grupos da contratação foram listados: grupos recebidos ≥ total de grupos informado (a lista de grupos é paginada; sem isso o total da condição 5 fica subestimado).
7. Todo grupo conhecido está exibido por completo — condição independente da 5, pois o total pode estar subestimado.
8. Nenhuma linha da planilha foi ignorada (inválida ou repetida).

Incompleta: o contador verde vira "N sem divergência no que foi conferido", aparece o aviso amarelo listando cada motivo e a orientação ao usuário (aumentar "Quantidade máxima de registros listados"; exibir e expandir todos os grupos; recarregar a página se o total não foi informado).

Testes: V "tudo preenchido e igual: conferência completa"; V "incompleta: …" (5 testes); V "grupos: …" (4 testes); V "juntarSite…"; V "linha com número de item inválido ou repetido…"; V "dados reais…" (só com `testes/dados-reais/`); P "contratação com grupos…" (3 testes); P "Q1: …" (2 testes); P "linha ignorada e padrão não reconhecido…"; P "dados reais…".

### RF-9. Relatório

Texto simples, nesta ordem: título com o id; "Itens exibidos pelo site: N [de T]"; para cada item divergente, número, nome, CATMAT e os problemas; linha separadora; "Conferem: N | Divergem: M" (ou "Sem divergência no que foi conferido: N…" se incompleta); colunas desativadas; se incompleta, "ATENÇÃO: CONFERÊNCIA INCOMPLETA" com todos os motivos de RF-8.

O botão de copiar fica desabilitado enquanto nada foi conferido e avisa quando a cópia falha.

Testes: V "relatório lista as divergências por item"; V "relatório: item do site sem código…"; P "relatório copiado".

### RF-10. Navegação de erros

"Próximo erro" aparece sempre que houver célula vermelha ou amarela (mesmo sem item divergente), percorre-as na ordem da grade, volta ao início no fim e mostra o motivo. Toda célula, cabeçalho e contador explica seu estado ao passar o mouse.

Testes: P "dica no hover e Próximo erro"; P "linha ignorada e padrão não reconhecido…".

## 7. Requisitos não funcionais

| | Requisito |
|---|---|
| RNF-1 Não interferência | A extensão não pode quebrar nem alterar o site: sem requisições próprias, sem mudar respostas, erros engolidos no interceptor, UI isolada em Shadow DOM fechado. |
| RNF-2 Privacidade | Nenhum dado sai do navegador nem é gravado. Sem `permissions`, `host_permissions`, `storage` ou rede no manifesto. |
| RNF-3 Segurança | Dado do site ou da planilha entra no DOM só por `textContent`/`value`/`dataset`; proibido `innerHTML`, `eval` e similares. Sem segredos no código (código de extensão é público). |
| RNF-4 Simplicidade | JS puro, sem build e sem dependências em tempo de execução. Playwright só nos testes. |
| RNF-5 Testabilidade | Toda regra de conferência mora em `verificacao.js` e é testável no Node, sem navegador. |
| RNF-6 Idioma | Código, comentários, mensagens, testes e documentos em português. |
| RNF-7 Compatibilidade | Chrome ≥ 111, Manifest V3. |

## 8. Limitações conhecidas

- **Paginação do site**: como a lista de itens vale pela última resposta, mudar de página no site troca o conjunto exibido; as linhas já criadas ficam como "ausentes". O caminho suportado é aumentar "Quantidade máxima de registros listados". O mesmo vale dentro de cada grupo.
- **Total no cabeçalho**: o site real só informa o total no cabeçalho `register-count` (Q1). Se o site deixar de mandá-lo, toda conferência fica incompleta ("o site não informou o total") até a extensão ser atualizada — erra para o lado seguro.
- **Lista de grupos paginada**: como a de itens, mostra 10 grupos por página. Os grupos acumulam, então passar pelas páginas da lista de grupos resolve; enquanto faltar grupo, a conferência fica incompleta (RF-8.6).
- **API interna**: endpoints e nomes de campos não são contrato público; mudança do site pode fazer o painel ficar em "Aguardando…" ou acusar divergência em tudo.
- **Ponto sem vírgula**: `12.5` é lido como 12,5 e `1.500` como 1500 (RF-4.1). É o que o Excel pt-BR exibe, mas uma planilha em formato americano pode enganar.
## 9. Questões em aberto

Pontos que o código não permite decidir e precisam de confirmação de quem conhece o site real:

- **Q2 — Remoção de grupo/itens no site sem sair da página**: grupos acumulam e só são descartados ao sair do resumo. Se o site permitir excluir um grupo ali mesmo, ele continuaria contando como "não exibido por completo" (erra para o lado seguro).
- **Q3 — Opções de benefício**: a lista de quatro opções cobre todos os tipos que o site oferece hoje? Outros tipos só conferem pelo nome exato.

### Questões resolvidas

- **Q1 — A lista de itens fora de grupo do site real informa o total?** *Resolvida em 19/11/2026 (v0.2), com as respostas reais de `testes/dados-reais/`.* Não no corpo: todas as listas (itens, grupos, itens de grupo) vêm como **array com status 206**, e o total vem só nos cabeçalhos de paginação (`register-count`, `pages-count`, `page`, `page-size`). Na contratação 634177 o site exibia 10 de 148 itens, e a v0.1, que não lia cabeçalhos, daria verde a uma planilha com aqueles 10. Correção: o interceptor lê o `register-count` (RF-1.7, D-15); total não informado deixa a conferência incompleta (RF-8.4); e, como a lista de grupos também é paginada, faltar grupo na lista também deixa (RF-8.6).
