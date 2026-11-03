// Última importação fica registrada (junto dos dados, então sincroniza) para
// o "Desfazer última importação" reverter com precisão.
const registrarUndoImportacao = (log) => {
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  allData.__app.ultimaImportacao = { quando: dayjs().toISOString(), ...log };
};

// Mesmo cartão em meses diferentes: nome + categoria + pessoa (ex.: "Nubank" do Gabriel)
const cardKey = (e) => `${String(e?.description || '').trim().toLowerCase()}|${e?.category || ''}|${e?.person || ''}`;

const findEntryAnyMonth = (id) => {
  for (const k of Object.keys(allData)) {
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    const e = (allData[k] || []).find((x) => x && x.id === id);
    if (e) return e;
  }
  return null;
};

// Destinos da fatura no diálogo de importação, em dois passos: primeiro DE QUEM é o
// cartão (categoria: Cartão de crédito Gabriel, Babi…), depois QUAL cartão dessa pessoa
// (Nubank, Santander, Bradesco…): os já lançados no mês escolhido, os de outros meses
// (criados no mês ao importar; os mais próximos primeiro) e "novo cartão".
// Sem categoria informada, escolhe a melhor no geral: a última escolha lembrada para o
// banco do arquivo, depois um cartão com o nome do banco, depois o primeiro do mês.
const opcoesCartaoImportacao = (mes, nomeCartao, cardCats, categoria = '') => {
  const noMes = (allData[mes] || []).filter((e) => e && isCreditCardEntry(e));
  const vistos = new Set(noMes.map(cardKey));
  const distancia = (k) => Math.abs((Number(k.slice(0, 4)) * 12 + Number(k.slice(5, 7))) - (Number(String(mes).slice(0, 4)) * 12 + Number(String(mes).slice(5, 7))));
  const deOutrosMeses = [];
  Object.keys(allData)
    .filter((k) => /^\d{4}-\d{2}$/.test(k) && k !== mes)
    .sort((a, b) => distancia(a) - distancia(b) || b.localeCompare(a))
    .forEach((k) => (allData[k] || []).forEach((e) => {
      if (!e || !isCreditCardEntry(e) || vistos.has(cardKey(e))) return;
      vistos.add(cardKey(e));
      deOutrosMeses.push(e);
    }));
  const todas = [
    ...noMes.map((e) => ({ value: `entry:${e.id}`, grupo: 'mes', categoria: e.category, nome: e.description, chave: cardKey(e), label: `${e.description} — ${formatCurrency(Number(e.value) || 0)}` })),
    ...deOutrosMeses.map((e) => ({ value: `modelo:${e.id}`, grupo: 'outros', categoria: e.category, nome: e.description, chave: cardKey(e), label: `${e.description} (criar neste mês)` })),
    ...cardCats.map((c) => ({ value: `novo:${c}`, grupo: 'novo', categoria: c, nome: '', label: `Novo cartão “${nomeCartao}”` }))
  ];
  const opcoes = categoria ? todas.filter((o) => o.categoria === categoria) : todas;

  const banco = String(nomeCartao || '').trim().toLowerCase();
  const combina = (o) => Boolean(banco) && banco !== 'cartão' && Boolean(o.nome) && o.nome.toLowerCase().includes(banco);
  const preferido = banco ? allData.__app?.importCartaoPreferido?.[banco] : '';
  const escolhida = (preferido && (opcoes.find((o) => o.grupo === 'mes' && o.chave === preferido) || opcoes.find((o) => o.grupo === 'outros' && o.chave === preferido)))
    || opcoes.find((o) => o.grupo === 'mes' && combina(o))
    || opcoes.find((o) => o.grupo === 'outros' && combina(o))
    || opcoes.find((o) => o.grupo === 'mes')
    || opcoes.find((o) => o.grupo === 'outros')
    || opcoes[0];
  return {
    opcoes,
    selecionado: escolhida ? escolhida.value : '',
    categoria: categoria || (escolhida ? escolhida.categoria : (cardCats[0] || ''))
  };
};

// Mesmo banco, mais de um cartão (ex.: Nubank do Gabriel e da Babi): o arquivo não diz
// de quem é. A última escolha para cada banco fica guardada e vem marcada da próxima vez.
const lembrarCartaoDoBanco = (nomeCartao, entry) => {
  const banco = String(nomeCartao || '').trim().toLowerCase();
  if (!banco || banco === 'cartão' || !entry) return;
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  allData.__app.importCartaoPreferido = { ...(allData.__app.importCartaoPreferido || {}), [banco]: cardKey(entry) };
};

// 1º select: de quem é o cartão, com quantos cartões a pessoa tem no mês
const categoriasCartaoHtml = (cardCats, selecionada, mes) => cardCats.map((c) => {
  const n = (allData[mes] || []).filter((e) => e && isCreditCardEntry(e) && e.category === c).length;
  const extra = n ? ` (${n} ${n === 1 ? 'cartão' : 'cartões'} no mês)` : '';
  return `<option value="${escapeAttr(c)}"${c === selecionada ? ' selected' : ''}>${escapeHtml(c)}${extra}</option>`;
}).join('');

// 2º select: os cartões da pessoa escolhida
const opcoesCartaoHtml = ({ opcoes, selecionado }, mes) => {
  const nomeMes = /^\d{4}-\d{2}$/.test(mes) ? dayjs(`${mes}-01`).format('MMMM [de] YYYY') : 'este mês';
  const grupo = (g, titulo) => {
    const itens = opcoes.filter((o) => o.grupo === g);
    return itens.length
      ? `<optgroup label="${escapeAttr(titulo)}">${itens.map((o) => `<option value="${escapeAttr(o.value)}"${o.value === selecionado ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</optgroup>`
      : '';
  };
  return grupo('mes', `Lançados em ${nomeMes}`) + grupo('outros', 'Usados em outros meses') + grupo('novo', 'Criar outro');
};

// Na fatura, o que tem o sinal contrário ao das compras é crédito. "Pagamento recebido"
// (pagamento da fatura) é ignorado. Estorno cancela a compra estornada do mesmo arquivo
// (as duas não entram); estorno sem a compra no arquivo (compra de outra fatura) vira
// item negativo e abate do total — igual ao total que o banco cobra.
const ehPagamentoFatura = (t) => /\bpagamento\b|\bpgto\b|pag\.?\s*fatura|\bpayment\b/i.test(String(t.desc || ''));

const chaveEstorno = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9*]+/g, ' ').trim();

// Nubank: Estorno de "99food *Arcos Dourados" (99 Food) → 99food *Arcos Dourados
const nomeDoEstorno = (desc) => {
  const s = String(desc || '');
  const aspas = s.match(/"([^"]+)"/);
  if (aspas) return aspas[1];
  return s.replace(/^\s*(estorno|reembolso|cancelamento|devolu[cç][aã]o)\s*(de|do|da)?\s*/i, '').trim();
};

const separarEstornosFatura = (txs, ehGasto) => {
  const gastos = txs.filter(ehGasto);
  const creditos = txs.filter((t) => !ehGasto(t));
  const pagamentos = creditos.filter(ehPagamentoFatura).length;
  const usados = new Set();
  const cancelados = [];
  const estornosAvulsos = [];
  const centavos = (v) => Math.round(Math.abs(Number(v) || 0) * 100);

  creditos.filter((t) => !ehPagamentoFatura(t)).forEach((estorno) => {
    const nome = chaveEstorno(nomeDoEstorno(estorno.desc));
    const valor = centavos(estorno.amount);
    const mesmoValor = gastos.filter((g) => !usados.has(g) && centavos(g.amount) === valor);
    const pelaDescricao = mesmoValor.find((g) => {
      const c = chaveEstorno(g.desc);
      return nome && c && (c.includes(nome) || nome.includes(c));
    });
    const pelaData = mesmoValor.filter((g) => g.date === estorno.date);
    const compra = pelaDescricao || (pelaData.length === 1 ? pelaData[0] : null);
    if (compra) {
      usados.add(compra);
      cancelados.push({ compra, estorno });
    } else {
      estornosAvulsos.push(estorno);
    }
  });

  return { gastos: gastos.filter((g) => !usados.has(g)), cancelados, estornosAvulsos, pagamentos };
};

// Fatura importada vira itens DENTRO do lançamento do cartão (o mesmo painel
// com drag & drop), em vez de dezenas de despesas soltas no mês. "alvo" é a opção
// escolhida no diálogo: entry:<id> (cartão do mês), modelo:<id> (cartão de outro mês,
// criado neste) ou novo:<categoria>.
const importFaturaAsCardItems = (txs, { mes, alvo }, { dueDay, nomeCartao }) => {
  const ehGasto = makeCardExpenseTest(txs);
  const { gastos, cancelados, estornosAvulsos, pagamentos } = separarEstornosFatura(txs, ehGasto);
  if (!gastos.length && !estornosAvulsos.length) {
    notify.info(cancelados.length ? 'Todas as compras do arquivo foram estornadas — nada a importar.' : 'O arquivo só tinha pagamentos — nada a importar.');
    return;
  }

  const lista = [...(allData[mes] || [])];
  const antesLista = allData[mes] || [];
  const [tipoAlvo, ...resto] = String(alvo || '').split(':');
  const valorAlvo = resto.join(':');
  let modelo = null;
  let categoria = catPapel('cartao');
  let index = -1;
  if (tipoAlvo === 'entry') {
    index = lista.findIndex((e) => e.id === valorAlvo && isCreditCardEntry(e));
    if (index === -1) { notify.error('Esse cartão não está mais neste mês. Abra a importação de novo.'); return; }
  } else {
    if (tipoAlvo === 'modelo') {
      modelo = findEntryAnyMonth(valorAlvo);
      if (!modelo) { notify.error('Não achei esse cartão. Abra a importação de novo.'); return; }
      categoria = modelo.category;
    } else if (tipoAlvo === 'novo' && valorAlvo) {
      categoria = valorAlvo;
    }
    // Já existe um cartão igual no mês? Usa ele em vez de criar outro
    const chave = cardKey(modelo || { description: nomeCartao, category: categoria, person: personFromCardCategory(categoria) || '' });
    index = lista.findIndex((e) => isCreditCardEntry(e) && cardKey(e) === chave);
  }
  const entryCriada = index === -1;
  const valorAnterior = entryCriada ? 0 : Number(lista[index].value) || 0;
  let entry;
  if (index === -1) {
    entry = {
      id: generateId(),
      description: modelo ? modelo.description : nomeCartao,
      category: categoria,
      type: 'despesa',
      person: modelo ? (modelo.person || '') : (personFromCardCategory(categoria) || ''),
      value: 0,
      status: 'nao_pago',
      due_day: dueDay || (modelo && modelo.due_day) || null,
      observation: '',
      card_items: []
    };
    lista.push(entry);
    index = lista.length - 1;
  } else {
    entry = { ...lista[index], card_items: [...(lista[index].card_items ?? [])] };
    lista[index] = entry;
  }

  let items = entry.card_items;
  // O item-base "Cartão" sozinho é só um placeholder do total: sai quando entram itens reais
  let defaultRemovido = null;
  if (items.length === 1 && isDefaultCardItem(items[0])) {
    defaultRemovido = items[0];
    items = [];
  }

  const fitids = new Set();
  const chavesComData = new Set(); // itens de importações anteriores (guardam txdate)
  const chavesManuais = new Set(); // itens digitados à mão (sem txdate)
  const itemPorChave = new Map(); // chave com data → item importado antes (para estorno)
  items.forEach((i) => {
    if (i.fitid) fitids.add(i.fitid);
    const base = `${String(i.description).toLowerCase()}|${(Number(i.value) || 0).toFixed(2)}`;
    if (i.txdate) {
      chavesComData.add(`${i.txdate}|${base}`);
      itemPorChave.set(`${i.txdate}|${base}`, i);
    } else chavesManuais.add(base);
    if (i.fitid) itemPorChave.set(`fitid:${i.fitid}`, i);
  });

  // Compra estornada que já tinha entrado numa importação anterior sai da fatura
  const removidosPorEstorno = [];
  cancelados.forEach(({ compra }) => {
    const description = normalizeBankDesc(compra.desc) || String(compra.desc).trim();
    const base = `${description.toLowerCase()}|${Math.abs(compra.amount).toFixed(2)}`;
    const antigo = (compra.fitid && itemPorChave.get(`fitid:${compra.fitid}`)) || itemPorChave.get(`${compra.date}|${base}`);
    if (antigo && !antigo.recurring) removidosPorEstorno.push(antigo);
  });
  if (removidosPorEstorno.length) {
    const fora = new Set(removidosPorEstorno.map((i) => i.id));
    items = items.filter((i) => !fora.has(i.id));
  }

  // Recorrentes: a compra importada ATUALIZA o recorrente que já está na fatura (ex.:
  // veio pelo "Copiar mês"), em vez de duplicar; se ele tinha sido limpo, volta marcado
  // como recorrente. Conhecidos: os desta fatura, os lembrados ao limpar e os do mesmo
  // cartão em outros meses.
  const recorrentesNaFatura = new Map();
  items.forEach((i) => {
    if (i.recurring !== true || isDefaultCardItem(i)) return;
    const c = chaveItemRecorrente(i.description);
    if (c && !recorrentesNaFatura.has(c)) recorrentesNaFatura.set(c, i);
  });
  const chavesRecorrentes = new Set([...recorrentesNaFatura.keys(), ...(Array.isArray(entry.recorrentesLembrados) ? entry.recorrentesLembrados : [])]);
  const chaveCartao = cardKey(entry);
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k) && k !== mes).forEach((k) => (allData[k] || []).forEach((e) => {
    if (!e || !isCreditCardEntry(e) || cardKey(e) !== chaveCartao) return;
    (e.card_items || []).forEach((i) => { if (i.recurring === true) chavesRecorrentes.add(chaveItemRecorrente(i.description)); });
  }));
  chavesRecorrentes.delete('');
  const mesclados = [];
  let marcadosRecorrentes = 0;

  let importados = 0;
  let pulados = 0;
  const itemIdsNovos = [];
  gastos.forEach((t) => {
    const description = normalizeBankDesc(t.desc) || String(t.desc).trim();
    const value = Math.abs(t.amount);
    const base = `${description.toLowerCase()}|${value.toFixed(2)}`;
    const comData = `${t.date}|${base}`;
    if ((t.fitid && fitids.has(t.fitid)) || chavesComData.has(comData) || chavesManuais.has(base)) {
      pulados++;
      return;
    }
    chavesComData.add(comData);
    if (t.fitid) fitids.add(t.fitid);

    const chaveRec = chaveItemRecorrente(description);
    const existente = chaveRec ? recorrentesNaFatura.get(chaveRec) : null;
    if (existente) {
      // Clona antes de mexer: nunca altera o item vivo antes do diff do histórico
      recorrentesNaFatura.delete(chaveRec);
      mesclados.push(cloneDados(existente));
      const atualizado = { ...cloneDados(existente), value, txdate: t.date, ...(t.fitid ? { fitid: t.fitid } : {}) };
      items = items.map((i) => (i.id === existente.id ? atualizado : i));
      return;
    }
    const recurring = Boolean(chaveRec) && chavesRecorrentes.has(chaveRec);
    if (recurring) marcadosRecorrentes++;
    const item = {
      id: generateId(), description, value, recurring, txdate: t.date,
      ...(t.fitid ? { fitid: t.fitid } : {})
    };
    items.push(item);
    itemIdsNovos.push(item.id);
    importados++;
  });

  let estornosLancados = 0;
  estornosAvulsos.forEach((t) => {
    const description = `Estorno · ${normalizeBankDesc(nomeDoEstorno(t.desc)) || String(t.desc).trim()}`;
    const value = -Math.abs(t.amount);
    const base = `${description.toLowerCase()}|${value.toFixed(2)}`;
    const comData = `${t.date}|${base}`;
    if ((t.fitid && fitids.has(t.fitid)) || chavesComData.has(comData) || chavesManuais.has(base)) {
      pulados++;
      return;
    }
    chavesComData.add(comData);
    if (t.fitid) fitids.add(t.fitid);
    const item = {
      id: generateId(), description, value, recurring: false, txdate: t.date, estorno: true,
      ...(t.fitid ? { fitid: t.fitid } : {})
    };
    items.push(item);
    itemIdsNovos.push(item.id);
    estornosLancados++;
  });

  if (!importados && !estornosLancados && !removidosPorEstorno.length && !mesclados.length) {
    notify.info(pulados ? 'Tudo já estava na fatura — nenhum item novo.' : 'Nenhum item válido.');
    return;
  }

  entry.card_items = items;
  entry.value = sumCardItems(items);
  allData[mes] = lista.map(normalizeEntry);
  registrarHistoricoMes(mes, antesLista, allData[mes], `importou fatura do banco (${importados} itens em “${entry.description}”${cancelados.length ? `, ${cancelados.length} compra(s) estornada(s) fora` : ''})`);
  expandedCardEntries.add(entry.id);
  registrarUndoImportacao({
    tipo: 'cartao', mes, entryId: entry.id, entryCriada,
    itemIds: itemIdsNovos, valorAnterior, defaultRemovido,
    ...(removidosPorEstorno.length ? { removidosPorEstorno: cloneDados(removidosPorEstorno) } : {}),
    ...(mesclados.length ? { recorrentesAntes: mesclados } : {})
  });
  lembrarCartaoDoBanco(nomeCartao, entry);
  saveData();

  if (mes !== getMonthKey(currentDate)) {
    currentDate = dayjs(`${mes}-01`);
    syncSelectors();
  }
  render();
  const nomeMes = dayjs(`${mes}-01`).format('MMMM [de] YYYY');
  const estornados = cancelados.map(({ compra }) => `${normalizeBankDesc(compra.desc) || compra.desc} ${formatCurrency(Math.abs(compra.amount))}`).join(', ');
  notify.success(`${importados} item(ns) na fatura de ${nomeMes}`
    + (cancelados.length ? ` · ${cancelados.length} compra(s) estornada(s) não entraram (${estornados})` : '')
    + (removidosPorEstorno.length ? ` · ${removidosPorEstorno.length} já importada(s) saíram por estorno` : '')
    + (mesclados.length ? ` · ${mesclados.length} recorrente(s) atualizado(s)` : '')
    + (marcadosRecorrentes ? ` · ${marcadosRecorrentes} marcado(s) como recorrente` : '')
    + (estornosLancados ? ` · ${estornosLancados} estorno(s) abatido(s) do total` : '')
    + (pulados ? ` · ${pulados} já existia(m)` : '')
    + (pagamentos ? ` · ${pagamentos} pagamento(s) da fatura ignorado(s)` : ''));
};

const importBankStatement = async (file) => {
  const { txs, formato, hint, fim, org } = await parseBankFile(file);
  if (!txs.length) {
    notify.error('Nenhuma transação encontrada. Exporte o extrato em OFX, CSV ou QIF.');
    return;
  }

  // Modo sugerido: assinatura do arquivo (cabeçalho Nubank, OFX de cartão) tem
  // prioridade; senão, fatura costuma ser quase toda de um sinal só
  const positivas = txs.filter((t) => t.amount >= 0).length;
  const dominancia = Math.max(positivas, txs.length - positivas) / txs.length;
  const sugestao = hint ?? (dominancia >= 0.8 ? 'cartao' : 'conta');

  const porMes = {};
  txs.forEach((t) => { const k = t.date.slice(0, 7); porMes[k] = (porMes[k] || 0) + 1; });
  const resumoMeses = Object.keys(porMes).sort().map((k) =>
    `<li>${dayjs(`${k}-01`).format('MMMM [de] YYYY')}: <strong>${porMes[k]}</strong> transação(ões)</li>`).join('');

  // Nubank exporta como "Nubank_2026-09-10": a data no nome é o vencimento da fatura
  const nomeData = file.name.match(/(\d{4})-(\d{2})-(\d{2})/);
  const mesFaturaDefault = (nomeData ? `${nomeData[1]}-${nomeData[2]}` : null)
    || fim || Object.keys(porMes).sort().pop();
  const diaVencimento = nomeData ? +nomeData[3] : null;
  const cardCats = [catPapel('cartaoGabriel'), catPapel('cartaoBabi'), catPapel('cartao')].filter((c) => CATEGORIAS.includes(c));
  const nomeCartao = bankIssuerName(org, file.name);
  // Pessoa/cartão iniciais: melhor escolha no geral (banco do arquivo, última escolha)
  const donoInicial = opcoesCartaoImportacao(mesFaturaDefault, nomeCartao, cardCats).categoria;
  const opcoesIniciais = opcoesCartaoImportacao(mesFaturaDefault, nomeCartao, cardCats, donoInicial);

  const { value: escolha, isConfirmed } = await Swal.fire({
    title: `Importar ${formato}?`,
    html: `<div style="text-align:left;font-size:.92rem">
      <p class="mb-1"><strong>${txs.length}</strong> transação(ões) encontradas:</p>
      <ul style="padding-left:1.2rem;margin-bottom:.7rem">${resumoMeses}</ul>
      <label style="display:block;margin:.3rem 0;cursor:pointer">
        <input type="radio" name="bankMode" value="cartao"${sugestao === 'cartao' ? ' checked' : ''}>
        <strong>Fatura de cartão</strong> — vira itens dentro do lançamento do cartão
      </label>
      <div id="bankCardOpts" style="margin:.2rem 0 .55rem 1.45rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">
        <label style="margin:0">Mês da fatura <input type="month" id="bankCardMes" value="${mesFaturaDefault}" style="padding:.2rem .3rem"></label>
        <label style="margin:0;display:flex;flex-direction:column;gap:.2rem;flex:1 1 100%">De quem é o cartão
          <select id="bankCardDono" class="fm-input" style="max-width:100%">${categoriasCartaoHtml(cardCats, donoInicial, mesFaturaDefault)}</select>
        </label>
        <label style="margin:0;display:flex;flex-direction:column;gap:.2rem;flex:1 1 100%">Qual cartão${nomeCartao && nomeCartao !== 'Cartão' ? ` <small style="color:#888">(arquivo do ${escapeHtml(nomeCartao)})</small>` : ''}
          <select id="bankCardAlvo" class="fm-input" style="max-width:100%">${opcoesCartaoHtml(opcoesIniciais, mesFaturaDefault)}</select>
        </label>
      </div>
      <label style="display:block;margin:.3rem 0;cursor:pointer">
        <input type="radio" name="bankMode" value="conta"${sugestao === 'conta' ? ' checked' : ''}>
        <strong>Extrato de conta</strong> — cada transação vira um lançamento no mês da própria data
      </label>
      <p class="mb-0" style="font-size:.85rem;color:#888">Duplicados são pulados — pode importar OFX e CSV do mesmo período.</p>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Importar',
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      const popup = Swal.getPopup();
      const opts = popup.querySelector('#bankCardOpts');
      const sync = () => {
        const modo = popup.querySelector('input[name="bankMode"]:checked')?.value;
        opts.style.opacity = modo === 'cartao' ? '1' : '.45';
      };
      popup.querySelectorAll('input[name="bankMode"]').forEach((r) => r.addEventListener('change', sync));
      // Trocou o mês ou a pessoa: lista os cartões daquela pessoa naquele mês
      const mesInput = popup.querySelector('#bankCardMes');
      const donoSelect = popup.querySelector('#bankCardDono');
      const alvoSelect = popup.querySelector('#bankCardAlvo');
      const atualizarCartoes = () => {
        const m = mesInput.value;
        const dono = donoSelect.value;
        donoSelect.innerHTML = categoriasCartaoHtml(cardCats, dono, m);
        alvoSelect.innerHTML = opcoesCartaoHtml(opcoesCartaoImportacao(m, nomeCartao, cardCats, dono), m);
      };
      mesInput.addEventListener('change', atualizarCartoes);
      donoSelect.addEventListener('change', atualizarCartoes);
      sync();
    },
    preConfirm: () => {
      const popup = Swal.getPopup();
      const tipo = popup.querySelector('input[name="bankMode"]:checked')?.value;
      if (!tipo) { Swal.showValidationMessage('Escolha o tipo do arquivo.'); return false; }
      if (tipo === 'conta') return { tipo };
      const mes = popup.querySelector('#bankCardMes').value;
      const alvo = popup.querySelector('#bankCardAlvo').value;
      if (!/^\d{4}-\d{2}$/.test(mes)) { Swal.showValidationMessage('Informe o mês da fatura.'); return false; }
      if (!alvo) { Swal.showValidationMessage('Escolha o cartão.'); return false; }
      return { tipo, mes, alvo };
    }
  });
  if (!isConfirmed || !escolha) return;

  if (escolha.tipo === 'cartao') {
    importFaturaAsCardItems(txs, escolha, { dueDay: diaVencimento, nomeCartao });
    return;
  }

  // ---- Extrato de conta: cada transação vira um lançamento ----
  const fitids = new Set();
  const chavesComDia = new Set(); // lançamentos com dia conhecido (importados antes)
  const chavesSemDia = new Set(); // lançamentos manuais sem due_day
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    (allData[k] || []).forEach((e) => {
      if (e.fitid) fitids.add(e.fitid);
      const base = `${k}|${String(e.description).toLowerCase()}|${(Number(e.value) || 0).toFixed(2)}|${e.type}`;
      if (e.due_day) chavesComDia.add(`${e.due_day}|${base}`);
      else chavesSemDia.add(base);
    });
  });

  let importados = 0;
  let pulados = 0;
  const mesesTocados = new Set();
  const entradasNovas = [];
  const antesPorMes = {};

  txs.forEach((t) => {
    const value = Math.abs(t.amount);
    let type = t.amount < 0 ? 'despesa' : 'entrada';

    const description = normalizeBankDesc(t.desc);
    let category = guessBankCategory(`${t.desc} ${description}`);
    // Só vira investimento quando o dinheiro SAI (aplicação); resgate é entrada normal
    if (category === catPapel('investimentos') && t.amount < 0) type = 'investimento';
    if (type === 'investimento') category = catPapel('investimentos');
    else if (type === 'entrada') category = catPapel('outros');

    const mes = t.date.slice(0, 7);
    const dia = Number(t.date.slice(8, 10)) || null;
    const base = `${mes}|${description.toLowerCase()}|${value.toFixed(2)}|${type}`;
    if ((t.fitid && fitids.has(t.fitid)) || chavesComDia.has(`${dia}|${base}`) || chavesSemDia.has(base)) {
      pulados++;
      return;
    }
    chavesComDia.add(`${dia}|${base}`);
    if (t.fitid) fitids.add(t.fitid);

    const entry = normalizeEntry({
      id: generateId(),
      description,
      category,
      type,
      person: '',
      value,
      status: 'pago',
      due_day: dia,
      observation: '',
      card_items: [],
      ...(t.fitid ? { fitid: t.fitid } : {})
    });

    if (!antesPorMes[mes]) antesPorMes[mes] = [...(allData[mes] || [])];
    if (!allData[mes]) allData[mes] = [];
    allData[mes].push(entry);
    entradasNovas.push({ mes, id: entry.id });
    mesesTocados.add(mes);
    importados++;
  });

  if (!importados) {
    notify.info(pulados ? 'Tudo já estava importado — nenhum lançamento novo.' : 'Nenhum lançamento válido.');
    return;
  }

  Object.keys(antesPorMes).forEach((m) => registrarHistoricoMes(m, antesPorMes[m], allData[m], `importou extrato do banco (${entradasNovas.filter((x) => x.mes === m).length} lançamentos)`));
  registrarUndoImportacao({ tipo: 'conta', entradas: entradasNovas });
  saveData();

  // Mostra o mês mais recente entre os importados
  const destino = [...mesesTocados].sort().pop();
  if (destino && destino !== getMonthKey(currentDate)) {
    currentDate = dayjs(`${destino}-01`);
    syncSelectors();
  }
  render();
  notify.success(`${importados} lançamento(s) importado(s)${pulados ? ` · ${pulados} duplicado(s)/pulado(s)` : ''}!`);
};

// Desfaz a última importação registrada; sem registro (importação feita numa
// versão anterior), remove pelo rastro: lançamentos com fitid e itens com txdate.
const desfazerUltimaImportacao = async () => {
  const log = allData.__app?.ultimaImportacao;

  if (log?.tipo === 'cartao') {
    const lista = [...(allData[log.mes] || [])];
    const idx = lista.findIndex((e) => e.id === log.entryId);
    if (idx === -1) {
      delete allData.__app.ultimaImportacao;
      saveData();
      notify.error('O lançamento daquela fatura não existe mais — nada a desfazer.');
      return;
    }
    const alvo = lista[idx];
    const nomeMes = dayjs(`${log.mes}-01`).format('MMMM [de] YYYY');
    const ok = await confirmAction({
      title: 'Desfazer importação?',
      text: log.entryCriada
        ? `O lançamento "${alvo.description}" (${nomeMes}) criado pela importação será excluído com seus itens.`
        : `${log.itemIds.length} item(ns) importado(s) saem da fatura "${alvo.description}" (${nomeMes}); o que era manual fica.`,
      icon: 'warning',
      confirmText: 'Sim, desfazer'
    });
    if (!ok) return;

    if (log.entryCriada) {
      lista.splice(idx, 1);
    } else {
      const ids = new Set(log.itemIds);
      let items = (alvo.card_items ?? []).filter((i) => !ids.has(i.id));
      if (Array.isArray(log.removidosPorEstorno)) items = [...items, ...log.removidosPorEstorno];
      // recorrentes que a importação atualizou voltam ao valor/data de antes
      if (Array.isArray(log.recorrentesAntes)) {
        const antes = new Map(log.recorrentesAntes.map((i) => [i.id, i]));
        items = items.map((i) => antes.get(i.id) || i);
      }
      if (log.defaultRemovido) items = [log.defaultRemovido, ...items];
      const value = (items.length === 1 && isDefaultCardItem(items[0]))
        ? (Number(log.valorAnterior) || 0)
        : sumCardItems(items);
      lista[idx] = { ...alvo, card_items: items, value };
    }
    const antesFatura = allData[log.mes] || [];
    allData[log.mes] = lista.map(normalizeEntry);
    registrarHistoricoMes(log.mes, antesFatura, allData[log.mes], 'desfez importação de fatura');
    delete allData.__app.ultimaImportacao;
    saveData();
    render();
    notify.success('Importação desfeita.');
    return;
  }

  if (log?.tipo === 'conta') {
    const ok = await confirmAction({
      title: 'Desfazer importação?',
      text: `${log.entradas.length} lançamento(s) importado(s) do extrato serão excluídos.`,
      icon: 'warning',
      confirmText: 'Sim, desfazer'
    });
    if (!ok) return;
    const porMes = {};
    log.entradas.forEach(({ mes, id }) => { (porMes[mes] = porMes[mes] || new Set()).add(id); });
    Object.entries(porMes).forEach(([mes, ids]) => {
      const antesMes = allData[mes] || [];
      allData[mes] = antesMes.filter((e) => !ids.has(e.id)).map(normalizeEntry);
      registrarHistoricoMes(mes, antesMes, allData[mes], 'desfez importação de extrato');
    });
    delete allData.__app.ultimaImportacao;
    saveData();
    render();
    notify.success('Importação desfeita.');
    return;
  }

  // ---- Sem registro: remove pelo rastro dos marcadores ----
  const entradas = [];
  const faturas = [];
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    (allData[k] || []).forEach((e) => {
      if (e.fitid) { entradas.push({ mes: k, id: e.id }); return; }
      const marcados = (e.card_items ?? []).filter((i) => i.txdate || i.fitid);
      if (marcados.length) {
        faturas.push({
          mes: k, id: e.id, desc: e.description, qtd: marcados.length,
          soImportados: marcados.length === (e.card_items ?? []).length
        });
      }
    });
  });

  if (!entradas.length && !faturas.length) {
    notify.info('Nenhuma importação de banco encontrada para desfazer.');
    return;
  }

  const resumo = [
    ...faturas.map((f) => `${f.soImportados ? 'excluir o lançamento' : `remover ${f.qtd} item(ns) importado(s) de`} "${f.desc}" (${dayjs(`${f.mes}-01`).format('MMM/YYYY')})`),
    ...(entradas.length ? [`excluir ${entradas.length} lançamento(s) importado(s) de extrato`] : [])
  ].join('; ');
  const ok = await confirmAction({
    title: 'Remover tudo que veio do banco?',
    text: `Vai ${resumo}. Itens e lançamentos manuais ficam.`,
    icon: 'warning',
    confirmText: 'Sim, remover'
  });
  if (!ok) return;

  const entradasPorMes = {};
  entradas.forEach(({ mes, id }) => { (entradasPorMes[mes] = entradasPorMes[mes] || new Set()).add(id); });
  const faturasPorMes = {};
  faturas.forEach((f) => { (faturasPorMes[f.mes] = faturasPorMes[f.mes] || []).push(f); });

  new Set([...Object.keys(entradasPorMes), ...Object.keys(faturasPorMes)]).forEach((mes) => {
    let lista = allData[mes] || [];
    const idsEntradas = entradasPorMes[mes];
    if (idsEntradas) lista = lista.filter((e) => !idsEntradas.has(e.id));
    (faturasPorMes[mes] || []).forEach((f) => {
      if (f.soImportados) {
        lista = lista.filter((e) => e.id !== f.id);
        return;
      }
      lista = lista.map((e) => {
        if (e.id !== f.id) return e;
        const items = (e.card_items ?? []).filter((i) => !i.txdate && !i.fitid);
        return { ...e, card_items: items, value: sumCardItems(items) };
      });
    });
    const antesMes = allData[mes] || [];
    allData[mes] = lista.map(normalizeEntry);
    registrarHistoricoMes(mes, antesMes, allData[mes], 'removeu importações do banco');
  });

  saveData();
  render();
  notify.success('Importações do banco removidas.');
};

const onImportBank = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importBankStatement(file);
  } catch {
    notify.error('Não consegui ler este arquivo. Exporte no formato OFX, CSV ou QIF.');
  }
  dom.inputImportBank.value = '';
};

const handleImportClick = (type) => {
  if (type === 'json') dom.inputImportJson.click();
  if (type === 'sheet') dom.inputImportSheet.click();
  if (type === 'bank') dom.inputImportBank.click();
  if (type === 'undo-bank') desfazerUltimaImportacao();
};

const onImportJson = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importJSON(file);
  } catch {
    notify.error('Arquivo JSON inválido.');
  }
  dom.inputImportJson.value = '';
};

const onImportSheet = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importSheet(file);
  } catch {
    notify.error('Arquivo inválido. Use o template CSV ou Excel.');
  }
  dom.inputImportSheet.value = '';
};
