/**
 * Finanças da Casa
 * Controle financeiro mensal — ES6+ | LocalStorage
 */

// ============================================
// Constantes
// ============================================

const STORAGE_KEY = 'financas_casa_dados';

const CATEGORIAS = [
  'Contribuição para casa',
  'Aluguel',
  'Combustível',
  'Mercado',
  'Luz',
  'Água',
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

const CHART_COLORS = [
  '#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'
];

// ============================================
// Estado global
// ============================================

let currentDate = dayjs();
let allData = {};
let editModal = null;
let maskAdd = null;
let maskEdit = null;
let chartIncomeExpense = null;
let chartCategories = null;

const notyf = new Notyf({
  duration: 3000,
  position: { x: 'center', y: 'bottom' },
  dismissible: true
});

// ============================================
// DOM
// ============================================

const $ = (sel) => document.querySelector(sel);

const dom = {
  currentMonthLabel: $('#currentMonthLabel'),
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
  editModalEl: $('#editModal'),
  totalIncome: $('#totalIncome'),
  totalExpense: $('#totalExpense'),
  totalBalance: $('#totalBalance'),
  totalPaid: $('#totalPaid'),
  totalReserved: $('#totalReserved'),
  totalUnpaid: $('#totalUnpaid'),
  inputDescription: $('#inputDescription'),
  inputCategory: $('#inputCategory'),
  inputType: $('#inputType'),
  inputValue: $('#inputValue'),
  inputStatus: $('#inputStatus'),
  inputObservation: $('#inputObservation'),
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

const getMonthKey = (date) => date.format('YYYY-MM');

const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const parseValue = (str) => {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : Math.abs(num);
};

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
};

const notify = {
  success: (msg) => notyf.success(msg),
  error: (msg) => notyf.error(msg),
  info: (msg) => notyf.open({ type: 'info', message: msg })
};

const confirmAction = async ({ title, text, icon = 'question', confirmText = 'Confirmar' }) => {
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#4f6ef7',
    cancelButtonColor: '#94a3b8',
    reverseButtons: true
  });
  return result.isConfirmed;
};

// ============================================
// LocalStorage
// ============================================

const loadData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    allData = raw ? JSON.parse(raw) : {};
  } catch {
    allData = {};
    notify.error('Erro ao carregar dados. Iniciando do zero.');
  }
};

const saveData = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch {
    notify.error('Erro ao salvar. Verifique o espaço do navegador.');
  }
};

const getCurrentEntries = () => allData[getMonthKey(currentDate)] ?? [];

const setCurrentEntries = (entries) => {
  allData[getMonthKey(currentDate)] = entries;
  saveData();
};

// ============================================
// Máscara de dinheiro (IMask)
// ============================================

const moneyMaskOptions = {
  mask: Number,
  scale: 2,
  thousandsSeparator: '.',
  radix: ',',
  mapToRadix: ['.'],
  normalizeZeros: true,
  padFractionalZeros: true,
  min: 0
};

const initMoneyMasks = () => {
  maskAdd = IMask(dom.inputValue, moneyMaskOptions);
  maskEdit = IMask(dom.editValue, moneyMaskOptions);
};

const resetAddForm = () => {
  dom.formAdd.reset();
  dom.inputType.value = 'despesa';
  dom.inputStatus.value = 'nao_pago';
  maskAdd.typedValue = 0;
  dom.inputDescription.focus();
};

const setMaskValue = (mask, value) => {
  mask.typedValue = value;
};

// ============================================
// Seletores e navegação
// ============================================

const populateSelectors = () => {
  dom.selectMonth.innerHTML = MESES
    .map((nome, i) => `<option value="${i}">${nome}</option>`)
    .join('');

  const startYear = 2020;
  const endYear = dayjs().year() + 3;

  dom.selectYear.innerHTML = Array.from(
    { length: endYear - startYear + 1 },
    (_, i) => endYear - i
  ).map((y) => `<option value="${y}">${y}</option>`).join('');

  syncSelectors();
};

const populateCategories = () => {
  const options = CATEGORIAS
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('');
  dom.inputCategory.innerHTML = options;
  dom.editCategory.innerHTML = options;
};

const syncSelectors = () => {
  dom.selectMonth.value = currentDate.month();
  dom.selectYear.value = currentDate.year();
  dom.currentMonthLabel.textContent = currentDate
    .locale('pt-br')
    .format('MMMM [de] YYYY');
};

const navigateMonth = (direction) => {
  currentDate = currentDate.add(direction, 'month');
  syncSelectors();
  render();
};

const onMonthChange = () => {
  currentDate = currentDate
    .month(parseInt(dom.selectMonth.value))
    .year(parseInt(dom.selectYear.value));
  syncSelectors();
  render();
};

// ============================================
// Cálculos
// ============================================

const calculateSummary = (entries) =>
  entries.reduce(
    (acc, { type, value, status }) => {
      if (type === 'entrada') acc.income += value;
      else acc.expense += value;

      if (status === 'pago') acc.paid += value;
      else if (status === 'reservado') acc.reserved += value;
      else acc.unpaid += value;

      return acc;
    },
    { income: 0, expense: 0, paid: 0, reserved: 0, unpaid: 0 }
  );

const getExpensesByCategory = (entries) =>
  entries
    .filter((e) => e.type === 'despesa')
    .reduce((acc, { category, value }) => {
      acc[category] = (acc[category] ?? 0) + value;
      return acc;
    }, {});

const sortEntries = (entries) =>
  [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'entrada' ? -1 : 1;
    return a.description.localeCompare(b.description, 'pt-BR');
  });

// ============================================
// Gráficos (Chart.js)
// ============================================

const destroyChart = (chart) => {
  if (chart) chart.destroy();
};

const updateCharts = (entries) => {
  const summary = calculateSummary(entries);
  const byCategory = getExpensesByCategory(entries);

  destroyChart(chartIncomeExpense);
  destroyChart(chartCategories);

  const ctxIE = document.getElementById('chartIncomeExpense');
  const ctxCat = document.getElementById('chartCategories');

  chartIncomeExpense = new Chart(ctxIE, {
    type: 'bar',
    data: {
      labels: ['Entradas', 'Despesas'],
      datasets: [{
        data: [summary.income, summary.expense],
        backgroundColor: ['#10b981', '#ef4444'],
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatCurrency(v)
          }
        }
      }
    }
  });

  const catLabels = Object.keys(byCategory);
  const catValues = Object.values(byCategory);

  chartCategories = new Chart(ctxCat, {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['Sem despesas'],
      datasets: [{
        data: catValues.length ? catValues : [1],
        backgroundColor: catLabels.length
          ? CHART_COLORS.slice(0, catLabels.length)
          : ['#e2e8f0'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (!catValues.length) return 'Nenhuma despesa';
              const total = catValues.reduce((a, b) => a + b, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return `${formatCurrency(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
};

// ============================================
// CRUD
// ============================================

const buildEntryFromForm = (formData) => ({
  id: formData.id ?? generateId(),
  description: formData.description.trim(),
  category: formData.category,
  type: formData.type,
  value: formData.value,
  status: formData.status,
  observation: formData.observation.trim()
});

const validateEntry = (entry) => {
  if (!entry.description) {
    notify.error('Informe uma descrição.');
    return false;
  }
  if (entry.value <= 0) {
    notify.error('Informe um valor maior que zero.');
    return false;
  }
  return true;
};

const handleAddEntry = (e) => {
  e.preventDefault();

  const entry = buildEntryFromForm({
    description: dom.inputDescription.value,
    category: dom.inputCategory.value,
    type: dom.inputType.value,
    value: parseValue(maskAdd.value),
    status: dom.inputStatus.value,
    observation: dom.inputObservation.value
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
  dom.editObservation.value = entry.observation ?? '';
  setMaskValue(maskEdit, entry.value);

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
    value: parseValue(maskEdit.value),
    status: dom.editStatus.value,
    observation: dom.editObservation.value
  });

  if (!validateEntry(updated)) return;

  entries[index] = updated;
  setCurrentEntries(entries);
  editModal.hide();
  notify.success('Lançamento atualizado!');
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
  if (index === -1) return;

  entries[index].status = newStatus;
  setCurrentEntries(entries);
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

  if (currentEntries.length) {
    const confirmed = await confirmAction({
      title: 'Copiar mês anterior?',
      text: `Serão adicionados ${prevEntries.length} lançamento(s) aos ${currentEntries.length} já existentes. Status voltará para "Não pago".`,
      confirmText: 'Sim, copiar'
    });
    if (!confirmed) return;
  }

  const copied = prevEntries.map(({ description, category, type, value, observation }) => ({
    id: generateId(),
    description,
    category,
    type,
    value,
    status: 'nao_pago',
    observation: observation ?? ''
  }));

  setCurrentEntries([...currentEntries, ...copied]);
  notify.success(`${copied.length} lançamento(s) copiado(s)!`);
  render();
};

const clearCurrentMonth = async () => {
  const entries = getCurrentEntries();
  if (!entries.length) {
    notify.info('Este mês já está vazio.');
    return;
  }

  const monthName = MESES[currentDate.month()];
  const confirmed = await confirmAction({
    title: 'Limpar mês?',
    text: `Apagar todos os ${entries.length} lançamento(s) de ${monthName}/${currentDate.year()}?`,
    icon: 'warning',
    confirmText: 'Sim, limpar'
  });

  if (!confirmed) return;

  setCurrentEntries([]);
  notify.info('Mês limpo com sucesso.');
  render();
};

// ============================================
// Exportar / Importar
// ============================================

const exportData = () => {
  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `financas-casa-${dayjs().format('YYYY-MM-DD')}.json`;
  link.click();
  URL.revokeObjectURL(url);

  notify.success('Dados exportados!');
};

const importData = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (typeof imported !== 'object' || imported === null) {
        throw new Error('Formato inválido');
      }

      const confirmed = await confirmAction({
        title: 'Importar dados?',
        text: 'Isso substituirá todos os dados atuais. Deseja continuar?',
        icon: 'warning',
        confirmText: 'Sim, importar'
      });

      if (!confirmed) return;

      allData = imported;
      saveData();
      render();
      notify.success('Dados importados com sucesso!');
    } catch {
      notify.error('Arquivo JSON inválido.');
    }

    dom.inputImport.value = '';
  };

  reader.readAsText(file);
};

// ============================================
// Renderização
// ============================================

const createStatusSelect = (entry) => {
  const options = Object.entries(STATUS_LABELS)
    .map(([val, label]) =>
      `<option value="${val}" ${entry.status === val ? 'selected' : ''}>${label}</option>`
    )
    .join('');

  return `<select class="status-select status-select--${entry.status}"
            data-id="${entry.id}" data-action="status"
            aria-label="Status de ${escapeHtml(entry.description)}">
            ${options}
          </select>`;
};

const createActionButtons = (id) => `
  <div class="btn-group btn-group-sm">
    <button type="button" class="btn btn-outline-primary" data-id="${id}" data-action="edit" title="Editar">
      <i class="bi bi-pencil"></i>
    </button>
    <button type="button" class="btn btn-outline-danger" data-id="${id}" data-action="delete" title="Excluir">
      <i class="bi bi-trash"></i>
    </button>
  </div>`;

const renderTable = (entries) => {
  dom.entriesBody.innerHTML = entries.map((entry) => {
    const valueClass = entry.type === 'entrada' ? 'value-income' : 'value-expense';
    const typeLabel = entry.type === 'entrada' ? 'Entrada' : 'Despesa';

    return `
      <tr data-id="${entry.id}">
        <td class="cell-description">${escapeHtml(entry.description)}</td>
        <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
        <td><span class="type-badge type-badge--${entry.type}">${typeLabel}</span></td>
        <td class="${valueClass}">${formatCurrency(entry.value)}</td>
        <td>${createStatusSelect(entry)}</td>
        <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">
          ${escapeHtml(entry.observation || '—')}
        </td>
        <td class="text-end">${createActionButtons(entry.id)}</td>
      </tr>`;
  }).join('');
};

const renderCards = (entries) => {
  dom.cardsList.innerHTML = entries.map((entry) => {
    const valueClass = entry.type === 'entrada' ? 'value-income' : 'value-expense';
    const typeLabel = entry.type === 'entrada' ? 'Entrada' : 'Despesa';
    const obs = entry.observation
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
        ${obs}
        <div class="entry-card__footer">
          ${createStatusSelect(entry)}
          ${createActionButtons(entry.id)}
        </div>
      </div>`;
  }).join('');
};

const updateSummary = (entries) => {
  const { income, expense, paid, reserved, unpaid } = calculateSummary(entries);
  const balance = income - expense;

  dom.totalIncome.textContent = formatCurrency(income);
  dom.totalExpense.textContent = formatCurrency(expense);
  dom.totalBalance.textContent = formatCurrency(balance);
  dom.totalPaid.textContent = formatCurrency(paid);
  dom.totalReserved.textContent = formatCurrency(reserved);
  dom.totalUnpaid.textContent = formatCurrency(unpaid);

  dom.totalBalance.style.color = balance >= 0 ? 'var(--app-income)' : 'var(--app-expense)';
};

const render = () => {
  const entries = getCurrentEntries();
  const hasEntries = entries.length > 0;
  const sorted = hasEntries ? sortEntries(entries) : [];

  dom.entryCount.textContent = entries.length;
  dom.emptyState.hidden = hasEntries;
  dom.tableWrapper.hidden = !hasEntries;

  if (hasEntries) {
    renderTable(sorted);
    renderCards(sorted);
  } else {
    dom.entriesBody.innerHTML = '';
    dom.cardsList.innerHTML = '';
  }

  updateSummary(entries);
  updateCharts(entries);
};

// ============================================
// Eventos
// ============================================

const bindEvents = () => {
  dom.selectMonth.addEventListener('change', onMonthChange);
  dom.selectYear.addEventListener('change', onMonthChange);
  dom.btnPrevMonth.addEventListener('click', () => navigateMonth(-1));
  dom.btnNextMonth.addEventListener('click', () => navigateMonth(1));
  dom.btnCopyMonth.addEventListener('click', copyPreviousMonth);
  dom.btnClearMonth.addEventListener('click', clearCurrentMonth);
  dom.btnExport.addEventListener('click', exportData);
  dom.btnImport.addEventListener('click', () => dom.inputImport.click());
  dom.inputImport.addEventListener('change', importData);
  dom.formAdd.addEventListener('submit', handleAddEntry);
  dom.formEdit.addEventListener('submit', handleEditEntry);

  // Delegação: tabela + cards mobile
  document.getElementById('entriesTable')?.addEventListener('click', handleListClick);
  dom.cardsList.addEventListener('click', handleListClick);
  document.getElementById('entriesTable')?.addEventListener('change', handleStatusChange);
  dom.cardsList.addEventListener('change', handleStatusChange);
};

const handleListClick = (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;

  const { id, action } = btn.dataset;
  if (action === 'edit') openEditModal(id);
  if (action === 'delete') deleteEntry(id);
};

const handleStatusChange = (e) => {
  const select = e.target.closest('[data-action="status"]');
  if (!select) return;

  changeStatus(select.dataset.id, select.value);
  select.className = `status-select status-select--${select.value}`;
};

// ============================================
// Inicialização
// ============================================

const init = () => {
  dayjs.locale('pt-br');
  loadData();
  populateSelectors();
  populateCategories();
  initMoneyMasks();
  editModal = new bootstrap.Modal(dom.editModalEl);
  bindEvents();
  render();
};

document.addEventListener('DOMContentLoaded', init);
