// Última importação fica registrada (junto dos dados, então sincroniza) para
// o "Desfazer última importação" reverter com precisão.
const registrarUndoImportacao = (log) => {
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  allData.__app.ultimaImportacao = { quando: dayjs().toISOString(), ...log };
};

// Fatura importada vira itens DENTRO do lançamento do cartão (o mesmo painel
// com drag & drop), em vez de dezenas de despesas soltas no mês.
const importFaturaAsCardItems = (txs, { mes, categoria }, { dueDay, nomeCartao }) => {
  const ehGasto = makeCardExpenseTest(txs);
  const gastos = txs.filter(ehGasto);
  const pagamentos = txs.length - gastos.length;
  if (!gastos.length) { notify.info('O arquivo só tinha pagamentos/estornos — nada a importar.'); return; }

  const lista = [...(allData[mes] || [])];
  const antesLista = allData[mes] || [];
  let index = lista.findIndex((e) => isCreditCardEntry(e) && e.category === categoria);
  const entryCriada = index === -1;
  const valorAnterior = entryCriada ? 0 : Number(lista[index].value) || 0;
  let entry;
  if (index === -1) {
    entry = {
      id: generateId(), description: nomeCartao, category: categoria, type: 'despesa',
      person: personFromCardCategory(categoria) || '', value: 0, status: 'nao_pago',
      due_day: dueDay || null, observation: '', card_items: []
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
  items.forEach((i) => {
    if (i.fitid) fitids.add(i.fitid);
    const base = `${String(i.description).toLowerCase()}|${(Number(i.value) || 0).toFixed(2)}`;
    if (i.txdate) chavesComData.add(`${i.txdate}|${base}`);
    else chavesManuais.add(base);
  });

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
    const item = {
      id: generateId(), description, value, recurring: false, txdate: t.date,
      ...(t.fitid ? { fitid: t.fitid } : {})
    };
    items.push(item);
    itemIdsNovos.push(item.id);
    importados++;
  });

  if (!importados) {
    notify.info(pulados ? 'Tudo já estava na fatura — nenhum item novo.' : 'Nenhum item válido.');
    return;
  }

  entry.card_items = items;
  entry.value = sumCardItems(items);
  allData[mes] = lista.map(normalizeEntry);
  registrarHistoricoMes(mes, antesLista, allData[mes], `importou fatura do banco (${importados} itens em “${entry.description}”)`);
  expandedCardEntries.add(entry.id);
  registrarUndoImportacao({
    tipo: 'cartao', mes, entryId: entry.id, entryCriada,
    itemIds: itemIdsNovos, valorAnterior, defaultRemovido
  });
  saveData();

  if (mes !== getMonthKey(currentDate)) {
    currentDate = dayjs(`${mes}-01`);
    syncSelectors();
  }
  render();
  const nomeMes = dayjs(`${mes}-01`).format('MMMM [de] YYYY');
  notify.success(`${importados} item(ns) na fatura de ${nomeMes}`
    + (pulados ? ` · ${pulados} já existia(m)` : '')
    + (pagamentos ? ` · ${pagamentos} pagamento(s)/estorno(s) ignorado(s)` : ''));
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
        <label style="margin:0">Cartão <select id="bankCardCat" style="padding:.25rem .3rem;max-width:14rem">
          ${cardCats.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
        </select></label>
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
      sync();
    },
    preConfirm: () => {
      const popup = Swal.getPopup();
      const tipo = popup.querySelector('input[name="bankMode"]:checked')?.value;
      if (!tipo) { Swal.showValidationMessage('Escolha o tipo do arquivo.'); return false; }
      if (tipo === 'conta') return { tipo };
      const mes = popup.querySelector('#bankCardMes').value;
      const categoria = popup.querySelector('#bankCardCat').value;
      if (!/^\d{4}-\d{2}$/.test(mes)) { Swal.showValidationMessage('Informe o mês da fatura.'); return false; }
      return { tipo, mes, categoria };
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
