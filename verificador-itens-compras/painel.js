/*
 * Painel da extensão (contexto isolado da extensão).
 * Aparece só em /execucao/resume?id={id}. Confere a planilha da grade com a
 * lista de itens que o site está exibindo (repassada pelo interceptor.js).
 * A grade só recebe valores colados; só a linha "Todos" é editável.
 * Nada é gravado: a planilha fica só na memória da aba, até trocar de contratação.
 * O que o site exibiu vale só enquanto a página de resumo está aberta: ao sair dela, é descartado.
 */
(() => {
  'use strict';

  const V = globalThis.VerificadorItens;
  const COLS = V.COLUNAS;
  const LARGURA = { item: 52, catmat: 92, quantidade: 72, valor: 98, beneficio: 132, qtdMinima: 88, criterio: 118, intervalo: 86, sigiloso: 82 };

  const estado = {
    id: null, // contratação da página
    recebidos: new Map(), // id da contratação -> { listas: { chave: {itens, total} }, grupos: Map }: o que o site exibiu
    grade: [V.linhaVazia()],
    padroes: V.linhaVazia(), // padrão de cada coluna (linha "Todos")
    desativadas: new Set(), // ids das colunas com a verificação desativada (caixa do cabeçalho)
  };

  let host, raiz, painel, pilula, dica, sub, resumo, tbody, btnCopiar;
  const titulos = []; // <th> do cabeçalho
  const todos = []; // <th> da linha "Todos"
  const controles = []; // <select>/<input> da linha "Todos" (null nas colunas sem padrão)
  const caixas = []; // caixas do cabeçalho que ativam/desativam a verificação de cada coluna
  let celulas = []; // celulas[linha][coluna] = <input readonly>
  let analise = null;
  let ultimoErro = null; // [linha, coluna] do último erro mostrado por "Próximo erro"
  let naPagina = false; // a página de resumo está aberta
  let avisoCopia = 0; // temporizador que devolve o botão de copiar ao normal

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .painel, .pilula, .dica {
      --azul: #1351b4; --texto: #1f2328; --suave: #57606a; --borda: #d0d7de; --linha: #eaeef2; --fundo: #f6f8fa;
      --verde: #1a7f37; --verde-fundo: #dafbe1; --vermelho: #c62828; --vermelho-fundo: #ffebe9; --vermelho-texto: #a40e26;
      --amarelo: #d4a72c; --amarelo-fundo: #fff8c5; --amarelo-texto: #6c4a00;
      --off: repeating-linear-gradient(135deg, #eef0f3 0 5px, #e1e5ea 5px 10px);
      font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    .painel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
      width: 822px; max-width: calc(100vw - 32px); max-height: 80vh;
      display: flex; flex-direction: column; overflow: hidden;
      background: #fff; color: var(--texto); border: 1px solid var(--borda); border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
    }
    svg { display: block; flex: none; }
    button { font: inherit; cursor: pointer; }

    .cab { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 14px; background: var(--azul); color: #fff; }
    .cab-texto { flex: 1; min-width: 0; }
    .titulo { font-weight: 600; }
    .sub { font-size: 12px; opacity: .85; width: max-content; max-width: 100%; }
    .cab button { width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #fff; }
    .cab button:hover:not(:disabled) { background: rgba(255,255,255,.16); }
    .cab button:disabled { opacity: .4; cursor: default; }

    .resumo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 10px 12px; }
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--fundo); color: var(--suave); }
    .chip.ok { background: var(--verde-fundo); color: var(--verde); }
    .chip.falha { background: var(--vermelho-fundo); color: var(--vermelho-texto); }
    .chip.aviso { background: #fff; color: var(--amarelo-texto); box-shadow: inset 0 0 0 1px var(--amarelo); }
    .chip.info { font-weight: 400; }
    .proximo { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; padding: 3px 10px; border: 1px solid var(--vermelho); border-radius: 6px; background: #fff; color: var(--vermelho-texto); font-size: 12px; font-weight: 600; }
    .proximo:hover { background: var(--vermelho-fundo); }
    .alerta {
      flex-basis: 100%; display: flex; gap: 8px; padding: 8px 10px; border-radius: 6px;
      background: var(--amarelo-fundo); color: var(--amarelo-texto); border-left: 4px solid var(--amarelo); font-size: 12px;
    }
    .alerta svg { margin-top: 1px; }
    .alerta b { display: block; font-size: 13px; }

    .caixa { flex: 1; min-height: 110px; overflow: auto; border-top: 1px solid var(--borda); scrollbar-width: thin; }
    table { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 12px; }
    th {
      position: sticky; top: 0; z-index: 2; padding: 6px 8px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      background: var(--fundo); color: var(--suave); font-weight: 600; cursor: help;
      border-bottom: 1px solid var(--borda); border-right: 1px solid var(--linha);
    }
    td { padding: 0; background: #fff; border-bottom: 1px solid var(--linha); border-right: 1px solid var(--linha); }
    thead tr:first-child th { height: 31px; }
    thead tr + tr th { top: 31px; padding: 3px 4px; font-weight: 400; cursor: default; }
    thead tr + tr th:first-child { padding-left: 8px; font-weight: 600; cursor: help; }
    th:first-child, td:first-child { position: sticky; left: 0; z-index: 1; border-right-color: var(--borda); }
    th:first-child { z-index: 3; }
    select, th input:not(.cx) {
      display: block; width: 100%; height: 24px; padding: 0 4px; border: 1px solid var(--borda); border-radius: 4px;
      background: #fff; color: var(--texto); font: 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    select:focus, th input:not(.cx):focus { outline: 2px solid var(--azul); outline-offset: -1px; }
    th.invalido select, th.invalido input { background: var(--amarelo-fundo); border-color: var(--amarelo); }
    th.off, td.off { background: var(--off); }
    th.off { color: #8c959f; }
    th.desativada { text-decoration: line-through; }
    th label { cursor: pointer; }
    .cx { margin: 0 4px 0 0; vertical-align: -2px; accent-color: var(--azul); cursor: pointer; }
    td input {
      all: unset; box-sizing: border-box; display: block; width: 100%; padding: 5px 8px; caret-color: transparent; cursor: default;
      font: 12px/18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; font-variant-numeric: tabular-nums; color: var(--texto);
    }
    td input:focus { box-shadow: inset 0 0 0 2px var(--azul); }
    td input::placeholder { color: #8c959f; font-style: italic; }
    td.off input { color: #8c959f; }
    td:first-child input { font-weight: 600; }
    td.falha { background: var(--vermelho-fundo); }
    td.falha input, td.falha input::placeholder { color: var(--vermelho-texto); font-weight: 600; }
    td.invalido { background: var(--amarelo-fundo); }
    td.invalido input { color: var(--amarelo-texto); }
    tr.ok td:first-child { box-shadow: inset 3px 0 0 var(--verde); }
    tr.falha td:first-child { box-shadow: inset 3px 0 0 var(--vermelho); }
    tr.invalida td:first-child, tr.parcial td:first-child { box-shadow: inset 3px 0 0 var(--amarelo); }
    tr.ausente td:not(:first-child) { background: var(--off); }
    tr.ausente td:first-child { box-shadow: inset 3px 0 0 var(--amarelo); }
    tr.ausente input, tr.repetida input { color: var(--suave); }
    tr.repetida input { text-decoration: line-through; }

    .rodape { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 12px; border-top: 1px solid var(--borda); background: var(--fundo); font-size: 12px; color: var(--suave); }
    .ajuda { cursor: help; border-bottom: 1px dotted currentColor; }
    .limpar { border: 0; background: none; padding: 2px 4px; color: var(--azul); font-weight: 600; }
    .limpar:hover { text-decoration: underline; }

    .pilula {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483646; display: inline-flex; align-items: center; gap: 7px;
      padding: 9px 16px; border: 0; border-radius: 999px; background: var(--azul); color: #fff; font-weight: 600;
      box-shadow: 0 6px 16px rgba(0,0,0,.22);
    }
    .pilula.ok { background: var(--verde); }
    .pilula.falha { background: var(--vermelho); }
    .pilula.aviso { background: var(--amarelo-fundo); color: var(--amarelo-texto); box-shadow: inset 0 0 0 2px var(--amarelo), 0 6px 16px rgba(0,0,0,.22); }

    .dica {
      position: fixed; z-index: 2147483647; max-width: 340px; padding: 6px 9px; border-radius: 6px; pointer-events: none;
      background: #24292f; color: #fff; font-size: 12px; white-space: pre-line; box-shadow: 0 4px 12px rgba(0,0,0,.2);
    }
  `;

  // ---------- utilidades ----------

  function el(tag, classe, texto, dicaTexto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    if (dicaTexto) e.dataset.dica = dicaTexto;
    return e;
  }

  const ICONES = {
    ok: 'M20 6 9 17l-5-5',
    falha: 'M18 6 6 18M6 6l12 12',
    aviso: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
    menos: 'M5 12h14',
    seta: 'M12 5v14M5 12l7 7 7-7',
  };

  function icone(nome, t = 16) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: t, height: t, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
      s.setAttribute(k, v);
    }
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', ICONES[nome]);
    s.appendChild(p);
    return s;
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function idDaPagina() {
    if (!/\/execucao\/resume\/?$/.test(location.pathname)) return null;
    const id = new URLSearchParams(location.search).get('id');
    return id && /^\d+$/.test(id) ? id : null;
  }

  /** Itens que o site exibe na contratação da página (juntando os grupos expandidos), ou null se nada chegou. */
  function doSite() {
    const r = estado.recebidos.get(estado.id);
    return r ? V.juntarSite(r.listas, [...r.grupos.values()]) : null;
  }

  const orientacao = (a) =>
    a.temGrupos
      ? 'Expanda todos os grupos na página e, se preciso, aumente "Quantidade máxima de registros listados".'
      : 'Aumente "Quantidade máxima de registros listados" na página.';

  // ---------- montagem ----------

  function montar() {
    host = document.createElement('div');
    host.id = 'verificador-itens-ext';
    raiz = host.attachShadow({ mode: 'closed' });

    const cab = el('div', 'cab');
    const texto = el('div', 'cab-texto');
    sub = el('div', 'sub');
    texto.append(el('div', 'titulo', 'Verificador de itens'), sub);
    btnCopiar = el('button', '', undefined, 'Copiar relatório');
    btnCopiar.append(icone('copiar'));
    btnCopiar.onclick = copiarRelatorio;
    const btnMin = el('button', '', undefined, 'Minimizar');
    btnMin.append(icone('menos', 18));
    btnMin.onclick = () => minimizar(true);
    cab.append(texto, btnCopiar, btnMin);

    resumo = el('div', 'resumo');

    const tabela = el('table');
    const trTitulos = el('tr');
    const trTodos = el('tr');
    let largura = 0;
    COLS.forEach((c, i) => {
      const regra = !c.ler
        ? ''
        : (c.padrao ? '\nCélula vazia: vale o padrão da linha "Todos".' : '\nCélula vazia: não confere.') +
          '\nCaixa desmarcada: coluna desativada (não verificada e não deixa a conferência incompleta).';
      const th = el('th', '', c.ler ? undefined : c.curto, `${c.nome}\n${c.ajuda}${regra}`);
      if (c.ler) {
        const cx = el('input', 'cx');
        cx.type = 'checkbox';
        cx.checked = true;
        cx.onchange = () => {
          estado.desativadas[cx.checked ? 'delete' : 'add'](c.id);
          atualizar();
        };
        caixas.push(cx);
        const rotulo = el('label');
        rotulo.append(cx, c.curto);
        th.append(rotulo);
      }
      th.style.width = LARGURA[c.id] + 'px';
      largura += LARGURA[c.id];

      const thTodos = el('th');
      let ctl = null;
      if (i === 0) {
        thTodos.textContent = 'Todos';
        thTodos.dataset.dica = 'Padrão da coluna: vale para as células vazias.\nEm branco: só as células preenchidas são conferidas.';
      } else if (c.padrao) {
        ctl = el(c.opcoes ? 'select' : 'input');
        if (c.opcoes) for (const o of ['', ...c.opcoes]) ctl.append(new Option(o || '—', o));
        else ctl.placeholder = '—';
        ctl.addEventListener(c.opcoes ? 'change' : 'input', () => {
          estado.padroes[i] = ctl.value;
          atualizar();
        });
        thTodos.append(ctl);
      }
      titulos.push(th);
      todos.push(thTodos);
      controles.push(ctl);
      trTitulos.append(th);
      trTodos.append(thTodos);
    });
    tabela.style.width = largura + 'px';
    tbody = el('tbody');
    tbody.addEventListener('paste', colar);
    tabela.append(el('thead'), tbody);
    tabela.tHead.append(trTitulos, trTodos);
    const caixa = el('div', 'caixa');
    caixa.append(tabela);

    const rodape = el('div', 'rodape');
    const limpar = el('button', 'limpar', 'Limpar');
    limpar.onclick = recomecar;
    rodape.append(
      el(
        'span',
        'ajuda',
        'Copie no Excel com o cabeçalho, clique numa célula e cole (Ctrl+V)',
        'A grade não é editável: só recebe valores colados. Edite só a linha "Todos".\n' +
          'Com cabeçalho: a grade é substituída, as colunas são reconhecidas pelo nome (as desconhecidas são ignoradas) ' +
          'e a linha "Todos" recebe o primeiro valor de cada coluna de critério.\n' +
          'Sem cabeçalho: cola a partir da célula selecionada.\n' +
          'Caixa no cabeçalho: desmarque para desativar a verificação da coluna.\n' +
          'Coluna ou célula hachurada: não conferida.'
      ),
      limpar
    );

    painel = el('div', 'painel');
    painel.append(cab, resumo, caixa, rodape);
    pilula = el('button', 'pilula');
    pilula.hidden = true;
    pilula.onclick = () => minimizar(false);
    dica = el('div', 'dica');
    dica.hidden = true;

    const estilo = el('style');
    estilo.textContent = CSS;
    raiz.append(estilo, painel, pilula, dica);
    ligarDica();
  }

  /** Recria a grade a partir de estado.grade (sempre com uma linha vazia no fim, para colar abaixo). */
  function montarGrade() {
    const g = estado.grade;
    if (!g.length || g[g.length - 1].some(Boolean)) g.push(V.linhaVazia());
    tbody.textContent = '';
    celulas = g.map((linha, r) => {
      const tr = el('tr');
      tbody.append(tr);
      return linha.map((v, c) => {
        const td = el('td');
        const i = el('input');
        i.readOnly = true;
        i.value = v;
        i.dataset.r = r;
        i.dataset.c = c;
        td.append(i);
        tr.append(td);
        return i;
      });
    });
    ultimoErro = null;
    atualizar();
  }

  /** Grade e padrões em branco, todas as colunas ativas (mais os itens que o site exibe). */
  function recomecar() {
    estado.grade = [V.linhaVazia()];
    definirPadroes(V.linhaVazia());
    estado.desativadas = new Set();
    caixas.forEach((cx) => (cx.checked = true));
    completarItens();
    montarGrade();
  }

  /** Acrescenta à grade uma linha para cada item do site que ainda não está nela. Devolve true se mudou. */
  function completarItens() {
    const site = doSite();
    const nova = site && V.completarItens(estado.grade, site.itens.map((i) => Number(i.numeroItem)));
    if (nova) estado.grade = nova;
    return !!nova;
  }

  function definirPadroes(padroes) {
    estado.padroes = padroes;
    controles.forEach((ctl, i) => ctl && (ctl.value = padroes[i]));
  }

  /** Única entrada da grade: colar (um bloco ou uma célula). */
  function colar(e) {
    e.preventDefault();
    const r = Number(e.target.dataset && e.target.dataset.r);
    const c = Number(e.target.dataset && e.target.dataset.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) return; // colou fora de uma célula
    const colado = V.colar(estado.grade, e.clipboardData.getData('text/plain'), r, c);
    estado.grade = colado.grade;
    if (colado.padroes) {
      definirPadroes(colado.padroes);
      completarItens();
    }
    montarGrade();
    focar(Math.min(r, estado.grade.length - 1), c);
  }

  function focar(r, c) {
    const i = celulas[r] && celulas[r][c];
    if (i) {
      i.focus();
      i.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function mostrarDica(alvo) {
    dica.textContent = alvo.dataset.dica;
    dica.hidden = false;
    const a = alvo.getBoundingClientRect();
    const d = dica.getBoundingClientRect();
    const y = a.bottom + d.height + 10 > innerHeight ? a.top - d.height - 6 : a.bottom + 6;
    dica.style.left = Math.max(8, Math.min(a.left, innerWidth - d.width - 8)) + 'px';
    dica.style.top = Math.max(8, y) + 'px';
  }

  function ligarDica() {
    const esconder = () => (dica.hidden = true);
    raiz.addEventListener('mouseover', (e) => {
      if (!e.target.closest) return;
      const alvo = e.target.closest('[data-dica]');
      if (alvo) mostrarDica(alvo);
      else if (!e.target.closest('.proximo')) esconder(); // sobre o botão, mantém o motivo do erro à vista
    });
    raiz.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget || !raiz.contains(e.relatedTarget)) esconder();
    });
    raiz.addEventListener('keydown', esconder);
  }

  function minimizar(sim) {
    painel.hidden = sim;
    pilula.hidden = !sim;
    dica.hidden = true;
  }

  // ---------- atualização ----------

  const DICA_LINHA = {
    ok: 'Sem divergência nas células conferidas.',
    repetida: 'Item repetido: vale a primeira linha.',
    parcial: 'Sem divergência no que foi conferido, mas há células NÃO conferidas neste item.',
    neutra: 'NADA CONFERIDO neste item: todas as células estão vazias.',
  };

  function atualizar() {
    if (!raiz || !estado.id) return;
    const site = doSite();
    const itens = site && site.itens;
    analise = V.analisar(estado.grade, site, estado.padroes, estado.desativadas);

    titulos.forEach((th, c) => {
      if (c === 0) return;
      const off = !analise.conferida[c];
      th.classList.toggle('off', off);
      th.classList.toggle('desativada', analise.desativada[c]);
      todos[c].classList.toggle('off', off);
      if (controles[c]) controles[c].disabled = analise.desativada[c];
      todos[c].classList.toggle('invalido', analise.padraoInvalido[c]);
      if (analise.padraoInvalido[c]) todos[c].dataset.dica = `Valor não reconhecido: este padrão não vale para nenhuma célula.\n${COLS[c].ajuda}`;
      else delete todos[c].dataset.dica;
    });

    analise.linhas.forEach((l, r) => {
      const linha = celulas[r];
      if (!linha) return;
      const comSite = itens || l.estado === 'invalida' || l.estado === 'repetida';
      const parcial = l.estado === 'ok' && l.celulas.some((cel) => cel && cel.estado === 'off'); // inclui colunas inteiras vazias
      const estadoLinha = parcial ? 'parcial' : l.estado;
      linha[0].closest('tr').className = comSite ? estadoLinha : '';
      linha.forEach((inp, c) => {
        const td = inp.parentElement;
        const cel =
          c > 0 && !analise.conferida[c]
            ? { estado: 'off', dica: analise.desativada[c] ? 'NÃO VERIFICADA: coluna desativada.' : analise.padraoInvalido[c] ? 'NÃO CONFERIDA: coluna vazia e padrão da linha "Todos" não reconhecido.' : 'NÃO CONFERIDA: coluna vazia.' }
            : l.celulas[c];
        td.className = cel ? cel.estado : '';
        const texto = cel
          ? cel.dica
          : c === 0 && comSite
            ? l.estado === 'falha'
              ? l.problemas.join('\n')
              : l.estado === 'ausente'
                ? `NÃO CONFERIDO: o site não está exibindo este item.\n${orientacao(analise)}`
                : DICA_LINHA[estadoLinha]
            : '';
        if (texto) td.dataset.dica = texto;
        else delete td.dataset.dica;
        inp.placeholder = COLS[c].padrao && l.estado !== 'vazia' ? analise.padroes[c] : '';
      });
    });

    desenharResumo(itens);
  }

  function desenharResumo(itens) {
    const a = analise;
    resumo.textContent = '';
    sub.textContent = itens
      ? `id ${estado.id} · ${a.total ? `${itens.length} de ${a.total} itens exibidos` : plural(itens.length, 'item exibido', 'itens exibidos')} pelo site`
      : `id ${estado.id}`;
    if (itens && itens.length) sub.dataset.dica = `Confere os itens que o site está exibindo: ${V.faixas(a.itens.map((i) => Number(i.numeroItem)))}`;
    else delete sub.dataset.dica;
    btnCopiar.disabled = !itens || !a.temConferencia;

    let pTexto = 'Verificador';
    let pClasse = '';
    if (!itens) {
      resumo.append(
        el('span', 'chip info', 'Aguardando a lista de itens do site…', 'A extensão só lê o que o site já carrega.\nAbra a lista de itens; se nada mudar, recarregue a página (F5).')
      );
    } else if (!a.temConferencia) {
      resumo.append(el('span', 'chip info', 'Nada conferido: cole a planilha ou escolha os padrões na linha "Todos"'));
    } else {
      const ok = a.completa
        ? el('span', 'chip ok', plural(a.conferem.length, 'confere', 'conferem'), a.conferem.length ? `Itens ${V.faixas(a.conferem)}` : '')
        : el('span', 'chip aviso', `${a.conferem.length} sem divergência no que foi conferido`, 'A conferência está incompleta: veja o aviso abaixo.');
      ok.prepend(icone(a.completa ? 'ok' : 'aviso', 13));
      resumo.append(ok);
      let proximo = null;
      if (a.divergem.length) {
        const f = el('span', 'chip falha', plural(a.divergem.length, 'diverge', 'divergem'), `Itens ${V.faixas(a.divergem.map((l) => l.item))}`);
        f.prepend(icone('falha', 13));
        resumo.append(f);
      }
      if (celulasComErro().length) {
        // também sem item divergente: linha ignorada ou valor não reconhecido num item que o site não exibe
        proximo = el('button', 'proximo', 'Próximo erro');
        proximo.append(icone('seta', 13));
        proximo.onclick = () => proximoErro(proximo);
      }
      const ds = a.colunasDesativadas;
      if (ds.length) {
        resumo.append(el('span', 'chip info', `${ds.length === 1 ? 'Desativada' : 'Desativadas'}: ${ds.join(', ')}`, 'Verificação desativada pela caixa do cabeçalho.'));
      }
      if (proximo) resumo.append(proximo);
      if (!a.completa) resumo.append(alertaIncompleta(a));
      pTexto = a.divergem.length
        ? plural(a.divergem.length, 'diverge', 'divergem')
        : a.completa
          ? plural(a.conferem.length, 'confere', 'conferem')
          : 'Conferência incompleta';
      pClasse = a.divergem.length ? 'falha' : a.completa ? 'ok' : 'aviso';
    }

    pilula.className = 'pilula ' + pClasse;
    pilula.textContent = pTexto;
    if (pClasse) pilula.prepend(icone(pClasse, 15));
  }

  function alertaIncompleta(a) {
    const caixa = el('div', 'alerta');
    const texto = el('div');
    texto.append(el('b', '', 'Conferência incompleta: "sem divergência" não significa que está tudo certo.'));
    if (a.total || a.naoExibidos.length) {
      const partes = [];
      if (a.total) partes.push(`O site está exibindo só ${a.itens.length} de ${a.total} itens.`);
      if (a.gruposIncompletos.length) partes.push(`Grupos não exibidos por completo: ${V.textoGrupos(a.gruposIncompletos)}.`);
      if (a.naoExibidos.length) partes.push(`${plural(a.naoExibidos.length, 'item', 'itens')} da planilha NÃO ${a.naoExibidos.length === 1 ? 'exibido' : 'exibidos'} pelo site, portanto NÃO ${a.naoExibidos.length === 1 ? 'conferido' : 'conferidos'}: ${V.faixas(a.naoExibidos)}.`);
      partes.push(orientacao(a));
      texto.append(el('div', '', partes.join(' ')));
    }
    if (a.linhasIgnoradas.length) texto.append(el('div', '', `Linhas da planilha ignoradas: ${V.textoIgnoradas(a.linhasIgnoradas)}. Cole de novo sem elas ou corrija o número do item.`));
    if (a.colunasNaoConferidas.length) texto.append(el('div', '', `Colunas NÃO conferidas: ${a.colunasNaoConferidas.join(', ')}.`));
    if (a.padroesInvalidos.length) texto.append(el('div', '', `Padrão não reconhecido na linha "Todos": ${a.padroesInvalidos.join(', ')}.`));
    if (a.incompletos.length) texto.append(el('div', '', `Itens com células NÃO conferidas: ${V.faixas(a.incompletos)}.`));
    caixa.append(icone('aviso'), texto);
    return caixa;
  }

  /** [linha, coluna] das células com divergência ou valor não reconhecido, na ordem da grade. */
  function celulasComErro() {
    const erros = [];
    analise.linhas.forEach((l, r) =>
      l.celulas.forEach((cel, c) => cel && (cel.estado === 'falha' || cel.estado === 'invalido') && erros.push([r, c]))
    );
    return erros;
  }

  /** Vai à próxima célula com divergência ou valor não reconhecido (volta ao início no fim) e mostra o motivo. */
  function proximoErro(botao) {
    const erros = celulasComErro();
    if (!erros.length) return;
    const [r0, c0] = ultimoErro || [-1, -1];
    const k = Math.max(0, erros.findIndex(([r, c]) => r > r0 || (r === r0 && c > c0)));
    ultimoErro = erros[k];
    focar(...ultimoErro);
    mostrarDica(celulas[ultimoErro[0]][ultimoErro[1]].parentElement);
    botao.firstChild.textContent = `Próximo erro (${k + 1}/${erros.length})`;
  }

  async function copiarRelatorio() {
    let copiou = true;
    try {
      await navigator.clipboard.writeText(V.relatorio(analise, estado.id));
    } catch (e) {
      copiou = false;
    }
    // o resultado aparece no próprio botão (e na dica) e some sozinho
    btnCopiar.replaceChildren(icone(copiou ? 'ok' : 'falha'));
    btnCopiar.dataset.dica = copiou ? 'Relatório copiado.' : 'Não foi possível copiar. Clique na página e tente de novo.';
    clearTimeout(avisoCopia);
    avisoCopia = setTimeout(() => {
      btnCopiar.replaceChildren(icone('copiar'));
      btnCopiar.dataset.dica = 'Copiar relatório';
    }, copiou ? 1500 : 4000);
  }

  // ---------- ciclo de vida ----------

  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.origem !== 'verificador-itens-ext' || !Array.isArray(d.dados)) return;
    if (!/^(item|grupos|grupo\/\d+)$/.test(d.lista)) return;
    sincronizar(); // a página pode ter mudado desde a última checagem
    // Guarda por contratação: a resposta atrasada de outra contratação não apaga a lista da atual.
    const id = String(d.contratacao);
    let r = estado.recebidos.get(id);
    if (!r) estado.recebidos.set(id, (r = { listas: {}, grupos: new Map() }));
    const dados = d.dados.filter((x) => x && typeof x === 'object');
    // grupos: acumulam (a lista de grupos também é paginada); listas de itens: vale a última resposta de cada uma
    if (d.lista === 'grupos') for (const g of dados) r.grupos.set(g.id, g);
    else r.listas[d.lista] = { itens: dados, total: Number.isFinite(d.total) ? d.total : undefined };
    if (!raiz || id !== estado.id) return;
    if (completarItens()) montarGrade();
    else atualizar();
  });

  /** Mostra o painel só na página de resumo e recomeça ao trocar de contratação (o site é SPA). */
  function sincronizar() {
    const id = idDaPagina();
    if (!id) {
      // Saiu da página de resumo: o que o site tinha exibido deixa de valer (ao voltar, o site carrega as listas
      // de novo e os grupos voltam fechados). A planilha continua na memória. Só na saída: o que chegar depois
      // (o site pode pedir a lista antes de trocar a URL) fica guardado.
      if (naPagina) {
        naPagina = false;
        estado.recebidos.clear();
        if (host) host.remove();
      }
      return;
    }
    if (!document.body) return;
    if (!host) montar();
    if (!host.isConnected) document.body.append(host);
    const voltou = !naPagina;
    naPagina = true;
    if (id !== estado.id) {
      estado.id = id;
      for (const outro of [...estado.recebidos.keys()]) if (outro !== id) estado.recebidos.delete(outro);
      recomecar();
    } else if (voltou) {
      atualizar(); // mesma contratação: mantém a planilha e espera o site exibir as listas de novo
    }
  }

  document.addEventListener('DOMContentLoaded', sincronizar);
  sincronizar();
  setInterval(sincronizar, 1000);
})();
