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
  'Investimentos',
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
  despesa: 'Despesa',
  investimento: 'Investimento'
};

const PERSON_LABELS = {
  gabriel: 'Gabriel',
  barbara: 'Barbara',
  casa: 'Casa',
  familia: 'Família'
};

const PERSON_MAP = {
  gabriel: 'gabriel',
  gab: 'gabriel',
  g: 'gabriel',
  barbara: 'barbara',
  babi: 'barbara',
  bibi: 'barbara',
  bab: 'barbara',
  casa: 'casa',
  ambos: 'casa',
  compartilhado: 'casa',
  'os dois': 'casa',
  familia: 'familia',
  family: 'familia'
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
  inputImportJson: $('#inputImportJson'),
  inputImportSheet: $('#inputImportSheet'),
  btnClearMonth: $('#btnClearMonth'),
  formAdd: $('#formAdd'),
  formEdit: $('#formEdit'),
  entryCount: $('#entryCount'),
  emptyState: $('#emptyState'),
  editModalEl: $('#editModal'),
  totalIncome: $('#totalIncome'),
  totalExpense: $('#totalExpense'),
  totalInvestment: $('#totalInvestment'),
  calcAfterExpenses: $('#calcAfterExpenses'),
  calcSurplus: $('#calcSurplus'),
  totalPaid: $('#totalPaid'),
  totalReserved: $('#totalReserved'),
  totalUnpaid: $('#totalUnpaid'),
  inputDescription: $('#inputDescription'),
  inputCategory: $('#inputCategory'),
  inputType: $('#inputType'),
  inputValue: $('#inputValue'),
  inputStatus: $('#inputStatus'),
  inputDueDay: $('#inputDueDay'),
  inputObservation: $('#inputObservation'),
  inputPerson: $('#inputPerson'),
  editId: $('#editId'),
  editDescription: $('#editDescription'),
  editCategory: $('#editCategory'),
  editType: $('#editType'),
  editValue: $('#editValue'),
  editStatus: $('#editStatus'),
  editDueDay: $('#editDueDay'),
  editObservation: $('#editObservation'),
  editPerson: $('#editPerson'),
  incomeCount: $('#incomeCount'),
  expenseCount: $('#expenseCount'),
  investmentCount: $('#investmentCount'),
  incomeSubtotal: $('#incomeSubtotal'),
  expenseSubtotal: $('#expenseSubtotal'),
  investmentSubtotal: $('#investmentSubtotal'),
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
  expenseSection: $('#expenseSection'),
  investmentSection: $('#investmentSection'),
  investmentBody: $('#investmentBody'),
  investmentCards: $('#investmentCards'),
  investmentTableWrapper: $('#investmentTableWrapper'),
  investmentEmpty: $('#investmentEmpty'),
  investmentTable: $('#investmentTable')
};

// ============================================
// Utilitários
// ============================================

const getMonthKey = (date) => date.format('YYYY-MM');

/** Identifica lançamento único para evitar duplicatas */
const entryFingerprint = ({ description, category, type, value, person }) =>
  [
    String(description ?? '').trim().toLowerCase(),
    category,
    type,
    Number(value).toFixed(2),
    person ?? ''
  ].join('|');

const isEntryDuplicate = (entry, list) =>
  list.some((e) => entryFingerprint(e) === entryFingerprint(entry));

const getMonthLabel = () =>
  currentDate.locale('pt-br').format('MMMM [de] YYYY');

const getExportBaseName = () =>
  `financas-casa-${getMonthKey(currentDate)}`;

const generateId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const parseValue = (str) => {
  if (!str) return 0;
  let s = String(str).replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;

  if (s.includes(',')) {
    // Formato BR: 4.500,00 → remove milhares e troca vírgula decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    // Vários pontos = separador de milhar (4.500)
    s = s.replace(/\./g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Padrão 1.234 ou 4.500 sem centavos
    s = s.replace(/\./g, '');
  }

  const num = parseFloat(s);
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

// Disponibiliza o toast para o cloud-sync.js (mensagem de migração)
window.appNotify = notify;

const confirmAction = async ({ title, text, icon = 'question', confirmText = 'Confirmar', cancelText = 'Cancelar' }) => {
  const { isConfirmed } = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
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
// Persistência (localStorage ou Firebase via AppStorage)
// ============================================

const loadData = async () => {
  try {
    allData = (await AppStorage.load()) ?? {};
  } catch {
    allData = {};
    notify.error('Erro ao carregar dados. Iniciando do zero.');
  }
};

const saveData = () => {
  try {
    AppStorage.save(allData);
  } catch {
    notify.error('Erro ao salvar os dados.');
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
  // Não mapear "." para vírgula — no BR o ponto é separador de milhar
  mapToRadix: [],
  normalizeZeros: true,
  padFractionalZeros: false,
  min: 0,
  max: 999999999.99
};

const getMaskValue = (mask) => {
  const val = mask?.typedValue;
  return typeof val === 'number' && !Number.isNaN(val) ? Math.abs(val) : 0;
};

const initMoneyMasks = () => {
  maskAdd = IMask(dom.inputValue, moneyMaskOptions);
  maskEdit = IMask(dom.editValue, moneyMaskOptions);
};

const resetAddForm = () => {
  dom.formAdd.reset();
  dom.inputType.value = 'despesa';
  dom.inputStatus.value = 'nao_pago';
  dom.inputPerson.value = '';
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

const populatePersonSelect = () => {
  const options = [
    '<option value="">Quem paga/recebe?</option>',
    ...Object.entries(PERSON_LABELS).map(
      ([val, label]) => `<option value="${val}">${label}</option>`
    )
  ].join('');
  dom.inputPerson.innerHTML = options;
  dom.editPerson.innerHTML = options;
};

const mapPerson = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const key = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (PERSON_MAP[key]) return PERSON_MAP[key];
  if (key.includes('gab')) return 'gabriel';
  if (key.includes('bab') || key.includes('barb') || key.includes('bibi')) return 'barbara';
  if (key.includes('famil')) return 'familia';
  if (key.includes('casa') || key.includes('amb')) return 'casa';
  return '';
};

const renderPersonTag = (person) => {
  if (!person || !PERSON_LABELS[person]) {
    return '<span class="text-muted">—</span>';
  }
  return `<span class="person-tag person-tag--${person}">${PERSON_LABELS[person]}</span>`;
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
      else if (type === 'investimento') acc.investment += value;
      else acc.expense += value;

      if (type !== 'entrada') {
        if (status === 'pago') acc.paid += value;
        else if (status === 'reservado') acc.reserved += value;
        else acc.unpaid += value;
      }
      return acc;
    },
    { income: 0, expense: 0, investment: 0, paid: 0, reserved: 0, unpaid: 0 }
  );

const getMonthBalances = (summary) => {
  const afterExpenses = summary.income - summary.expense;
  const surplus = afterExpenses - summary.investment;
  return { afterExpenses, surplus };
};

const splitEntries = (entries) => ({
  income: entries
    .filter((e) => e.type === 'entrada')
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR')),
  expense: entries
    .filter((e) => e.type === 'despesa')
    .sort((a, b) => a.description.localeCompare(b.description, 'pt-BR')),
  investment: entries
    .filter((e) => e.type === 'investimento')
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
  PERSON_LABELS[entry.person] ?? '',
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
      labels: ['Entradas', 'Despesas', 'Investimentos'],
      datasets: [{
        data: [summary.income, summary.expense, summary.investment],
        backgroundColor: ['#10b981', '#ef4444', '#8b5cf6'],
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
  person: formData.person ?? '',
  value: formData.value,
  status: formData.status,
  due_day: formData.due_day ? parseInt(formData.due_day, 10) : null,
  observation: formData.observation.trim()
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
  dom.editDueDay.value = entry.due_day ?? '';
  dom.editObservation.value = entry.observation ?? '';
  dom.editPerson.value = entry.person ?? '';
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
    person: dom.editPerson.value,
    value: getMaskValue(maskEdit),
    status: dom.editStatus.value,
    due_day: dom.editDueDay.value || null,
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

  const copied = newEntries.map(({ description, category, type, person, value, due_day, observation }) => ({
    id: generateId(),
    description,
    category,
    type,
    person: person ?? '',
    value,
    status: 'nao_pago',
    due_day: due_day ?? null,
    observation: observation ?? ''
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

// ============================================
// Exportações
// ============================================

const getExportContext = () => {
  const entries = getCurrentEntries();
  const { income, expense, investment } = splitEntries(entries);
  const summary = calculateSummary(entries);
  const { afterExpenses, surplus } = getMonthBalances(summary);

  return { entries, income, expense, investment, summary, afterExpenses, surplus, monthLabel: getMonthLabel() };
};

const exportJSON = () => {
  downloadBlob(
    new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' }),
    `financas-casa-backup-${dayjs().format('YYYY-MM-DD')}.json`
  );
  notify.success('Backup JSON exportado!');
};

const exportCSV = () => {
  const { income, expense, investment, summary, afterExpenses, surplus, monthLabel } = getExportContext();

  const lines = [
    `Finanças da Casa - ${monthLabel}`,
    '',
    'RESUMO',
    `Entradas (lucro);${formatValuePlain(summary.income)}`,
    `Despesas;${formatValuePlain(summary.expense)}`,
    `Investimentos (reserva);${formatValuePlain(summary.investment)}`,
    `Lucro - Despesas;${formatValuePlain(afterExpenses)}`,
    `Lucro - Despesas - Investimentos;${formatValuePlain(surplus)}`,
    `Pago;${formatValuePlain(summary.paid)}`,
    `Reservado;${formatValuePlain(summary.reserved)}`,
    `Não pago;${formatValuePlain(summary.unpaid)}`,
    '',
    'ENTRADAS E RENDAS',
    'Descrição;Tag;Categoria;Valor;Status;Observação',
    ...income.map((e) =>
      [e.description, PERSON_LABELS[e.person] ?? '', e.category, formatValuePlain(e.value), STATUS_LABELS[e.status], e.observation ?? ''].join(';')
    ),
    '',
    'DESPESAS E LANÇAMENTOS',
    'Descrição;Tag;Categoria;Valor;Status;Observação',
    ...expense.map((e) =>
      [e.description, PERSON_LABELS[e.person] ?? '', e.category, formatValuePlain(e.value), STATUS_LABELS[e.status], e.observation ?? ''].join(';')
    ),
    '',
    'INVESTIMENTOS (RESERVA)',
    'Descrição;Tag;Categoria;Valor;Status;Observação',
    ...investment.map((e) =>
      [e.description, PERSON_LABELS[e.person] ?? '', e.category, formatValuePlain(e.value), STATUS_LABELS[e.status], e.observation ?? ''].join(';')
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
  const { income, expense, investment, summary, afterExpenses, surplus, monthLabel } = getExportContext();

  const wb = XLSX.utils.book_new();

  const resumoSheet = XLSX.utils.aoa_to_sheet([
    ['Finanças da Casa', monthLabel],
    [],
    ['Resumo', 'Valor (R$)'],
    ['Entradas (lucro)', summary.income],
    ['Despesas', summary.expense],
    ['Investimentos (reserva)', summary.investment],
    ['Lucro - Despesas', afterExpenses],
    ['Lucro - Despesas - Investimentos', surplus],
    ['Pago', summary.paid],
    ['Reservado', summary.reserved],
    ['Não pago', summary.unpaid]
  ]);

  const incomeSheet = XLSX.utils.aoa_to_sheet([
    ['ENTRADAS E RENDAS'],
    ['Descrição', 'Tag', 'Categoria', 'Valor (R$)', 'Status', 'Observação'],
    ...income.map((e) => [
      e.description, PERSON_LABELS[e.person] ?? '', e.category, e.value,
      STATUS_LABELS[e.status], e.observation ?? ''
    ])
  ]);

  const expenseSheet = XLSX.utils.aoa_to_sheet([
    ['DESPESAS E LANÇAMENTOS'],
    ['Descrição', 'Tag', 'Categoria', 'Valor (R$)', 'Status', 'Observação'],
    ...expense.map((e) => [
      e.description, PERSON_LABELS[e.person] ?? '', e.category, e.value,
      STATUS_LABELS[e.status], e.observation ?? ''
    ])
  ]);

  const investmentSheet = XLSX.utils.aoa_to_sheet([
    ['INVESTIMENTOS (RESERVA)'],
    ['Descrição', 'Tag', 'Categoria', 'Valor (R$)', 'Status', 'Observação'],
    ...investment.map((e) => [
      e.description, PERSON_LABELS[e.person] ?? '', e.category, e.value,
      STATUS_LABELS[e.status], e.observation ?? ''
    ])
  ]);

  XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
  XLSX.utils.book_append_sheet(wb, incomeSheet, 'Entradas');
  XLSX.utils.book_append_sheet(wb, expenseSheet, 'Despesas');
  XLSX.utils.book_append_sheet(wb, investmentSheet, 'Investimentos');

  XLSX.writeFile(wb, `${getExportBaseName()}.xlsx`);
  notify.success('Excel exportado!');
};

const exportPDF = () => {
  const { income, expense, investment, summary, afterExpenses, surplus, monthLabel } = getExportContext();
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
      ['Entradas (lucro)', formatCurrency(summary.income)],
      ['Despesas', formatCurrency(summary.expense)],
      ['Investimentos (reserva)', formatCurrency(summary.investment)],
      ['Lucro − Despesas', formatCurrency(afterExpenses)],
      ['Lucro − Despesas − Investimentos', formatCurrency(surplus)],
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
      head: [['Descrição', 'Tag', 'Categoria', 'Valor', 'Status']],
      body: income.map((e) => [
        e.description, PERSON_LABELS[e.person] ?? '—', e.category,
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
      head: [['Descrição', 'Tag', 'Categoria', 'Valor', 'Status']],
      body: expense.map((e) => [
        e.description, PERSON_LABELS[e.person] ?? '—', e.category,
        formatCurrency(e.value), STATUS_LABELS[e.status]
      ]),
      theme: 'striped',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 9 }
    });

    startY = doc.lastAutoTable.finalY + 10;
  }

  if (investment.length) {
    doc.setFontSize(12);
    doc.setTextColor(139, 92, 246);
    doc.text('Investimentos (reserva)', 14, startY);

    doc.autoTable({
      startY: startY + 4,
      head: [['Descrição', 'Tag', 'Categoria', 'Valor', 'Status']],
      body: investment.map((e) => [
        e.description, PERSON_LABELS[e.person] ?? '—', e.category,
        formatCurrency(e.value), STATUS_LABELS[e.status]
      ]),
      theme: 'striped',
      headStyles: { fillColor: [139, 92, 246] },
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

const TYPE_MAP = {
  entrada: 'entrada', entradas: 'entrada', '+': 'entrada',
  despesa: 'despesa', despesas: 'despesa', '-': 'despesa',
  investimento: 'investimento', investimentos: 'investimento', reserva: 'investimento'
};

const STATUS_MAP = {
  pago: 'pago',
  reservado: 'reservado',
  nao_pago: 'nao_pago',
  'não pago': 'nao_pago',
  'nao pago': 'nao_pago',
  'não-pago': 'nao_pago'
};

const normalizeHeader = (h) =>
  String(h ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const mapTipo = (raw) => {
  const key = String(raw ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (TYPE_MAP[key]) return TYPE_MAP[key];
  if (key.startsWith('entr')) return 'entrada';
  if (key.startsWith('invest') || key.startsWith('reserv')) return 'investimento';
  if (key.startsWith('desp')) return 'despesa';
  return null;
};

const mapStatus = (raw) => {
  const key = String(raw ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return STATUS_MAP[key] ?? 'nao_pago';
};

const rowToEntry = (row) => {
  const desc = String(row.descricao ?? row.description ?? '').trim();
  const category = String(row.categoria ?? row.category ?? 'Outros').trim();
  const type = mapTipo(row.tipo ?? row.type);
  const value = parseValue(String(row.valor ?? row.value ?? '0'));
  const status = mapStatus(row.status);
  const observation = String(row.observacao ?? row.observation ?? '').trim();
  const person = mapPerson(row.tag ?? row.pessoa ?? row.responsavel ?? row.responsável);

  if (!desc || !type || value <= 0) return null;

  return {
    id: generateId(),
    description: desc,
    category: type === 'investimento'
      ? 'Investimentos'
      : (CATEGORIAS.includes(category) ? category : 'Outros'),
    type,
    person,
    value,
    status,
    observation
  };
};

const parseSheetRows = (rows) => {
  if (!rows.length) return [];

  const headerRow = rows.findIndex((r) =>
    r.some((c) => normalizeHeader(c).includes('descricao'))
  );

  const dataRows = headerRow >= 0 ? rows.slice(headerRow + 1) : rows;
  const headers = headerRow >= 0
    ? rows[headerRow].map(normalizeHeader)
    : ['descricao', 'categoria', 'tipo', 'valor', 'status', 'tag', 'observacao'];

  return dataRows
    .filter((r) => r.some((c) => String(c ?? '').trim()))
    .map((cells) => {
      const row = {};
      headers.forEach((h, i) => {
        if (h.includes('descricao')) row.descricao = cells[i];
        else if (h.includes('categoria')) row.categoria = cells[i];
        else if (h === 'tipo' || h.includes('tipo')) row.tipo = cells[i];
        else if (h.includes('valor')) row.valor = cells[i];
        else if (h.includes('status')) row.status = cells[i];
        else if (h === 'tag' || h.includes('pessoa') || h.includes('respons')) row.tag = cells[i];
        else if (h.includes('observ')) row.observacao = cells[i];
      });
      return rowToEntry(row);
    })
    .filter(Boolean);
};

const importJSON = async (file) => {
  const text = await file.text();
  const imported = JSON.parse(text);

  if (typeof imported !== 'object' || imported === null) throw new Error('json');

  const confirmed = await confirmAction({
    title: 'Restaurar backup JSON?',
    text: 'Isso substituirá TODOS os dados do sistema. Deseja continuar?',
    icon: 'warning',
    confirmText: 'Sim, restaurar'
  });

  if (!confirmed) return;

  allData = imported;
  saveData();
  render();
  notify.success('Backup restaurado com sucesso!');
};

const importEntriesFromRows = async (rows, { title, text }) => {
  const entries = parseSheetRows(rows);

  if (!entries.length) {
    notify.error('Nenhum lançamento válido encontrado. Use o template.');
    return 0;
  }

  const confirmed = await confirmAction({
    title: title ?? 'Importar lançamentos?',
    text: text ?? `Adicionar ${entries.length} lançamento(s) ao mês de ${getMonthLabel()}?`,
    confirmText: 'Sim, importar'
  });

  if (!confirmed) return 0;

  setCurrentEntries([...getCurrentEntries(), ...entries]);
  render();
  return entries.length;
};

const csvTextToRows = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
  const sep = clean.includes(';') ? ';' : ',';
  return clean.split(/\r?\n/).map((line) => line.split(sep).map((c) => c.trim()));
};

const importSheet = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  let rows = [];

  if (ext === 'csv') {
    rows = csvTextToRows(await file.text());
  } else if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames.find((n) =>
      n.toLowerCase().includes('lanc')
    ) ?? wb.SheetNames.find((n) =>
      ['entradas', 'despesas'].includes(n.toLowerCase())
    ) ?? wb.SheetNames[0];

    rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    const extraSheets = wb.SheetNames.filter((n) =>
      ['entradas', 'despesas'].includes(n.toLowerCase()) && n !== sheetName
    );

    extraSheets.forEach((name) => {
      const extra = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
      const tipoDefault = name.toLowerCase() === 'entradas' ? 'Entrada' : 'Despesa';
      extra.slice(1).forEach((cells) => {
        if (cells.some((c) => String(c ?? '').trim())) {
          rows.push([cells[0], cells[1], tipoDefault, cells[2], cells[3], cells[4] ?? '']);
        }
      });
    });
  } else {
    throw new Error('formato');
  }

  const count = await importEntriesFromRows(rows);
  if (count) notify.success(`${count} lançamento(s) importado(s)!`);
};

const goToMonth = (year, monthIndex) => {
  currentDate = dayjs().year(year).month(monthIndex).date(1);
  dom.selectMonth.value = String(monthIndex);
  dom.selectYear.value = String(year);
  render();
};

const importBundledJunho2026 = async () => {
  const targetKey = '2026-06';
  const needsMonthSwitch = getMonthKey(currentDate) !== targetKey;

  if (needsMonthSwitch) {
    const ok = await confirmAction({
      title: 'Importar Junho 2026?',
      text: 'Os lançamentos do PDF serão adicionados em Junho de 2026. O mês atual será alterado.',
      confirmText: 'Sim, continuar'
    });
    if (!ok) return;
    goToMonth(2026, 5);
  }

  try {
    const mainRes = await fetch('dados/junho-2026.csv');

    if (!mainRes.ok) {
      notify.error('Não foi possível carregar a planilha de Junho 2026.');
      return;
    }

    const mainRows = csvTextToRows(await mainRes.text());

    const mainCount = await importEntriesFromRows(mainRows, {
      title: 'Importar Junho 2026?',
      text: 'Adicionar todos os lançamentos do PDF (entradas, despesas e investimentos/reservas)?'
    });
    if (!mainCount) return;

    notify.success(`${mainCount} lançamento(s) importado(s)!`);

    const importDetail = await confirmAction({
      title: 'Detalhar fatura Nubank?',
      text: 'A planilha principal já inclui Nubank Babi R$ 866,00. Importe o detalhe só se quiser substituir por itens separados (remova a linha do total antes).',
      confirmText: 'Importar detalhe',
      cancelText: 'Não, obrigado'
    });

    if (!importDetail) return;

    const nubankRes = await fetch('dados/junho-2026-nubank-babi.csv');
    if (!nubankRes.ok) {
      notify.error('Não foi possível carregar o detalhe Nubank.');
      return;
    }

    const nubankRows = csvTextToRows(await nubankRes.text());
    const nubankCount = await importEntriesFromRows(nubankRows, {
      title: 'Importar itens Nubank Babi?',
      text: 'Adicionar o detalhamento da fatura (Jun/2026)?'
    });

    if (nubankCount) {
      notify.success(`${nubankCount} item(ns) Nubank importado(s)!`);
    }
  } catch {
    notify.error('Erro ao importar planilha Junho 2026.');
  }
};

const handleImportClick = (type) => {
  if (type === 'json') dom.inputImportJson.click();
  if (type === 'sheet') dom.inputImportSheet.click();
  if (type === 'junho2026') importBundledJunho2026();
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
  <div class="row-actions">
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

const renderEntryRow = (entry, valueClass) => `
  <tr data-id="${entry.id}">
    <td class="cell-description">${escapeHtml(entry.description)}</td>
    <td>${renderPersonTag(entry.person)}</td>
    <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
    <td class="${valueClass}">${formatCurrency(entry.value)}</td>
    <td>${createStatusSelect(entry)}</td>
    <td>${renderDueDay(entry.due_day)}</td>
    <td class="cell-obs" title="${escapeHtml(entry.observation ?? '')}">${escapeHtml(entry.observation || '—')}</td>
    <td class="text-end">${createActionButtons(entry.id)}</td>
  </tr>`;

const renderEntryCard = (entry, valueClass) => {
  const obs = entry.observation
    ? `<p class="entry-card__obs">${escapeHtml(entry.observation)}</p>` : '';
  const due = entry.due_day
    ? `<span class="badge text-bg-light border ms-1" style="font-size:.7rem;"><i class="bi bi-calendar-event me-1"></i>vence dia ${entry.due_day}</span>` : '';

  return `
    <div class="entry-card" data-id="${entry.id}">
      <div class="entry-card__header">
        <span class="entry-card__title">${escapeHtml(entry.description)}</span>
        <span class="entry-card__value ${valueClass}">${formatCurrency(entry.value)}</span>
      </div>
      <div class="entry-card__meta">
        ${renderPersonTag(entry.person)}
        <span class="category-tag">${escapeHtml(entry.category)}</span>${due}
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
  const summary = calculateSummary(entries);
  const { afterExpenses, surplus } = getMonthBalances(summary);
  const { income: incomeList, expense: expenseList, investment: investmentList } = splitEntries(entries);

  dom.totalIncome.textContent = formatCurrency(summary.income);
  dom.totalExpense.textContent = formatCurrency(summary.expense);
  dom.totalInvestment.textContent = formatCurrency(summary.investment);
  dom.totalPaid.textContent = formatCurrency(summary.paid);
  dom.totalReserved.textContent = formatCurrency(summary.reserved);
  dom.totalUnpaid.textContent = formatCurrency(summary.unpaid);

  if (dom.calcAfterExpenses) {
    dom.calcAfterExpenses.textContent = formatCurrency(afterExpenses);
    dom.calcAfterExpenses.style.color = afterExpenses >= 0 ? 'var(--app-income)' : 'var(--app-expense)';
  }
  if (dom.calcSurplus) {
    dom.calcSurplus.textContent = formatCurrency(surplus);
    dom.calcSurplus.style.color = surplus >= 0 ? 'var(--app-income)' : 'var(--app-expense)';
  }

  dom.entryCount.textContent = entries.length;
  dom.incomeCount.textContent = incomeList.length;
  dom.expenseCount.textContent = expenseList.length;
  dom.investmentCount.textContent = investmentList.length;
  dom.incomeSubtotal.textContent = formatCurrency(summary.income);
  dom.expenseSubtotal.textContent = formatCurrency(summary.expense);
  dom.investmentSubtotal.textContent = formatCurrency(summary.investment);
};

const render = () => {
  const entries = getCurrentEntries();
  const { income, expense, investment } = splitEntries(entries);
  const hasEntries = entries.length > 0;

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
    entries: investment,
    bodyEl: dom.investmentBody,
    cardsEl: dom.investmentCards,
    tableWrapper: dom.investmentTableWrapper,
    emptyEl: dom.investmentEmpty,
    valueClass: 'value-investment'
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
  document.querySelectorAll('[data-import]').forEach((btn) => {
    btn.addEventListener('click', () => handleImportClick(btn.dataset.import));
  });
  dom.inputImportJson.addEventListener('change', onImportJson);
  dom.inputImportSheet.addEventListener('change', onImportSheet);
  dom.formAdd.addEventListener('submit', handleAddEntry);
  dom.formEdit.addEventListener('submit', handleEditEntry);

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => handleExport(btn.dataset.export));
  });

  bindListEvents(dom.incomeTable, dom.incomeCards);
  bindListEvents(dom.expenseTable, dom.expenseCards);
  bindListEvents(dom.investmentTable, dom.investmentCards);

  dom.inputType?.addEventListener('change', onTypeChange);
  dom.editType?.addEventListener('change', onEditTypeChange);
};

const onTypeChange = () => {
  if (dom.inputType.value === 'investimento') {
    dom.inputCategory.value = 'Investimentos';
  }
};

const onEditTypeChange = () => {
  if (dom.editType.value === 'investimento') {
    dom.editCategory.value = 'Investimentos';
  }
};

// ============================================
// Init
// ============================================

// Carrega os dados e desenha a tela (chamado quando o armazenamento está pronto)
const startApp = async () => {
  await loadData();
  render();
};

const init = () => {
  dayjs.locale('pt-br');
  initTheme();
  populateSelectors();
  populateCategories();
  populatePersonSelect();
  initMoneyMasks();
  editModal = new bootstrap.Modal(dom.editModalEl);
  bindEvents();

  // Inicia o armazenamento: em modo nuvem aguarda o login;
  // em modo local dispara startApp() imediatamente.
  AppStorage.init(startApp);
};

document.addEventListener('DOMContentLoaded', init);
