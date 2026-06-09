/**
 * Finanças da Casa
 * ES6+ | LocalStorage | Tema Dark/Light | Exportações
 */

// ============================================
// Constantes
// ============================================

const STORAGE_KEY = 'financas_casa_dados';
const THEME_KEY = 'financas_casa_theme';

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

const TYPE_LABELS = {
  entrada: 'Entrada',
  despesa: 'Despesa'
};

const CHART_COLORS = [
  '#4f6ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'
];

// ============================================
// Estado
// ============================================

let currentDate = dayjs();
let allData = {};
let currentTheme = 'light';
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
  html: document.documentElement,
  currentMonthLabel: $('#currentMonthLabel'),
  selectMonth: $('#selectMonth'),
  selectYear: $('#selectYear'),
  btnPrevMonth: $('#btnPrevMonth'),
  btnNextMonth: $('#btnNextMonth'),
  btnCopyMonth: $('#btnCopyMonth'),
  btnTheme: $('#btnTheme'),
  themeIcon: $('#themeIcon'),
  btnImport: $('#btnImport'),
  inputImport: $('#inputImport'),
  btnClearMonth: $('#btnClearMonth'),
  formAdd: $('#formAdd'),
  formEdit: $('#formEdit'),
  entryCount: $('#entryCount'),
  emptyState: $('#emptyState'),
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
  editObservation: $('#editObservation'),
  incomeCount: $('#incomeCount'),
  expenseCount: $('#expenseCount'),
  incomeSubtotal: $('#incomeSubtotal'),
  expenseSubtotal: $('#expenseSubtotal'),
  incomeBody: $('#incomeBody'),
  expenseBody: $('#expenseBody'),
  incomeCards: $('#incomeCards'),
  expenseCards: $('#expenseCards'),
  incomeTableWrapper: $('#incomeTableWrapper'),
  expenseTableWrapper: $('#expenseTableWrapper'),
  incomeEmpty: $('#incomeEmpty'),
  expenseEmpty: $('#expenseEmpty'),
  incomeTable: $('#incomeTable'),
  expenseTable: $('#expenseTable'),
  incomeSection: $('#incomeSection'),
  expenseSection: $('#expenseSection')
};

// ============================================
// Utilitários
// ============================================

const getMonthKey = (date) => date.format('YYYY-MM');

const getMonthLabel = () =>
  currentDate.locale('pt-br').format('MMMM [de] YYYY');

const getExportBaseName = () =>
  `financas-casa-${getMonthKey(currentDate)}`;

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

const formatValuePlain = (value) =>
  value.toFixed(2).replace('.', ',');

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
  const { isConfirmed } = await Swal.fire({
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
  return isConfirmed;
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const getChartTheme = () => {
  const style = getComputedStyle(document.documentElement);
  return {
    grid: style.getPropertyValue('--chart-grid').trim() || '#e2e8f0',
    text: style.getPropertyValue('--chart-text').trim() || '#64748b'
  };
};

// ============================================
// Tema Dark / Light
// ============================================

const applyTheme = (theme) => {
  currentTheme = theme;
  dom.html.setAttribute('data-theme', theme);
  dom.html.setAttribute('data-bs-theme', theme);
  dom.themeIcon.className = theme === 'dark'
    ? 'bi bi-sun-fill'
    : 'bi bi-moon-stars-fill';
  localStorage.setItem(THEME_KEY, theme);

  const metaTheme = document.getElementById('metaThemeColor');
  if (metaTheme) {
    metaTheme.content = theme === 'dark' ? '#1e293b' : '#ffffff';
  }
};

const initTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
};

const toggleTheme = () => {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  render();
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
// IMask
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
// Navegação
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
  const options = CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join('');
  dom.inputCategory.innerHTML = options;
  dom.editCategory.innerHTML = options;
};

const syncSelectors = () => {
  dom.selectMonth.value = currentDate.month();
  dom.selectYear.value = currentDate.year();
  dom.currentMonthLabel.textContent = getMonthLabel();
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

const splitEntries = (entries) => ({
  income: entries
    .filter((e) => e.type === 'entrada')
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR')),
  expense: entries
    .filter((e) => e.type === 'despesa')
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'))
});

const getExpensesByCategory = (entries) =>
  entries
    .filter((e) => e.type === 'despesa')
    .reduce((acc, { category, value }) => {
      acc[category] = (acc[category] ?? 0) + value;
      return acc;
    }, {});

const entryToRow = (entry) => [
  entry.description,
  entry.category,
  TYPE_LABELS[entry.type],
  formatValuePlain(entry.value),
  STATUS_LABELS[entry.status],
  entry.observation ?? ''
];

// ============================================
// Gráficos
// ============================================

const destroyChart = (chart) => {
  if (chart) chart.destroy();
};

const updateCharts = (entries) => {
  const summary = calculateSummary(entries);
  const byCategory = getExpensesByCategory(entries);
  const { grid, text } = getChartTheme();

  destroyChart(chartIncomeExpense);
  destroyChart(chartCategories);

  chartIncomeExpense = new Chart($('#chartIncomeExpense'), {
    type: 'bar',
    data: {
      labels: ['Entradas', 'Despesas'],
      datasets: [{
        data: [summary.income, summary.expense],
        backgroundColor: ['#10b981', '#ef4444'],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatCurrency(ctx.raw) } }
      },
      scales: {
        x: { ticks: { color: text }, grid: { color: grid } },
        y: {
          beginAtZero: true,
          ticks: { color: text, callback: (v) => formatCurrency(v) },
          grid: { color: grid }
        }
      }
    }
  });

  const catLabels = Object.keys(byCategory);
  const catValues = Object.values(byCategory);

  chartCategories = new Chart($('#chartCategories'), {
    type: 'doughnut',
    data: {
      labels: catLabels.length ? catLabels : ['Sem despesas'],
      datasets: [{
        data: catValues.length ? catValues : [1],
        backgroundColor: catLabels.length
          ? CHART_COLORS.slice(0, catLabels.length)
          : ['#64748b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 11 }, color: text }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (!catValues.length) return 'Nenhuma despesa';
              const total = catValues.reduce((a, b) => a + b, 0);
              return `${formatCurrency(ctx.raw)} (${((ctx.raw / total) * 100).toFixed(1)}%)`;
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
  if (!entry.description) { notify.error('Informe uma descrição.'); return false; }
  if (entry.value <= 0) { notify.error('Informe um valor maior que zero.'); return false; }
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
      text: `Serão adicionados ${prevEntries.length} lançamento(s). Status voltará para "Não pago".`,
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

// ============================================
// Exportações
// ============================================

const getExportContext = () => {
  const entries = getCurrentEntries();
  const { income, expense } = splitEntries(entries);
  const summary = calculateSummary(entries);
  const balance = summary.income - summary.expense;

  return { entries, income, expense, summary, balance, monthLabel: getMonthLabel() };
};

const exportJSON = () => {
  downloadBlob(
    new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' }),
    `financas-casa-backup-${dayjs().format('YYYY-MM-DD')}.json`
  );
  notify.success('Backup JSON exportado!');
};

const exportCSV = () => {
  const { income, expense, summary, balance, monthLabel } = getExportContext();

  const lines = [
    `Finanças da Casa - ${monthLabel}`,
    '',
    'RESUMO',
    `Entradas;${formatValuePlain(summary.income)}`,
    `Despesas;${formatValuePlain(summary.expense)}`,
    `Saldo;${formatValuePlain(balance)}`,
    `Pago;${formatValuePlain(summary.paid)}`,
    `Reservado;${formatValuePlain(summary.reserved)}`,
    `Não pago;${formatValuePlain(summary.unpaid)}`,
    '',
    'ENTRADAS E RENDAS',
    'Descrição;Categoria;Valor;Status;Observação',
    ...income.map((e) =>
      [e.description, e.category, formatValuePlain(e.value), STATUS_LABELS[e.status], e.observation ?? ''].join(';')
    ),
    '',
    'DESPESAS E LANÇAMENTOS',
    'Descrição;Categoria;Valor;Status;Observação',
    ...expense.map((e) =>
      [e.description, e.category, formatValuePlain(e.value), STATUS_LABELS[e.status], e.observation ?? ''].join(';')
    )
  ];

  const bom = '\uFEFF';
  downloadBlob(
    new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `${getExportBaseName()}.csv`
  );
  notify.success('CSV exportado!');
};

const exportExcel = () => {
  const { income, expense, summary, balance, monthLabel } = getExportContext();

  const wb = XLSX.utils.book_new();

  const resumoSheet = XLSX.utils.aoa_to_sheet([
    ['Finanças da Casa', monthLabel],
    [],
    ['Resumo', 'Valor (R$)'],
    ['Entradas', summary.income],
    ['Despesas', summary.expense],
    ['Saldo', balance],
    ['Pago', summary.paid],
    ['Reservado', summary.reserved],
    ['Não pago', summary.unpaid]
  ]);

  const incomeSheet = XLSX.utils.aoa_to_sheet([
    ['ENTRADAS E RENDAS'],
    ['Descrição', 'Categoria', 'Valor (R$)', 'Status', 'Observação'],
    ...income.map((e) => [
      e.description, e.category, e.value,
      STATUS_LABELS[e.status], e.observation ?? ''
    ])
  ]);

  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['DESPESAS E LANÇAMENTOS'],
    ['Descrição', 'Categoria', 'Valor (R$)', 'Status', 'Observação'],
    ...expense.map((e) => [
      e.description, e.category, e.value,
      STATUS_LABELS[e.status], e.observation ?? ''
    ])
  ]);

  XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
  XLSX.utils.book_append_sheet(wb, incomeSheet, 'Entradas');
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Despesas');

  XLSX.writeFile(wb, `${getExportBaseName()}.xlsx`);
  notify.success('Excel exportado!');
};

const exportPDF = () => {
  const { income, expense, summary, balance, monthLabel } = getExportContext();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('Finanças da Casa', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(monthLabel, 14, 26);

  doc.autoTable({
    startY: 32,
    head: [['Resumo', 'Valor']],
    body: [
      ['Entradas', formatCurrency(summary.income)],
      ['Despesas', formatCurrency(summary.expense)],
      ['Saldo', formatCurrency(balance)],
      ['Pago', formatCurrency(summary.paid)],
      ['Reservado', formatCurrency(summary.reserved)],
      ['Não pago', formatCurrency(summary.unpaid)]
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 110, 247] },
    styles: { fontSize: 10 }
  });

  let startY = doc.lastAutoTable.finalY + 10;

  if (income.length) {
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text('Entradas e Rendas', 14, startY);

    doc.autoTable({
      startY: startY + 4,
      head: [['Descrição', 'Categoria', 'Valor', 'Status']],
      body: income.map((e) => [
        e.description, e.category,
        formatCurrency(e.value), STATUS_LABELS[e.status]
      ]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 9 }
    });

    startY = doc.lastAutoTable.finalY + 10;
  }

  if (expense.length) {
    doc.setFontSize(12);
    doc.setTextColor(239, 68, 68);
    doc.text('Despesas e Lançamentos', 14, startY);

    doc.autoTable({
      startY: startY + 4,
      head: [['Descrição', 'Categoria', 'Valor', 'Status']],
      body: expense.map((e) => [
        e.description, e.category,
        formatCurrency(e.value), STATUS_LABELS[e.status]
      ]),
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 9 }
    });
  }

  doc.save(`${getExportBaseName()}.pdf`);
  notify.success('PDF exportado!');
};

const handleExport = (format) => {
  const { entries } = getExportContext();

  if (format !== 'json' && !entries.length) {
    notify.error('Não há lançamentos neste mês para exportar.');
    return;
  }

  const exporters = {
    json: exportJSON,
    csv: exportCSV,
    excel: exportExcel,
    pdf: exportPDF
  };

  exporters[format]?.();
};

const importData = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (typeof imported !== 'object' || imported === null) throw new Error();

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
    ).join('');

  return `<select class="status-select status-select--${entry.status}"
            data-id="${entry.id}" data-action="status"
            aria-label="Status de ${escapeHtml(entry.description)}">${options}</select>`;
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

const renderEntryRow = (entry, valueClass) => `
  <tr data-id="${entry.id}">
    <td class="cell-description">${escapeHtml(entry.description)}</td>
    <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
    <td class="${valueClass}">${formatCurrency(entry.value)}</td>
    <td>${createStatusSelect(entry)}</td>
    <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">${escapeHtml(entry.observation || '—')}</td>
    <td class="text-end">${createActionButtons(entry.id)}</td>
  </tr>`;

const renderEntryCard = (entry, valueClass) => {
  const obs = entry.observation
    ? `<p class="entry-card__obs">${escapeHtml(entry.observation)}</p>` : '';

  return `
    <div class="entry-card" data-id="${entry.id}">
      <div class="entry-card__header">
        <span class="entry-card__title">${escapeHtml(entry.description)}</span>
        <span class="entry-card__value ${valueClass}">${formatCurrency(entry.value)}</span>
      </div>
      <div class="entry-card__meta">
        <span class="category-tag">${escapeHtml(entry.category)}</span>
      </div>
      ${obs}
      <div class="entry-card__footer">
        ${createStatusSelect(entry)}
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
  const { income, expense, paid, reserved, unpaid } = calculateSummary(entries);
  const balance = income - expense;
  const { income: incomeList, expense: expenseList } = splitEntries(entries);

  dom.totalIncome.textContent = formatCurrency(income);
  dom.totalExpense.textContent = formatCurrency(expense);
  dom.totalBalance.textContent = formatCurrency(balance);
  dom.totalPaid.textContent = formatCurrency(paid);
  dom.totalReserved.textContent = formatCurrency(reserved);
  dom.totalUnpaid.textContent = formatCurrency(unpaid);
  dom.totalBalance.style.color = balance >= 0 ? 'var(--app-income)' : 'var(--app-expense)';

  dom.entryCount.textContent = entries.length;
  dom.incomeCount.textContent = incomeList.length;
  dom.expenseCount.textContent = expenseList.length;
  dom.incomeSubtotal.textContent = formatCurrency(income);
  dom.expenseSubtotal.textContent = formatCurrency(expense);
};

const render = () => {
  const entries = getCurrentEntries();
  const { income, expense } = splitEntries(entries);
  const hasEntries = entries.length > 0;

  dom.emptyState.hidden = hasEntries;
  dom.incomeSection.hidden = !hasEntries;
  dom.expenseSection.hidden = !hasEntries;

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

  updateSummary(entries);
  updateCharts(entries);
};

// ============================================
// Eventos
// ============================================

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

const bindListEvents = (tableEl, cardsEl) => {
  tableEl?.addEventListener('click', handleListClick);
  cardsEl?.addEventListener('click', handleListClick);
  tableEl?.addEventListener('change', handleStatusChange);
  cardsEl?.addEventListener('change', handleStatusChange);
};

const bindEvents = () => {
  dom.selectMonth.addEventListener('change', onMonthChange);
  dom.selectYear.addEventListener('change', onMonthChange);
  dom.btnPrevMonth.addEventListener('click', () => navigateMonth(-1));
  dom.btnNextMonth.addEventListener('click', () => navigateMonth(1));
  dom.btnCopyMonth.addEventListener('click', copyPreviousMonth);
  dom.btnClearMonth.addEventListener('click', clearCurrentMonth);
  dom.btnTheme.addEventListener('click', toggleTheme);
  dom.btnImport.addEventListener('click', () => dom.inputImport.click());
  dom.inputImport.addEventListener('change', importData);
  dom.formAdd.addEventListener('submit', handleAddEntry);
  dom.formEdit.addEventListener('submit', handleEditEntry);

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => handleExport(btn.dataset.export));
  });

  bindListEvents(dom.incomeTable, dom.incomeCards);
  bindListEvents(dom.expenseTable, dom.expenseCards);
};

// ============================================
// Init
// ============================================

const init = () => {
  dayjs.locale('pt-br');
  initTheme();
  loadData();
  populateSelectors();
  populateCategories();
  initMoneyMasks();
  editModal = new bootstrap.Modal(dom.editModalEl);
  bindEvents();
  render();
};

document.addEventListener('DOMContentLoaded', init);
