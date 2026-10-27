// ============================================
// Histórico de alterações (auditoria + desfazer)
// ============================================
// Cada mudança guarda só o que mudou (antes/depois dos lançamentos afetados),
// em allData.__app.historico — sincroniza junto com os dados. Tem teto de
// tamanho porque o Firestore guarda tudo num único documento de 1 MiB.
const HISTORICO_MAX = 150;
const HISTORICO_MAX_CHARS = 150000;

const NOMES_COLECAO = {
  metas: 'Metas', reservas: 'Reservas', cartoes: 'Cartões', comprasCartao: 'Compras no cartão',
  investimentos: 'Investimentos', patrimonio: 'Patrimônio', assinaturas: 'Contas fixas', passeios: 'Passeios'
};

// Instantâneo do último estado salvo de cada mês: várias ações alteram os objetos
// no lugar antes de salvar, então comparar com o array vivo não enxergaria nada.
const snapshotsMes = {};
const cloneDados = (v) => JSON.parse(JSON.stringify(v ?? []));
const iniciarSnapshotsHistorico = () => {
  Object.keys(snapshotsMes).forEach((k) => delete snapshotsMes[k]);
  Object.keys(allData).forEach((k) => {
    if (/^\d{4}-\d{2}$/.test(k) && Array.isArray(allData[k])) {
      allData[k] = allData[k].map(normalizeEntry);
      snapshotsMes[k] = cloneDados(allData[k]);
    }
  });
};

const getHistorico = () => {
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  if (!Array.isArray(allData.__app.historico)) allData.__app.historico = [];
  return allData.__app.historico;
};

const podarHistorico = () => {
  const h = getHistorico();
  while (h.length > HISTORICO_MAX) h.pop();
  while (h.length > 1 && JSON.stringify(h).length > HISTORICO_MAX_CHARS) h.pop();
};

const novoRegistroHistorico = (dados) => {
  // Guarda quem fez (nome do aparelho: ex. "Barbara", "Gabriel") — vocês usam o mesmo login
  const autor = AppStorage.getDeviceName?.() || '';
  const registro = { id: generateId(), quando: dayjs().toISOString(), ...(autor ? { autor } : {}), ...dados };
  getHistorico().unshift(registro);
  podarHistorico();
  Promise.resolve(AppStorage.registrarEventoAuditoria?.(registro)).catch(() => {});
  return registro;
};

const resumoLancamento = (e) => `“${e.description}” (${formatCurrency(Number(e.value) || 0)})`;

const detalheAlteracaoLancamento = (antes, depois) => {
  const mudancas = [];
  const vA = Number(antes?.value) || 0;
  const vD = Number(depois?.value) || 0;
  if (Math.abs(vA - vD) >= 0.005) {
    mudancas.push(`${formatCurrency(vA)} → ${formatCurrency(vD)}`);
  } else {
    mudancas.push(formatCurrency(vD));
  }
  if (antes?.status !== depois?.status) {
    mudancas.push(`${STATUS_LABELS[antes?.status] || antes?.status || '—'} → ${STATUS_LABELS[depois?.status] || depois?.status || '—'}`);
  }
  if (antes?.description !== depois?.description) {
    mudancas.push(`nome “${antes?.description || ''}” → “${depois?.description || ''}”`);
  }
  if (antes?.category !== depois?.category) {
    mudancas.push(`cat. ${antes?.category || '—'} → ${depois?.category || '—'}`);
  }
  if ((antes?.person || '') !== (depois?.person || '')) {
    mudancas.push(`tag ${PERSON_LABELS[antes?.person] || '—'} → ${PERSON_LABELS[depois?.person] || '—'}`);
  }
  return `“${depois?.description || ''}” (${mudancas.join(' · ')})`;
};

const stripSyncMeta = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const { _updatedAt, ...rest } = obj;
  return rest;
};

const diffListas = (antes, depois) => {
  const mapA = new Map(antes.map((e) => [e.id, e]));
  const mapD = new Map(depois.map((e) => [e.id, e]));
  return {
    adicionados: depois.filter((e) => !mapA.has(e.id)),
    removidos: antes.filter((e) => !mapD.has(e.id)),
    alterados: depois
      .filter((e) => mapA.has(e.id) && JSON.stringify(stripSyncMeta(mapA.get(e.id))) !== JSON.stringify(stripSyncMeta(e)))
      .map((e) => ({ antes: cloneDados(mapA.get(e.id)), depois: cloneDados(e) }))
  };
};

// Mudança nos lançamentos de um mês (usado por setCurrentEntries e pelas importações)
const registrarHistoricoMes = (mes, antes, depois, acao) => {
  const d = diffListas(antes || [], depois || []);
  const now = Date.now();
  const mapAntes = new Map((antes || []).map((e) => [e.id, e]));
  const changedIds = new Set([
    ...d.adicionados.map((e) => e.id),
    ...d.alterados.map(({ depois: dep }) => dep.id)
  ]);
  const removedIds = d.removidos.map((e) => e.id);
  if (removedIds.length) {
    const maxRemovedAt = d.removidos.reduce((max, e) => Math.max(max, Number(e?._updatedAt) || 0), 0);
    registrarExclusaoIds(removedIds, maxRemovedAt);
  }
  if (changedIds.size) desmarcarExclusaoIds([...changedIds]);

  depois.forEach((e) => {
    const prevAt = Number(mapAntes.get(e.id)?._updatedAt) || Number(e._updatedAt) || 0;
    if (changedIds.has(e.id)) {
      e._updatedAt = Math.max(now, prevAt + 1);
    } else if (prevAt > 0) {
      e._updatedAt = prevAt;
    }
  });

  snapshotsMes[mes] = cloneDados(depois); // próximo diff parte daqui
  if (!d.adicionados.length && !d.removidos.length && !d.alterados.length) return null;
  if (!acao) {
    const partes = [];
    if (d.adicionados.length) {
      partes.push(d.adicionados.length === 1
        ? `adicionou ${resumoLancamento(d.adicionados[0])}`
        : `adicionou ${d.adicionados.length} lançamentos`);
    }
    if (d.removidos.length) {
      partes.push(d.removidos.length === 1
        ? `excluiu ${resumoLancamento(d.removidos[0])}`
        : `excluiu ${d.removidos.length} lançamentos`);
    }
    if (d.alterados.length) {
      partes.push(d.alterados.length === 1
        ? `alterou ${detalheAlteracaoLancamento(d.alterados[0].antes, d.alterados[0].depois)}`
        : `alterou ${d.alterados.length} lançamentos (${d.alterados.slice(0, 3).map((x) => detalheAlteracaoLancamento(x.antes, x.depois)).join('; ')})`);
    }
    acao = partes.join(' · ');
  }
  const reg = { tipo: 'mes', mes, acao, reversivel: true, ...d };
  novoRegistroHistorico(reg);
  return reg;
};

const valorItemModulo = (colecao, item) => {
  if (!item || typeof item !== 'object') return null;
  if (colecao === 'investimentos') {
    const at = Number(item.valorAtual) || 0;
    const ap = Number(item.valorAplicado) || 0;
    return at > 0 ? at : ap;
  }
  if (colecao === 'reservas') {
    return (item.movimentacoes || []).reduce((acc, m) => acc + (m.tipo === 'deposito' ? (Number(m.valor) || 0) : -(Number(m.valor) || 0)), 0);
  }
  if (colecao === 'metas') {
    const acum = (item.aportes || []).reduce((acc, a) => acc + (Number(a.valor) || 0), 0);
    return acum > 0 ? acum : (Number(item.valorObjetivo) || 0);
  }
  if (colecao === 'patrimonio') return Number(item.valorAtual) || 0;
  if (colecao === 'assinaturas') return Number(item.valor) || 0;
  if (colecao === 'cartoes') return Number(item.limite) || 0;
  if (colecao === 'comprasCartao') return Number(item.valor) || 0;
  return null;
};

// Mudança num item de módulo (metas, reservas, investimentos…) — chamado pelo app-modules
const registrarHistoricoModulo = (colecao, antes, depois) => {
  const antesLimpo = antes ? cloneDados(stripSyncMeta(antes)) : null;
  const depoisLimpo = depois ? cloneDados(stripSyncMeta(depois)) : null;
  if (JSON.stringify(antesLimpo) === JSON.stringify(depoisLimpo)) return;

  const alvo = depoisLimpo ?? antesLimpo ?? {};
  const nome = alvo.nome || alvo.instituicao || alvo.descricao || alvo.description || alvo.tipo || '';
  const verbo = !antesLimpo ? 'adicionou' : !depoisLimpo ? 'excluiu' : 'alterou';

  const vA = valorItemModulo(colecao, antesLimpo);
  const vD = valorItemModulo(colecao, depoisLimpo);
  let sufixoValor = '';
  if (!antesLimpo && vD !== null) {
    sufixoValor = ` (${formatCurrency(vD)})`;
  } else if (!depoisLimpo && vA !== null) {
    sufixoValor = ` (${formatCurrency(vA)})`;
  } else if (antesLimpo && depoisLimpo && vA !== null && vD !== null) {
    sufixoValor = Math.abs(vA - vD) >= 0.005
      ? ` (${formatCurrency(vA)} → ${formatCurrency(vD)})`
      : ` (${formatCurrency(vD)})`;
  }

  novoRegistroHistorico({
    tipo: 'modulo',
    colecao,
    acao: `${NOMES_COLECAO[colecao] || colecao}: ${verbo} ${nome ? `“${nome}”` : 'item'}${sufixoValor}`,
    antes: antes ? cloneDados(antes) : null,
    depois: depois ? cloneDados(depois) : null,
    reversivel: true
  });
};

// Só auditoria (sem desfazer): ex. mudança nas categorias
const registrarHistoricoInfo = (acao) => novoRegistroHistorico({ tipo: 'info', acao, reversivel: false });

const mesmoConteudoHistorico = (a, b) => {
  const normalizar = (valor) => {
    if (Array.isArray(valor)) return valor.map(normalizar);
    if (!valor || typeof valor !== 'object') return valor;
    return Object.keys(valor).filter((k) => k !== '_updatedAt').sort().reduce((out, k) => {
      out[k] = normalizar(valor[k]);
      return out;
    }, {});
  };
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
};

const desfazerRegistroHistorico = (registroOuId) => {
  const historico = getHistorico();
  const fornecido = typeof registroOuId === 'object' ? registroOuId : null;
  let reg = (fornecido && historico.find((r) => r.id === fornecido.id))
    || fornecido
    || historico.find((r) => r.id === registroOuId);
  if (!reg || !reg.reversivel || reg.desfeito) return false;
  const now = Date.now();

  if (reg.tipo === 'mes') {
    const antesLista = cloneDados(allData[reg.mes] || []);
    const atuais = new Map(antesLista.map((e) => [e.id, e]));
    const conflito = (reg.adicionados || []).some((e) => !mesmoConteudoHistorico(atuais.get(e.id), e))
      || (reg.alterados || []).some(({ depois }) => !mesmoConteudoHistorico(atuais.get(depois.id), depois))
      || (reg.removidos || []).some((e) => atuais.has(e.id));
    if (conflito) return false;
    if (!historico.some((r) => r.id === reg.id)) {
      reg = cloneDados(reg);
      historico.unshift(reg);
    }
    const addIds = new Set((reg.adicionados || []).map((e) => e.id));
    if (addIds.size) registrarExclusaoIds([...addIds]);
    const nova = antesLista.filter((e) => !addIds.has(e.id));
    (reg.alterados || []).forEach(({ antes }) => {
      const restaurado = { ...cloneDados(antes), _updatedAt: now };
      desmarcarExclusaoIds([restaurado.id]);
      const i = nova.findIndex((e) => e.id === antes.id);
      if (i >= 0) nova[i] = restaurado; else nova.push(restaurado);
    });
    (reg.removidos || []).forEach((e) => {
      const restaurado = { ...cloneDados(e), _updatedAt: now };
      desmarcarExclusaoIds([restaurado.id]);
      if (!nova.some((x) => x.id === e.id)) nova.push(restaurado);
    });
    allData[reg.mes] = nova.map(normalizeEntry);
    reg.desfeito = true;
    registrarHistoricoMes(reg.mes, antesLista, allData[reg.mes], `desfez: ${reg.acao}`);
    if (reg.mes !== getMonthKey(currentDate)) { currentDate = dayjs(`${reg.mes}-01`); syncSelectors(); }
  } else if (reg.tipo === 'modulo') {
    const listaAtual = allData.__app?.[reg.colecao] || [];
    const alvoAtual = listaAtual.find((x) => x.id === (reg.depois ?? reg.antes)?.id) || null;
    if (reg.depois ? !mesmoConteudoHistorico(alvoAtual, reg.depois) : Boolean(alvoAtual)) return false;
    if (!historico.some((r) => r.id === reg.id)) {
      reg = cloneDados(reg);
      historico.unshift(reg);
    }
    if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
    if (!Array.isArray(allData.__app[reg.colecao])) allData.__app[reg.colecao] = [];
    const lista = allData.__app[reg.colecao];
    const alvoId = (reg.depois ?? reg.antes)?.id;
    const i = lista.findIndex((x) => x.id === alvoId);
    if (reg.antes) {
      const restaurado = { ...cloneDados(reg.antes), _updatedAt: now };
      desmarcarExclusaoIds([alvoId]);
      if (i >= 0) lista[i] = restaurado; else lista.push(restaurado);
    } else if (i >= 0) {
      registrarExclusaoIds([alvoId]);
      lista.splice(i, 1);
    }
    reg.desfeito = true;
    novoRegistroHistorico({
      tipo: 'modulo',
      colecao: reg.colecao,
      acao: `desfez: ${reg.acao}`,
      antes: reg.depois ? cloneDados(reg.depois) : null,
      depois: reg.antes ? cloneDados(reg.antes) : null,
      reversivel: true
    });
  } else {
    return false;
  }

  saveData();
  render();
  return true;
};

const formatarAcaoHistorico = (r) => {
  if (!r || typeof r !== 'object') return '';
  const acaoBase = String(r.acao || r.resumo || '');
  if (r.tipo === 'mes' && Array.isArray(r.alterados) && r.alterados.length && !acaoBase.includes('→') && !acaoBase.startsWith('desfez:')) {
    const partes = [];
    if (Array.isArray(r.adicionados) && r.adicionados.length) {
      partes.push(r.adicionados.length === 1
        ? `adicionou ${resumoLancamento(r.adicionados[0])}`
        : `adicionou ${r.adicionados.length} lançamentos`);
    }
    if (Array.isArray(r.removidos) && r.removidos.length) {
      partes.push(r.removidos.length === 1
        ? `excluiu ${resumoLancamento(r.removidos[0])}`
        : `excluiu ${r.removidos.length} lançamentos`);
    }
    partes.push(r.alterados.length === 1
      ? `alterou ${detalheAlteracaoLancamento(r.alterados[0].antes, r.alterados[0].depois)}`
      : `alterou ${r.alterados.length} lançamentos (${r.alterados.slice(0, 3).map((x) => detalheAlteracaoLancamento(x.antes, x.depois)).join('; ')})`);
    return partes.join(' · ');
  }
  return acaoBase;
};

const setCurrentEntries = (entries, acao) => {
  const mes = getMonthKey(currentDate);
  const antes = snapshotsMes[mes] ?? cloneDados(allData[mes] || []);
  const depois = entries.map(normalizeEntry);
  registrarHistoricoMes(mes, antes, depois, acao);
  allData[mes] = depois;
  saveData();
};

const addCardItem = (entryId, description, value, recurring = false) => {
  if (!description) { notify.error('Informe a descrição do item.'); return false; }
  if (value <= 0) { notify.error('Informe um valor maior que zero.'); return false; }

  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return false;

  const items = [...(entries[index].card_items ?? [])];
  items.push({ id: generateId(), description, value, recurring: recurring === true });
  const total = sumCardItems(items);
  const nextEntries = entries.map((e, i) => (i === index ? { ...e, card_items: items, value: total } : e));
  expandedCardEntries.add(entryId);
  pendingCardFocusEntryId = entryId;
  setCurrentEntries(nextEntries);
  notify.success(recurring ? 'Item recorrente adicionado ao cartão.' : 'Item adicionado ao cartão.');
  render();
  return true;
};

const clearCardItemAddForm = (panel) => {
  if (!panel) return;
  const desc = panel.querySelector('.card-item-desc');
  const val = panel.querySelector('.card-item-val');
  const rec = panel.querySelector('.card-item-recurring');
  if (desc) desc.value = '';
  if (val) val.value = '';
  if (rec) rec.checked = false;
};

const submitCardItemAdd = (panel, entryId) => {
  if (!panel || !entryId) return;
  const description = panel.querySelector('.card-item-desc')?.value?.trim() ?? '';
  const value = parseValue(panel.querySelector('.card-item-val')?.value ?? '0');
  const recurring = panel.querySelector('.card-item-recurring')?.checked ?? false;
  if (addCardItem(entryId, description, value, recurring)) {
    clearCardItemAddForm(panel);
  }
};

const parseCardItemPaste = (text) => {
  const line = String(text ?? '').trim().split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
  if (!line) return null;

  if (line.includes('\t')) {
    const [desc, val] = line.split('\t');
    return { description: desc.trim(), value: parseValue(val) };
  }
  if (line.includes(';')) {
    const [desc, val] = line.split(';');
    return { description: desc.trim(), value: parseValue(val) };
  }
  const spaced = line.match(/^(.+?)\s+([\d.,]+)$/);
  if (spaced) {
    return { description: spaced[1].trim(), value: parseValue(spaced[2]) };
  }
  return { description: line, value: 0 };
};

const copyCardItem = (item) => {
  cardItemClip = {
    description: item.description,
    value: Number(item.value) || 0,
    recurring: item.recurring === true
  };
  const clipText = `${item.description}\t${formatValuePlain(item.value)}`;
  navigator.clipboard?.writeText(clipText).catch(() => {});
  notify.info('Item copiado. Use Colar ou Ctrl+V no formulário.');
};

const pasteCardItemToForm = async (panel) => {
  let data = cardItemClip;

  if (!data && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseCardItemPaste(text);
      if (parsed?.description) data = { ...parsed, recurring: false };
    } catch {
      /* clipboard bloqueado */
    }
  }

  if (!data?.description) {
    notify.error('Nada para colar. Copie um item primeiro.');
    return;
  }

  const desc = panel.querySelector('.card-item-desc');
  const val = panel.querySelector('.card-item-val');
  const rec = panel.querySelector('.card-item-recurring');
  if (desc) desc.value = data.description;
  if (val) val.value = formatValuePlain(data.value || 0);
  if (rec) rec.checked = data.recurring === true;
  desc?.focus();
  desc?.select();
};

const updateCardItem = (entryId, itemId, description, value, recurring) => {
  if (!description) { notify.error('Informe a descrição do item.'); return; }
  if (value <= 0) { notify.error('Informe um valor maior que zero.'); return; }

  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return;

  const items = (entries[index].card_items ?? []).map((item) => {
    if (item.id !== itemId) return item;

    const wasDefault = isDefaultCardItem(item);
    const next = {
      ...item,
      description,
      value,
      recurring: wasDefault ? false : recurring === true
    };

    if (wasDefault && /^cart[aã]o$/i.test(description.trim())) {
      next.isDefault = true;
    } else {
      delete next.isDefault;
    }

    return next;
  });

  const nextEntries = entries.map((e, i) => (
    i === index ? syncCardEntryFromItems({ ...e, card_items: items }) : e
  ));
  editingCardItems.delete(`${entryId}:${itemId}`);
  expandedCardEntries.add(entryId);
  pendingCardFocusEntryId = entryId;
  setCurrentEntries(nextEntries);
  notify.success('Item atualizado.');
  render();
};

const startEditCardItem = (entryId, itemId) => {
  editingCardItems.add(`${entryId}:${itemId}`);
  expandedCardEntries.add(entryId);
  render();
  requestAnimationFrame(() => {
    const row = document.querySelector(`.card-item--editing[data-item-id="${itemId}"]`);
    row?.querySelector('.card-item-edit-desc')?.focus();
  });
};

const cancelEditCardItem = (entryId, itemId) => {
  editingCardItems.delete(`${entryId}:${itemId}`);
  pendingCardFocusEntryId = entryId;
  render();
};

const toggleCardItemRecurring = (entryId, itemId) => {
  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return;

  const items = (entries[index].card_items ?? []).map((item) => {
    if (item.id !== itemId || isDefaultCardItem(item)) return item;
    return { ...item, recurring: !item.recurring };
  });

  const nextEntries = entries.map((e, i) => (i === index ? { ...e, card_items: items } : e));
  expandedCardEntries.add(entryId);
  setCurrentEntries(nextEntries);
  render();
};

const canDeleteCardItem = (item, items = []) =>
  items.length > 1;

const deleteCardItem = (entryId, itemId) => {
  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return;

  const currentItems = entries[index].card_items ?? [];
  if (!canDeleteCardItem(null, currentItems)) {
    notify.error('Adicione outros itens antes de remover o único restante.');
    return;
  }

  const items = currentItems.filter((item) => item.id !== itemId);
  const total = sumCardItems(items);

  const nextEntries = entries.map((e, i) => (
    i === index ? syncCardEntryFromItems({ ...e, card_items: items, value: total }) : e
  ));
  expandedCardEntries.add(entryId);
  setCurrentEntries(nextEntries);
  notify.info('Item removido da fatura.');
  render();
};

// Reordena apenas os ids informados, mantendo os demais itens nas posições atuais
// (avulsos e recorrentes são grupos separados na tela).
const applyCardItemsOrder = (entryId, orderedIds) => {
  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return false;

  const items = entries[index].card_items ?? [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const targets = orderedIds.filter((id) => byId.has(id));
  if (targets.length < 2) return false;

  const slots = new Set(targets);
  let cursor = 0;
  const next = items.map((item) => (slots.has(item.id) ? byId.get(targets[cursor++]) : item));

  if (next.every((item, i) => item.id === items[i].id)) return false;

  const nextEntries = entries.map((e, i) => (i === index ? { ...e, card_items: next } : e));
  expandedCardEntries.add(entryId);
  setCurrentEntries(nextEntries);
  return true;
};

const reorderCardItems = (entryId, orderedIds) => {
  if (!applyCardItemsOrder(entryId, orderedIds)) return false;
  render();
  return true;
};

const moveCardItemBy = (entryId, itemId, delta) => {
  const entry = getCurrentEntries().find((e) => e.id === entryId);
  const item = entry?.card_items?.find((i) => i.id === itemId);
  if (!item) return;

  const group = entry.card_items.filter((i) => (i.recurring === true) === (item.recurring === true));
  const from = group.findIndex((i) => i.id === itemId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= group.length) return;

  const ids = group.map((i) => i.id);
  ids.splice(to, 0, ids.splice(from, 1)[0]);

  pendingCardItemFocusId = itemId;
  if (!reorderCardItems(entryId, ids)) pendingCardItemFocusId = null;
};

window.HistoricoAuditoria = {
  listar: () => Array.isArray(allData.__app?.historico) ? cloneDados(allData.__app.historico) : [],
  formatar: formatarAcaoHistorico,
  desfazer: desfazerRegistroHistorico
};
