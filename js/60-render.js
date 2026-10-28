// ============================================
// Renderização
// ============================================

const createStatusPicker = (entry) => {
  const buttons = Object.entries(STATUS_LABELS).map(([val, label]) => {
    const active = entry.status === val;
    return `<button type="button"
      class="status-picker__btn status-picker__btn--${val}${active ? ' is-active' : ''}"
      data-action="set-status"
      data-id="${entry.id}"
      data-status="${val}"
      aria-pressed="${active}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}">
      <i class="bi bi-${STATUS_ICONS[val]}" aria-hidden="true"></i>
      <span>${STATUS_SHORT_LABELS[val]}</span>
    </button>`;
  }).join('');

  return `<div class="status-picker status-picker--${entry.status}" role="group" aria-label="Status de ${escapeHtml(entry.description)}">${buttons}</div>`;
};

const createActionButtons = (id) => `
  <div class="row-actions">
    <button type="button" class="row-action row-action--duplicate" data-id="${id}" data-action="duplicate" title="Duplicar lançamento" aria-label="Duplicar lançamento">
      <i class="bi bi-copy"></i>
    </button>
    <button type="button" class="row-action row-action--edit" data-id="${id}" data-action="edit" title="Editar" aria-label="Editar">
      <i class="bi bi-pencil-fill"></i>
    </button>
    <button type="button" class="row-action row-action--delete" data-id="${id}" data-action="delete" title="Excluir" aria-label="Excluir">
      <i class="bi bi-trash-fill"></i>
    </button>
  </div>`;

const renderDueDay = (due_day) => due_day
  ? `<span class="badge text-bg-light border" style="font-size:.7rem;"><i class="bi bi-calendar-event me-1"></i>dia ${due_day}</span>`
  : '<span class="text-muted">—</span>';

const renderCardItemDragHandle = (entry, item) => `
  <button type="button" class="card-item__drag" data-card-drag data-id="${entry.id}" data-item-id="${item.id}"
    title="Arraste para reordenar (ou use ↑ ↓)" aria-label="Reordenar ${escapeAttr(item.description)}">
    <i class="bi bi-grip-vertical"></i>
  </button>`;

const renderCardItemRow = (entry, item, sortable = false) => {
  const isDefault = isDefaultCardItem(item);
  const recurring = item.recurring === true;
  const editKey = `${entry.id}:${item.id}`;
  const allItems = entry.card_items ?? [];
  const canDelete = canDeleteCardItem(item, allItems);
  const deleteTitle = isDefault ? 'Remover valor base da fatura' : 'Remover item';
  const dragHandle = sortable ? renderCardItemDragHandle(entry, item) : '';

  if (editingCardItems.has(editKey)) {
    // Sem handle ativo durante a edição: reordenar re-renderiza e descartaria o que foi digitado
    return `
    <li class="card-item card-item--editing" data-item-id="${item.id}">
      ${sortable ? '<span class="card-item__drag card-item__drag--off" aria-hidden="true"><i class="bi bi-grip-vertical"></i></span>' : ''}
      <input type="text" class="form-control form-control-sm card-item-edit-desc" value="${escapeAttr(item.description)}" aria-label="Editar descrição">
      <input type="text" class="form-control form-control-sm card-item-edit-val" value="${escapeAttr(formatValuePlain(item.value))}" inputmode="decimal" aria-label="Editar valor">
      ${isDefault ? '' : `<label class="card-item-recurring-check card-item-recurring-check--inline">
        <input type="checkbox" class="card-item-edit-recurring"${recurring ? ' checked' : ''}>
        <span>Rec.</span>
      </label>`}
      <div class="card-item__actions">
        <button type="button" class="card-item__save" data-action="save-card-item" data-id="${entry.id}" data-item-id="${item.id}" title="Salvar" aria-label="Salvar">
          <i class="bi bi-check-lg"></i>
        </button>
        <button type="button" class="card-item__cancel" data-action="cancel-card-item-edit" data-id="${entry.id}" data-item-id="${item.id}" title="Cancelar" aria-label="Cancelar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </li>`;
  }

  return `
    <li class="card-item${recurring ? ' card-item--recurring' : ''}" data-item-id="${item.id}">
      ${dragHandle}
      <span class="card-item__desc">
        ${escapeHtml(item.description)}
        ${recurring ? '<span class="card-item__tag">Recorrente</span>' : ''}
      </span>
      <strong class="card-item__value">${formatCurrency(item.value)}</strong>
      <div class="card-item__actions">
        <button type="button" class="card-item__copy" data-action="copy-card-item" data-id="${entry.id}" data-item-id="${item.id}" title="Copiar" aria-label="Copiar item">
          <i class="bi bi-clipboard"></i>
        </button>
        <button type="button" class="card-item__edit" data-action="edit-card-item" data-id="${entry.id}" data-item-id="${item.id}" title="Editar" aria-label="Editar item">
          <i class="bi bi-pencil"></i>
        </button>
        ${isDefault ? '' : `<button type="button" class="card-item__recurring${recurring ? ' is-active' : ''}" data-action="toggle-card-recurring" data-id="${entry.id}" data-item-id="${item.id}" title="${recurring ? 'Remover recorrência' : 'Marcar como recorrente'}" aria-label="Recorrente">
          <i class="bi bi-arrow-repeat"></i>
        </button>`}
        ${canDelete ? `<button type="button" class="card-item__remove" data-action="delete-card-item" data-id="${entry.id}" data-item-id="${item.id}" title="${deleteTitle}" aria-label="Remover item">
          <i class="bi bi-x-lg"></i>
        </button>` : ''}
      </div>
    </li>`;
};

const getCardItemFromEntry = (entryId, itemId) => {
  const entry = getCurrentEntries().find((e) => e.id === entryId);
  return entry?.card_items?.find((item) => item.id === itemId) ?? null;
};

const saveCardItemFromRow = (entryId, itemId, row) => {
  const description = row.querySelector('.card-item-edit-desc')?.value?.trim() ?? '';
  const value = parseValue(row.querySelector('.card-item-edit-val')?.value ?? '0');
  const recurring = row.querySelector('.card-item-edit-recurring')?.checked ?? false;
  updateCardItem(entryId, itemId, description, value, recurring);
};

const renderCardItemsPanel = (entry, items) => {
  const regular = items.filter((item) => !item.recurring);
  const recurring = items.filter((item) => item.recurring);
  const regularHtml = regular.length
    ? regular.map((item) => renderCardItemRow(entry, item, regular.length > 1)).join('')
    : '<li class="card-item card-item--empty">Nenhum item avulso</li>';
  const recurringHtml = recurring.length
    ? recurring.map((item) => renderCardItemRow(entry, item, recurring.length > 1)).join('')
    : '<li class="card-item card-item--empty">Nenhum item recorrente neste cartão</li>';

  const itemsSum = sumCardItems(items);
  const recurringSum = sumCardItems(recurring);

  return `
    <div class="card-items-panel" data-card-id="${entry.id}">
      <p class="card-items-panel__title"><i class="bi bi-receipt"></i> Itens da fatura</p>
      <ul class="card-items-list">${regularHtml}</ul>
      <p class="card-items-panel__title card-items-panel__title--recurring"><i class="bi bi-arrow-repeat"></i> Recorrentes no cartão</p>
      <ul class="card-items-list card-items-list--recurring">${recurringHtml}</ul>
      <p class="card-items-sum">
        Soma dos itens: <strong>${formatCurrency(itemsSum)}</strong>
        · Recorrentes: <strong>${formatCurrency(recurringSum)}</strong>
        · Total da fatura: <strong>${formatCurrency(entry.value)}</strong>
      </p>
      <div class="card-item-add">
        <input type="text" class="form-control form-control-sm card-item-desc" placeholder="Ex: Gasolina" aria-label="Descrição do item">
        <input type="text" class="form-control form-control-sm card-item-val" placeholder="0,00" inputmode="decimal" aria-label="Valor do item">
        <label class="card-item-recurring-check">
          <input type="checkbox" class="card-item-recurring">
          <span>Recorrente</span>
        </label>
        <div class="card-item-add__actions">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="paste-card-item" data-id="${entry.id}" title="Colar item copiado">
            <i class="bi bi-clipboard-plus"></i>
          </button>
          <button type="button" class="btn btn-sm btn-primary" data-action="add-card-item" data-id="${entry.id}">
            <i class="bi bi-plus-lg"></i> Adicionar
          </button>
        </div>
      </div>
      <p class="card-item-add__hint">Enter adiciona · Copie e cole itens entre faturas · Arraste <i class="bi bi-grip-vertical"></i> para reordenar (ou ↑ ↓ com o handle focado)</p>
    </div>`;
};

const renderCreditCardRows = (entry, valueClass) => {
  const expanded = expandedCardEntries.has(entry.id);
  const items = entry.card_items ?? [];
  const recurringItems = items.filter((item) => item.recurring);

  return `
    <tr class="entry-row entry-row--card" data-id="${entry.id}">
      <td class="cell-description">
        <button type="button" class="btn-card-toggle" data-action="toggle-card" data-id="${entry.id}" title="Ver itens da fatura" aria-expanded="${expanded}">
          <i class="bi bi-chevron-${expanded ? 'up' : 'down'}"></i>
        </button>
        ${escapeHtml(entry.description)}
        ${items.length ? `<span class="card-items-badge">${items.length}</span>` : ''}
        ${recurringItems.length ? `<span class="card-items-badge card-items-badge--recurring" title="Itens recorrentes">${recurringItems.length} rec.</span>` : ''}
      </td>
      <td>${renderPersonTag(entry.person)}</td>
      <td><span class="category-tag category-tag--card">${escapeHtml(entry.category)}</span></td>
      <td class="${valueClass}">${formatCurrency(entry.value)}</td>
      <td>${createStatusPicker(entry)}</td>
      <td>${renderDueDay(entry.due_day)}</td>
      <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">${escapeHtml(entry.observation || '—')}</td>
      <td class="text-end">${createActionButtons(entry.id)}</td>
    </tr>
    <tr class="card-details-row ${expanded ? '' : 'd-none'}" data-parent-id="${entry.id}">
      <td colspan="8" class="card-details-cell">${renderCardItemsPanel(entry, items)}</td>
    </tr>`;
};

const investLinkTag = (entry) => {
  const label = entry.investimento_id ? getInvestimentoLabelById(entry.investimento_id) : '';
  if (!label) return '';
  const resgate = entry.type === 'resgate';
  return ` <span class="invest-link-tag${resgate ? ' invest-link-tag--resgate' : ''}" title="${resgate ? 'Reduz o saldo na aba Investimentos' : 'Soma na carteira (aba Investimentos)'}"><i class="bi bi-${resgate ? 'box-arrow-in-down' : 'graph-up-arrow'}"></i> ${resgate ? 'Resgate · ' : ''}${escapeHtml(label)}</span>`;
};

const formatEntryValue = (entry) =>
  entry.type === 'resgate' ? `− ${formatCurrency(entry.value)}` : formatCurrency(entry.value);

const carteiraStatusBadge = () =>
  '<span class="badge text-bg-light border carteira-badge" title="Cadastrado direto na aba Investimentos — edite ou exclua por lá">' +
  '<i class="bi bi-piggy-bank me-1"></i>Carteira</span>';

const carteiraActionButton = (carteiraId) => `
  <div class="row-actions">
    <button type="button" class="row-action row-action--edit" data-action="edit-carteira" data-carteira-id="${carteiraId}" title="Editar na aba Investimentos" aria-label="Editar na aba Investimentos">
      <i class="bi bi-box-arrow-up-right"></i>
    </button>
  </div>`;

const renderEntryRow = (entry, valueClass) => {
  if (isCreditCardEntry(entry)) return renderCreditCardRows(entry, valueClass);

  if (entry.__carteiraId) {
    return `
    <tr class="entry-row--carteira" data-id="${entry.id}">
      <td class="cell-description">${escapeHtml(entry.description)}</td>
      <td><span class="text-muted">—</span></td>
      <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
      <td class="${valueClass}${entry.type === 'resgate' ? ' value-resgate' : ''}">${formatEntryValue(entry)}</td>
      <td>${carteiraStatusBadge()}</td>
      <td>${renderDueDay(entry.due_day)}</td>
      <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">${escapeHtml(entry.observation || '—')}</td>
      <td class="text-end">${carteiraActionButton(entry.__carteiraId)}</td>
    </tr>`;
  }

  return `
  <tr data-id="${entry.id}">
    <td class="cell-description">${escapeHtml(entry.description)}${investLinkTag(entry)}</td>
    <td>${renderPersonTag(entry.person)}</td>
    <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
    <td class="${valueClass}${entry.type === 'resgate' ? ' value-resgate' : ''}">${formatEntryValue(entry)}</td>
    <td>${createStatusPicker(entry)}</td>
    <td>${renderDueDay(entry.due_day)}</td>
    <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">${escapeHtml(entry.observation || '—')}</td>
    <td class="text-end">${createActionButtons(entry.id)}</td>
  </tr>`;
};

const renderEntryCard = (entry, valueClass) => {
  const obs = entry.observation
    ? `<p class="entry-card__obs">${escapeHtml(entry.observation)}</p>` : '';
  const due = entry.due_day
    ? `<span class="badge text-bg-light border ms-1" style="font-size:.7rem;"><i class="bi bi-calendar-event me-1"></i>vence dia ${entry.due_day}</span>` : '';

  if (entry.__carteiraId) {
    return `
    <div class="entry-card entry-card--carteira" data-id="${entry.id}">
      <div class="entry-card__header">
        <span class="entry-card__title">${escapeHtml(entry.description)}</span>
        <span class="entry-card__value ${valueClass}${entry.type === 'resgate' ? ' value-resgate' : ''}">${formatEntryValue(entry)}</span>
      </div>
      <div class="entry-card__meta">
        <span class="category-tag">${escapeHtml(entry.category)}</span>
      </div>
      ${obs}
      <div class="entry-card__footer">
        ${carteiraStatusBadge()}
        ${carteiraActionButton(entry.__carteiraId)}
      </div>
    </div>`;
  }

  if (isCreditCardEntry(entry)) {
    const expanded = expandedCardEntries.has(entry.id);
    const items = entry.card_items ?? [];
    const recurringItems = items.filter((item) => item.recurring);

    return `
    <div class="entry-card entry-card--credit" data-id="${entry.id}">
      <div class="entry-card__header">
        <button type="button" class="btn-card-toggle" data-action="toggle-card" data-id="${entry.id}" aria-expanded="${expanded}">
          <i class="bi bi-chevron-${expanded ? 'up' : 'down'}"></i>
        </button>
        <span class="entry-card__title">${escapeHtml(entry.description)}${investLinkTag(entry)}</span>
        <span class="entry-card__value ${valueClass}${entry.type === 'resgate' ? ' value-resgate' : ''}">${formatEntryValue(entry)}</span>
      </div>
      <div class="entry-card__meta">
        ${renderPersonTag(entry.person)}
        <span class="category-tag category-tag--card">${escapeHtml(entry.category)}</span>${due}
        ${items.length ? `<span class="card-items-badge">${items.length} item(ns)</span>` : ''}
        ${recurringItems.length ? `<span class="card-items-badge card-items-badge--recurring">${recurringItems.length} rec.</span>` : ''}
      </div>
      ${obs}
      <div class="card-details-mobile ${expanded ? '' : 'd-none'}">${renderCardItemsPanel(entry, items)}</div>
      <div class="entry-card__footer">
        ${createStatusPicker(entry)}
        ${createActionButtons(entry.id)}
      </div>
    </div>`;
  }

  return `
    <div class="entry-card" data-id="${entry.id}">
      <div class="entry-card__header">
        <span class="entry-card__title">${escapeHtml(entry.description)}${investLinkTag(entry)}</span>
        <span class="entry-card__value ${valueClass}${entry.type === 'resgate' ? ' value-resgate' : ''}">${formatEntryValue(entry)}</span>
      </div>
      <div class="entry-card__meta">
        ${renderPersonTag(entry.person)}
        <span class="category-tag">${escapeHtml(entry.category)}</span>${due}
      </div>
      ${obs}
      <div class="entry-card__footer">
        ${createStatusPicker(entry)}
        ${createActionButtons(entry.id)}
      </div>
    </div>`;
};

const renderSection = ({ entries, bodyEl, cardsEl, tableWrapper, emptyEl, valueClass }) => {
  const hasItems = entries.length > 0;

  emptyEl.hidden = hasItems;
  tableWrapper.hidden = !hasItems;

  if (hasItems) {
    bodyEl.innerHTML = entries.map((e) => renderEntryRow(e, valueClass)).join('');
    cardsEl.innerHTML = entries.map((e) => renderEntryCard(e, valueClass)).join('');
  } else {
    bodyEl.innerHTML = '';
    cardsEl.innerHTML = '';
  }
};

const updateSummary = (entries) => {
  const summary = calculateSummary(entries);
  const { income: incomeList, expense: expenseList, investment: investmentList } = splitEntries(entries);

  // Investimentos do mês (tile/lista) = lançamentos manuais + o que foi cadastrado
  // direto na aba Investimentos com "Data de início" neste mês. A Sobra NÃO entra
  // nessa soma: o valor batido direto na carteira é dinheiro que já existia (só
  // está sendo catalogado agora), não saiu do caixa neste mês — por isso a Sobra
  // usa só summary.investment (lançamentos reais), como sempre foi.
  const investAtribuido = investimentoAtribuidoAoMes(getMonthKey(currentDate));
  const investimentoTotal = summary.investment + investAtribuido;
  const surplus = summary.income - summary.expense - summary.investment;

  dom.totalIncome.textContent = formatCurrency(summary.income);
  dom.totalExpense.textContent = formatCurrency(summary.expense);
  dom.totalInvestment.textContent = formatCurrency(investimentoTotal);
  dom.totalPaid.textContent = formatCurrency(summary.paid);
  dom.totalReserved.textContent = formatCurrency(summary.reserved);
  dom.totalUnpaid.textContent = formatCurrency(summary.unpaid);

  if (dom.calcSurplus) {
    dom.calcSurplus.textContent = formatCurrency(surplus);
    dom.calcSurplus.style.color = surplus >= 0 ? 'var(--app-investment)' : 'var(--app-expense)';
  }

  // Gabriel & Bárbara
  const gabrielSurplus = summary.gabrielIncome - summary.gabrielExpense;
  const gabrielPercent = summary.gabrielIncome > 0 ? (summary.gabrielExpense / summary.gabrielIncome) * 100 : 0;

  if (dom.gabrielIncome) {
    dom.gabrielIncome.textContent = formatCurrency(summary.gabrielIncome);
    dom.gabrielExpense.textContent = formatCurrency(summary.gabrielExpense);
    dom.gabrielSurplus.textContent = formatCurrency(gabrielSurplus);
    dom.gabrielSurplus.className = `fs-5 ${gabrielSurplus >= 0 ? 'text-success' : 'text-danger'}`;
    dom.gabrielPercent.textContent = `${gabrielPercent.toFixed(1).replace('.', ',')}%`;
  }

  const barbaraSurplus = summary.barbaraIncome - summary.barbaraExpense;
  const barbaraPercent = summary.barbaraIncome > 0 ? (summary.barbaraExpense / summary.barbaraIncome) * 100 : 0;

  if (dom.barbaraIncome) {
    dom.barbaraIncome.textContent = formatCurrency(summary.barbaraIncome);
    dom.barbaraExpense.textContent = formatCurrency(summary.barbaraExpense);
    dom.barbaraSurplus.textContent = formatCurrency(barbaraSurplus);
    dom.barbaraSurplus.className = `fs-5 ${barbaraSurplus >= 0 ? 'text-success' : 'text-danger'}`;
    dom.barbaraPercent.textContent = `${barbaraPercent.toFixed(1).replace('.', ',')}%`;
  }

  dom.entryCount.textContent = entries.length;
  dom.incomeCount.textContent = incomeList.length;
  dom.expenseCount.textContent = expenseList.length;
  dom.investmentCount.textContent = investmentList.length + investimentosDoMesSintetico(getMonthKey(currentDate)).length;
  dom.incomeSubtotal.textContent = formatCurrency(summary.income);
  dom.expenseSubtotal.textContent = formatCurrency(summary.expense);
  dom.investmentSubtotal.textContent = formatCurrency(investimentoTotal);
};

const render = () => {
  const entries = getCurrentEntries();
  const { income, expense, investment } = splitEntries(entries);
  const investmentComCarteira = [...investment, ...investimentosDoMesSintetico(getMonthKey(currentDate))];
  const hasEntries = entries.length > 0 || investmentComCarteira.length > 0;

  dom.emptyState.hidden = hasEntries;
  dom.incomeSection.hidden = !hasEntries;
  dom.expenseSection.hidden = !hasEntries;
  dom.investmentSection.hidden = !hasEntries;

  renderSection({
    entries: income,
    bodyEl: dom.incomeBody,
    cardsEl: dom.incomeCards,
    tableWrapper: dom.incomeTableWrapper,
    emptyEl: dom.incomeEmpty,
    valueClass: 'value-income'
  });

  renderSection({
    entries: expense,
    bodyEl: dom.expenseBody,
    cardsEl: dom.expenseCards,
    tableWrapper: dom.expenseTableWrapper,
    emptyEl: dom.expenseEmpty,
    valueClass: 'value-expense'
  });

  renderSection({
    entries: investmentComCarteira,
    bodyEl: dom.investmentBody,
    cardsEl: dom.investmentCards,
    tableWrapper: dom.investmentTableWrapper,
    emptyEl: dom.investmentEmpty,
    valueClass: 'value-investment'
  });

  updateSummary(entries);
  updateCharts(entries);

  // Atualiza módulos avançados (dashboard, alertas, etc.), se carregados
  if (window.AppModules?.onDataRender) window.AppModules.onDataRender();

  if (pendingCardFocusEntryId) {
    const focusId = pendingCardFocusEntryId;
    pendingCardFocusEntryId = null;
    requestAnimationFrame(() => {
      const panel = document.querySelector(`.card-items-panel[data-card-id="${focusId}"]`);
      panel?.querySelector('.card-item-desc')?.focus();
    });
  }

  if (pendingCardItemFocusId) {
    const itemId = pendingCardItemFocusId;
    pendingCardItemFocusId = null;
    requestAnimationFrame(() => focusCardItemHandle(itemId));
  }
};
