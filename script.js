/**
 * Finanças da Casa
 * Sistema de controle financeiro mensal com LocalStorage
 */

// ============================================
// Constantes e configuração
// ============================================

const STORAGE_KEY = 'financas_casa_dados';

const CATEGORIAS = [
  'Contribuição para casa',
  'Aluguel',
  'Combustível',
  'Mercado',
  'Conta de luz',
  'Conta de água',
  'Internet',
  'Cartão de crédito',
  'Farmácia',
  'Outros'
];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const STATUS_LABELS = {
  pago: 'Pago',
  reservado: 'Reservado',
  nao_pago: 'Não pago'
};

// Estado da aplicação
let currentMonth = new Date().getMonth(); // 0-11
let currentYear = new Date().getFullYear();
let allData = {};

// ============================================
// Referências DOM
// ============================================

const $ = (sel) => document.querySelector(sel);

const dom = {
  selectMonth: $('#selectMonth'),
  selectYear: $('#selectYear'),
  btnPrevMonth: $('#btnPrevMonth'),
  btnNextMonth: $('#btnNextMonth'),
  btnCopyMonth: $('#btnCopyMonth'),
  btnExport: $('#btnExport'),
  btnImport: $('#btnImport'),
  inputImport: $('#inputImport'),
  btnClearMonth: $('#btnClearMonth'),
  formAdd: $('#formAdd'),
  formEdit: $('#formEdit'),
  entriesBody: $('#entriesBody'),
  cardsList: $('#cardsList'),
  emptyState: $('#emptyState'),
  tableWrapper: $('#tableWrapper'),
  entryCount: $('#entryCount'),
  modalOverlay: $('#modalOverlay'),
  btnCloseModal: $('#btnCloseModal'),
  btnCancelEdit: $('#btnCancelEdit'),
  toast: $('#toast'),
  // Resumo
  totalIncome: $('#totalIncome'),
  totalExpense: $('#totalExpense'),
  totalBalance: $('#totalBalance'),
  totalPaid: $('#totalPaid'),
  totalReserved: $('#totalReserved'),
  totalUnpaid: $('#totalUnpaid'),
  // Form add
  inputDescription: $('#inputDescription'),
  inputCategory: $('#inputCategory'),
  inputType: $('#inputType'),
  inputValue: $('#inputValue'),
  inputStatus: $('#inputStatus'),
  inputObservation: $('#inputObservation'),
  // Form edit
  editId: $('#editId'),
  editDescription: $('#editDescription'),
  editCategory: $('#editCategory'),
  editType: $('#editType'),
  editValue: $('#editValue'),
  editStatus: $('#editStatus'),
  editObservation: $('#editObservation')
};

// ============================================
// Utilitários
// ============================================

/** Gera chave do mês no formato YYYY-MM */
function getMonthKey(year, month) {
  const m = String(month + 1).padStart(2, '0');
  return `${year}-${m}`;
}

/** Gera ID único para lançamento */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Converte string de valor para número (aceita vírgula ou ponto) */
function parseValue(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

/** Formata número como moeda brasileira */
function formatCurrency(value) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/** Exibe toast de notificação */
function showToast(message, type = 'info') {
  dom.toast.textContent = message;
  dom.toast.className = `toast toast--${type} toast--visible`;

  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => {
    dom.toast.classList.remove('toast--visible');
  }, 3000);
}

// ============================================
// LocalStorage
// ============================================

/** Carrega todos os dados do LocalStorage */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    allData = raw ? JSON.parse(raw) : {};
  } catch {
    allData = {};
    showToast('Erro ao carregar dados. Iniciando do zero.', 'error');
  }
}

/** Salva todos os dados no LocalStorage */
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch {
    showToast('Erro ao salvar dados. Verifique o espaço do navegador.', 'error');
  }
}

/** Retorna lançamentos do mês atual */
function getCurrentEntries() {
  const key = getMonthKey(currentYear, currentMonth);
  return allData[key] || [];
}

/** Salva lançamentos do mês atual */
function setCurrentEntries(entries) {
  const key = getMonthKey(currentYear, currentMonth);
  allData[key] = entries;
  saveData();
}

// ============================================
// Inicialização da interface
// ============================================

/** Preenche selects de mês e ano */
function populateSelectors() {
  dom.selectMonth.innerHTML = MESES.map((nome, i) =>
    `<option value="${i}">${nome}</option>`
  ).join('');

  const startYear = 2020;
  const endYear = new Date().getFullYear() + 3;
  dom.selectYear.innerHTML = '';

  for (let y = endYear; y >= startYear; y--) {
    dom.selectYear.innerHTML += `<option value="${y}">${y}</option>`;
  }

  dom.selectMonth.value = currentMonth;
  dom.selectYear.value = currentYear;
}

/** Preenche selects de categoria */
function populateCategories() {
  const options = CATEGORIAS.map(c =>
    `<option value="${c}">${c}</option>`
  ).join('');

  dom.inputCategory.innerHTML = options;
  dom.editCategory.innerHTML = options;
}

/** Vincula eventos da interface */
function bindEvents() {
  dom.selectMonth.addEventListener('change', () => {
    currentMonth = parseInt(dom.selectMonth.value);
    render();
  });

  dom.selectYear.addEventListener('change', () => {
    currentYear = parseInt(dom.selectYear.value);
    render();
  });

  dom.btnPrevMonth.addEventListener('click', () => navigateMonth(-1));
  dom.btnNextMonth.addEventListener('click', () => navigateMonth(1));

  dom.btnCopyMonth.addEventListener('click', copyPreviousMonth);
  dom.btnClearMonth.addEventListener('click', clearCurrentMonth);
  dom.btnExport.addEventListener('click', exportData);
  dom.btnImport.addEventListener('click', () => dom.inputImport.click());
  dom.inputImport.addEventListener('change', importData);

  dom.formAdd.addEventListener('submit', handleAddEntry);
  dom.formEdit.addEventListener('submit', handleEditEntry);

  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.btnCancelEdit.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/** Navega para mês anterior ou próximo */
function navigateMonth(direction) {
  currentMonth += direction;

  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }

  dom.selectMonth.value = currentMonth;
  dom.selectYear.value = currentYear;
  render();
}

// ============================================
// CRUD de lançamentos
// ============================================

/** Adiciona novo lançamento */
function handleAddEntry(e) {
  e.preventDefault();

  const entry = {
    id: generateId(),
    description: dom.inputDescription.value.trim(),
    category: dom.inputCategory.value,
    type: dom.inputType.value,
    value: parseValue(dom.inputValue.value),
    status: dom.inputStatus.value,
    observation: dom.inputObservation.value.trim()
  };

  if (!entry.description) {
    showToast('Informe uma descrição.', 'error');
    return;
  }

  if (entry.value <= 0) {
    showToast('Informe um valor maior que zero.', 'error');
    return;
  }

  const entries = getCurrentEntries();
  entries.push(entry);
  setCurrentEntries(entries);

  dom.formAdd.reset();
  dom.inputType.value = 'despesa';
  dom.inputStatus.value = 'nao_pago';

  showToast('Lançamento adicionado!', 'success');
  render();
}

/** Abre modal de edição */
function openEditModal(id) {
  const entry = getCurrentEntries().find(e => e.id === id);
  if (!entry) return;

  dom.editId.value = entry.id;
  dom.editDescription.value = entry.description;
  dom.editCategory.value = entry.category;
  dom.editType.value = entry.type;
  dom.editValue.value = entry.value.toFixed(2).replace('.', ',');
  dom.editStatus.value = entry.status;
  dom.editObservation.value = entry.observation || '';

  dom.modalOverlay.hidden = false;
  dom.editDescription.focus();
}

/** Fecha modal de edição */
function closeModal() {
  dom.modalOverlay.hidden = true;
}

/** Salva edição de lançamento */
function handleEditEntry(e) {
  e.preventDefault();

  const id = dom.editId.value;
  const entries = getCurrentEntries();
  const index = entries.findIndex(e => e.id === id);

  if (index === -1) return;

  const value = parseValue(dom.editValue.value);
  if (value <= 0) {
    showToast('Informe um valor maior que zero.', 'error');
    return;
  }

  entries[index] = {
    ...entries[index],
    description: dom.editDescription.value.trim(),
    category: dom.editCategory.value,
    type: dom.editType.value,
    value,
    status: dom.editStatus.value,
    observation: dom.editObservation.value.trim()
  };

  setCurrentEntries(entries);
  closeModal();
  showToast('Lançamento atualizado!', 'success');
  render();
}

/** Exclui lançamento */
function deleteEntry(id) {
  const entry = getCurrentEntries().find(e => e.id === id);
  if (!entry) return;

  const msg = `Excluir "${entry.description}"?`;
  if (!confirm(msg)) return;

  const entries = getCurrentEntries().filter(e => e.id !== id);
  setCurrentEntries(entries);
  showToast('Lançamento excluído.', 'info');
  render();
}

/** Altera status rapidamente */
function changeStatus(id, newStatus) {
  const entries = getCurrentEntries();
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return;

  entries[index].status = newStatus;
  setCurrentEntries(entries);
  render();
}

// ============================================
// Ações do mês
// ============================================

/** Copia lançamentos do mês anterior (status volta para "não pago") */
function copyPreviousMonth() {
  let prevMonth = currentMonth - 1;
  let prevYear = currentYear;

  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear--;
  }

  const prevKey = getMonthKey(prevYear, prevMonth);
  const prevEntries = allData[prevKey] || [];

  if (prevEntries.length === 0) {
    showToast('O mês anterior não tem lançamentos.', 'error');
    return;
  }

  const currentEntries = getCurrentEntries();

  if (currentEntries.length > 0) {
    const confirmMsg = `Este mês já tem ${currentEntries.length} lançamento(s). Deseja adicionar os ${prevEntries.length} do mês anterior?`;
    if (!confirm(confirmMsg)) return;
  }

  const copied = prevEntries.map(entry => ({
    id: generateId(),
    description: entry.description,
    category: entry.category,
    type: entry.type,
    value: entry.value,
    status: 'nao_pago',
    observation: entry.observation || ''
  }));

  setCurrentEntries([...currentEntries, ...copied]);
  showToast(`${copied.length} lançamento(s) copiado(s) do mês anterior!`, 'success');
  render();
}

/** Limpa todos os lançamentos do mês atual */
function clearCurrentMonth() {
  const entries = getCurrentEntries();
  if (entries.length === 0) {
    showToast('Este mês já está vazio.', 'info');
    return;
  }

  const monthName = MESES[currentMonth];
  const msg = `Tem certeza que deseja apagar todos os ${entries.length} lançamento(s) de ${monthName}/${currentYear}?`;
  if (!confirm(msg)) return;

  setCurrentEntries([]);
  showToast('Mês limpo com sucesso.', 'info');
  render();
}

// ============================================
// Exportar / Importar
// ============================================

/** Exporta todos os dados como JSON */
function exportData() {
  const dataStr = JSON.stringify(allData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `financas-casa-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Dados exportados com sucesso!', 'success');
}

/** Importa dados de arquivo JSON */
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);

      if (typeof imported !== 'object' || imported === null) {
        throw new Error('Formato inválido');
      }

      const msg = 'Importar vai substituir todos os dados atuais. Deseja continuar?';
      if (!confirm(msg)) return;

      allData = imported;
      saveData();
      render();
      showToast('Dados importados com sucesso!', 'success');
    } catch {
      showToast('Arquivo JSON inválido.', 'error');
    }

    dom.inputImport.value = '';
  };

  reader.readAsText(file);
}

// ============================================
// Cálculos e resumo
// ============================================

/** Calcula totais do mês */
function calculateSummary(entries) {
  const summary = {
    income: 0,
    expense: 0,
    paid: 0,
    reserved: 0,
    unpaid: 0
  };

  entries.forEach(entry => {
    const val = entry.value;

    if (entry.type === 'entrada') {
      summary.income += val;
    } else {
      summary.expense += val;
    }

    if (entry.status === 'pago') summary.paid += val;
    else if (entry.status === 'reservado') summary.reserved += val;
    else summary.unpaid += val;
  });

  summary.balance = summary.income - summary.expense;
  return summary;
}

/** Atualiza cards de resumo */
function updateSummary(entries) {
  const s = calculateSummary(entries);

  dom.totalIncome.textContent = formatCurrency(s.income);
  dom.totalExpense.textContent = formatCurrency(s.expense);
  dom.totalBalance.textContent = formatCurrency(s.balance);
  dom.totalPaid.textContent = formatCurrency(s.paid);
  dom.totalReserved.textContent = formatCurrency(s.reserved);
  dom.totalUnpaid.textContent = formatCurrency(s.unpaid);

  dom.totalBalance.style.color = s.balance >= 0
    ? 'var(--color-income)'
    : 'var(--color-expense)';
}

// ============================================
// Renderização
// ============================================

/** Cria HTML do select de status */
function createStatusSelect(entry) {
  const options = Object.entries(STATUS_LABELS).map(([val, label]) =>
    `<option value="${val}" ${entry.status === val ? 'selected' : ''}>${label}</option>`
  ).join('');

  return `<select class="status-select status-select--${entry.status}"
            data-id="${entry.id}" data-action="status"
            aria-label="Alterar status de ${entry.description}">
            ${options}
          </select>`;
}

/** Cria botões de ação */
function createActionButtons(id) {
  return `
    <button type="button" class="btn-action btn-action--edit" data-id="${id}" data-action="edit" title="Editar" aria-label="Editar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
    </button>
    <button type="button" class="btn-action btn-action--delete" data-id="${id}" data-action="delete" title="Excluir" aria-label="Excluir">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
    </button>
  `;
}

/** Renderiza tabela (desktop) */
function renderTable(entries) {
  dom.entriesBody.innerHTML = entries.map(entry => {
    const valueClass = entry.type === 'entrada' ? 'cell-value--income' : 'cell-value--expense';
    const typeLabel = entry.type === 'entrada' ? 'Entrada' : 'Despesa';

    return `
      <tr data-id="${entry.id}">
        <td class="cell-description">${escapeHtml(entry.description)}</td>
        <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
        <td><span class="type-badge type-badge--${entry.type}">${typeLabel}</span></td>
        <td class="cell-value ${valueClass}">${formatCurrency(entry.value)}</td>
        <td>${createStatusSelect(entry)}</td>
        <td class="cell-obs" title="${escapeHtml(entry.observation || '')}">${escapeHtml(entry.observation || '—')}</td>
        <td class="cell-actions">${createActionButtons(entry.id)}</td>
      </tr>
    `;
  }).join('');
}

/** Renderiza cards (mobile) */
function renderCards(entries) {
  dom.cardsList.innerHTML = entries.map(entry => {
    const valueClass = entry.type === 'entrada' ? 'entry-card__value--income' : 'entry-card__value--expense';
    const typeLabel = entry.type === 'entrada' ? 'Entrada' : 'Despesa';
    const obsHtml = entry.observation
      ? `<p class="entry-card__obs">${escapeHtml(entry.observation)}</p>`
      : '';

    return `
      <div class="entry-card" data-id="${entry.id}">
        <div class="entry-card__header">
          <span class="entry-card__title">${escapeHtml(entry.description)}</span>
          <span class="entry-card__value ${valueClass}">${formatCurrency(entry.value)}</span>
        </div>
        <div class="entry-card__meta">
          <span class="category-tag">${escapeHtml(entry.category)}</span>
          <span class="type-badge type-badge--${entry.type}">${typeLabel}</span>
        </div>
        ${obsHtml}
        <div class="entry-card__footer">
          ${createStatusSelect(entry)}
          <div class="entry-card__actions">${createActionButtons(entry.id)}</div>
        </div>
      </div>
    `;
  }).join('');
}

/** Escapa HTML para evitar XSS */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Atualiza classe do select de status ao mudar */
function updateStatusSelectClass(select) {
  select.className = `status-select status-select--${select.value}`;
}

/** Delegação de eventos na lista */
function bindListEvents() {
  const container = $('#entriesContainer');

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT') return;

    const { id, action } = btn.dataset;
    if (action === 'edit') openEditModal(id);
    if (action === 'delete') deleteEntry(id);
  });

  container.addEventListener('change', (e) => {
    const select = e.target.closest('[data-action="status"]');
    if (!select) return;

    changeStatus(select.dataset.id, select.value);
    updateStatusSelectClass(select);
  });
}

/** Renderiza toda a interface */
function render() {
  const entries = getCurrentEntries();
  const hasEntries = entries.length > 0;

  dom.entryCount.textContent = entries.length;
  dom.emptyState.hidden = hasEntries;
  dom.tableWrapper.style.display = hasEntries ? '' : 'none';

  if (hasEntries) {
    // Ordena: entradas primeiro, depois despesas; dentro de cada tipo por descrição
    const sorted = [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'entrada' ? -1 : 1;
      return a.description.localeCompare(b.description, 'pt-BR');
    });

    renderTable(sorted);
    renderCards(sorted);
  } else {
    dom.entriesBody.innerHTML = '';
    dom.cardsList.innerHTML = '';
  }

  updateSummary(entries);
}

// ============================================
// Inicialização
// ============================================

function init() {
  loadData();
  populateSelectors();
  populateCategories();
  bindEvents();
  bindListEvents();
  render();
}

document.addEventListener('DOMContentLoaded', init);
