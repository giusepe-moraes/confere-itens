// Teste do painel no Chromium com uma página simulada do Compras.gov.
// Rodar (da pasta acima de testes/): node --test testes/*.test.js   (requer o pacote playwright)
// EXT=/outra/pasta roda os testes contra outra cópia da extensão.
// Capturas de tela em testes/capturas/.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const reais = require('./apoio-dados-reais.js');

const EXT = process.env.EXT || path.join(__dirname, '..', 'confere-itens');
const CAPTURAS = path.join(__dirname, 'capturas');
const ORIGEM = 'https://cnetmobile.estaleiro.serpro.gov.br';
const pagina = (id) => `${ORIGEM}/comprasnet-artefatos-web/execucao/resume?id=${id}`;
const ler = (f) => fs.readFileSync(path.join(EXT, f), 'utf8');
const SCRIPTS = [ler('interceptor.js'), ler('verificacao.js'), ler('painel.js').replace("mode: 'closed'", "mode: 'open'")];

// ---------- dados simulados da API ----------
// No formato do site real (ver testes/dados-reais/): listas em array com status 206 e o total só nos cabeçalhos
// de paginação. A contratação 456 usa o formato antigo, objeto com o total no corpo, que continua aceito.

function item(n, extra = {}) {
  return {
    numeroItem: n, nomeItem: `Produto ${n}`, codigoItem: String(400000 + n),
    quantidadeItens: 100, quantidadeMinimaAquisicao: 100, valorUnitario: 8.9962,
    valorSigiloso: false, intervaloMinimo: 0.5,
    tipoBeneficio: { id: 0, nome: 'Sem benefícios ME/EPP', subContratacao: false, cotaReservada: false, desempateFicto: false },
    idCriterioJulgamento: 1, nomeCriterioJulgamento: 'Menor preço',
    criterioJulgamento: { id: 1, nome: 'Menor preço', menorPrecoMaiorDesconto: false, maiorDesconto: false, aplicavel: true },
    idGrupo: null,
    ...extra,
  };
}
const ate = (n) => Array.from({ length: n }, (_, i) => i + 1);
const ITENS = {
  123: [item(1), item(2, { valorUnitario: 1.5 }), item(3), item(4), item(5)],
  456: [item(1), item(2)],
  777: [], // contratações com grupos: a lista de itens fora de grupo vem vazia (register-count 0)
  778: [],
  888: ate(12).map((n) => item(n)), // Q1: o site exibe uma página e diz o total só no cabeçalho
  999: [item(1), item(2)],
};
const FORMATO_ANTIGO = new Set(['456']); // { content, totalElements }, status 200
const SEM_TOTAL = new Set(['999']); // resposta sem o cabeçalho register-count
// Grupos: os itens só chegam ao expandir cada grupo. A 778 tem 3 grupos e é aberta com 2 grupos por página.
const GRUPOS = {
  777: [
    { id: 57339, sequencialGrupo: 1, nomeGrupo: 'GRUPO 1', quantidadeItens: 3 },
    { id: 57341, sequencialGrupo: 2, nomeGrupo: 'GRUPO 2', quantidadeItens: 2 },
  ],
  778: [
    { id: 60001, sequencialGrupo: 1, nomeGrupo: 'GRUPO 1', quantidadeItens: 2 },
    { id: 60002, sequencialGrupo: 2, nomeGrupo: 'GRUPO 2', quantidadeItens: 2 },
    { id: 60003, sequencialGrupo: 3, nomeGrupo: 'GRUPO 3', quantidadeItens: 1 },
  ],
};
const ITENS_GRUPO = {
  57339: [1, 2, 3].map((n) => item(n, { idGrupo: 57339 })),
  // no site real, os itens de grupo vieram com quantidadeMinimaAquisicao null
  57341: [4, 5].map((n) => item(n, { idGrupo: 57341, valorSigiloso: true, quantidadeMinimaAquisicao: null })),
  60001: [1, 2].map((n) => item(n, { idGrupo: 60001 })),
  60002: [3, 4].map((n) => item(n, { idGrupo: 60002 })),
  60003: [item(5, { idGrupo: 60003 })],
};

/** Resposta paginada como a do site real: uma página do array (tamanhoPagina/pagina), status 206, total nos cabeçalhos. */
function lista206(todos, u, semTotal = false) {
  const tam = Number(u.searchParams.get('tamanhoPagina')) || 10;
  const pag = Number(u.searchParams.get('pagina')) || 0;
  const headers = {
    'access-control-expose-headers': 'Message-Severity, Message-Summary, Message-Detail, Message-Sticky, Content-Disposition, Pages-Count, Register-Count, Register-Count-Unfiltered, Search-Term, Page, Page-Size',
    page: String(pag), 'page-size': String(tam), 'pages-count': String(Math.ceil(todos.length / tam)), 'register-count': String(todos.length),
  };
  if (semTotal) delete headers['register-count'];
  return { status: 206, contentType: 'application/json', headers, body: JSON.stringify(todos.slice(pag * tam, (pag + 1) * tam)) };
}

// Página falsa: pede as listas com XHR (como o Angular) ou fetch, com os parâmetros do site real (tamanhoPagina, pagina).
// "Quantidade máxima de registros listados" muda o tamanhoPagina dos itens; &tamGrupos= na URL, o da lista de grupos.
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Compras.gov (simulado)</title>
<style>body{font:14px sans-serif;margin:0;background:#f8f8f8}header{background:#071d41;color:#fff;padding:14px 20px}
main{padding:20px}table{border-collapse:collapse;background:#fff}td,th{border:1px solid #ccc;padding:4px 8px}</style></head>
<body><header>Compras.gov.br — Resumo da contratação</header><main>
<label>Quantidade máxima de registros listados <select id="tam"><option>3</option><option>5</option></select></label>
<table><thead><tr><th>Item</th><th>Descrição</th></tr></thead><tbody id="lista"></tbody></table><div id="grupos"></div></main>
<script>
  const q = new URLSearchParams(location.search);
  const id = q.get('id');
  const xhr = (url, cb) => { const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'json'; x.onload = () => cb(x.response); x.send(); };
  const API = '/comprasnet-artefatos/api/v1/contratacao-execucao/' + id + '/grupo';
  window.carregarGrupos = function (pagina = 0) {
    xhr(API + '?tamanhoPagina=' + (q.get('tamGrupos') || 10) + '&pagina=' + pagina, (gs) => {
      for (const g of gs) {
        const b = document.createElement('button');
        b.textContent = g.nomeGrupo + ' | ' + g.quantidadeItens + ' itens';
        b.onclick = () => xhr(API + '/' + g.id + '/item?pagina=0&tamanhoPagina=10', (its) => b.after(' itens ' + its.map(i => i.numeroItem).join(', ')));
        const p = document.createElement('p');
        p.append(b);
        document.getElementById('grupos').append(p);
      }
    });
  };
  function mostrar(d) { d = Array.isArray(d) ? { content: d } : d; document.getElementById('lista').innerHTML = d.content.map(i => '<tr><td>'+i.numeroItem+'</td><td>'+i.nomeItem+'</td></tr>').join(''); }
  window.carregar = function (tam, comFetch, idc = id) {
    const url = '/comprasnet-artefatos/api/v1/contratacaoexecucao/contratacao/' + idc + '/item?tamanhoPagina=' + tam + '&pagina=0';
    if (comFetch) return fetch(url).then(r => r.json()).then(mostrar);
    const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'json'; x.onload = () => mostrar(x.response); x.send();
  };
  document.getElementById('tam').onchange = (e) => carregar(e.target.value);
  carregarGrupos();
  carregar(3);
</script></body></html>`;

// respostas gravadas do site real, por contratação e caminho (sem a pasta testes/dados-reais: nenhuma)
const EXEMPLOS = reais.exemplos();
const GRAVADAS = new Map(EXEMPLOS.flatMap((ex) => ex.respostas.map((r) => [new URL(r.url).pathname, r])));

// ---------- infraestrutura ----------

let navegador, contexto, page;

test.before(async () => {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  navegador = await chromium.launch();
  contexto = await navegador.newContext({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 });
  await contexto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGEM });
  await contexto.route(`${ORIGEM}/**`, (rota) => {
    const u = new URL(rota.request().url());
    const gravada = GRAVADAS.get(u.pathname); // dados reais: a resposta gravada, com status e cabeçalhos
    if (gravada) return rota.fulfill({ status: gravada.status, headers: gravada.cabecalhos, body: JSON.stringify(gravada.corpo) });
    const g = /\/contratacao-execucao\/(\d+)\/grupo(?:\/(\d+)\/item)?$/.exec(u.pathname);
    if (g) return rota.fulfill(lista206((g[2] ? ITENS_GRUPO[g[2]] : GRUPOS[g[1]]) || [], u));
    const m = /\/contratacao\/(\d+)\/item$/.exec(u.pathname);
    if (m && FORMATO_ANTIGO.has(m[1])) {
      const todos = ITENS[m[1]];
      const tam = Number(u.searchParams.get('tamanhoPagina')) || todos.length;
      return rota.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: todos.slice(0, tam), totalElements: todos.length }) });
    }
    if (m) return rota.fulfill(lista206(ITENS[m[1]] || [], u, SEM_TOTAL.has(m[1])));
    if (u.pathname.startsWith('/comprasnet-artefatos-web/')) return rota.fulfill({ contentType: 'text/html', body: HTML });
    return rota.fulfill({ status: 404, body: '' });
  });
  for (const s of SCRIPTS) await contexto.addInitScript(s);
  page = await contexto.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => assert.fail(`erro na página: ${e.message}`));
});

test.after(async () => navegador && navegador.close());

const host = () => page.locator('#verificador-itens-ext');
const celula = (r, c) => host().locator('tbody tr').nth(r).locator('td').nth(c);
const coluna = (c) => host().locator('tbody tr td:nth-child(' + (c + 1) + ') input');
const valoresColuna = (c) => coluna(c).evaluateAll((is) => is.map((i) => i.value));
const resumo = () => host().locator('.resumo');
const sub = () => host().locator('.sub');
/** Caixa do cabeçalho que ativa/desativa a verificação da coluna c. */
const caixa = (c) => host().locator('thead tr').first().locator('th').nth(c).locator('input.cx');
const caixasMarcadas = () => host().locator('thead input.cx').evaluateAll((cs) => cs.map((c) => c.checked));
/** Captura de tela; tira o mouse de cima do painel, salvo quando a dica é o que se quer ver. */
async function captura(nome, comMouse = false) {
  if (!comMouse) await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(CAPTURAS, nome + '.png') });
}

/** Cola um texto pela área de transferência real, com Ctrl+V na célula (r, c). */
async function colar(texto, r, c) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), texto);
  await celula(r, c).locator('input').click();
  await page.keyboard.press('Control+V');
}

const tsv = (linhas) => linhas.map((l) => l.join('\t')).join('\r\n') + '\r\n';
const texto = async () => resumo().innerText();
const CABECALHO = ['ITEM', 'DESCRIÇÃO', 'CATMAT', 'QUANTIDADE', 'VALOR', 'VALOR TOTAL', 'TIPO DE BENEFÍCIO', 'QUANTIDADE MÍNIMA', 'CRITÉRIO DE JULGAMENTO', 'INTERVALO MÍNIMO', 'VALOR SIGILOSO'];
const linhaOk = (n, extra = {}) => {
  const v = { ITEM: n, DESCRIÇÃO: 'x', CATMAT: 400000 + n, QUANTIDADE: '100', VALOR: 'R$ 8,9962', 'VALOR TOTAL': '899,62', 'TIPO DE BENEFÍCIO': 'Sem benefícios', 'QUANTIDADE MÍNIMA': '100', 'CRITÉRIO DE JULGAMENTO': 'Menor preço', 'INTERVALO MÍNIMO': '0,5', 'VALOR SIGILOSO': 'Não', ...extra };
  return CABECALHO.map((k) => String(v[k]));
};

// ---------- testes (em sequência, na mesma página) ----------

test('abre o painel e preenche ITEM com os itens exibidos pelo site (XHR)', async () => {
  await page.goto(pagina(123));
  await host().locator('.painel').waitFor();
  await assert.doesNotReject(() => sub().filter({ hasText: '3 de 5 itens exibidos' }).waitFor({ timeout: 3000 }));
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '']);
  assert.match(await resumo().innerText(), /Nada conferido/);
  assert.equal(await host().locator('.cab button').first().isDisabled(), true, 'copiar desabilitado');
  await captura('01-inicial');
});

test('ordem das colunas: Qtd. mín. logo à direita de Qtd.; nenhum título do cabeçalho cortado', async () => {
  const ths = host().locator('thead tr').first().locator('th');
  assert.deepEqual(await ths.evaluateAll((es) => es.map((e) => e.textContent.trim())),
    ['Item', 'CATMAT', 'Qtd.', 'Qtd. mín.', 'Valor unit.', 'Benefício', 'Critério', 'Intervalo', 'Sigiloso']);
  assert.deepEqual(await ths.evaluateAll((es) => es.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent)), []);
  assert.equal(await host().locator('.painel').evaluate((e) => e.getBoundingClientRect().width), 822);
});

test('a grade não aceita digitação', async () => {
  await celula(0, 0).locator('input').click();
  await page.keyboard.type('99');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '']);
});

test('colar com cabeçalho: substitui a grade, preenche a linha Todos e marca divergências', async () => {
  const dados = [CABECALHO, linhaOk(1), linhaOk(2), linhaOk(3, { CATMAT: '', 'VALOR SIGILOSO': 'talvez' }), linhaOk(9)];
  await colar(tsv(dados), 2, 4);
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '9', '']);
  // linha Todos recebe o primeiro valor de cada coluna de critério
  const todos = host().locator('thead tr').nth(1).locator('select, input');
  assert.deepEqual(await todos.evaluateAll((es) => es.map((e) => e.value)), ['Sem benefícios', 'Menor preço', '0,5', 'Não']);
  // colunas reconhecidas pelo nome: no Excel a QUANTIDADE MÍNIMA vem depois do benefício, na grade fica na coluna 3
  assert.deepEqual(await valoresColuna(3), ['100', '100', '100', '100', '']);
  assert.deepEqual(await valoresColuna(4), ['R$ 8,9962', 'R$ 8,9962', 'R$ 8,9962', 'R$ 8,9962', '']);
  // item 2: valor diverge (site 1,5)
  assert.match(await celula(1, 4).getAttribute('class'), /falha/);
  assert.match(await host().locator('tbody tr').nth(1).getAttribute('class'), /falha/);
  // item 3: CATMAT vazio = não conferido; sigiloso não reconhecido
  assert.match(await celula(2, 1).getAttribute('class'), /off/);
  assert.match(await celula(2, 8).getAttribute('class'), /invalido/);
  // item 9 não é exibido pelo site
  assert.match(await host().locator('tbody tr').nth(3).getAttribute('class'), /ausente/);
  const r = await resumo().innerText();
  assert.match(r, /1 sem divergência no que foi conferido/);
  assert.match(r, /2 divergem/);
  assert.match(r, /Conferência incompleta/);
  assert.match(r, /só 3 de 5 itens/);
  assert.match(r, /NÃO exibido pelo site.*: 9/);
  assert.match(r, /Quantidade máxima de registros listados/);
  assert.match(r, /células NÃO conferidas: 3/);
  await captura('02-colado-com-cabecalho');
});

test('dica no hover e Próximo erro', async () => {
  await celula(1, 4).hover();
  const dica = host().locator('.dica');
  await dica.waitFor({ state: 'visible' });
  assert.match(await dica.innerText(), /Site: R\$ 1,50\nPlanilha: R\$ 8,9962/);
  await captura('03-dica', true);
  const prox = host().locator('.proximo');
  await prox.click();
  assert.match(await prox.innerText(), /Próximo erro \(1\/2\)/);
  assert.equal(await page.evaluate(() => document.querySelector('#verificador-itens-ext').shadowRoot.activeElement.dataset.r), '1');
  await prox.click();
  assert.match(await prox.innerText(), /\(2\/2\)/);
  assert.match(await dica.innerText(), /Valor não reconhecido/);
  await prox.click();
  assert.match(await prox.innerText(), /\(1\/2\)/, 'volta ao primeiro');
});

test('colar sem cabeçalho a partir da célula selecionada, sem mexer na linha Todos', async () => {
  await colar('400003\n', 2, 1); // CATMAT do item 3
  await colar('Não\n', 2, 8); // sigiloso do item 3
  assert.equal(await celula(2, 1).locator('input').inputValue(), '400003');
  assert.doesNotMatch((await celula(2, 1).getAttribute('class')) || '', /off/);
  assert.doesNotMatch((await celula(2, 8).getAttribute('class')) || '', /invalido/);
  assert.equal(await host().locator('thead tr').nth(1).locator('select').first().inputValue(), 'Sem benefícios');
  assert.match(await resumo().innerText(), /1 diverge/);
});

test('linha Todos: lista suspensa e campo de intervalo', async () => {
  const selCriterio = host().locator('thead tr').nth(1).locator('th').nth(6).locator('select');
  const intervalo = host().locator('thead tr').nth(1).locator('th').nth(7).locator('input');
  // células preenchidas sobrescrevem o padrão; esvaziar não é possível na grade, então testamos o padrão inválido
  await intervalo.fill('');
  await intervalo.click();
  await page.keyboard.type('abc');
  assert.match(await host().locator('thead tr').nth(1).locator('th').nth(7).getAttribute('class'), /invalido/);
  await intervalo.fill('');
  await page.keyboard.type('0,5');
  assert.doesNotMatch((await host().locator('thead tr').nth(1).locator('th').nth(7).getAttribute('class')) || '', /invalido/);
  await selCriterio.selectOption('');
  assert.equal(await selCriterio.inputValue(), '');
  await selCriterio.selectOption('Menor preço');
  const selBeneficio = host().locator('thead tr').nth(1).locator('th').nth(5).locator('select');
  assert.deepEqual(await selBeneficio.locator('option').allTextContents(),
    ['—', 'Sem benefícios', 'Apenas desempate ficto', 'Subcontratação e Desempate Ficto', 'Cota Reservada e Desempate Ficto']);
  await selBeneficio.selectOption('Cota Reservada e Desempate Ficto');
  assert.equal(await selBeneficio.inputValue(), 'Cota Reservada e Desempate Ficto');
  await captura('03b-beneficio-cota-reservada');
  await selBeneficio.selectOption('Sem benefícios');
});

test('ao exibir mais itens, o site completa a grade em ordem sem alterar as linhas', async () => {
  const antes = await valoresColuna(1);
  await page.locator('#tam').selectOption('5');
  // com o id na frente: "3 de 5 itens exibidos" (o texto de antes) também contém "5 itens exibidos"
  await sub().filter({ hasText: 'id 123 · 5 itens exibidos' }).waitFor({ timeout: 3000 });
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '4', '5', '9', '']);
  const depois = await valoresColuna(1);
  assert.deepEqual([depois[0], depois[1], depois[2], depois[5]], [antes[0], antes[1], antes[2], antes[3]]);
  assert.match(await celula(3, 1).getAttribute('class'), /off/, 'linha nova: CATMAT não conferido');
  assert.doesNotMatch(await resumo().innerText(), /de 5 itens/);
  await captura('04-mais-itens');
});

test('relatório copiado', async () => {
  await host().locator('.cab button').first().click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(texto, /^Verificação de itens - contratação id 123\nItens exibidos pelo site: 5\n/);
  assert.match(texto, /Item 2 - Produto 2 \(CATMAT 400002\):\n {3}- Valor unitário: site R\$ 1,50, planilha R\$ 8,9962/);
  assert.match(texto, /ATENÇÃO: CONFERÊNCIA INCOMPLETA/);
  assert.match(texto, /não exibidos pelo site \(não conferidos\): 9/);
  assert.match(texto, /Itens com células não conferidas: 4–5/);
});

test('conferência completa: verde no resumo e na pílula', async () => {
  const dados = [CABECALHO, ...[1, 2, 3, 4, 5].map((n) => linhaOk(n, n === 2 ? { VALOR: '1,5' } : {}))];
  await colar(tsv(dados), 0, 0);
  const r = await resumo().innerText();
  assert.match(r, /5 conferem/);
  assert.doesNotMatch(r, /incompleta/i);
  assert.equal(await host().locator('tbody tr.ok').count(), 5);
  await captura('05-completa');
  await host().locator('.cab button').nth(1).click(); // minimizar
  const pilula = host().locator('.pilula');
  await pilula.waitFor({ state: 'visible' });
  assert.match(await pilula.getAttribute('class'), /ok/);
  assert.match(await pilula.innerText(), /5 conferem/);
  await captura('06-pilula');
  await pilula.click();
  await host().locator('.painel').waitFor({ state: 'visible' });
});

test('caixa do cabeçalho desativa a coluna: hachurada, fora da conferência, sem aviso de incompleta', async () => {
  assert.deepEqual(await caixasMarcadas(), [true, true, true, true, true, true, true, true]);
  const dados = [CABECALHO, ...[1, 2, 3, 4, 5].map((n) => linhaOk(n, { 'VALOR SIGILOSO': '', ...(n === 2 ? { VALOR: '9' } : n === 3 ? { 'QUANTIDADE MÍNIMA': 'abc' } : {}) }))];
  await colar(tsv(dados), 0, 0);
  let r = await resumo().innerText();
  assert.match(r, /2 divergem/);
  assert.match(r, /Colunas NÃO conferidas: Valor sigiloso/);

  await caixa(4).click(); // Valor unit.
  await caixa(3).click(); // Qtd. mín.
  await caixa(8).click(); // Sigiloso
  assert.deepEqual(await caixasMarcadas(), [true, true, false, false, true, true, true, false]);
  r = await resumo().innerText();
  assert.match(r, /5 conferem/);
  assert.doesNotMatch(r, /incompleta|diverge/i);
  assert.match(r, /Desativadas: Quantidade mínima, Valor unitário, Valor sigiloso/);
  assert.equal(await host().locator('tbody tr.ok').count(), 5);
  assert.match(await celula(1, 4).getAttribute('class'), /off/);
  assert.match(await celula(2, 3).getAttribute('class'), /off/, 'valor não reconhecido ignorado');
  assert.match(await host().locator('thead tr').first().locator('th').nth(4).getAttribute('class'), /off/);
  assert.equal(await host().locator('thead tr').nth(1).locator('th').nth(8).locator('select').isDisabled(), true);
  await celula(1, 4).hover();
  assert.match(await host().locator('.dica').innerText(), /NÃO VERIFICADA: coluna desativada/);
  await captura('10-colunas-desativadas');
  await host().locator('.cab button').first().click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(texto, /Conferem: 5 \| Divergem: 0\nColunas desativadas \(não verificadas\): Quantidade mínima, Valor unitário, Valor sigiloso/);

  await caixa(4).click(); // reativa Valor unit.: a divergência volta
  assert.match(await resumo().innerText(), /1 diverge/);
  assert.match(await celula(1, 4).getAttribute('class'), /falha/);
});

test('Limpar zera a grade e a linha Todos, mantendo os itens do site', async () => {
  await host().locator('.limpar').click();
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '4', '5', '']);
  assert.deepEqual(await valoresColuna(1), ['', '', '', '', '', '']);
  const todos = host().locator('thead tr').nth(1).locator('select, input');
  assert.deepEqual(await todos.evaluateAll((es) => es.map((e) => e.value)), ['', '', '', '']);
  assert.deepEqual(await caixasMarcadas(), [true, true, true, true, true, true, true, true], 'colunas reativadas');
  assert.equal(await host().locator('thead tr').nth(1).locator('th').nth(8).locator('select').isDisabled(), false);
  assert.match(await resumo().innerText(), /Nada conferido/);
});

test('padrão da linha Todos sozinho confere todos os itens daquela coluna', async () => {
  await host().locator('thead tr').nth(1).locator('th').nth(8).locator('select').selectOption('Sim');
  assert.match(await resumo().innerText(), /0 sem divergência/);
  assert.match(await resumo().innerText(), /5 divergem/);
  assert.equal(await celula(0, 8).locator('input').getAttribute('placeholder'), 'Sim');
});

test('troca de contratação (SPA) recomeça; fetch também é observado; outras páginas sem painel', async () => {
  await caixa(1).click(); // desativa CATMAT: a troca de contratação reativa
  await page.evaluate(() => history.pushState({}, '', '/comprasnet-artefatos-web/execucao/resume?id=456'));
  await page.waitForFunction(() => {
    const s = document.querySelector('#verificador-itens-ext').shadowRoot.querySelector('.sub');
    return s && s.textContent === 'id 456';
  });
  assert.match(await resumo().innerText(), /Aguardando a lista/);
  await page.evaluate(() => carregar(10, true, 456));
  await sub().filter({ hasText: 'id 456 · 2 itens exibidos' }).waitFor({ timeout: 3000 });
  assert.deepEqual(await valoresColuna(0), ['1', '2', '']);
  assert.equal(await host().locator('thead tr').nth(1).locator('th').nth(8).locator('select').inputValue(), '');
  assert.deepEqual(await caixasMarcadas(), [true, true, true, true, true, true, true, true]);
  // lista de outra contratação não é usada
  await page.evaluate(() => carregar(10, true, 123));
  await page.waitForTimeout(300);
  assert.deepEqual(await valoresColuna(0), ['1', '2', '']);
  await page.evaluate(() => history.pushState({}, '', '/comprasnet-artefatos-web/outra'));
  await page.waitForFunction(() => !document.querySelector('#verificador-itens-ext'), null, { timeout: 3000 });
});

test('contratação com grupos: junta os itens dos grupos expandidos e avisa os grupos que faltam', async () => {
  await page.goto(pagina(777));
  await sub().filter({ hasText: 'id 777 · 0 de 5 itens exibidos' }).waitFor();
  assert.deepEqual(await valoresColuna(0), ['']);
  const dados = [CABECALHO, ...[1, 2, 3, 4, 5].map((n) => linhaOk(n, n > 3 ? { 'VALOR SIGILOSO': 'Sim' } : {}))];
  await colar(tsv(dados), 0, 0);
  let r = await resumo().innerText();
  assert.match(r, /só 0 de 5 itens/);
  assert.match(r, /Grupos não exibidos por completo: GRUPO 1 \(0 de 3\), GRUPO 2 \(0 de 2\)/);
  assert.match(r, /Expanda todos os grupos/);
  assert.equal(await host().locator('tbody tr.ausente').count(), 5);
  await captura('07-grupos-nenhum-expandido');

  await page.getByRole('button', { name: /GRUPO 1/ }).click();
  await sub().filter({ hasText: '3 de 5 itens exibidos' }).waitFor();
  r = await resumo().innerText();
  assert.match(r, /3 sem divergência no que foi conferido/);
  assert.match(r, /Grupos não exibidos por completo: GRUPO 2 \(0 de 2\)\./);
  assert.doesNotMatch(r, /GRUPO 1 \(/);
  await celula(3, 0).hover();
  assert.match(await host().locator('.dica').innerText(), /Expanda todos os grupos/);
  await captura('08-grupo-1-expandido', true);

  await page.getByRole('button', { name: /GRUPO 2/ }).click();
  await sub().filter({ hasText: 'id 777 · 5 itens exibidos' }).waitFor();
  // itens do GRUPO 2 sem quantidade mínima no site (null): divergem
  r = await resumo().innerText();
  assert.match(r, /3 conferem/);
  assert.match(r, /2 divergem/);
  assert.doesNotMatch(r, /incompleta/i);
  assert.match(await celula(3, 3).getAttribute('class'), /falha/);
  await celula(3, 3).hover();
  assert.match(await host().locator('.dica').innerText(), /Site: não informada\nPlanilha: 100/);
  await captura('09-grupos-qtd-minima-nao-informada', true);
  await caixa(3).click(); // desativa Qtd. mín.
  r = await resumo().innerText();
  assert.match(r, /5 conferem/);
  assert.doesNotMatch(r, /incompleta|diverge/i);
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '4', '5', '']);
  await captura('09b-grupos-completos');
  await host().locator('.cab button').first().click();
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(texto, /Itens exibidos pelo site: 5\n/);
  assert.match(texto, /Conferem: 5 \| Divergem: 0\nColunas desativadas \(não verificadas\): Quantidade mínima/);
});

test('contratação com grupos: itens novos de um grupo entram na grade em ordem', async () => {
  await page.goto(pagina(777));
  await sub().filter({ hasText: '0 de 5' }).waitFor();
  await page.getByRole('button', { name: /GRUPO 2/ }).click();
  await sub().filter({ hasText: '2 de 5' }).waitFor();
  assert.deepEqual(await valoresColuna(0), ['4', '5', '']);
  await page.getByRole('button', { name: /GRUPO 1/ }).click();
  await sub().filter({ hasText: 'id 777 · 5 itens exibidos' }).waitFor();
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '4', '5', '']);
});

// ---------- casos de falso "confere" e outros casos de borda ----------

const API_ITENS = (id, q = '') => `/comprasnet-artefatos/api/v1/contratacaoexecucao/contratacao/${id}/item${q}`;

test('resposta atrasada de outra contratação não apaga a lista da atual', async () => {
  await page.goto(pagina(456));
  await sub().filter({ hasText: 'id 456 · 2 itens exibidos' }).waitFor();
  await page.evaluate(() => carregar(10, true, 123)); // resposta da contratação 123 chegando na página da 456
  await page.waitForTimeout(400);
  assert.equal(await sub().innerText(), 'id 456 · 2 itens exibidos pelo site');
  assert.doesNotMatch(await resumo().innerText(), /Aguardando/);
  assert.deepEqual(await valoresColuna(0), ['1', '2', '']);
});

test('só GET é lido como lista; XHR reaproveitado não troca a contratação da resposta', async () => {
  await page.goto(pagina(456));
  await sub().filter({ hasText: 'id 456 · 2 itens exibidos' }).waitFor();
  // POST na URL da lista (ex.: inclusão de item): a resposta não é a lista exibida
  await page.evaluate((u) => fetch(u, { method: 'POST' }).then((r) => r.text()), API_ITENS(456, '?tamanhoPagina=1&pagina=0'));
  await page.evaluate((u) => new Promise((ok) => { const x = new XMLHttpRequest(); x.open('POST', u); x.onload = ok; x.send(); }), API_ITENS(456, '?tamanhoPagina=1&pagina=0'));
  // o mesmo XHR aberto para a lista da 456 e, depois, para a da 123: a resposta é da 123
  await page.evaluate(([a, b]) => new Promise((ok) => { const x = new XMLHttpRequest(); x.open('GET', a); x.open('GET', b); x.onload = ok; x.send(); }), [API_ITENS(456), API_ITENS(123)]);
  await page.waitForTimeout(400);
  assert.equal(await sub().innerText(), 'id 456 · 2 itens exibidos pelo site');
  assert.deepEqual(await valoresColuna(0), ['1', '2', '']);
});

test('coluna vazia fica hachurada, mas só a desativada tem o nome riscado', async () => {
  const th = host().locator('thead tr').first().locator('th').nth(1);
  const riscado = () => th.evaluate((e) => getComputedStyle(e).textDecorationLine);
  assert.match(await th.getAttribute('class'), /off/);
  assert.equal(await riscado(), 'none');
  await caixa(1).click();
  assert.equal(await riscado(), 'line-through');
  await caixa(1).click();
});

test('linha ignorada e padrão não reconhecido: aviso de incompleta, Próximo erro mesmo sem item divergente', async () => {
  const semIntervalo = (n) => linhaOk(n, { 'INTERVALO MÍNIMO': '' });
  await colar(tsv([CABECALHO, semIntervalo(1), semIntervalo(2), semIntervalo('3A')]), 0, 0);
  let r = await resumo().innerText();
  assert.match(r, /2 sem divergência no que foi conferido/);
  assert.doesNotMatch(r, /diverge[m ]/);
  assert.match(r, /Linhas da planilha ignoradas: linha 3 \(número do item inválido: "3A"\)/);
  assert.match(r, /Colunas NÃO conferidas: Intervalo mínimo/);
  const prox = host().locator('.proximo');
  await prox.click();
  assert.match(await prox.innerText(), /Próximo erro \(1\/1\)/);
  assert.equal(await page.evaluate(() => document.querySelector('#verificador-itens-ext').shadowRoot.activeElement.dataset.r), '2');
  assert.match(await host().locator('.dica').innerText(), /Número do item inválido/);

  // padrão não reconhecido no intervalo: a coluna continua sem conferência (não pode dar "confere")
  const intervalo = host().locator('thead tr').nth(1).locator('th').nth(7).locator('input');
  await intervalo.fill('1%');
  r = await resumo().innerText();
  assert.match(r, /Colunas NÃO conferidas: Intervalo mínimo/);
  assert.match(r, /Padrão não reconhecido na linha "Todos": Intervalo mínimo/);
  assert.match(await celula(0, 7).getAttribute('class'), /off/);
  assert.equal(await celula(0, 7).locator('input').getAttribute('placeholder'), '');
  await captura('11-linha-ignorada-e-padrao-invalido');
  await intervalo.fill('0,5');
  r = await resumo().innerText();
  assert.doesNotMatch(r, /Intervalo mínimo/);
  assert.match(r, /Linhas da planilha ignoradas/);

  // sem a linha inválida: completa
  await colar(tsv([CABECALHO, linhaOk(1), linhaOk(2)]), 0, 0);
  r = await resumo().innerText();
  assert.match(r, /2 conferem/);
  assert.doesNotMatch(r, /incompleta/i);
  const copiar = host().locator('.cab button').first();
  await copiar.click();
  // o botão confirma a cópia e volta ao normal sozinho
  await host().locator('.cab button[data-dica="Relatório copiado."]').waitFor();
  await host().locator('.cab button[data-dica="Copiar relatório"]').waitFor({ timeout: 3000 });
});

test('Q1: total só no cabeçalho register-count (XHR e fetch): planilha igual aos itens exibidos não fica verde', async () => {
  await page.goto(pagina(888));
  await sub().filter({ hasText: 'id 888 · 3 de 12 itens exibidos' }).waitFor();
  // a planilha tem exatamente os 3 itens que o site exibe, todos certos: na v0.1 sairia verde
  await colar(tsv([CABECALHO, ...[1, 2, 3].map((n) => linhaOk(n))]), 0, 0);
  let r = await texto();
  assert.match(r, /3 sem divergência no que foi conferido/);
  assert.match(r, /Conferência incompleta/);
  assert.match(r, /O site está exibindo só 3 de 12 itens/);
  assert.match(await host().locator('.pilula').innerText(), /Conferência incompleta/);
  await captura('12-q1-total-no-cabecalho');
  // fetch: o total também vem do cabeçalho
  await page.evaluate(() => carregar(5, true));
  await sub().filter({ hasText: 'id 888 · 5 de 12 itens exibidos' }).waitFor();
  // o site exibe todos: completa
  await page.evaluate(() => carregar(12));
  await sub().filter({ hasText: 'id 888 · 12 itens exibidos' }).waitFor();
  await colar(tsv([CABECALHO, ...ate(12).map((n) => linhaOk(n))]), 0, 0);
  r = await texto();
  assert.match(r, /12 conferem/);
  assert.doesNotMatch(r, /incompleta/i);
});

test('Q1: resposta sem o total (sem register-count) deixa a conferência incompleta', async () => {
  await page.goto(pagina(999));
  await sub().filter({ hasText: 'id 999 · 2 itens exibidos' }).waitFor();
  await colar(tsv([CABECALHO, linhaOk(1), linhaOk(2)]), 0, 0);
  const r = await texto();
  assert.match(r, /2 sem divergência no que foi conferido/);
  assert.match(r, /O site não informou o total de itens fora de grupo: não dá para saber se todos os itens estão exibidos\. Recarregue a página \(F5\)/);
  await captura('13-q1-sem-total');
  await host().locator('.cab button').first().click();
  const rel = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(rel, /ATENÇÃO: CONFERÊNCIA INCOMPLETA\n {3}- O site não informou o total de itens fora de grupo/);
});

test('contratação com grupos: lista de grupos paginada; enquanto faltar grupo na lista, fica incompleta', async () => {
  await page.goto(pagina(778) + '&tamGrupos=2');
  await sub().filter({ hasText: 'id 778 · 0 de 4 itens exibidos' }).waitFor(); // só os 2 grupos listados entram no total
  await page.getByRole('button', { name: /GRUPO 1/ }).click();
  await page.getByRole('button', { name: /GRUPO 2/ }).click();
  await sub().filter({ hasText: 'id 778 · 4 itens exibidos' }).waitFor();
  await colar(tsv([CABECALHO, ...[1, 2, 3, 4].map((n) => linhaOk(n))]), 0, 0);
  let r = await texto();
  assert.match(r, /4 sem divergência no que foi conferido/);
  assert.match(r, /O site listou só 2 de 3 grupos\./);
  assert.match(r, /Exiba todos os grupos/);
  assert.doesNotMatch(r, /Grupos não exibidos por completo/);
  await captura('14-grupos-paginados');
  // próxima página da lista de grupos: os grupos acumulam
  await page.evaluate(() => carregarGrupos(1));
  await sub().filter({ hasText: 'id 778 · 4 de 5 itens exibidos' }).waitFor();
  r = await texto();
  assert.doesNotMatch(r, /listou só/);
  assert.match(r, /Grupos não exibidos por completo: GRUPO 3 \(0 de 1\)/);
  await page.getByRole('button', { name: /GRUPO 3/ }).click();
  await sub().filter({ hasText: 'id 778 · 5 itens exibidos' }).waitFor();
  await colar(tsv([CABECALHO, ...ate(5).map((n) => linhaOk(n))]), 0, 0);
  r = await texto();
  assert.match(r, /5 conferem/);
  assert.doesNotMatch(r, /incompleta/i);
});

test('sair da página de resumo e voltar: o que o site exibiu antes deixa de valer; a planilha continua', async () => {
  await page.goto(pagina(777));
  await sub().filter({ hasText: '0 de 5' }).waitFor();
  await colar(tsv([CABECALHO, ...[1, 2, 3, 4, 5].map((n) => linhaOk(n))]), 0, 0);
  await page.getByRole('button', { name: /GRUPO 1/ }).click();
  await sub().filter({ hasText: '3 de 5 itens exibidos' }).waitFor();
  // vai a outra tela do site (ex.: corrigir um item) e volta: o site recarrega e os grupos voltam fechados
  await page.evaluate(() => history.pushState({}, '', '/comprasnet-artefatos-web/execucao/item?id=777'));
  await page.waitForFunction(() => !document.querySelector('#verificador-itens-ext'), null, { timeout: 3000 });
  await page.evaluate(() => history.pushState({}, '', '/comprasnet-artefatos-web/execucao/resume?id=777'));
  await host().locator('.painel').waitFor();
  assert.equal(await sub().innerText(), 'id 777');
  assert.match(await resumo().innerText(), /Aguardando a lista/);
  assert.deepEqual(await valoresColuna(0), ['1', '2', '3', '4', '5', ''], 'a planilha continua');
  assert.equal(await celula(0, 1).locator('input').inputValue(), '400001');
  assert.equal(await host().locator('thead tr').nth(1).locator('select').first().inputValue(), 'Sem benefícios');
  // o site pede as listas de novo
  await page.evaluate(() => {
    const x = new XMLHttpRequest();
    x.open('GET', '/comprasnet-artefatos/api/v1/contratacao-execucao/777/grupo?tamanhoPagina=10&pagina=0');
    x.send();
    carregar(3);
  });
  await sub().filter({ hasText: 'id 777 · 0 de 5 itens exibidos' }).waitFor();
  assert.match(await resumo().innerText(), /Grupos não exibidos por completo: GRUPO 1 \(0 de 3\), GRUPO 2 \(0 de 2\)/);
});

// ---------- dados reais (testes/dados-reais, fora do git; pulados sem a pasta) ----------
// A página falsa pede as listas; a rota responde com o que o site real respondeu (corpo, status 206 e cabeçalhos).

if (!EXEMPLOS.length) test('dados reais: painel com as respostas gravadas do site', { skip: 'sem testes/dados-reais' }, () => {});
for (const ex of EXEMPLOS) {
  test(`dados reais (${ex.arquivo}): painel lê o total do cabeçalho e confere a planilha com os valores do site`, async () => {
    const soltos = ex.respostas.find((r) => r.lista === 'item');
    const grupos = (ex.respostas.find((r) => r.lista === 'grupos') || { corpo: [] }).corpo;
    const itensGrupos = ex.respostas.filter((r) => r.lista.startsWith('grupo/'));
    const total = Number(soltos.registros) + grupos.reduce((s, g) => s + g.quantidadeItens, 0);
    await page.goto(pagina(ex.id));
    const exibidos = soltos.corpo.length;
    await sub().filter({ hasText: `id ${ex.id} · ${exibidos < total ? `${exibidos} de ${total}` : `${exibidos} `}` }).waitFor();
    for (const g of grupos.filter((g) => itensGrupos.some((r) => r.lista === 'grupo/' + g.id))) {
      await page.getByRole('button', { name: new RegExp(`^${g.nomeGrupo} \\|`) }).click();
    }
    const itens = [soltos, ...itensGrupos].flatMap((r) => r.corpo);
    const linhas = reais.planilha(itens);
    await colar(tsv([reais.CABECALHO, ...linhas]), 0, 0);
    for (const c of reais.colunasVazias(linhas)) await caixa(c).click(); // campo que o site não tem nesta contratação
    await sub().filter({ hasText: `id ${ex.id} · ${itens.length < total ? `${itens.length} de ${total}` : `${itens.length} ${itens.length === 1 ? 'item exibido' : 'itens exibidos'}`}` }).waitFor();
    const r = await texto();
    assert.doesNotMatch(r, /diverge/);
    if (itens.length < total) {
      // 634177: 10 de 148 itens exibidos; a v0.1 daria verde
      assert.match(r, new RegExp(`${itens.length} sem divergência no que foi conferido`));
      assert.match(r, new RegExp(`O site está exibindo só ${itens.length} de ${total} itens`));
    } else {
      assert.match(r, new RegExp(`${itens.length} conferem`));
      assert.doesNotMatch(r, /incompleta/i);
    }
    await captura(`20-dados-reais-${ex.arquivo.replace(/-api\.json$/, '')}`);
  });
}
