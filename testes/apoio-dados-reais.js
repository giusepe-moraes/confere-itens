// Apoio aos testes com as respostas reais da API de testes/dados-reais/ (pasta fora do git: sem ela, esses
// testes são pulados). Lê os exemplo-*-api.json gerados por extrair_har.py.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, 'dados-reais');
// as três listas observadas pelo interceptor (mesmos caminhos do PADRAO de interceptor.js)
const LISTA = /\/comprasnet-artefatos\/api\/v1\/(?:contratacaoexecucao\/contratacao\/(\d+)\/item|contratacao-execucao\/(\d+)\/grupo(?:\/(\d+)\/item)?)$/;

const cabecalho = (r, nome) => {
  const k = Object.keys(r.cabecalhosResposta || {}).find((c) => c.toLowerCase() === nome);
  return k === undefined ? undefined : r.cabecalhosResposta[k];
};

/** Respostas GET 2xx das três listas: [{ url, contratacao, lista ('item' | 'grupos' | 'grupo/{id}'), status, cabecalhos, corpo }]. */
function listasObservadas(respostas) {
  const saida = [];
  for (const r of respostas) {
    const m = LISTA.exec(new URL(r.url).pathname);
    if (!m || r.metodo !== 'GET' || r.status < 200 || r.status >= 300) continue;
    saida.push({
      url: r.url, contratacao: m[1] || m[2], lista: m[1] ? 'item' : m[3] ? 'grupo/' + m[3] : 'grupos',
      status: r.status, cabecalhos: r.cabecalhosResposta || {}, corpo: r.corpo, registros: cabecalho(r, 'register-count'),
    });
  }
  return saida;
}

/** Exemplos disponíveis: [{ arquivo, id, respostas: listasObservadas(...) }]; vazio sem a pasta. */
function exemplos() {
  if (!fs.existsSync(PASTA)) return [];
  return fs.readdirSync(PASTA).filter((f) => /^exemplo-.*-api\.json$/.test(f)).sort().map((arquivo) => {
    const respostas = listasObservadas(JSON.parse(fs.readFileSync(path.join(PASTA, arquivo), 'utf8')));
    return { arquivo, id: respostas[0] && respostas[0].contratacao, respostas };
  }).filter((e) => e.id);
}

const br = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

/** Cabeçalho da planilha montada por `planilha`, na ordem das colunas da grade. */
const CABECALHO = ['ITEM', 'CATMAT', 'QUANTIDADE', 'QUANTIDADE MÍNIMA', 'VALOR', 'TIPO DE BENEFÍCIO', 'CRITÉRIO DE JULGAMENTO', 'INTERVALO MÍNIMO', 'VALOR SIGILOSO'];

/** Planilha que confere com os itens reais (mesma ordem de CABECALHO); campo nulo no site vira célula vazia. */
function planilha(itens) {
  return itens
    .slice()
    .sort((a, b) => a.numeroItem - b.numeroItem)
    .map((it) => [
      String(it.numeroItem), it.codigoItem ?? '', br(it.quantidadeItens), br(it.quantidadeMinimaAquisicao), br(it.valorUnitario),
      (it.tipoBeneficio && it.tipoBeneficio.nome) || '',
      (it.criterioJulgamento && it.criterioJulgamento.nome) || it.nomeCriterioJulgamento || '',
      br(it.intervaloMinimo), it.valorSigiloso === true ? 'Sim' : it.valorSigiloso === false ? 'Não' : '',
    ]);
}

/** Índices das colunas (exceto ITEM) vazias em todas as linhas: o site não tem o campo nesta contratação. */
const colunasVazias = (linhas) => CABECALHO.map((_, i) => i).filter((i) => i > 0 && linhas.every((l) => !l[i]));

module.exports = { exemplos, planilha, colunasVazias, CABECALHO };
