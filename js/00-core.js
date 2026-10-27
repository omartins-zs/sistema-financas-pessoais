/**
 * Finanças da Casa
 * ES6+ | LocalStorage | Tema Dark/Light | Exportações
 */

// ============================================
// Constantes
// ============================================

const STORAGE_KEY = 'financas_casa_dados';
const THEME_KEY = 'financas_casa_theme';

const DEFAULT_CATEGORIAS = [
  'Contribuição para casa',
  'Aluguel',
  'Combustível',
  'Mercado',
  'Luz',
  'Água',
  'Internet',
  'Cartão de crédito Gabriel',
  'Cartão de crédito Babi',
  'Cartão de crédito',
  'Farmácia',
  'Investimentos',
  'Outros'
];

// Papéis: o app precisa saber qual categoria é o cartão de cada um, qual é
// "Investimentos" (forçada pelo tipo) e qual é "Outros" (destino padrão).
// O NOME pode ser editado à vontade — o papel acompanha o novo nome.
const PAPEIS_PADRAO = {
  cartaoGabriel: 'Cartão de crédito Gabriel',
  cartaoBabi: 'Cartão de crédito Babi',
  cartao: 'Cartão de crédito',
  investimentos: 'Investimentos',
  outros: 'Outros'
};
let PAPEIS_CATEGORIA = { ...PAPEIS_PADRAO };
const catPapel = (papel) => PAPEIS_CATEGORIA[papel] || PAPEIS_PADRAO[papel];
const papelDaCategoria = (nome) => Object.keys(PAPEIS_CATEGORIA).find((p) => PAPEIS_CATEGORIA[p] === nome) || null;
// Categorias com papel podem ser renomeadas, mas não excluídas
const categoriasComPapel = () => new Set(Object.values(PAPEIS_CATEGORIA));

// Lista viva: o usuário pode adicionar, renomear e excluir (fora as fixas).
// Persiste em allData.__app.categorias e sincroniza junto com os dados.
let CATEGORIAS = [...DEFAULT_CATEGORIAS];

const aplicarCategoriasSalvas = () => {
  const papeis = allData.__app?.categoriasPapel;
  PAPEIS_CATEGORIA = { ...PAPEIS_PADRAO, ...(papeis && typeof papeis === 'object' ? papeis : {}) };

  const salvas = allData.__app?.categorias;
  let lista;
  if (Array.isArray(salvas) && salvas.length) {
    lista = salvas.map((c) => String(c).trim()).filter(Boolean);
  } else {
    // sem lista salva: padrão, já com os nomes atuais dos papéis
    lista = DEFAULT_CATEGORIAS.map((c) => {
      const p = Object.keys(PAPEIS_PADRAO).find((k) => PAPEIS_PADRAO[k] === c);
      return p ? catPapel(p) : c;
    });
  }
  categoriasComPapel().forEach((nome) => { if (!lista.includes(nome)) lista.push(nome); });
  CATEGORIAS = lista;
};

const salvarCategorias = () => {
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  allData.__app.categorias = [...CATEGORIAS];
  allData.__app.categoriasPapel = { ...PAPEIS_CATEGORIA };
  allData.__app._categoriasUpdatedAt = Date.now();
  saveData();
};

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const STATUS_LABELS = {
  pago: 'Pago',
  reservado: 'Reservado',
  nao_pago: 'Não pago'
};

const STATUS_SHORT_LABELS = {
  pago: 'Pago',
  reservado: 'Res.',
  nao_pago: 'Não'
};

const STATUS_ICONS = {
  pago: 'check-lg',
  reservado: 'pause-fill',
  nao_pago: 'x-lg'
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

const PERSON_SORT_ORDER = {
  gabriel: 0,
  barbara: 1,
  casa: 2,
  familia: 3
};

const sortByPersonThenDescription = (a, b) => {
  const pa = PERSON_SORT_ORDER[a.person] ?? 99;
  const pb = PERSON_SORT_ORDER[b.person] ?? 99;
  if (pa !== pb) return pa - pb;
  return a.description.localeCompare(b.description, 'pt-BR');
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
const expandedCardEntries = new Set();
const editingCardItems = new Set();
let cardItemClip = null;
let pendingCardFocusEntryId = null;
let pendingCardItemFocusId = null;

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
  inputImportBank: $('#inputImportBank'),
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
  investmentTable: $('#investmentTable'),
  appVersion: $('#appVersion'),
  inputInvestimento: $('#inputInvestimento'),
  editInvestimento: $('#editInvestimento'),
  gabrielIncome: $('#gabrielIncome'),
  gabrielExpense: $('#gabrielExpense'),
  gabrielSurplus: $('#gabrielSurplus'),
  gabrielPercent: $('#gabrielPercent'),
  barbaraIncome: $('#barbaraIncome'),
  barbaraExpense: $('#barbaraExpense'),
  barbaraSurplus: $('#barbaraSurplus'),
  barbaraPercent: $('#barbaraPercent')
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

const isCreditCardEntry = (entry) => {
  const cat = String(entry?.category ?? '').trim();
  if (!cat) return false;
  if (cat === catPapel('cartaoGabriel') || cat === catPapel('cartaoBabi') || cat === catPapel('cartao')) return true;
  const baixo = cat.toLowerCase(); // nomes antigos, antes de renomear
  return baixo.includes('cartão de crédito') || baixo.includes('cartao de credito');
};

const DEFAULT_CARD_ITEM_DESC = 'Cartão';

const isDefaultCardItem = (item) => {
  const desc = String(item?.description ?? '').trim();
  return item?.isDefault === true
    || /^cart[aã]o$/i.test(desc)
    || /^fatura/i.test(desc);
};

const defaultCardItemLabel = () => DEFAULT_CARD_ITEM_DESC;

const createDefaultCardItem = (entry) => ({
  id: generateId(),
  description: defaultCardItemLabel(),
  value: Number(entry.value) || 0,
  isDefault: true
});

// Arredonda em centavos: sem isso a soma muda na 13ª casa só por reordenar os itens
const sumCardItems = (items = []) =>
  Math.round(items.reduce((acc, item) => acc + (Number(item.value) || 0), 0) * 100) / 100;

const syncCardEntryFromItems = (entry) => {
  if (!isCreditCardEntry(entry) || !entry.card_items?.length) return entry;
  return { ...entry, value: sumCardItems(entry.card_items) };
};

const syncDefaultCartaoItem = (entry) => {
  if (!isCreditCardEntry(entry) || !entry.card_items?.length) return entry;

  const items = [...entry.card_items];

  if (items.length === 1) {
    items[0] = { ...items[0], description: DEFAULT_CARD_ITEM_DESC, isDefault: true, value: Number(entry.value) || 0 };
    return { ...entry, card_items: items };
  }

  return syncCardEntryFromItems(entry);
};

const migrateLegacyCardItems = (entry) => {
  if (!isCreditCardEntry(entry) || entry.card_items.length !== 1) return entry;

  const [item] = entry.card_items;
  const itemValue = Number(item.value) || 0;
  const entryValue = Number(entry.value) || 0;
  const desc = String(item.description ?? '').trim();
  const obs = String(entry.observation ?? '').trim();

  // Item recorrente ou vindo de importação nunca é placeholder; e valor igual ao
  // total NÃO basta (um único item real sempre soma o total — viraria "Cartão" errado)
  if (item.recurring === true || item.txdate || item.fitid) return entry;
  const looksLikePlaceholder = isDefaultCardItem(item)
    || /^fatura/i.test(desc)
    || (desc !== '' && desc === obs && itemValue === entryValue);

  if (!looksLikePlaceholder) return entry;

  return {
    ...entry,
    card_items: [{ ...item, description: DEFAULT_CARD_ITEM_DESC, isDefault: true }]
  };
};

const normalizeEntry = (entry) => {
  const normalized = { ...entry };
  if (!Array.isArray(normalized.card_items)) normalized.card_items = [];
  normalized.card_items = normalized.card_items.map((item) => ({
    ...item,
    recurring: item.recurring === true
  }));
  if (normalized.category === catPapel('cartao')) {
    if (normalized.person === 'gabriel') normalized.category = catPapel('cartaoGabriel');
    else if (normalized.person === 'barbara') normalized.category = catPapel('cartaoBabi');
  }

  if (!isCreditCardEntry(normalized)) return normalized;

  if (normalized.card_items.length === 0) {
    normalized.card_items = [createDefaultCardItem(normalized)];
    return normalized;
  }

  normalized.card_items = migrateLegacyCardItems(normalized).card_items;

  if (normalized.card_items.length === 1) {
    const only = normalized.card_items[0];
    if (isDefaultCardItem(only)) {
      return syncDefaultCartaoItem(normalized);
    }
    return syncCardEntryFromItems(normalized);
  }

  return syncCardEntryFromItems(normalized);
};

const personFromCardCategory = (category) => {
  if (category === catPapel('cartaoGabriel')) return 'gabriel';
  if (category === catPapel('cartaoBabi')) return 'barbara';
  return '';
};

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

const escapeAttr = (str) => escapeHtml(str).replace(/"/g, '&quot;');

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
  // Ação perigosa confirmada (excluir, limpar mês, restaurar...): tira uma cópia completa antes
  if (isConfirmed && (icon === 'warning' || icon === 'error')) {
    try { await AppStorage.backupNow?.(allData, `antes de: ${title}`, { nuvem: false }); } catch {}
  }
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
