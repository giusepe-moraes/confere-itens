// Testes da lógica pura (verificacao.js). Rodar: node --test testes/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const V = require(path.join(process.env.EXT || path.join(__dirname, '..', 'verificador-itens-compras'), 'verificacao.js'));
const reais = require('./apoio-dados-reais.js');

const IDX = Object.fromEntries(V.COLUNAS.map((c, i) => [c.id, i]));

/** Item da API com valores típicos, nos campos e tipos do site real (testes/dados-reais); `extra` sobrescreve. */
function item(n, extra = {}) {
  return {
    numeroItem: n,
    nomeItem: `Produto ${n}`,
    codigoItem: String(400000 + n),
    quantidadeItens: 100,
    quantidadeMinimaAquisicao: 100,
    valorUnitario: 8.9962,
    valorSigiloso: false,
    intervaloMinimo: 0.5,
    tipoBeneficio: { id: 0, nome: 'Sem benefícios ME/EPP', subContratacao: false, cotaReservada: false, desempateFicto: false },
    idCriterioJulgamento: 1,
    nomeCriterioJulgamento: 'Menor preço',
    criterioJulgamento: { id: 1, nome: 'Menor preço', menorPrecoMaiorDesconto: false, maiorDesconto: false, aplicavel: true },
    idGrupo: null,
    ...extra,
  };
}

/** Linha da grade a partir de { idColuna: valor }. */
function linha(valores) {
  const l = V.linhaVazia();
  for (const [k, v] of Object.entries(valores)) l[IDX[k]] = v;
  return l;
}

/** Linha com todas as colunas preenchidas de forma que confira com item(n). */
const linhaCheia = (n, extra = {}) =>
  linha({
    item: String(n), catmat: String(400000 + n), quantidade: '100', valor: 'R$ 8,9962',
    beneficio: 'Sem benefícios', qtdMinima: '100', criterio: 'Menor preço', intervalo: '0,5', sigiloso: 'Não',
    ...extra,
  });

const semPadroes = () => V.linhaVazia();

test('ordem das colunas: QUANTIDADE MÍNIMA logo depois de QUANTIDADE', () => {
  assert.deepEqual(V.COLUNAS.map((c) => c.nome), [
    'ITEM', 'CATMAT', 'QUANTIDADE', 'QUANTIDADE MÍNIMA', 'VALOR', 'TIPO DE BENEFÍCIO',
    'CRITÉRIO DE JULGAMENTO', 'INTERVALO MÍNIMO', 'VALOR SIGILOSO',
  ]);
  const a = analisar([linhaCheia(1)], [item(1)], semPadroes());
  const desat = V.analisar([linhaCheia(1)], semGrupos([item(1)]), semPadroes(),
    new Set(['sigiloso', 'valor', 'qtdMinima', 'quantidade']));
  assert.deepEqual(desat.colunasDesativadas, ['Quantidade', 'Quantidade mínima', 'Valor unitário', 'Valor sigiloso']);
  assert.match(V.relatorio(desat, '1'), /Colunas desativadas \(não verificadas\): Quantidade, Quantidade mínima, Valor unitário, Valor sigiloso/);
  assert.equal(a.completa, true);
});

/**
 * O que o painel recebe de uma contratação sem grupos no site real: a lista de itens com o total (cabeçalho
 * register-count; por padrão, todos exibidos) e a lista de grupos vazia, com total 0.
 */
const semGrupos = (itens, total = itens.length) => V.juntarSite({ item: { itens, total } }, [], 0);

/** Atalho: analisa com a lista de itens fora de grupo (e o total informado; por padrão, todos exibidos). */
const analisar = (grade, itens, padroes, total) => V.analisar(grade, itens && semGrupos(itens, total), padroes);

// ---------- números e texto ----------

test('numeroBR', () => {
  assert.equal(V.numeroBR('R$ 1.234,5678'), 1234.5678);
  assert.equal(V.numeroBR('300.000'), 300000);
  assert.equal(V.numeroBR('0,5'), 0.5);
  assert.equal(V.numeroBR('12.5'), 12.5);
  assert.equal(V.numeroBR(' 8,9962 '), 8.9962);
  assert.equal(V.numeroBR(''), null);
  assert.equal(V.numeroBR('abc'), null);
});

test('faixas', () => {
  assert.equal(V.faixas([1, 2, 3, 5, 7, 8]), '1–3, 5, 7–8');
  assert.equal(V.faixas([3, 1, 2, 2]), '1–3');
  assert.equal(V.faixas([]), '');
});

test('lerTSV: tabulações, CRLF, aspas com quebra de linha e espaços', () => {
  const m = V.lerTSV('A\tB\r\n1\t"linha 1\nlinha 2"\r\n2\t"com ""aspas"""\r\n');
  assert.deepEqual(m, [['A', 'B'], ['1', 'linha 1 linha 2'], ['2', 'com "aspas"']]);
  assert.deepEqual(V.lerTSV('x'), [['x']]);
  assert.deepEqual(V.lerTSV(''), []);
});

// ---------- colar ----------

test('colar com cabeçalho: reconhece colunas pelo nome, ignora desconhecidas e VALOR TOTAL, define padrões', () => {
  const texto = [
    'Nº\tDESCRIÇÃO\tCATMAT\tQTDE\tVALOR UNITÁRIO\tVALOR TOTAL\tTIPO DE BENEFÍCIO\tQUANTIDADE MÍNIMA\tCRITÉRIO DE JULGAMENTO\tINTERVALO MÍNIMO\tVALOR SIGILOSO',
    '1\tCaneta\t400001\t100\tR$ 8,9962\t899,62\t\t100\tMenor preço\t0,5\tNão',
    '2\tLápis\t400002\t200\t1,00\t200,00\tApenas desempate ficto\t\t\t\t',
    '\t\t\t\t\t\t\t\t\t\t',
  ].join('\n');
  const { grade, padroes } = V.colar([V.linhaVazia()], texto, 0, 0);
  assert.equal(grade.length, 2, 'linha totalmente vazia é descartada');
  assert.deepEqual(grade[0], linhaCheia(1, { beneficio: '' }));
  assert.equal(grade[1][IDX.valor], '1,00');
  assert.equal(grade[1][IDX.beneficio], 'Apenas desempate ficto');
  // padrão = primeiro valor preenchido de cada coluna de critério, convertido em opção
  assert.equal(padroes[IDX.beneficio], 'Apenas desempate ficto');
  assert.equal(padroes[IDX.qtdMinima], '', 'quantidade mínima não tem padrão');
  assert.equal(padroes[IDX.criterio], 'Menor preço');
  assert.equal(padroes[IDX.intervalo], '0,5');
  assert.equal(padroes[IDX.sigiloso], 'Não');
  assert.equal(padroes[IDX.item], '');
  assert.equal(padroes[IDX.catmat], '');
});

test('colar com cabeçalho só com ITEM; sem coluna ITEM não é cabeçalho', () => {
  const { grade, padroes } = V.colar([], 'ITEM\n3\n1', 0, 0);
  assert.deepEqual(grade.map((l) => l[0]), ['3', '1']);
  assert.ok(padroes.every((p) => p === ''));
  const semItem = V.colar([V.linhaVazia()], 'CATMAT\tQTD\n1\t2', 0, 0);
  assert.equal(semItem.padroes, null, 'sem ITEM: cola como dados');
  assert.equal(semItem.grade[0][0], 'CATMAT');
});

test('colar sem cabeçalho: a partir da célula, cria linhas e corta colunas excedentes', () => {
  const base = [linha({ item: '1' }), linha({ item: '2' })];
  const { grade, padroes } = V.colar(base, '10\t20\n30\t40\n50\t60', 1, 2);
  assert.equal(padroes, null);
  assert.equal(grade.length, 4);
  assert.equal(grade[1][2], '10');
  assert.equal(grade[1][3], '20');
  assert.equal(grade[3][2], '50');
  assert.equal(base[1][2], '', 'não altera a grade original');
  const borda = V.colar([V.linhaVazia()], 'a\tb\tc', 0, V.COLUNAS.length - 1);
  assert.equal(borda.grade[0][V.COLUNAS.length - 1], 'a');
  assert.equal(borda.grade[0].length, V.COLUNAS.length);
});

// ---------- completarItens ----------

test('completarItens: acrescenta em ordem, sem mudar as linhas existentes', () => {
  const g = [linha({ item: '2', catmat: 'x' }), linha({ item: '5' }), V.linhaVazia()];
  const nova = V.completarItens(g, [5, 1, 3, 2, 7, 3]);
  assert.deepEqual(nova.map((l) => l[0]), ['1', '2', '3', '5', '7', '']);
  assert.equal(nova[1][IDX.catmat], 'x');
  assert.equal(g.length, 3, 'não altera a grade original');
  assert.equal(V.completarItens(nova, [1, 2]), null, 'nada faltando: null');
  assert.deepEqual(V.completarItens([V.linhaVazia()], [2, 1]).map((l) => l[0]), ['1', '2', '']);
});

// ---------- analisar ----------

test('tudo preenchido e igual: conferência completa', () => {
  const a = analisar([linhaCheia(1), linhaCheia(2)], [item(1), item(2)], semPadroes());
  assert.equal(a.completa, true);
  assert.deepEqual(a.conferem, [1, 2]);
  assert.equal(a.divergem.length, 0);
  assert.ok(a.linhas.every((l) => l.estado === 'ok'));
  assert.match(V.relatorio(a, '99'), /Conferem: 2 \| Divergem: 0/);
  assert.doesNotMatch(V.relatorio(a, '99'), /INCOMPLETA/);
});

test('padrões da linha Todos valem para as células vazias', () => {
  const p = linha({ beneficio: 'Sem benefícios', criterio: 'Menor preço', intervalo: '0,5', sigiloso: 'Não' });
  const g = [linhaCheia(1, { beneficio: '', criterio: '', intervalo: '', sigiloso: '' })];
  assert.equal(analisar(g, [item(1)], p).completa, true);
  // quantidade mínima não tem padrão: um valor na linha Todos é ignorado
  const a0 = analisar([linhaCheia(1, { qtdMinima: '' })], [item(1)], linha({ qtdMinima: '5' }));
  assert.equal(a0.conferida[IDX.qtdMinima], false);
  // a célula preenchida sobrescreve o padrão
  const g2 = [linhaCheia(1, { criterio: 'Maior desconto' })];
  const a = analisar(g2, [item(1)], p);
  assert.equal(a.linhas[0].estado, 'falha');
  assert.equal(a.linhas[0].celulas[IDX.criterio].estado, 'falha');
});

test('cada coluna detecta divergência', () => {
  const casos = {
    catmat: ['999', {}],
    quantidade: ['101', {}],
    valor: ['8,9963', {}],
    beneficio: ['Apenas desempate ficto', {}],
    qtdMinima: ['99', {}],
    criterio: ['Maior desconto', {}],
    intervalo: ['1', {}],
    sigiloso: ['Sim', {}],
  };
  for (const [col, [valor]] of Object.entries(casos)) {
    const a = analisar([linhaCheia(1, { [col]: valor })], [item(1)], semPadroes());
    assert.equal(a.linhas[0].estado, 'falha', col);
    assert.equal(a.linhas[0].celulas[IDX[col]].estado, 'falha', col);
    assert.equal(a.linhas[0].celulas.filter(Boolean).length, 1, `${col}: só a célula divergente`);
    assert.equal(a.divergem.length, 1);
    assert.match(a.linhas[0].problemas[0], /site .*, planilha /);
  }
});

test('tolerâncias e formatos: valor com 4 casas, CATMAT com zeros à esquerda, quantidade com milhar', () => {
  const it = item(1, { codigoItem: '0400001', quantidadeItens: 300000, quantidadeMinimaAquisicao: 300000, valorUnitario: 8.99624 });
  const a = analisar([linhaCheia(1, { catmat: '400001', quantidade: '300.000', qtdMinima: '300.000', valor: '8,9962' })], [it], semPadroes());
  assert.equal(a.linhas[0].estado, 'ok');
});

test('benefício: sem benefícios, desempate ficto, cota/subcontratação e nome do site', () => {
  const ficto = item(1, { tipoBeneficio: { id: 5, nome: 'Desempate ficto', desempateFicto: true, cotaReservada: false, subContratacao: false } });
  const cota = item(2, { tipoBeneficio: { id: 2, nome: 'Cota reservada', desempateFicto: true, cotaReservada: true, subContratacao: false } });
  const sem = item(3);
  const ler = (n, t) => analisar([linha({ item: String(n), beneficio: t })], [ficto, cota, sem], semPadroes()).linhas[0].estado;
  assert.equal(ler(1, 'Apenas desempate ficto'), 'ok');
  assert.equal(ler(1, 'Sem benefícios'), 'falha');
  assert.equal(ler(2, 'Apenas desempate ficto'), 'falha');
  assert.equal(ler(2, 'cota reservada'), 'ok', 'nome igual ao do site, sem acento/caixa');
  assert.equal(ler(3, 'Sem benefícios'), 'ok');
  assert.equal(ler(3, 'Apenas desempate ficto'), 'falha');
});

test('benefício: Subcontratação e Desempate Ficto · Cota Reservada e Desempate Ficto', () => {
  const tb = (id, ficto, cota, sub) => ({ tipoBeneficio: { id, nome: 'outro nome', desempateFicto: ficto, cotaReservada: cota, subContratacao: sub } });
  const itens = [item(1, tb(4, true, false, true)), item(2, tb(2, true, true, false)), item(3, tb(5, true, false, false)), item(4, tb(3, false, false, true))];
  const ler = (n, t) => analisar([linha({ item: String(n), beneficio: t })], itens, semPadroes()).linhas[0].estado;
  assert.equal(ler(1, 'Subcontratação e Desempate Ficto'), 'ok');
  assert.equal(ler(1, 'Cota Reservada e Desempate Ficto'), 'falha');
  assert.equal(ler(1, 'Apenas desempate ficto'), 'falha');
  assert.equal(ler(2, 'Cota Reservada e Desempate Ficto'), 'ok');
  assert.equal(ler(2, 'cota reservada e desempate ficto'), 'ok', 'sem acento/caixa');
  assert.equal(ler(2, 'Subcontratação e Desempate Ficto'), 'falha');
  assert.equal(ler(3, 'Subcontratação e Desempate Ficto'), 'falha', 'só desempate ficto');
  assert.equal(ler(3, 'Cota Reservada e Desempate Ficto'), 'falha', 'só desempate ficto');
  assert.equal(ler(4, 'Subcontratação e Desempate Ficto'), 'falha', 'subcontratação sem desempate ficto');
  // padrão da linha Todos e colagem com cabeçalho reconhecem as novas opções
  const b = V.COLUNAS[IDX.beneficio];
  assert.deepEqual(b.opcoes, ['Sem benefícios', 'Apenas desempate ficto', 'Subcontratação e Desempate Ficto', 'Cota Reservada e Desempate Ficto']);
  assert.equal(b.opcao('SUBCONTRATACAO E DESEMPATE FICTO'), 'Subcontratação e Desempate Ficto');
  assert.equal(b.opcao('Cota reservada e desempate ficto'), 'Cota Reservada e Desempate Ficto');
  assert.equal(b.opcao('Desempate ficto'), 'Apenas desempate ficto');
  const p = linha({ beneficio: 'Cota Reservada e Desempate Ficto' });
  assert.equal(analisar([linha({ item: '2' })], itens, p).linhas[0].celulas[IDX.beneficio], null);
  assert.equal(analisar([linha({ item: '1' })], itens, p).linhas[0].celulas[IDX.beneficio].estado, 'falha');
});

test('critério: pelo nome ou por maiorDesconto; aceita nomeCriterioJulgamento', () => {
  const md = item(1, { criterioJulgamento: { nome: 'Maior Desconto', maiorDesconto: true } });
  const so = item(2, { criterioJulgamento: undefined, nomeCriterioJulgamento: 'Menor Preço' });
  const ler = (n, t) => analisar([linha({ item: String(n), criterio: t })], [md, so], semPadroes()).linhas[0].estado;
  assert.equal(ler(1, 'Maior desconto'), 'ok');
  assert.equal(ler(1, 'Menor preço'), 'falha');
  assert.equal(ler(2, 'menor preco'), 'ok');
  assert.equal(ler(2, 'Maior desconto'), 'falha');
});

test('quantidade mínima: número comparado com quantidadeMinimaAquisicao; site sem mínima (null) diverge', () => {
  const dif = item(1, { quantidadeItens: 300000, quantidadeMinimaAquisicao: 10000 });
  const semMin = item(2, { quantidadeMinimaAquisicao: null });
  const a = (n, t) => analisar([linha({ item: String(n), qtdMinima: t })], [dif, semMin, item(3)], semPadroes()).linhas[0];
  assert.equal(a(1, '10.000').estado, 'ok');
  assert.equal(a(1, '10000').estado, 'ok');
  assert.equal(a(1, '300.000').estado, 'falha', 'não compara com a quantidade total');
  assert.equal(a(3, '100').estado, 'ok');
  const nulo = a(2, '100');
  assert.equal(nulo.estado, 'falha');
  assert.equal(nulo.celulas[IDX.qtdMinima].dica, 'Site: não informada\nPlanilha: 100');
  assert.deepEqual(nulo.problemas, ['Quantidade mínima: site não informada, planilha 100']);
  // Sim/Não (formato antigo) não é número: valor não reconhecido
  assert.equal(a(3, 'Sim').celulas[IDX.qtdMinima].estado, 'invalido');
  // célula vazia: não confere aquele item, mesmo com o site sem mínima
  const vazia = analisar([linhaCheia(2, { qtdMinima: '' }), linhaCheia(3)], [semMin, item(3)], semPadroes());
  assert.equal(vazia.linhas[0].estado, 'ok');
  assert.equal(vazia.linhas[0].celulas[IDX.qtdMinima].estado, 'off');
  assert.deepEqual(vazia.incompletos, [2]);
});

test('valor não reconhecido: célula amarela (invalido) e padrão inválido sinalizado', () => {
  const a = analisar([linha({ item: '1', sigiloso: 'talvez', quantidade: '-3' })], [item(1)], semPadroes());
  assert.equal(a.linhas[0].celulas[IDX.sigiloso].estado, 'invalido');
  assert.equal(a.linhas[0].celulas[IDX.quantidade].estado, 'invalido');
  assert.equal(a.linhas[0].estado, 'falha');
  assert.equal(a.linhas[0].problemas.length, 2);
  const p = linha({ intervalo: 'abc' });
  const b = analisar([linha({ item: '1' })], [item(1)], p);
  assert.equal(b.padraoInvalido[IDX.intervalo], true);
  assert.equal(b.linhas[0].celulas[IDX.intervalo].estado, 'off', 'padrão inválido: a célula fica sem conferência');
});

test('linhas especiais: vazia, número inválido, repetida, ausente do site', () => {
  const g = [V.linhaVazia(), linha({ item: 'abc' }), linha({ item: '1', catmat: '400001' }), linha({ item: '1', catmat: '0' }), linha({ item: '9', catmat: '1' })];
  const a = analisar(g, [item(1)], semPadroes());
  assert.deepEqual(a.linhas.map((l) => l.estado), ['vazia', 'invalida', 'ok', 'repetida', 'ausente']);
  assert.equal(a.linhas[1].celulas[0].estado, 'invalido');
  assert.deepEqual(a.naoExibidos, [9]);
  assert.equal(a.completa, false);
});

test('sem lista do site: nada é dado como ausente', () => {
  const a = analisar([linhaCheia(1)], null, semPadroes());
  assert.deepEqual(a.naoExibidos, []);
  assert.equal(a.linhas[0].estado, 'ausente');
  assert.deepEqual(a.itens, []);
});

test('incompleta: coluna não conferida', () => {
  const a = analisar([linhaCheia(1, { sigiloso: '' })], [item(1)], semPadroes());
  assert.equal(a.completa, false);
  assert.deepEqual(a.colunasNaoConferidas, ['Valor sigiloso']);
  assert.deepEqual(a.conferem, [1]);
  assert.deepEqual(a.incompletos, [], 'coluna inteira vazia não conta como célula');
  const r = V.relatorio(a, '7');
  assert.match(r, /Sem divergência no que foi conferido: 1 \| Divergem: 0/);
  assert.match(r, /ATENÇÃO: CONFERÊNCIA INCOMPLETA/);
  assert.match(r, /Colunas não conferidas: Valor sigiloso/);
});

test('incompleta: célula vazia numa coluna conferida', () => {
  const a = analisar([linhaCheia(1), linhaCheia(2, { catmat: '' })], [item(1), item(2)], semPadroes());
  assert.equal(a.completa, false);
  assert.deepEqual(a.incompletos, [2]);
  assert.equal(a.linhas[1].celulas[IDX.catmat].estado, 'off');
  assert.match(V.relatorio(a, '7'), /Itens com células não conferidas: 2/);
});

test('incompleta: item exibido pelo site sem linha na planilha', () => {
  const a = analisar([linhaCheia(1)], [item(1), item(2)], semPadroes());
  assert.equal(a.completa, false);
  assert.deepEqual(a.incompletos, [2]);
});

test('incompleta: total informado pelo site maior que o exibido', () => {
  const g = [linhaCheia(1), linhaCheia(2)];
  const a = analisar(g, [item(1), item(2)], semPadroes(), 148);
  assert.equal(a.total, 148);
  assert.equal(a.completa, false);
  const r = V.relatorio(a, '7');
  assert.match(r, /Itens exibidos pelo site: 2 de 148/);
  assert.match(r, /O site exibiu só 2 de 148 itens/);
  // total igual não atrapalha (total ausente: ver o teste seguinte)
  assert.equal(analisar(g, [item(1), item(2)], semPadroes(), 2).completa, true);
});

test('incompleta: o site não informou o total (Q1: no site real, o total só vem no cabeçalho register-count)', () => {
  const g = [linhaCheia(1), linhaCheia(2)];
  // lista de itens sem total: os 2 itens exibidos podem ser 2 de 148
  const a = V.analisar(g, V.juntarSite({ item: { itens: [item(1), item(2)] } }, [], 0), semPadroes());
  assert.deepEqual(a.conferem, [1, 2]);
  assert.equal(a.total, null);
  assert.deepEqual(a.totaisNaoInformados, ['itens fora de grupo']);
  assert.equal(a.completa, false);
  const r = V.relatorio(a, '7');
  assert.match(r, /Sem divergência no que foi conferido: 2 \| Divergem: 0/);
  assert.match(r, /ATENÇÃO: CONFERÊNCIA INCOMPLETA\n {3}- O site não informou o total de itens fora de grupo \(não dá para saber se todos os itens estão exibidos\)/);
  // lista de grupos não recebida (ou sem total): pode haver grupos que o painel não conhece
  const b = V.analisar(g, V.juntarSite({ item: { itens: [item(1), item(2)], total: 2 } }, []), semPadroes());
  assert.deepEqual(b.totaisNaoInformados, ['grupos']);
  assert.equal(b.completa, false);
  assert.match(V.relatorio(b, '7'), /- O site não informou o total de grupos/);
  // nada recebido, ou site montado sem passar por juntarSite: nada se supõe
  assert.deepEqual(V.analisar(g, null, semPadroes()).totaisNaoInformados, ['itens fora de grupo', 'grupos']);
  assert.equal(V.analisar(g, { itens: [item(1), item(2)], grupos: [] }, semPadroes()).completa, false);
  assert.match(V.relatorio(V.analisar(g, null, semPadroes()), '7'), /o total de itens fora de grupo e de grupos/);
  // total 0 é um total informado (contratação só com grupos)
  assert.deepEqual(V.juntarSite({ item: { itens: [], total: 0 } }, [], 0).totaisNaoInformados, []);
  // com os dois totais: completa
  assert.equal(V.analisar(g, semGrupos([item(1), item(2)]), semPadroes()).completa, true);
});

test('relatório lista as divergências por item', () => {
  const a = analisar([linhaCheia(1, { valor: '9' })], [item(1)], semPadroes());
  const r = V.relatorio(a, '123');
  assert.match(r, /^Verificação de itens - contratação id 123/);
  assert.match(r, /Item 1 - Produto 1 \(CATMAT 400001\):\n {3}- Valor unitário: site R\$ 8,9962, planilha 9/);
});

test('nada conferido: temConferencia falso', () => {
  const a = analisar([linha({ item: '1' })], [item(1)], semPadroes());
  assert.equal(a.temConferencia, false);
  assert.equal(a.linhas[0].estado, 'neutra');
});

// ---------- contratação com grupos ----------

const GRUPOS = [
  { id: 57339, sequencialGrupo: 1, nomeGrupo: 'GRUPO 1', quantidadeItens: 3 },
  { id: 57341, sequencialGrupo: 2, nomeGrupo: 'GRUPO 2', quantidadeItens: 2 },
];
const g1 = [1, 2, 3].map((n) => item(n, { idGrupo: 57339 }));
const g2 = [4, 5].map((n) => item(n, { idGrupo: 57341 }));

test('juntarSite: junta os grupos expandidos e soma o total dos grupos', () => {
  // como no site real (contratação 578602): lista de itens fora de grupo vazia, com register-count 0
  const s = V.juntarSite({ item: { itens: [], total: 0 }, 'grupo/57339': { itens: g1 } }, GRUPOS, 2);
  assert.deepEqual(s.itens.map((i) => i.numeroItem), [1, 2, 3]);
  assert.equal(s.total, 5);
  assert.deepEqual(s.grupos, [{ nome: 'GRUPO 1', exibidos: 3, total: 3 }, { nome: 'GRUPO 2', exibidos: 0, total: 2 }]);
  assert.deepEqual(s.totaisNaoInformados, []);
  assert.equal(s.gruposNaoListados, null);
  // itens fora de grupo somam ao total informado
  assert.equal(V.juntarSite({ item: { itens: [item(9)], total: 4 } }, GRUPOS, 2).total, 9);
  // sem o total dos itens fora de grupo, o total fica desconhecido: não se supõe que todos foram exibidos
  const semTotal = V.juntarSite({ item: { itens: [item(9)] } }, GRUPOS, 2);
  assert.equal(semTotal.total, undefined);
  assert.deepEqual(semTotal.totaisNaoInformados, ['itens fora de grupo']);
  // sem grupos: só o total da lista de itens
  assert.equal(V.juntarSite({ item: { itens: [item(9)], total: 1 } }, [], 0).total, 1);
  assert.equal(V.juntarSite({}, [{ id: 1, sequencialGrupo: 3, quantidadeItens: '4' }], 1).grupos[0].nome, 'Grupo 3');
});

test('grupos: incompleta enquanto houver grupo não expandido', () => {
  const grade = [1, 2, 3, 4, 5].map((n) => linhaCheia(n));
  const parcial = V.analisar(grade, V.juntarSite({ item: { itens: [], total: 0 }, 'grupo/57339': { itens: g1 } }, GRUPOS, 2), semPadroes());
  assert.equal(parcial.completa, false);
  assert.equal(parcial.total, 5);
  assert.equal(parcial.temGrupos, true);
  assert.deepEqual(parcial.gruposIncompletos, [{ nome: 'GRUPO 2', exibidos: 0, total: 2 }]);
  assert.deepEqual(parcial.naoExibidos, [4, 5]);
  assert.deepEqual(parcial.conferem, [1, 2, 3]);
  const r = V.relatorio(parcial, '578602');
  assert.match(r, /Itens exibidos pelo site: 3 de 5/);
  assert.match(r, /Grupos não exibidos por completo: GRUPO 2 \(0 de 2\)/);

  const tudo = V.analisar(grade, V.juntarSite({ item: { itens: [], total: 0 }, 'grupo/57339': { itens: g1 }, 'grupo/57341': { itens: g2 } }, GRUPOS, 2), semPadroes());
  assert.equal(tudo.completa, true);
  assert.deepEqual(tudo.conferem, [1, 2, 3, 4, 5]);
  assert.deepEqual(tudo.gruposIncompletos, []);
  assert.doesNotMatch(V.relatorio(tudo, '578602'), /Grupos/);
});

test('grupos: divergência num item de grupo', () => {
  const grade = [1, 2, 3].map((n) => linhaCheia(n, n === 2 ? { quantidade: '7' } : {}));
  const a = V.analisar(grade, V.juntarSite({ item: { itens: [], total: 0 }, 'grupo/57339': { itens: g1 } }, GRUPOS.slice(0, 1), 1), semPadroes());
  assert.equal(a.completa, true, 'tudo exibido e conferido (com divergência)');
  assert.match(V.relatorio(a, '1'), /Item 2 .*\n {3}- Quantidade: site 100, planilha 7/);
  assert.deepEqual(a.divergem.map((l) => l.item), [2]);
});

// ---------- colunas desativadas ----------

test('coluna desativada: ignora divergências, valores não reconhecidos e o padrão; não deixa incompleta', () => {
  const grade = [linhaCheia(1, { valor: '9', sigiloso: 'talvez' }), linhaCheia(2, { qtdMinima: '' })];
  const p = linha({ sigiloso: 'abc' });
  const ativa = analisar(grade, [item(1), item(2)], p);
  assert.equal(ativa.divergem.length, 1);
  assert.equal(ativa.completa, false);

  const a = V.analisar(grade, semGrupos([item(1), item(2)]), p, new Set(['valor', 'sigiloso', 'qtdMinima']));
  assert.equal(a.completa, true);
  assert.deepEqual(a.conferem, [1, 2]);
  assert.deepEqual(a.divergem, []);
  assert.deepEqual(a.incompletos, []);
  assert.deepEqual(a.colunasNaoConferidas, []);
  assert.deepEqual(a.colunasDesativadas, ['Quantidade mínima', 'Valor unitário', 'Valor sigiloso']);
  assert.equal(a.desativada[IDX.valor], true);
  assert.equal(a.desativada[IDX.catmat], false);
  assert.equal(a.conferida[IDX.valor], false);
  assert.equal(a.padraoInvalido[IDX.sigiloso], false, 'padrão de coluna desativada é ignorado');
  assert.ok(a.linhas.every((l) => l.celulas[IDX.valor] === null && l.celulas[IDX.sigiloso] === null));
  const r = V.relatorio(a, '1');
  assert.match(r, /Conferem: 2 \| Divergem: 0\nColunas desativadas \(não verificadas\): Quantidade mínima, Valor unitário, Valor sigiloso$/);
  assert.doesNotMatch(r, /INCOMPLETA/);
  assert.doesNotMatch(V.relatorio(ativa, '1'), /desativadas/);
});

test('coluna desativada não substitui as outras regras de incompleta', () => {
  const site = semGrupos([item(1)]);
  // coluna vazia continua não conferida; desativar outra não resolve
  const a = V.analisar([linhaCheia(1, { catmat: '' })], site, semPadroes(), new Set(['valor']));
  assert.equal(a.completa, false);
  assert.deepEqual(a.colunasNaoConferidas, ['CATMAT']);
  // desativar a coluna vazia: completa
  assert.equal(V.analisar([linhaCheia(1, { catmat: '' })], site, semPadroes(), new Set(['catmat'])).completa, true);
  // todas desativadas: nada conferido; ITEM não pode ser desativada
  const todas = V.analisar([linhaCheia(1)], site, semPadroes(), new Set(V.COLUNAS.map((c) => c.id)));
  assert.equal(todas.temConferencia, false);
  assert.equal(todas.desativada[IDX.item], false);
  assert.equal(todas.colunasDesativadas.length, V.COLUNAS.length - 1);
});

// ---------- casos de falso "confere" e outros casos de borda ----------

test('padrão não reconhecido na linha Todos: a coluna não é conferida e a conferência fica incompleta', () => {
  const p = linha({ intervalo: '1%' });
  // nenhuma célula preenchida: a coluna inteira fica sem conferência (o site até diverge, mas não foi conferido)
  const a = analisar([linhaCheia(1, { intervalo: '' })], [item(1, { intervaloMinimo: 99 })], p);
  assert.equal(a.padraoInvalido[IDX.intervalo], true);
  assert.equal(a.padroes[IDX.intervalo], '', 'padrão não reconhecido não vale para as células');
  assert.equal(a.conferida[IDX.intervalo], false);
  assert.deepEqual(a.colunasNaoConferidas, ['Intervalo mínimo']);
  assert.deepEqual(a.padroesInvalidos, ['Intervalo mínimo']);
  assert.equal(a.completa, false);
  const r = V.relatorio(a, '1');
  assert.match(r, /Sem divergência no que foi conferido: 1/);
  assert.match(r, /Padrão não reconhecido na linha "Todos": Intervalo mínimo/);
  // com células preenchidas em outras linhas: as vazias ficam sem conferência
  const b = analisar([linhaCheia(1), linhaCheia(2, { intervalo: '' })], [item(1), item(2)], p);
  assert.equal(b.linhas[1].celulas[IDX.intervalo].estado, 'off');
  assert.deepEqual(b.incompletos, [2]);
  assert.equal(b.completa, false);
  // padrão inválido que ninguém usa (todas as células preenchidas) não atrapalha
  assert.equal(analisar([linhaCheia(1)], [item(1)], p).completa, true);
});

test('linha com número de item inválido ou repetido: ignorada, mas deixa a conferência incompleta', () => {
  const g = [linhaCheia(1), linhaCheia(2), linhaCheia('3A', { valor: '999' }), linhaCheia(2, { valor: '999' }), linha({ catmat: '5' })];
  const a = analisar(g, [item(1), item(2)], semPadroes());
  assert.deepEqual(a.linhas.map((l) => l.estado), ['ok', 'ok', 'invalida', 'repetida', 'invalida']);
  assert.equal(a.completa, false);
  assert.deepEqual(a.linhasIgnoradas.map((l) => l.linha), [3, 4, 5]);
  assert.equal(a.linhas[3].celulas[0].estado, 'invalido', 'a célula ITEM repetida é sinalizada');
  const r = V.relatorio(a, '1');
  assert.match(r, /ATENÇÃO: CONFERÊNCIA INCOMPLETA/);
  assert.match(r, /Linhas da planilha ignoradas \(não conferidas\): linha 3 \(número do item inválido: "3A"\), linha 4 \(item 2 repetido\), linha 5 \(sem número do item\)/);
  // sem essas linhas: completa
  assert.equal(analisar(g.slice(0, 2), [item(1), item(2)], semPadroes()).completa, true);
});

test('cabeçalhos abreviados: Qtd. mín. não vira QUANTIDADE; Interv., Cód. e variações de ITEM', () => {
  const mapa = (nomes) => {
    const r = V.colar([V.linhaVazia()], nomes.join('\t') + '\n' + nomes.map((_, i) => i + 1).join('\t'), 0, 0);
    return r.padroes && Object.fromEntries(V.COLUNAS.map((c, i) => [c.id, r.grade[0][i]]).filter(([, v]) => v));
  };
  assert.deepEqual(mapa(['ITEM', 'QTD. MÍN.', 'INTERV. MÍN.', 'CÓD.']), { item: '1', qtdMinima: '2', intervalo: '3', catmat: '4' });
  assert.deepEqual(mapa(['Item', 'Qtd.', 'Qtd. mín.', 'Valor unit.']), { item: '1', quantidade: '2', qtdMinima: '3', valor: '4' });
  assert.deepEqual(mapa(['ITEM', 'QTDE MIN', 'QUANT. MÍNIMA']), { item: '1', qtdMinima: '2' }, 'vale a primeira');
  for (const n of ['Nº ITEM', 'ITENS', 'Item nº', 'N.º', 'Nº do item', 'Núm. item']) assert.ok(mapa([n, 'CATMAT']), n);
  for (const n of ['DESCRIÇÃO DO ITEM', 'ITEM DE DESPESA', 'UNIDADE']) assert.equal(mapa([n, 'CATMAT']), null, n);
});

test('critério: sem o campo maiorDesconto, deduz do nome do site', () => {
  const so = item(1, { criterioJulgamento: undefined, nomeCriterioJulgamento: 'Menor Preço' });
  const md = item(2, { criterioJulgamento: { nome: 'Maior Desconto' } });
  const ler = (n, t) => analisar([linha({ item: String(n), criterio: t })], [so, md], semPadroes()).linhas[0].estado;
  assert.equal(ler(1, 'Menor preço por item'), 'ok');
  assert.equal(ler(1, 'Maior desconto'), 'falha');
  assert.equal(ler(2, 'Maior desconto sobre a tabela'), 'ok');
  assert.equal(ler(2, 'Menor preço'), 'falha');
});

test('numeroBR: só aceita número de planilha (nada de notação científica, hexadecimal ou formato americano)', () => {
  for (const t of ['1,23E+11', '1e3', '0x10', '0b11', '1,234.56', '1,5,5', '5%', '-', '#####']) assert.equal(V.numeroBR(t), null, t);
  assert.equal(V.numeroBR('1.234.567,89'), 1234567.89);
  assert.equal(V.numeroBR(',5'), 0.5);
  assert.equal(V.numeroBR('-3'), -3);
  assert.equal(V.numeroBR('R$ 1.234,50'), 1234.5, 'espaço não separável do Excel');
  // na planilha: vira "valor não reconhecido" em vez de um número aproximado
  const a = analisar([linhaCheia(1, { quantidade: '1,23E+11' })], [item(1)], semPadroes());
  assert.equal(a.linhas[0].celulas[IDX.quantidade].estado, 'invalido');
});

test('grupos: grupo não exibido por completo nunca dá conferência completa, mesmo com o total subestimado', () => {
  const grupos = [{ id: 1, nomeGrupo: 'G1', quantidadeItens: 2 }, { id: 2, nomeGrupo: 'G2', quantidadeItens: 2 }];
  // chegou a lista de um grupo que não está na lista de grupos: os itens exibidos igualam o total somado
  const s = V.juntarSite({ item: { itens: [], total: 0 }, 'grupo/1': { itens: [item(1), item(2)] }, 'grupo/9': { itens: [item(3), item(4)] } }, grupos, 2);
  const a = V.analisar([1, 2, 3, 4].map((n) => linhaCheia(n)), s, semPadroes());
  assert.deepEqual(a.gruposIncompletos.map((g) => g.nome), ['G2']);
  assert.equal(a.completa, false);
  assert.match(V.relatorio(a, '1'), /Grupos não exibidos por completo: G2 \(0 de 2\)/);
});

test('relatório: item do site sem código não vira "CATMAT undefined"', () => {
  const a = analisar([linhaCheia(1, { valor: '9', catmat: '' })], [item(1, { codigoItem: undefined, nomeItem: undefined })], semPadroes());
  assert.match(V.relatorio(a, '1'), /^Item 1 \(CATMAT —\):$/m);
});

test('grupos: lista de grupos paginada — faltar grupo na lista deixa incompleta, mesmo com os listados completos', () => {
  const grade = [1, 2, 3, 4, 5].map((n) => linhaCheia(n));
  const listas = { item: { itens: [], total: 0 }, 'grupo/57339': { itens: g1 }, 'grupo/57341': { itens: g2 } };
  // o site listou 2 de 3 grupos (register-count 3): o total somado (5) não conta o grupo que falta
  const s = V.juntarSite(listas, GRUPOS, 3);
  assert.deepEqual(s.gruposNaoListados, { recebidos: 2, total: 3 });
  const a = V.analisar(grade, s, semPadroes());
  assert.deepEqual(a.conferem, [1, 2, 3, 4, 5]);
  assert.equal(a.total, null, 'os itens exibidos igualam o total somado');
  assert.deepEqual(a.gruposIncompletos, []);
  assert.deepEqual(a.gruposNaoListados, { recebidos: 2, total: 3 });
  assert.equal(a.temGrupos, true);
  assert.equal(a.completa, false);
  assert.match(V.relatorio(a, '1'), /ATENÇÃO: CONFERÊNCIA INCOMPLETA\n {3}- O site listou só 2 de 3 grupos/);
  // nenhum grupo recebido, mas o total diz que há grupos
  const nenhum = V.analisar([linhaCheia(1)], V.juntarSite({ item: { itens: [item(1)], total: 1 } }, [], 2), semPadroes());
  assert.equal(nenhum.temGrupos, true);
  assert.equal(nenhum.completa, false);
  // todos listados (os grupos acumulam entre as páginas da lista): completa
  assert.equal(V.analisar(grade, V.juntarSite(listas, GRUPOS, 2), semPadroes()).completa, true);
});

// ---------- dados reais (testes/dados-reais, fora do git; pulados sem a pasta) ----------

/** Junta as respostas gravadas como o painel faz com as mensagens do interceptor (total = register-count). */
function siteReal(respostas) {
  const listas = {};
  const grupos = new Map();
  let totalGrupos;
  for (const r of respostas) {
    const total = r.registros === undefined ? undefined : Number(r.registros);
    if (r.lista === 'grupos') {
      for (const g of r.corpo) grupos.set(g.id, g);
      totalGrupos = total;
    } else listas[r.lista] = { itens: r.corpo, total };
  }
  return V.juntarSite(listas, [...grupos.values()], totalGrupos);
}

const EXEMPLOS = reais.exemplos();
if (!EXEMPLOS.length) test('dados reais: respostas da API conferem com a planilha', { skip: 'sem testes/dados-reais' }, () => {});
for (const ex of EXEMPLOS) {
  test(`dados reais (${ex.arquivo}): planilha com os valores do site confere; total do cabeçalho vale`, () => {
    // o site real manda todas as listas como array, com o total só no cabeçalho register-count (Q1)
    for (const r of ex.respostas) {
      assert.ok(Array.isArray(r.corpo), `${r.lista}: corpo em array`);
      assert.match(String(r.registros), /^\d+$/, `${r.lista}: register-count`);
    }
    const site = siteReal(ex.respostas);
    const grade = reais.planilha(site.itens);
    const desativadas = new Set(reais.colunasVazias(grade).map((i) => V.COLUNAS[i].id));
    const a = V.analisar(grade, site, semPadroes(), desativadas);
    const soltos = ex.respostas.find((r) => r.lista === 'item');
    const total = Number(soltos.registros) + site.grupos.reduce((s, g) => s + g.total, 0);
    assert.deepEqual(a.divergem, []);
    assert.equal(a.conferem.length, site.itens.length);
    assert.deepEqual(a.totaisNaoInformados, []);
    // completa só se o site exibiu todos os itens que diz ter (634177: 10 de 148 exibidos -> incompleta)
    assert.equal(a.completa, site.itens.length >= total, `${site.itens.length} de ${total}`);
    if (site.itens.length < total) {
      assert.equal(a.total, total);
      assert.match(V.relatorio(a, ex.id), new RegExp(`O site exibiu só ${site.itens.length} de ${total} itens`));
    }
    // e diverge quando a planilha muda
    const errada = grade.map((l) => l.slice());
    errada[0][V.COLUNAS.findIndex((c) => c.id === 'valor')] = '0,01';
    assert.deepEqual(V.analisar(errada, site, semPadroes(), desativadas).divergem.map((l) => l.item), [Number(grade[0][0])]);
  });
}
