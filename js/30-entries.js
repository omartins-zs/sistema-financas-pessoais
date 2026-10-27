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

const populateInvestimentoSelects = () => {
  const lista = getInvestimentosCarteira();
  const opts = [
    lista.length
      ? '<option value="">Sem categoria (só conta neste mês)</option>'
      : '<option value="">Nenhuma categoria criada ainda — crie na aba Investimentos</option>',
    ...lista.map((i) => `<option value="${escapeAttr(i.id)}">${escapeHtml(investimentoLabel(i))}</option>`)
  ].join('');
  [dom.inputInvestimento, dom.editInvestimento].forEach((sel) => {
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = opts;
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  });
};

// A categoria ocupa o MESMO lugar na tela: normal (Mercado, Luz…) ou, quando o Tipo é
// Investimento, a lista de categorias da carteira — nunca os dois ao mesmo tempo.
const toggleInvestimentoField = (typeSel, categorySel, investSel, manageBtn, autoFoco = false) => {
  if (!typeSel || !categorySel || !investSel) return;
  const mostrar = typeSel.value === 'investimento';
  const jaEstavaEscondido = investSel.hidden;
  categorySel.hidden = mostrar;
  investSel.hidden = !mostrar;
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
    descInput.value = getInvestimentoLabelById(sel.value);
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
  ...(formData.type === 'investimento' && formData.investimento_id
    ? { investimento_id: formData.investimento_id } : {}),
  ...(formData.fitid ? { fitid: formData.fitid } : {}),
  ...(formData._updatedAt ? { _updatedAt: formData._updatedAt } : {})
});

const validateEntry = (entry) => {
  if (!entry.description) { notify.error('Informe uma descrição.'); return false; }
  if (!entry.person) { notify.error('Selecione quem paga ou recebe (Gabriel, Barbara ou Casa).'); return false; }
  if (entry.value <= 0) { notify.error('Informe um valor maior que zero.'); return false; }
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

  const newEntries = prevEntries.filter(
    (prev) => !isEntryDuplicate(prev, currentEntries)
  );

  const skipped = prevEntries.length - newEntries.length;

  if (!newEntries.length) {
    notify.info(
      skipped === prevEntries.length
        ? 'Todos os lançamentos do mês anterior já existem neste mês.'
        : 'Não há lançamentos novos para copiar.'
    );
    return;
  }

  let confirmText = `Adicionar ${newEntries.length} lançamento(s) novo(s)? O status virá como "Não pago".`;
  if (skipped > 0) {
    confirmText += ` ${skipped} já existente(s) serão ignorado(s).`;
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
