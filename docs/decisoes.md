# Registro de decisões

Decisões de projeto que explicam por que o código é como é. As de D-01 a D-14 foram **reconstruídas** em 16/11/2026 a partir do código, dos comentários, dos testes e do LEIAME (com apoio de IA): o "porquê" é o que o código declara ou deixa inferir, e onde é inferência está marcado com *(inferido)*. Corrija se a motivação real foi outra.

Decisões novas entram no fim, com data. Não se apaga decisão antiga: marca-se como **substituída por D-xx**.

Formato: **Decisão** · **Porquê** · **Consequência**.

---

**D-01 — O que não foi conferido nunca conta como "confere".**
Porquê: o resultado vai a um processo de contratação; um verde falso é pior que um amarelo a mais.Consequência: toda situação nova precisa ser classificada em "confere", "diverge" ou "incompleta"; na dúvida, incompleta. Há um estado e uma mensagem para cada motivo de incompletude.

**D-02 — A extensão só observa; nunca faz requisições.**
Porquê: não interferir num sistema de governo, não depender de autenticação e conferir exatamente o que o usuário vê na tela *(inferido)*.
Consequência: a conferência depende do que o site exibe — o usuário precisa aumentar a paginação e expandir os grupos; daí as mensagens de orientação. O manifesto não pede permissão alguma.

**D-03 — Só GET com status 2xx é lido como lista.**
Porquê: a mesma URL com POST/PUT (inclusão de item) não devolve a lista exibida.
Consequência: `ehLista()` no interceptor; teste dedicado.

**D-04 — O interceptor engole todo erro e não lê cabeçalhos.** *(A parte "não lê cabeçalhos" foi substituída por D-15.)*
Porquê: roda no mundo da página; qualquer exceção ou efeito colateral poderia quebrar o site.
Consequência: falha de leitura é silenciosa — o sintoma é o painel em "Aguardando…". O total de respostas em array (possivelmente só no cabeçalho) fica desconhecido: ver Q1 na spec.

**D-05 — Três scripts em dois mundos; toda regra em `verificacao.js`.**
Porquê: o monkey-patch exige o mundo MAIN; a lógica pura separada é testável no Node em milissegundos, sem navegador.
Consequência: Chrome ≥ 111. `painel.js` não decide nada sobre conferência.

**D-06 — Sem build, sem dependências, UMD manual.**
Porquê: instalação por "Carregar sem compactação" a partir de um .zip, por usuários não técnicos; nada a auditar em `node_modules` *(inferido)*.
Consequência: nada de TypeScript, bundler ou biblioteca de UI. Playwright existe só para os testes e não está declarado em `package.json`.

**D-07 — Nada é persistido.**
Porquê: a planilha pode conter dado não público; manter só na memória da aba dispensa a permissão `storage` e elimina vazamento entre contratações *(inferido)*.
Consequência: recarregar a página exige colar de novo.

**D-08 — A grade só aceita colagem.**
Porquê: a planilha é a única fonte do que é conferido; editar na grade criaria uma segunda versão dos dados, divergente do Excel *(inferido)*.
Consequência: células são `<input readonly>`; para corrigir, corrige-se no Excel e cola-se de novo. Só a linha "Todos" é editável.

**D-09 — Números só em formato brasileiro; o resto é "não reconhecido".**
Porquê: o Excel arredonda ao exibir em notação científica, e adivinhar entre formato americano e brasileiro pode errar por um fator de mil. Recusar é mais seguro que aproximar.
Consequência: `numeroBR` devolve `null` em vez de tentar; a célula fica amarela e o item conta como falha.

**D-10 — Dados do site guardados por id de contratação.**
Porquê: numa SPA, a resposta atrasada da contratação anterior pode chegar depois da troca de página.
Consequência: `estado.recebidos` é um `Map` por id.

**D-11 — Listas de itens valem pela última resposta; grupos acumulam.**
Porquê: a lista de itens reflete o que está na tela agora (uma nova resposta substitui a anterior); a lista de grupos é paginada e todos os grupos contam para o total.
Consequência: paginar a lista de itens no site troca o conjunto conferido (limitação na spec).

**D-12 — Sair da página de resumo descarta o que o site exibiu, mas mantém a planilha.**
Porquê: ao voltar, o site recarrega as listas e os grupos voltam fechados; manter o estado antigo conferiria algo que não está mais na tela. O usuário costuma sair para corrigir um item e voltar, então a planilha fica.
Consequência: `naPagina` em `sincronizar()`.

**D-13 — Navegação da SPA detectada por verificação periódica (1 s).**
Porquê: mais simples e robusto que interceptar a History API a partir do mundo isolado *(inferido)*.
Consequência: até 1 s de atraso para aparecer/sumir; cada mensagem do interceptor também força a verificação, para não atribuir dados à contratação errada.

**D-14 — Coluna desativada é a única exceção a D-01.**
Porquê: há contratações em que uma coluna legitimamente não se aplica ou a planilha não a traz; sem isso o verde seria inalcançável. É uma escolha explícita do usuário, não uma omissão.
Consequência: sempre registrada no painel e no relatório; reativada ao limpar ou trocar de contratação.

**D-15 — O interceptor lê o cabeçalho `register-count`; sem total, a conferência fica incompleta.** (2026-11-19, v0.2)
Porquê: as respostas reais (`testes/dados-reais/`) mostraram que o site manda todas as listas como array com status 206 e o total só nos cabeçalhos de paginação (Q1). Sem lê-lo, uma planilha com os 10 itens exibidos de uma contratação de 148 saía verde. Ler um cabeçalho da resposta que o site já recebeu não faz requisição nem altera nada; o resto de D-04 continua.
Consequência: só `register-count` é lido, só quando o corpo é array, dentro do `try/catch`. Pelo P0, total não informado (cabeçalho sumiu, lista não chegou) deixa a conferência incompleta em vez de supor que tudo foi exibido — se o site mudar o cabeçalho, o sintoma é amarelo sempre, nunca verde falso. Pelo mesmo motivo a lista de grupos, também paginada, tem total: faltar grupo nela deixa incompleta.

**D-16 — Nome "Confere Itens", marcado como não oficial.** (2026-11-23, v0.2)
Porquê: para publicar na Chrome Web Store, cuja política proíbe nomes e ícones que sugiram origem oficial. "Confere" é o verbo que o painel já usa. O ícone mostra duas linhas conferidas e uma incompleta (D-01) e não usa as cores do gov.br.
Consequência: o nome no manifesto termina em "(não oficial)" e o LEIAME diz que não há vínculo com o Compras.gov ou o Serpro. Os PNG de `icones/` saem de `icone.svg` (renderizados no Chromium); ao mudar o desenho, gere os quatro tamanhos de novo.

---

<!-- Modelo para novas decisões:

**D-NN — Título.** (AAAA-MM-DD, vX.Y.Z)
Porquê: …
Consequência: …
-->
