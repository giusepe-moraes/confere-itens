/*
 * Regras de verificação: compara a planilha com os itens que o site exibe.
 *
 * A planilha é a única fonte do que é conferido. Só ITEM é obrigatória.
 *
 *   Coluna vazia ................ não verifica.
 *   Coluna desativada ........... não verifica, e não deixa a conferência incompleta.
 *   Célula vazia (critérios) .... vale o padrão da coluna (linha "Todos"); sem padrão, não verifica.
 *   Célula vazia (CATMAT, QUANTIDADE, QUANTIDADE MÍNIMA, VALOR) ... não verifica aquele item.
 *   Padrão não reconhecido ...... não vale para nenhuma célula (a coluna fica sem padrão).
 *   Linha sem número de item válido, ou com item repetido ... ignorada, e a conferência fica incompleta.
 *   Site sem o total de itens ou de grupos ... não há como saber se tudo está exibido: incompleta.
 *
 * Regra geral: o que não foi conferido nunca conta como "confere".
 */
(function (raiz) {
  'use strict';

  const limpo = (s) => String(s ?? '').trim();
  const norm = (s) =>
    limpo(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');

  const SIM = new Set(['sim', 's', 'x']);
  const NAO = new Set(['nao', 'n']);

  // ---------- números ----------

  /**
   * "R$ 1.234,5678" -> 1234.5678 · "300.000" -> 300000 · "0,5" -> 0.5 · "12.5" -> 12.5
   * Devolve null para o que não é número de planilha: "1,23E+11" (o Excel arredonda ao exibir assim),
   * "1,234.56" (formato americano), "0x10", "5%", "-".
   */
  function numeroBR(v) {
    let s = limpo(v).replace(/R\$/gi, '').replace(/\s/g, '');
    if (!s) return null;
    if (s.includes(',')) {
      if (s.indexOf('.', s.indexOf(',')) >= 0) return null; // ponto depois da vírgula: não é pt-BR
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
  }

  const valido = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const igual = (v, esperado, tol) => valido(v) && Math.abs(Number(v) - esperado) <= tol;
  const fmtNum = (v) => (valido(v) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '—');
  const fmtMoeda = (v) =>
    valido(v) ? 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—';
  const catmat = (v) => limpo(v).replace(/\D/g, '').replace(/^0+(?=\d)/, '');

  // ---------- leitura das células ----------
  // ler(texto) devolve o valor esperado, null para "não verificar" ou undefined se não reconhecer.

  function lerNumero(t) {
    const n = numeroBR(t);
    return n === null || n < 0 ? undefined : n;
  }

  function lerSimNao(t) {
    const n = norm(t);
    if (SIM.has(n) || n === 'sigiloso') return true;
    if (NAO.has(n) || n === 'publico' || n === 'nao sigiloso') return false;
    return undefined;
  }

  // ---------- conferência com o item do site ----------

  /** Converte um texto colado numa opção da lista de benefícios ('' se não reconhecer). */
  function opcaoBeneficio(t) {
    const n = norm(t);
    if (n.includes('desempate') && n.includes('subcontrat')) return 'Subcontratação e Desempate Ficto';
    if (n.includes('desempate') && n.includes('cota')) return 'Cota Reservada e Desempate Ficto';
    if (n.startsWith('sem beneficio')) return 'Sem benefícios';
    if (n.startsWith('desempate') || n.startsWith('apenas desempate')) return 'Apenas desempate ficto';
    return '';
  }

  function beneficioConfere(it, t) {
    const b = it.tipoBeneficio || {};
    if (b.nome && norm(b.nome) === norm(t)) return true;
    const ficto = b.desempateFicto === true;
    const cota = b.cotaReservada === true;
    const sub = b.subContratacao === true;
    switch (opcaoBeneficio(t)) {
      case 'Sem benefícios': return b.id === 0 && !ficto && !cota && !sub;
      case 'Apenas desempate ficto': return ficto && !cota && !sub;
      case 'Subcontratação e Desempate Ficto': return ficto && sub && !cota;
      case 'Cota Reservada e Desempate Ficto': return ficto && cota && !sub;
      default: return false;
    }
  }

  function criterioConfere(it, t) {
    const cj = it.criterioJulgamento || {};
    const nome = norm(cj.nome || it.nomeCriterioJulgamento);
    const e = norm(t);
    if (nome === e) return true;
    // Se a resposta não trouxer maiorDesconto (só o nome do critério), deduz do nome.
    const maiorDesconto =
      typeof cj.maiorDesconto === 'boolean'
        ? cj.maiorDesconto
        : nome.startsWith('maior desconto') ? true : nome.startsWith('menor preco') ? false : null;
    if (e.startsWith('maior desconto')) return maiorDesconto === true;
    if (e.startsWith('menor preco')) return maiorDesconto === false;
    return false;
  }

  const simNao = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '—');

  /**
   * Colunas da planilha, na ordem da grade.
   * padrao: a coluna tem um valor padrão (linha "Todos") que vale para as células vazias.
   * opcoes: valores da lista suspensa do padrão; opcao(texto) converte um valor colado na opção correspondente.
   */
  const COLUNAS = [
    { id: 'item', nome: 'ITEM', curto: 'Item', ajuda: 'Número do item. Única coluna obrigatória.' },
    {
      id: 'catmat', nome: 'CATMAT', curto: 'CATMAT', rotulo: 'CATMAT',
      ajuda: 'Código do item no catálogo.',
      ler: (t) => catmat(t) || undefined,
      site: (it) => limpo(it.codigoItem) || '—',
      confere: (it, v) => catmat(it.codigoItem) === v,
    },
    {
      id: 'quantidade', nome: 'QUANTIDADE', curto: 'Qtd.', rotulo: 'Quantidade',
      ajuda: 'Quantidade total. Ex.: 300.000',
      ler: lerNumero,
      site: (it) => fmtNum(it.quantidadeItens),
      confere: (it, v) => igual(it.quantidadeItens, v, 1e-9),
    },
    {
      id: 'qtdMinima', nome: 'QUANTIDADE MÍNIMA', curto: 'Qtd. mín.', rotulo: 'Quantidade mínima',
      ajuda: 'Quantidade mínima de aquisição. Ex.: 10.000\nSe o site não informar a mínima, diverge.',
      ler: lerNumero,
      site: (it) => (valido(it.quantidadeMinimaAquisicao) ? fmtNum(it.quantidadeMinimaAquisicao) : 'não informada'),
      confere: (it, v) => igual(it.quantidadeMinimaAquisicao, v, 1e-9),
    },
    {
      id: 'valor', nome: 'VALOR', curto: 'Valor unit.', rotulo: 'Valor unitário',
      ajuda: 'Valor unitário, até 4 casas. Ex.: R$ 8,9962',
      ler: lerNumero,
      site: (it) => fmtMoeda(it.valorUnitario),
      confere: (it, v) => igual(it.valorUnitario, v, 0.00005),
    },
    {
      id: 'beneficio', nome: 'TIPO DE BENEFÍCIO', curto: 'Benefício', rotulo: 'Tipo de benefício', padrao: true,
      ajuda: 'Sem benefícios · Apenas desempate ficto · Subcontratação e Desempate Ficto · Cota Reservada e Desempate Ficto · ou o nome do benefício como aparece no site',
      opcoes: ['Sem benefícios', 'Apenas desempate ficto', 'Subcontratação e Desempate Ficto', 'Cota Reservada e Desempate Ficto'],
      opcao: opcaoBeneficio,
      ler: (t) => t,
      site: (it) => (it.tipoBeneficio && it.tipoBeneficio.nome) || '—',
      confere: beneficioConfere,
    },
    {
      id: 'criterio', nome: 'CRITÉRIO DE JULGAMENTO', curto: 'Critério', rotulo: 'Critério de julgamento', padrao: true,
      ajuda: 'Menor preço · Maior desconto',
      opcoes: ['Menor preço', 'Maior desconto'],
      opcao: (t) => {
        const n = norm(t);
        return n.startsWith('menor preco') ? 'Menor preço' : n.startsWith('maior desconto') ? 'Maior desconto' : '';
      },
      ler: (t) => t,
      site: (it) => (it.criterioJulgamento && it.criterioJulgamento.nome) || it.nomeCriterioJulgamento || '—',
      confere: criterioConfere,
    },
    {
      id: 'intervalo', nome: 'INTERVALO MÍNIMO', curto: 'Intervalo', rotulo: 'Intervalo mínimo', padrao: true,
      ajuda: 'Intervalo mínimo entre lances. Ex.: 0,5',
      opcao: (t) => t,
      ler: lerNumero,
      site: (it) => fmtNum(it.intervaloMinimo),
      confere: (it, v) => igual(it.intervaloMinimo, v, 1e-9),
    },
    {
      id: 'sigiloso', nome: 'VALOR SIGILOSO', curto: 'Sigiloso', rotulo: 'Valor sigiloso', padrao: true,
      ajuda: 'Sim · Não',
      opcoes: ['Sim', 'Não'],
      opcao: (t) => simNao(lerSimNao(t)).replace('—', ''),
      ler: lerSimNao,
      site: (it) => simNao(it.valorSigiloso),
      confere: (it, v) => it.valorSigiloso === v,
    },
  ];

  const linhaVazia = () => COLUNAS.map(() => '');
  const numeroDoItem = (t) => {
    const s = limpo(t);
    return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null;
  };

  // ---------- colagem do Excel ----------

  /** Texto copiado do Excel (tabulações, aspas em células com quebra de linha) -> matriz. */
  function lerTSV(texto) {
    const s = String(texto ?? '').replace(/\r\n?/g, '\n');
    const linhas = [];
    let linha = [];
    let cel = '';
    let aspas = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (aspas) {
        if (ch !== '"') cel += ch;
        else if (s[i + 1] === '"') cel += s[++i];
        else aspas = false;
      } else if (ch === '"' && cel === '') aspas = true;
      else if (ch === '\t') linha.push(cel), (cel = '');
      else if (ch === '\n') linha.push(cel), linhas.push(linha), (linha = []), (cel = '');
      else cel += ch;
    }
    if (cel || linha.length) linha.push(cel), linhas.push(linha);
    return linhas.map((l) => l.map((c) => c.replace(/\s+/g, ' ').trim()));
  }

  /** Qual coluna o nome do cabeçalho representa (ou null). */
  function reconhecer(n) {
    if (n.includes('sigilos')) return 'sigiloso';
    if (n.includes('benefic')) return 'beneficio';
    if (n.includes('criterio') || n.includes('julgamento')) return 'criterio';
    if (n.includes('interv') || n.includes('lance')) return 'intervalo';
    if (/minim|\bmin\b/.test(n)) return 'qtdMinima'; // antes de QUANTIDADE: "Qtd. mín." não é a quantidade total
    if (n.includes('catmat') || n.includes('catser') || /codigo|\bcod\b/.test(n)) return 'catmat';
    if (/^(quant|qtd|qtde)/.test(n)) return 'quantidade';
    if (n.includes('total')) return null; // "valor total" não é o valor unitário
    if (n.includes('valor') || n.includes('preco') || n.includes('unitari')) return 'valor';
    if (/^(item|itens)( (n|no|nº|n°|num|numero)\.?)?$/.test(n)) return 'item'; // "Item", "Itens", "Item nº"
    if (/^(n|no|nº|n°|n\.º|n\.°|num|numero)\.?( (do )?item)?$/.test(n)) return 'item'; // "Nº", "N.º", "Nº do item", "Núm. item"
    return null;
  }

  /** Se a linha for um cabeçalho com ITEM, devolve { idColuna: posição }; senão null. */
  function mapaCabecalho(celulas) {
    if (numeroDoItem(celulas[0])) return null;
    const mapa = {};
    celulas.forEach((c, i) => {
      const id = reconhecer(norm(c));
      if (id && mapa[id] === undefined) mapa[id] = i;
    });
    return mapa.item === undefined ? null : mapa;
  }

  /**
   * Cola o texto na grade. Devolve { grade, padroes }.
   *  - Com cabeçalho: substitui a grade (colunas reconhecidas pelo nome) e define o padrão de
   *    cada coluna de critério pelo primeiro valor preenchido nela.
   *  - Sem cabeçalho: cola a partir da célula (l0, c0), como no Excel; padroes = null (não mudam).
   */
  function colar(grade, texto, l0, c0) {
    const dados = lerTSV(texto);
    const mapa = dados.length ? mapaCabecalho(dados[0]) : null;
    if (mapa) {
      const nova = dados
        .slice(1)
        .map((l) => COLUNAS.map((c) => (mapa[c.id] === undefined ? '' : l[mapa[c.id]] || '')))
        .filter((l) => l.some(Boolean));
      const padroes = COLUNAS.map((c, i) => (c.padrao ? c.opcao(nova.map((l) => l[i]).find(Boolean) || '') : ''));
      return { grade: nova, padroes };
    }
    const nova = grade.map((l) => l.slice());
    dados.forEach((l, i) => {
      while (nova.length <= l0 + i) nova.push(linhaVazia());
      l.forEach((v, j) => {
        if (c0 + j < COLUNAS.length) nova[l0 + i][c0 + j] = v;
      });
    });
    return { grade: nova, padroes: null };
  }

  /**
   * Acrescenta, em ordem, uma linha (só com ITEM) para cada número do site que ainda não está na grade.
   * Devolve a nova grade, ou null se não faltar nada.
   */
  function completarItens(grade, numeros) {
    const presentes = new Set(grade.map((l) => numeroDoItem(l[0])));
    const faltam = [...new Set(numeros)].filter((n) => n > 0 && !presentes.has(n)).sort((a, b) => a - b);
    if (!faltam.length) return null;
    const nova = grade.slice();
    for (const n of faltam) {
      let i = nova.findIndex((l) => numeroDoItem(l[0]) > n);
      if (i < 0) i = nova.reduce((fim, l, j) => (l.some((c) => limpo(c)) ? j + 1 : fim), 0);
      const linha = linhaVazia();
      linha[0] = String(n);
      nova.splice(i, 0, linha);
    }
    return nova;
  }

  // ---------- listas do site ----------

  // Totais sem os quais não há como saber se o site exibiu tudo (ver juntarSite).
  const ITENS_FORA = 'itens fora de grupo';
  const GRUPOS = 'grupos';

  /**
   * Junta as listas que o site exibiu numa contratação.
   *   listas: { 'item': {itens, total}, 'grupo/{id}': {itens, total} } — última resposta de cada lista
   *           ('item' = itens fora de grupo; 'grupo/{id}' = itens de um grupo expandido).
   *   grupos: grupos recebidos da contratação ({ id, nomeGrupo, quantidadeItens }; a lista é paginada e acumula).
   *   totalGrupos: total de grupos informado pelo site (última resposta da lista de grupos).
   * Devolve { itens, total, grupos: [{ nome, exibidos, total }], totaisNaoInformados, gruposNaoListados }.
   *   total: itens fora de grupo + soma dos itens de cada grupo recebido; undefined se o site não informou
   *          o total dos itens fora de grupo (não se supõe que a lista exibida é a lista inteira).
   *   totaisNaoInformados: ['itens fora de grupo', 'grupos'], ou parte: totais que o site não informou (ou cuja lista não chegou).
   *   gruposNaoListados: { recebidos, total } se o site informou mais grupos do que os recebidos; senão null.
   */
  function juntarSite(listas, grupos, totalGrupos) {
    const porNumero = new Map();
    for (const l of Object.values(listas)) for (const it of l.itens) porNumero.set(Number(it.numeroItem), it);
    const soltos = listas.item;
    const totalSoltos = soltos && Number.isFinite(soltos.total) ? soltos.total : undefined;
    const recebidos = grupos || [];
    const resumoGrupos = recebidos.map((g) => ({
      nome: limpo(g.nomeGrupo) || `Grupo ${g.sequencialGrupo ?? g.id}`,
      exibidos: listas['grupo/' + g.id] ? listas['grupo/' + g.id].itens.length : 0,
      total: Number(g.quantidadeItens) || 0,
    }));
    const comTotalGrupos = Number.isFinite(totalGrupos);
    const totaisNaoInformados = [];
    if (totalSoltos === undefined) totaisNaoInformados.push(ITENS_FORA);
    if (!comTotalGrupos) totaisNaoInformados.push(GRUPOS);
    return {
      itens: [...porNumero.values()],
      total: totalSoltos === undefined ? undefined : totalSoltos + resumoGrupos.reduce((s, g) => s + g.total, 0),
      grupos: resumoGrupos,
      totaisNaoInformados,
      gruposNaoListados: comTotalGrupos && totalGrupos > recebidos.length ? { recebidos: recebidos.length, total: totalGrupos } : null,
    };
  }

  // ---------- análise ----------

  /**
   * Compara a grade com os itens exibidos pelo site (`site`, de juntarSite, ou null se nada chegou).
   * `padroes[i]` é o padrão da coluna i (linha "Todos"). `desativadas`: ids das colunas que o usuário
   * desativou; são ignoradas por inteiro e não deixam a conferência incompleta.
   * Devolve, por linha: estado ('vazia' | 'invalida' | 'repetida' | 'ausente' | 'ok' | 'falha' | 'neutra'),
   * as células com problema (ou não conferidas) e o texto dos problemas; e, por coluna, se é conferida.
   * A conferência é "completa" só se todas as colunas forem conferidas em todos os itens exibidos, se o site
   * exibir todos os itens da planilha, se o site tiver informado o total de itens e o de grupos, se esse total
   * (inclusive o dos grupos) estiver exibido, se todos os grupos tiverem sido listados e se nenhuma linha da
   * planilha tiver sido ignorada (número de item inválido ou repetido).
   */
  function analisar(grade, site, padroesBrutos, desativadas) {
    const itens = site && site.itens;
    const doSite = new Map((itens || []).map((it) => [Number(it.numeroItem), it]));
    const desativada = COLUNAS.map((c) => !!c.ler && !!desativadas && desativadas.has(c.id));
    const informados = COLUNAS.map((c, i) => (c.padrao && !desativada[i] ? limpo(padroesBrutos && padroesBrutos[i]) : ''));
    const padraoInvalido = COLUNAS.map((c, i) => !!informados[i] && c.ler(informados[i]) === undefined);
    // Padrão não reconhecido não vale para nenhuma célula: sem isto, a coluna contaria como conferida sem que
    // nada fosse comparado, e a conferência poderia sair "completa".
    const padroes = informados.map((p, i) => (padraoInvalido[i] ? '' : p));
    const conferida = COLUNAS.map((c, i) => !!c.ler && !desativada[i] && (!!padroes[i] || grade.some((l) => limpo(l[i]))));
    const usados = new Set();
    const linhasIgnoradas = []; // linhas da planilha que não foram conferidas: { linha (a partir de 1), motivo }

    const linhas = grade.map((l, r) => {
      const celulas = COLUNAS.map(() => null); // { estado: 'falha' | 'invalido' | 'off', dica }
      if (!l.some((c) => limpo(c))) return { estado: 'vazia', celulas, problemas: [] };

      const n = numeroDoItem(l[0]);
      if (!n) {
        const dica = limpo(l[0]) ? 'Número do item inválido.' : 'Linha sem número do item.';
        celulas[0] = { estado: 'invalido', dica: `${dica}\nLinha ignorada: não conferida.` };
        linhasIgnoradas.push({ linha: r + 1, motivo: limpo(l[0]) ? `número do item inválido: "${limpo(l[0])}"` : 'sem número do item' });
        return { estado: 'invalida', celulas, problemas: [dica] };
      }
      if (usados.has(n)) {
        celulas[0] = { estado: 'invalido', dica: 'Item repetido: vale a primeira linha.\nLinha ignorada: não conferida.' };
        linhasIgnoradas.push({ linha: r + 1, motivo: `item ${n} repetido` });
        return { estado: 'repetida', item: n, celulas, problemas: [] };
      }
      usados.add(n);

      const it = doSite.get(n);
      const problemas = [];
      let conferidas = 0;
      COLUNAS.forEach((c, i) => {
        if (!c.ler || desativada[i]) return;
        const proprio = limpo(l[i]);
        const texto = proprio || padroes[i];
        if (!texto) {
          const motivo = padraoInvalido[i] ? 'Célula vazia e padrão da linha "Todos" não reconhecido' : 'Célula vazia';
          celulas[i] = { estado: 'off', dica: `${motivo}: não conferida.` };
          return;
        }
        const v = c.ler(texto);
        if (v === undefined) {
          // só acontece com valor da própria célula: o padrão não reconhecido já foi descartado acima
          celulas[i] = { estado: 'invalido', dica: `Valor não reconhecido.\n${c.ajuda}` };
          problemas.push(`${c.rotulo}: valor "${proprio}" não reconhecido na planilha`);
          return;
        }
        if (!it) return;
        conferidas++;
        if (!c.confere(it, v)) {
          const site = c.site(it);
          celulas[i] = { estado: 'falha', dica: `Site: ${site}\nPlanilha: ${texto}` };
          problemas.push(`${c.rotulo}: site ${site}, planilha ${texto}`);
        }
      });

      const estado = !it ? 'ausente' : problemas.length ? 'falha' : conferidas ? 'ok' : 'neutra';
      return { estado, item: n, celulas, problemas, siteItem: it };
    });

    const comLinha = new Map(linhas.filter((l) => l.siteItem).map((l) => [l.item, l]));
    const ordenados = [...doSite.values()].sort((a, b) => Number(a.numeroItem) - Number(b.numeroItem));
    const conferem = []; // sem divergência no que foi conferido
    const divergem = [];
    const incompletos = []; // itens exibidos com alguma célula não conferida numa coluna conferida
    for (const it of ordenados) {
      const n = Number(it.numeroItem);
      const l = comLinha.get(n);
      if (l && l.estado === 'falha') divergem.push(l);
      else if (l && l.estado === 'ok') conferem.push(n);
      if (!l || l.celulas.some((cel, i) => conferida[i] && cel && cel.estado === 'off')) incompletos.push(n);
    }
    const colunasNaoConferidas = COLUNAS.filter((c, i) => c.ler && !conferida[i] && !desativada[i]).map((c) => c.rotulo);
    const colunasDesativadas = COLUNAS.filter((c, i) => desativada[i]).map((c) => c.rotulo);
    const padroesInvalidos = COLUNAS.filter((c, i) => padraoInvalido[i]).map((c) => c.rotulo);
    const temConferencia = usados.size > 0 && conferida.some(Boolean);
    const naoExibidos = itens ? linhas.filter((l) => l.estado === 'ausente').map((l) => l.item) : [];
    const total = site && Number.isFinite(site.total) && site.total > ordenados.length ? site.total : null; // só se faltar item
    const grupos = (site && site.grupos) || [];
    // Em geral um grupo incompleto implica total > exibidos, mas não quando o total está subestimado
    // (ex.: chegou a lista de um grupo que não está na lista de grupos); por isso entra na conta por si só.
    const gruposIncompletos = grupos.filter((g) => g.exibidos < g.total);
    // Sem o total, "exibidos = total" não pode ser verificado: o site real só o informa no cabeçalho da resposta.
    // Site que não veio de juntarSite (sem o campo) também não prova nada.
    const totaisNaoInformados = site && Array.isArray(site.totaisNaoInformados) ? site.totaisNaoInformados : [ITENS_FORA, GRUPOS];
    const gruposNaoListados = (site && site.gruposNaoListados) || null; // a lista de grupos também é paginada
    const completa =
      !colunasNaoConferidas.length && !incompletos.length && !naoExibidos.length && !total &&
      !totaisNaoInformados.length && !gruposNaoListados && !gruposIncompletos.length && !linhasIgnoradas.length;
    return {
      linhas, padroes, padraoInvalido, padroesInvalidos, conferida, desativada, itens: ordenados, temConferencia,
      conferem, divergem, incompletos, colunasNaoConferidas, colunasDesativadas, naoExibidos, linhasIgnoradas,
      total, totaisNaoInformados, gruposNaoListados, completa, temGrupos: grupos.length > 0 || !!gruposNaoListados,
      gruposIncompletos,
    };
  }

  /** "GRUPO 1 (0 de 7), GRUPO 2 (3 de 6)" */
  const textoGrupos = (gs) => gs.map((g) => `${g.nome} (${g.exibidos} de ${g.total})`).join(', ');

  /** "itens fora de grupo e de grupos" (para "o site não informou o total de …") */
  const textoTotais = (ts) => ts.join(' e de ');

  /** 'linha 3 (número do item inválido: "3A"), linha 7 (item 2 repetido)' */
  const textoIgnoradas = (ls) => ls.map((l) => `linha ${l.linha} (${l.motivo})`).join(', ');

  /** Relatório em texto para colar no processo. */
  function relatorio(a, id) {
    const out = [`Verificação de itens - contratação id ${id}`, `Itens exibidos pelo site: ${a.itens.length}${a.total ? ` de ${a.total}` : ''}`];
    for (const l of a.divergem) {
      const it = l.siteItem;
      const nome = limpo(it.nomeItem);
      out.push(`Item ${it.numeroItem}${nome ? ` - ${nome}` : ''} (CATMAT ${limpo(it.codigoItem) || '—'}):`);
      for (const p of l.problemas) out.push(`   - ${p}`);
    }
    out.push('-'.repeat(50));
    out.push(`${a.completa ? 'Conferem' : 'Sem divergência no que foi conferido'}: ${a.conferem.length} | Divergem: ${a.divergem.length}`);
    if (a.colunasDesativadas.length) out.push(`Colunas desativadas (não verificadas): ${a.colunasDesativadas.join(', ')}`);
    if (!a.completa) {
      out.push('ATENÇÃO: CONFERÊNCIA INCOMPLETA');
      if (a.totaisNaoInformados.length) out.push(`   - O site não informou o total de ${textoTotais(a.totaisNaoInformados)} (não dá para saber se todos os itens estão exibidos)`);
      if (a.total) out.push(`   - O site exibiu só ${a.itens.length} de ${a.total} itens`);
      if (a.gruposNaoListados) out.push(`   - O site listou só ${a.gruposNaoListados.recebidos} de ${a.gruposNaoListados.total} grupos`);
      if (a.gruposIncompletos.length) out.push(`   - Grupos não exibidos por completo: ${textoGrupos(a.gruposIncompletos)}`);
      if (a.naoExibidos.length) out.push(`   - Itens da planilha não exibidos pelo site (não conferidos): ${faixas(a.naoExibidos)}`);
      if (a.linhasIgnoradas.length) out.push(`   - Linhas da planilha ignoradas (não conferidas): ${textoIgnoradas(a.linhasIgnoradas)}`);
      if (a.colunasNaoConferidas.length) out.push(`   - Colunas não conferidas: ${a.colunasNaoConferidas.join(', ')}`);
      if (a.padroesInvalidos.length) out.push(`   - Padrão não reconhecido na linha "Todos": ${a.padroesInvalidos.join(', ')}`);
      if (a.incompletos.length) out.push(`   - Itens com células não conferidas: ${faixas(a.incompletos)}`);
    }
    return out.join('\n');
  }

  /** [1,2,3,5,7,8] -> "1–3, 5, 7–8" */
  function faixas(nums) {
    const ns = [...new Set(nums)].sort((a, b) => a - b);
    const partes = [];
    for (let i = 0; i < ns.length; i++) {
      let j = i;
      while (ns[j + 1] === ns[j] + 1) j++;
      partes.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
      i = j;
    }
    return partes.join(', ');
  }

  const api = { COLUNAS, linhaVazia, numeroBR, lerTSV, colar, completarItens, juntarSite, analisar, relatorio, faixas, textoGrupos, textoIgnoradas, textoTotais };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VerificadorItens = api;
})(globalThis);
