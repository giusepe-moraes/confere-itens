/*
 * Roda no contexto da página (world: MAIN).
 * Só observa as respostas das listas que o próprio site pede (GET):
 *   /comprasnet-artefatos/api/v1/contratacaoexecucao/contratacao/{id}/item ....... itens fora de grupo
 *   /comprasnet-artefatos/api/v1/contratacao-execucao/{id}/grupo ................. grupos da contratação
 *   /comprasnet-artefatos/api/v1/contratacao-execucao/{id}/grupo/{idGrupo}/item ... itens de um grupo expandido
 * Não faz requisições. Repassa ao painel, via postMessage, a lista ('item', 'grupos' ou 'grupo/{idGrupo}'),
 * os dados e, se a resposta informar, o total: o do corpo, se ele for um objeto com o total, ou o do cabeçalho
 * register-count, se for um array (é assim no site real: array com status 206 e a paginação nos cabeçalhos).
 * Nenhum outro cabeçalho é lido.
 * Nada aqui pode atrapalhar o site: qualquer erro é engolido.
 */
(() => {
  'use strict';

  const PADRAO =
    /\/comprasnet-artefatos\/api\/v1\/(?:contratacaoexecucao\/contratacao\/(\d+)\/item|contratacao-execucao\/(\d+)\/grupo(?:\/(\d+)\/item)?)(?:[?#]|$)/;

  /** Total de registros da lista no cabeçalho register-count (inteiro >= 0), ou undefined. */
  function totalDoCabecalho(cabecalho) {
    try {
      const t = String(cabecalho('register-count') ?? '').trim();
      return /^\d+$/.test(t) ? Number(t) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  // cabecalho: função nome -> valor do cabeçalho da resposta (ou null)
  function repassar(url, corpo, cabecalho) {
    try {
      const m = PADRAO.exec(url);
      if (!m) return;
      const d = typeof corpo === 'string' ? JSON.parse(corpo) : corpo;
      const dados = Array.isArray(d) ? d : d && ['content', 'itens', 'items', 'data'].map((k) => d[k]).find(Array.isArray);
      if (!dados) return;
      const doCorpo = Array.isArray(d) ? undefined : ['totalElements', 'totalRegistros', 'totalItens', 'total'].map((k) => d[k]).find(Number.isFinite);
      const total = doCorpo !== undefined ? doCorpo : totalDoCabecalho(cabecalho);
      const lista = m[1] ? 'item' : m[3] ? 'grupo/' + m[3] : 'grupos';
      window.postMessage({ origem: 'verificador-itens-ext', contratacao: m[1] || m[2], lista, dados, total }, location.origin);
    } catch (e) {
      // resposta que não é JSON, ou que não dá para repassar: ignora
    }
  }

  const absoluta = (u) => {
    try {
      return new URL(String(u), location.href).href;
    } catch (e) {
      return '';
    }
  };

  // Só GET: a mesma URL com POST/PUT (ex.: inclusão de item) não devolve a lista que o site exibe.
  const ehLista = (metodo, u) => String(metodo || 'GET').toUpperCase() === 'GET' && PADRAO.test(u);

  // XMLHttpRequest (HttpClient do Angular)
  const listaDoXHR = new WeakMap(); // XHR observado -> URL da lista pedida no último open() ('' se não for lista)
  function aoCarregar() {
    try {
      const xhr = this;
      const u = listaDoXHR.get(xhr);
      if (!u || xhr.status < 200 || xhr.status >= 300) return;
      repassar(u, xhr.responseType === '' || xhr.responseType === 'text' ? xhr.responseText : xhr.response, (n) => xhr.getResponseHeader(n));
    } catch (e) {
      // ignora
    }
  }
  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    try {
      const u = absoluta(url);
      const lista = ehLista(metodo, u) ? u : '';
      // Um ouvinte por XHR, sempre com a URL do último open(): um XHR reaproveitado não repassa a resposta
      // de uma URL como se fosse de outra.
      if (lista && !listaDoXHR.has(this)) this.addEventListener('load', aoCarregar);
      if (lista || listaDoXHR.has(this)) listaDoXHR.set(this, lista);
    } catch (e) {
      // ignora
    }
    return abrir.apply(this, arguments);
  };

  // fetch
  const buscar = window.fetch;
  window.fetch = function (entrada, opcoes) {
    const promessa = buscar.apply(this, arguments);
    try {
      const pedido = typeof Request === 'function' && entrada instanceof Request;
      const u = absoluta(pedido ? entrada.url : entrada);
      if (ehLista((opcoes && opcoes.method) || (pedido && entrada.method), u)) {
        promessa.then((r) => r.ok && r.clone().text().then((t) => repassar(u, t, (n) => r.headers.get(n)))).catch(() => {});
      }
    } catch (e) {
      // ignora
    }
    return promessa;
  };
})();
