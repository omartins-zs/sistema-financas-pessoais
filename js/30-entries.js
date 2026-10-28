// ============================================
// CRUD
// ============================================

// ---- Vínculo lançamento mensal (tipo investimento) -> carteira (aba Investimentos) ----
const getInvestimentosCarteira = () =>
  (Array.isArray(allData.__app?.investimentos) ? allData.__app.investimentos : []);

// Funções sintéticas removidas a pedido do usuário, pois confundiam o painel mensal
// (dinheiro já existente na carteira não deve somar como gasto/investimento do mês)
const investimentoAtribuidoAoMes = () => 0;
const investimentosDoMesSintetico = () => [];

// Só o nome — o Tipo (CDB, Ações…) é só uma classificação interna, mostrada na
// tabela da carteira; aqui só polui ("Outros · Caixinha Turbo" pra quem nem
// escolheu um tipo específico).
const investimentoLabel = (inv) =>
  String(inv.instituicao || inv.tipo || '').trim() || 'Categoria sem nome';

const getInvestimentoLabelById = (id) => {
  if (!id) return '';
  const inv = getInvestimentosCarteira().find((i) => i.id === id);
  return inv ? investimentoLabel(inv) : '';
};

const resumoMovimentosInvestimento = (investimentoId, ignorarLancamentoId = '') => {
  const resumo = { aportado: 0, resgatado: 0, liquido: 0 };
  if (!investimentoId) return resumo;

  Object.keys(allData).filter((mes) => /^\d{4}-\d{2}$/.test(mes)).forEach((mes) => {
    (allData[mes] || []).forEach((entry) => {
      if (!entry || entry.id === ignorarLancamentoId || entry.investimento_id !== investimentoId) return;
      const valor = Math.abs(Number(entry.value) || 0);
      if (entry.type === 'investimento') resumo.aportado += valor;
      else if (entry.type === 'resgate') resumo.resgatado += valor;
    });
  });

  resumo.aportado = Math.round(resumo.aportado * 100) / 100;
  resumo.resgatado = Math.round(resumo.resgatado * 100) / 100;
  resumo.liquido = Math.round((resumo.aportado - resumo.resgatado) * 100) / 100;
  return resumo;
};

const saldoDisponivelInvestimento = (investimentoId, ignorarLancamentoId = '') => {
  const investimento = getInvestimentosCarteira().find((item) => item.id === investimentoId);
  if (!investimento) return 0;
  const { liquido } = resumoMovimentosInvestimento(investimentoId, ignorarLancamentoId);
  const saldo = liquido + (Number(investimento.rendimento) || 0);
  return Math.max(0, Math.round(saldo * 100) / 100);
};

const populateInvestimentoSelects = () => {
  const lista = getInvestimentosCarteira();
  [dom.inputInvestimento, dom.editInvestimento].forEach((sel) => {
    if (!sel) return;
    const typeSel = sel === dom.inputInvestimento ? dom.inputType : dom.editType;
    const exigirCategoria = typeSel?.value === 'resgate';
    const opts = [
      exigirCategoria
        ? '<option value="">Selecione a categoria do investimento</option>'
        : lista.length
          ? '<option value="">Sem categoria (só conta neste mês)</option>'
          : '<option value="">Nenhuma categoria criada ainda — crie na aba Investimentos</option>',
    ...lista.map((i) => `<option value="${escapeAttr(i.id)}">${escapeHtml(investimentoLabel(i))}</option>`)
    ].join('');
    const atual = sel.value;
    sel.innerHTML = opts;
    sel.required = exigirCategoria;
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  });
};

// A categoria ocupa o MESMO lugar na tela: normal (Mercado, Luz…) ou, quando o Tipo é
// Aporte/resgate usam a lista da carteira — nunca junto com a categoria comum.
const toggleInvestimentoField = (typeSel, categorySel, investSel, manageBtn, autoFoco = false) => {
  if (!typeSel || !categorySel || !investSel) return;
  const mostrar = typeSel.value === 'investimento' || typeSel.value === 'resgate';
  const jaEstavaEscondido = investSel.hidden;
  categorySel.hidden = mostrar;
  investSel.hidden = !mostrar;
  investSel.required = typeSel.value === 'resgate';
  if (manageBtn) manageBtn.hidden = mostrar;

  if (mostrar) {
    populateInvestimentoSelects();
    // Só foca ao ligar o campo agora (mudou o Tipo), não em toda renderização/edição
    if (autoFoco && jaEstavaEscondido) investSel.focus();
  } else {
    // Trocou o Tipo para outro: a categoria de investimento escolhida não vale mais
    investSel.value = '';
  }
};

// Categorias de investimento só se criam na aba Investimentos — aqui é só escolher.
// Ao escolher uma já existente, a descrição preenche sozinha com o MESMO nome sempre
// que estiver vazia — é o que faz os lançamentos de meses diferentes ficarem agrupados
// (nomes digitados diferentes cada mês, tipo "emergência"/"Emergência", criavam
// categorias separadas em vez de somar).
const onInvestimentoSelectChange = (sel, descInput) => {
  if (!sel || !sel.value) return;
  if (descInput && !descInput.value.trim()) {
    const typeSel = sel === dom.inputInvestimento ? dom.inputType : dom.editType;
    const label = getInvestimentoLabelById(sel.value);
    descInput.value = typeSel?.value === 'resgate' ? `Resgate — ${label}` : label;
  }
};

const buildEntryFromForm = (formData) => normalizeEntry({
  id: formData.id ?? generateId(),
  description: formData.description.trim(),
  category: formData.category,
  type: formData.type,
  person: formData.person ?? '',
  value: formData.value,
  status: formData.status,
  due_day: formData.due_day ? parseInt(formData.due_day, 10) : null,
  observation: formData.observation.trim(),
  card_items: formData.card_items ?? [],
  ...(['investimento', 'resgate'].includes(formData.type) && formData.investimento_id
    ? { investimento_id: formData.investimento_id } : {}),
  ...(formData.fitid ? { fitid: formData.fitid } : {}),
  ...(formData._updatedAt ? { _updatedAt: formData._updatedAt } : {})
});

const validateEntry = (entry) => {
  if (!entry.description) { notify.error('Informe uma descrição.'); return false; }
  if (!entry.person) { notify.error('Selecione quem paga ou recebe (Gabriel, Barbara ou Casa).'); return false; }
  if (entry.value <= 0) { notify.error('Informe um valor maior que zero.'); return false; }
  if (entry.type === 'resgate') {
    if (!entry.investimento_id) {
      notify.error('Selecione de qual investimento será feito o resgate.');
      return false;
    }
    const investimento = getInvestimentosCarteira().find((item) => item.id === entry.investimento_id);
    if (!investimento) {
      notify.error('A categoria deste investimento não existe mais. Atualize a tela e selecione outra.');
      return false;
    }
    const disponivel = saldoDisponivelInvestimento(entry.investimento_id, entry.id);
    if (entry.value > disponivel + 0.004) {
      notify.error(`O resgate excede o saldo disponível de ${formatCurrency(disponivel)}.`);
      return false;
    }
  }
  return true;
};

const registrarResgateInvestimento = ({ investimentoId, valor, pessoa, observacao = '' }) => {
  const investimento = getInvestimentosCarteira().find((item) => item.id === investimentoId);
  if (!investimento) {
    notify.error('Selecione uma categoria de investimento válida.');
    return false;
  }

  const entry = normalizeEntry({
    id: generateId(),
    description: `Resgate — ${investimentoLabel(investimento)}`,
    category: catPapel('investimentos'),
    type: 'resgate',
    person: pessoa,
    value: Number(valor) || 0,
    status: 'pago',
    due_day: null,
    observation: String(observacao || '').trim(),
    card_items: [],
    investimento_id: investimento.id
  });
  if (!validateEntry(entry)) return false;

  setCurrentEntries([...getCurrentEntries(), entry], `resgatou ${formatCurrency(entry.value)} de “${investimentoLabel(investimento)}”`);
  render();
  notify.success(`Resgate registrado em ${getMonthLabel()}.`);
  return true;
};

const handleAddEntry = (e) => {
  e.preventDefault();

  const entry = buildEntryFromForm({
    description: dom.inputDescription.value,
    category: dom.inputCategory.value,
    type: dom.inputType.value,
    person: dom.inputPerson.value,
    value: getMaskValue(maskAdd),
    status: dom.inputStatus.value,
    due_day: dom.inputDueDay.value || null,
    observation: dom.inputObservation.value,
    investimento_id: dom.inputInvestimento?.value || ''
  });

  if (!validateEntry(entry)) return;

  setCurrentEntries([...getCurrentEntries(), entry]);
  resetAddForm();
  notify.success('Lançamento adicionado!');
  render();
};

const openEditModal = (id) => {
  const entry = getCurrentEntries().find((e) => e.id === id);
  if (!entry) return;

  dom.editId.value = entry.id;
  dom.editDescription.value = entry.description;
  dom.editCategory.value = entry.category;
  dom.editType.value = entry.type;
  dom.editStatus.value = entry.status;
  dom.editDueDay.value = entry.due_day ?? '';
  dom.editObservation.value = entry.observation ?? '';
  dom.editPerson.value = entry.person ?? '';
  setMaskValue(maskEdit, entry.value);
  toggleInvestimentoField(dom.editType, dom.editCategory, dom.editInvestimento, null);
  if (dom.editInvestimento) dom.editInvestimento.value = entry.investimento_id || '';

  editModal.show();
  dom.editDescription.focus();
};

const handleEditEntry = (e) => {
  e.preventDefault();

  const id = dom.editId.value;
  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1) return;

  const updated = buildEntryFromForm({
    id,
    description: dom.editDescription.value,
    category: dom.editCategory.value,
    type: dom.editType.value,
    person: dom.editPerson.value,
    value: getMaskValue(maskEdit),
    status: dom.editStatus.value,
    due_day: dom.editDueDay.value || null,
    observation: dom.editObservation.value,
    card_items: entries[index].card_items ?? [],
    investimento_id: dom.editInvestimento?.value || '',
    fitid: entries[index].fitid,
    _updatedAt: entries[index]._updatedAt
  });

  if (!validateEntry(updated)) return;

  const nextEntries = entries.map((item, i) => (i === index ? updated : item));
  setCurrentEntries(nextEntries);
  editModal.hide();
  notify.success('Lançamento atualizado!');
  render();
};

const duplicateEntry = (id) => {
  const entries = getCurrentEntries();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;

  const clonedCardItems = Array.isArray(entry.card_items)
    ? entry.card_items.map((item) => ({ ...cloneDados(item), id: generateId() }))
    : [];

  const duplicated = normalizeEntry({
    ...cloneDados(entry),
    id: generateId(),
    card_items: clonedCardItems,
    _updatedAt: Date.now()
  });

  if (!validateEntry(duplicated)) return;

  setCurrentEntries([...entries, duplicated], `duplicou ${resumoLancamento(duplicated)}`);
  notify.success('Lançamento duplicado!');
  render();
};

const deleteEntry = async (id) => {
  const entry = getCurrentEntries().find((e) => e.id === id);
  if (!entry) return;

  const confirmed = await confirmAction({
    title: 'Excluir lançamento?',
    text: `"${entry.description}" será removido permanentemente.`,
    icon: 'warning',
    confirmText: 'Sim, excluir'
  });

  if (!confirmed) return;

  setCurrentEntries(getCurrentEntries().filter((e) => e.id !== id));
  notify.info('Lançamento excluído.');
  render();
};

const changeStatus = (id, newStatus) => {
  const entries = getCurrentEntries();
  const index = entries.findIndex((e) => e.id === id);
  if (index === -1 || entries[index].status === newStatus) return;

  const nextEntries = entries.map((e, i) => (i === index ? { ...e, status: newStatus } : e));
  setCurrentEntries(nextEntries);
  render();
};

// ============================================
// Ações do mês
// ============================================

const copyPreviousMonth = async () => {
  const prevDate = dayjs(currentDate).subtract(1, 'month');
  const prevEntries = allData[getMonthKey(prevDate)] ?? [];

  if (!prevEntries.length) {
    notify.error('O mês anterior não tem lançamentos.');
    return;
  }

  const currentEntries = getCurrentEntries();

  // Resgates são eventos avulsos; copiar o mês anterior não deve repetir a retirada.
  const copiaveis = prevEntries.filter((entry) => entry.type !== 'resgate');
  const resgatesIgnorados = prevEntries.length - copiaveis.length;
  const newEntries = copiaveis.filter(
    (prev) => !isEntryDuplicate(prev, currentEntries)
  );

  const skipped = copiaveis.length - newEntries.length;

  if (!newEntries.length) {
    if (resgatesIgnorados && !copiaveis.length) {
      notify.info('O mês anterior só tem resgates, que não são copiados automaticamente.');
    } else {
      notify.info(
        skipped === copiaveis.length
          ? 'Todos os lançamentos do mês anterior já existem neste mês.'
          : 'Não há lançamentos novos para copiar.'
      );
      if (resgatesIgnorados) notify.info(`${resgatesIgnorados} resgate(s) não foram copiados por serem movimentações avulsas.`);
    }
    return;
  }

  let confirmText = `Adicionar ${newEntries.length} lançamento(s) novo(s)? O status virá como "Não pago".`;
  if (skipped > 0) {
    confirmText += ` ${skipped} já existente(s) serão ignorado(s).`;
  }
  if (resgatesIgnorados > 0) {
    confirmText += ` ${resgatesIgnorados} resgate(s) avulso(s) não serão repetidos.`;
  }

  const needsConfirm = currentEntries.length > 0 || skipped > 0;

  if (needsConfirm) {
    const confirmed = await confirmAction({
      title: 'Copiar mês anterior?',
      text: confirmText,
      confirmText: 'Sim, copiar'
    });
    if (!confirmed) return;
  }

  const now = Date.now();
  const copied = newEntries.map(({ description, category, type, person, value, due_day, observation, card_items, investimento_id }) => normalizeEntry({
    id: generateId(),
    description,
    category,
    type,
    person: person ?? '',
    value,
    status: 'nao_pago',
    due_day: due_day ?? null,
    observation: observation ?? '',
    card_items: Array.isArray(card_items) ? card_items.map((item) => ({ ...item, id: generateId() })) : [],
    ...(type === 'investimento' && investimento_id ? { investimento_id } : {}),
    _updatedAt: now
  }));

  setCurrentEntries([...currentEntries, ...copied]);

  const msg = skipped > 0
    ? `${copied.length} copiado(s), ${skipped} ignorado(s) (já existiam).`
    : `${copied.length} lançamento(s) copiado(s)!`;

  notify.success(msg);
  render();
};

const clearCurrentMonth = async () => {
  const entries = getCurrentEntries();
  if (!entries.length) {
    notify.info('Este mês já está vazio.');
    return;
  }

  const confirmed = await confirmAction({
    title: 'Limpar mês?',
    text: `Apagar todos os ${entries.length} lançamento(s) de ${getMonthLabel()}?`,
    icon: 'warning',
    confirmText: 'Sim, limpar'
  });

  if (!confirmed) return;

  setCurrentEntries([]);
  notify.info('Mês limpo com sucesso.');
  render();
};
