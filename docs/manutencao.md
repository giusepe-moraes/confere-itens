# Guia de manutenção

Como mudar o projeto sem quebrar o que ele garante. Complementa [spec.md](spec.md), [arquitetura.md](arquitetura.md) e [decisoes.md](decisoes.md).

## 1. Onde fica cada coisa

| Documento | Responde | Atualizar quando |
|---|---|---|
| `docs/spec.md` | O que a extensão faz e o que é "pronto" | Qualquer mudança de comportamento (antes do código) |
| `docs/arquitetura.md` | Como está construída; contrato com o site | Mudar estrutura, estado, mensagem ou formato de resposta suportado |
| `docs/decisoes.md` | Por que é assim | Tomar ou reverter uma decisão de projeto |
| `docs/manutencao.md` | Como mudar e publicar | Mudar o processo |
| `docs/loja.md`, `PRIVACIDADE.md` | Textos da ficha na Chrome Web Store e política de privacidade | Mudar o que a extensão lê, mostra ou o `manifest.json` |
| `confere-itens/LEIAME.md` | Manual do usuário e novidades da versão | Junto com a `version` do manifesto |
| `CLAUDE.md` | Contexto enxuto para o agente | Só quando a falta da linha faria o agente errar |

## 2. Ambiente

- Node com `node:test` (testado com Node 26).
- Testes do painel: pacote `playwright` e o Chromium dele (`npx playwright install chromium`). Não há `package.json`; o pacote precisa estar resolvível a partir de `testes/`.

```
node --test testes/verificacao.test.js          # lógica, sem navegador (≈ 0,2 s)
node --test testes/*.test.js                    # + painel no Chromium
node --test --test-name-pattern="grupos" testes/verificacao.test.js
EXT=/outra/pasta node --test testes/*.test.js   # contra outra cópia da extensão
```

Não filtre testes isolados em `painel.test.js`: eles dependem do estado deixado pelos anteriores.

## 3. Fluxo de uma mudança

1. **Spec**: escreva ou altere o requisito e o critério de aceite em `spec.md`. Classifique todo caso novo em confere / diverge / incompleta (P0).
2. **Teste primeiro**: escreva o teste, rode e veja **falhar**. Regra de conferência → `verificacao.test.js`; comportamento de tela ou do interceptor → `painel.test.js`.
3. **Implemente** sem alterar os testes para passar. Regra de conferência vai em `verificacao.js`, nunca em `painel.js`.
4. **Verifique**: suíte completa verde; olhe as capturas em `testes/capturas/` se a aparência mudou.
5. **Documente**: LEIAME (uso + "Novidades"), `version`, e `arquitetura.md`/`decisoes.md` se couber.
6. **Leia o diff** inteiro antes de aceitar. Uma mudança por vez.

Se o diff cabe em uma frase e não muda comportamento (texto, CSS, comentário), pule os passos 1 e 2.

## 4. Regras que não se quebram

Checklist de revisão de qualquer diff:

- [ ] Nenhum caminho novo leva a verde sem comparação (P0). Para cada `return`/`continue` antecipado em `analisar`, o que acontece com `completa`?
- [ ] `interceptor.js` continua sem fazer requisições, sem ler cabeçalho além de `register-count`, sem alterar a resposta, com todo código dentro de `try/catch`.
- [ ] Nenhum `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`, `new Function` ou `setTimeout` com string.
- [ ] `manifest.json` sem `permissions`, `host_permissions` ou novos `matches`.
- [ ] Nenhuma dependência de execução, `storage`, cookie ou chamada de rede.
- [ ] Nenhum teste apagado ou afrouxado para passar.
- [ ] A string `mode: 'closed'` continua idêntica em `painel.js`.
- [ ] Textos em português.

## 5. Receitas

### O site mudou e o painel parou de funcionar

Sintomas: "Aguardando a lista de itens do site…" para sempre; ou tudo diverge; ou uma coluna mostra "—" no lado do site.

1. No DevTools (aba Rede) da página de resumo, ache a requisição da lista e compare com a seção 3 de `arquitetura.md`: caminho, método, status, forma do corpo, cabeçalho `register-count`, nomes dos campos. Melhor: salve um HAR, extraia com `testes/dados-reais/extrair_har.py`, anonimize e rode os testes "dados reais".
2. Caminho mudou → regex `PADRAO` em `interceptor.js`. Forma do corpo mudou → `repassar()`. Campo mudou → `site`/`confere` da coluna em `COLUNAS`.
3. Atualize os mocks de `painel.test.js` (e os itens de exemplo de `verificacao.test.js`) para o formato novo **antes** do código.
4. Atualize a seção 3 de `arquitetura.md`.

Ao colar respostas reais em teste ou em conversa com IA, use só dados de contratação já pública, ou anonimize.

### Nova coluna

1. Spec: linha na tabela da seção 5 e regra de leitura/igualdade.
2. `COLUNAS` em `verificacao.js`: `id`, `nome`, `curto`, `rotulo`, `ajuda`, `ler`, `site`, `confere` (e `padrao`/`opcoes`/`opcao` se for de critério). A posição no array é a posição na grade.
3. `reconhecer()`: nome do cabeçalho — atenção à **ordem** das regras (ex.: "mín." antes de "qtd"; "total" antes de "valor").
4. `LARGURA` em `painel.js` (e a largura do painel, se não couber).
5. Testes: reconhecimento do cabeçalho, igualdade, divergência, valor não reconhecido, célula vazia.
6. LEIAME: tabela de colunas.

### Nova opção de benefício ou de critério

`opcoes` da coluna + `opcaoBeneficio`/`beneficioConfere` (ou `criterioConfere`) + teste com as marcas reais do site + spec RF-4 + LEIAME.

### Novo motivo de conferência incompleta

Precisa aparecer em **quatro** lugares, senão o usuário vê amarelo sem saber por quê: campo no resultado de `analisar` e na expressão `completa`; `relatorio()`; `alertaIncompleta()` no painel; spec RF-8 e LEIAME.

### Nova lista ou endpoint observado

Regex e nome da `lista` no interceptor; validação da mensagem em `painel.js` (regex de `d.lista`); tratamento em `juntarSite`; mocks do `context.route`; seção 3 de `arquitetura.md`.

## 6. Publicar uma versão

- [ ] `node --test testes/*.test.js` verde (os dois arquivos).
- [ ] `version` no `manifest.json` e no título do `LEIAME.md` iguais.
- [ ] Seção "Novidades da vX" acrescentada ao LEIAME, acima das anteriores (a v0.2, primeira publicada, é a versão inicial e não tem).
- [ ] Commit da versão e tag `vX.Y` no git.
- [ ] Teste manual no Chrome com a extensão carregada da pasta (é o único teste do `manifest.json`): abrir uma contratação sem grupos e uma com grupos; colar uma planilha; trocar de contratação pelo site; sair do resumo e voltar; conferir o console sem erros da extensão.
- [ ] Compactar só a pasta `confere-itens/` (sem `testes/`, `docs/`, capturas).
- [ ] Ficha da loja e política conferem com a versão (`docs/loja.md`, `PRIVACIDADE.md`); enviar o zip no painel de desenvolvedor.

Numeração: começa em 0.1; `0.x` para comportamento novo, `0.x.y` para correção. O Chrome aceita de um a quatro números inteiros separados por ponto.

## 7. Trabalhando com agente de IA

Práticas adotadas neste projeto:

- Peça o plano antes de mudanças em mais de um arquivo; uma tarefa por sessão.
- Dê ao agente o critério verificável: o requisito da spec e o comando de teste. Peça a saída dos testes, não a afirmação de que passou.
- Peça os testes primeiro, confirme que falham, só então a implementação.
- Não aceite diff que você não saiba explicar; desconfie de teste alterado junto com o código.
- Dependência nova: confira no registro oficial antes de instalar (este projeto não deveria precisar de nenhuma).
- Só informação pública em ferramentas de nuvem: nada de planilha interna, minuta não publicada ou dado pessoal em prompt ou fixture.

## 8. Pendências de infraestrutura

Encontradas na engenharia reversa (16/11/2026); nenhuma foi alterada:

1. **Controle de versão.** Resolvido: repositório git iniciado na v0.1; `.gitignore` exclui `node_modules/` e `testes/capturas/` (geradas pelos testes).
2. **Playwright não declarado.** Sem `package.json`, os testes do painel não rodam numa máquina limpa (nesta data, falharam aqui por falta do pacote; os 37 testes de lógica passaram). Um `package.json` na raiz, só com `devDependencies` e versão fixada, resolve sem tocar na extensão.
3. **Sem lint nem análise estática.** Um ESLint com regra contra `innerHTML`/`eval` automatizaria parte da seção 4.
4. **Fixtures reais.** Resolvido em parte (19/11/2026): `testes/dados-reais/` (fora do git) tem respostas reais anonimizadas de três contratações; os testes "dados reais" as usam quando a pasta existe e são pulados quando não. Os mocks dos testes seguem esse formato.
5. **Questões em aberto** Q2–Q3 da spec. Q1 resolvida na v0.2 (era um falso "confere").
6. **Lacunas de teste** listadas no fim de `arquitetura.md`.
