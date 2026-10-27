// ============================================
// Eventos
// ============================================

const handleListClick = (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;

  const { id, action, itemId } = btn.dataset;

  if (action === 'toggle-card') {
    if (expandedCardEntries.has(id)) expandedCardEntries.delete(id);
    else expandedCardEntries.add(id);
    render();
    return;
  }

  if (action === 'add-card-item') {
    const panel = btn.closest('.card-items-panel');
    submitCardItemAdd(panel, id);
    return;
  }

  if (action === 'paste-card-item') {
    const panel = btn.closest('.card-items-panel');
    pasteCardItemToForm(panel);
    return;
  }

  if (action === 'copy-card-item') {
    const item = getCardItemFromEntry(id, itemId);
    if (item) copyCardItem(item);
    return;
  }

  if (action === 'edit-card-item') {
    startEditCardItem(id, itemId);
    return;
  }

  if (action === 'save-card-item') {
    const row = btn.closest('.card-item--editing');
    if (row) saveCardItemFromRow(id, itemId, row);
    return;
  }

  if (action === 'cancel-card-item-edit') {
    cancelEditCardItem(id, itemId);
    return;
  }

  if (action === 'toggle-card-recurring') {
    toggleCardItemRecurring(id, itemId);
    return;
  }

  if (action === 'delete-card-item') {
    deleteCardItem(id, itemId);
    return;
  }

  if (action === 'set-status') {
    changeStatus(id, btn.dataset.status);
    return;
  }

  if (action === 'duplicate') duplicateEntry(id);
  if (action === 'edit') openEditModal(id);
  if (action === 'delete') deleteEntry(id);
  if (action === 'edit-carteira') {
    const carteiraId = btn.dataset.carteiraId;
    if (carteiraId && window.AppModules?.editInvestimento) {
      window.AppModules.editInvestimento(carteiraId);
    } else {
      window.AppModules?.activate('investimentos');
      notify.info('Editando na aba Investimentos — encontre a categoria e clique no lápis.');
    }
  }
};

const bindListEvents = (tableEl, cardsEl) => {
  tableEl?.addEventListener('click', handleListClick);
  cardsEl?.addEventListener('click', handleListClick);
  tableEl?.addEventListener('keydown', handleCardItemKeydown);
  cardsEl?.addEventListener('keydown', handleCardItemKeydown);
  tableEl?.addEventListener('pointerdown', handleCardItemPointerDown);
  cardsEl?.addEventListener('pointerdown', handleCardItemPointerDown);
};

const handleCardItemKeydown = (e) => {
  const panel = e.target.closest('.card-items-panel');
  if (!panel) return;

  const entryId = panel.dataset.cardId;

  const dragHandle = e.target.closest('[data-card-drag]');
  if (dragHandle && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveCardItemBy(entryId, dragHandle.dataset.itemId, e.key === 'ArrowUp' ? -1 : 1);
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    const editRow = e.target.closest('.card-item--editing');
    if (editRow) {
      e.preventDefault();
      saveCardItemFromRow(entryId, editRow.dataset.itemId, editRow);
      return;
    }

    if (e.target.matches('.card-item-desc, .card-item-val')) {
      e.preventDefault();
      submitCardItemAdd(panel, entryId);
    }
    return;
  }

  if (e.key === 'Escape') {
    const editRow = e.target.closest('.card-item--editing');
    if (editRow) {
      e.preventDefault();
      cancelEditCardItem(entryId, editRow.dataset.itemId);
    }
  }
};

const handleCardItemPaste = (e) => {
  const panel = e.target.closest('.card-items-panel');
  if (!panel || !e.target.matches('.card-item-desc, .card-item-val')) return;

  const text = e.clipboardData?.getData('text');
  const parsed = parseCardItemPaste(text);
  if (!parsed?.description) return;

  e.preventDefault();
  const desc = panel.querySelector('.card-item-desc');
  const val = panel.querySelector('.card-item-val');
  if (desc) desc.value = parsed.description;
  if (val && parsed.value > 0) val.value = formatValuePlain(parsed.value);
  (parsed.value > 0 ? val : desc)?.focus();
};

const bindEvents = () => {
  dom.selectMonth.addEventListener('change', onMonthChange);
  dom.selectYear.addEventListener('change', onMonthChange);
  dom.btnPrevMonth.addEventListener('click', () => navigateMonth(-1));
  dom.btnNextMonth.addEventListener('click', () => navigateMonth(1));
  dom.btnCopyMonth.addEventListener('click', copyPreviousMonth);
  dom.btnClearMonth.addEventListener('click', clearCurrentMonth);
  dom.btnTheme.addEventListener('click', toggleTheme);
  document.getElementById('btnHistory')?.addEventListener('click', abrirHistorico);
  document.getElementById('btnBackups')?.addEventListener('click', () => window.abrirBackupsLogs?.());
  document.querySelectorAll('[data-import]').forEach((btn) => {
    btn.addEventListener('click', () => handleImportClick(btn.dataset.import));
  });
  dom.inputImportJson.addEventListener('change', onImportJson);
  dom.inputImportSheet.addEventListener('change', onImportSheet);
  dom.inputImportBank.addEventListener('change', onImportBank);
  document.getElementById('btnManageCategories')?.addEventListener('click', gerenciarCategorias);
  dom.inputInvestimento?.addEventListener('change', () => onInvestimentoSelectChange(dom.inputInvestimento, dom.inputDescription));
  dom.editInvestimento?.addEventListener('change', () => onInvestimentoSelectChange(dom.editInvestimento, dom.editDescription));
  dom.formAdd.addEventListener('submit', handleAddEntry);
  dom.formEdit.addEventListener('submit', handleEditEntry);

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => handleExport(btn.dataset.export));
  });

  bindListEvents(dom.incomeTable, dom.incomeCards);
  bindListEvents(dom.expenseTable, dom.expenseCards);
  bindListEvents(dom.investmentTable, dom.investmentCards);

  document.addEventListener('paste', handleCardItemPaste);
  bindCardDragEvents();

  dom.inputType?.addEventListener('change', onTypeChange);
  dom.editType?.addEventListener('change', onEditTypeChange);
  dom.inputCategory?.addEventListener('change', onCategoryChange);
  dom.editCategory?.addEventListener('change', onEditCategoryChange);
};

const onCategoryChange = () => {
  const person = personFromCardCategory(dom.inputCategory.value);
  if (person) dom.inputPerson.value = person;
  if (dom.inputType.value === 'investimento') {
    dom.inputCategory.value = catPapel('investimentos');
  }
};

const onEditCategoryChange = () => {
  const person = personFromCardCategory(dom.editCategory.value);
  if (person) dom.editPerson.value = person;
  if (dom.editType.value === 'investimento') {
    dom.editCategory.value = catPapel('investimentos');
  }
};

const onTypeChange = () => {
  if (dom.inputType.value === 'investimento') {
    dom.inputCategory.value = catPapel('investimentos');
  }
  toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'), true);
};

const onEditTypeChange = () => {
  if (dom.editType.value === 'investimento') {
    dom.editCategory.value = catPapel('investimentos');
  }
  toggleInvestimentoField(dom.editType, dom.editCategory, dom.editInvestimento, null, true);
};
