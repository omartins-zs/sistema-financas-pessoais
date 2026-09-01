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
  inputInvestimentoWrap: $('#inputInvestimentoWrap'),
  editInvestimento: $('#editInvestimento'),
  editInvestimentoWrap: $('#editInvestimentoWrap')
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

// ============================================
// Histórico de alterações (auditoria + desfazer)
// ============================================
// Cada mudança guarda só o que mudou (antes/depois dos lançamentos afetados),
// em allData.__app.historico — sincroniza junto com os dados. Tem teto de
// tamanho porque o Firestore guarda tudo num único documento de 1 MiB.
const HISTORICO_MAX = 150;
const HISTORICO_MAX_CHARS = 150000;

const NOMES_COLECAO = {
  metas: 'Metas', reservas: 'Reservas', cartoes: 'Cartões', investimentos: 'Investimentos',
  patrimonio: 'Patrimônio', assinaturas: 'Contas fixas'
};

// Instantâneo do último estado salvo de cada mês: várias ações alteram os objetos
// no lugar antes de salvar, então comparar com o array vivo não enxergaria nada.
const snapshotsMes = {};
const cloneDados = (v) => JSON.parse(JSON.stringify(v ?? []));
const iniciarSnapshotsHistorico = () => {
  Object.keys(allData).forEach((k) => { if (/^\d{4}-\d{2}$/.test(k)) snapshotsMes[k] = cloneDados(allData[k]); });
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
  getHistorico().unshift({ id: generateId(), quando: dayjs().toISOString(), ...dados });
  podarHistorico();
};

const resumoLancamento = (e) => `“${e.description}” (${formatCurrency(Number(e.value) || 0)})`;

const diffListas = (antes, depois) => {
  const mapA = new Map(antes.map((e) => [e.id, e]));
  const mapD = new Map(depois.map((e) => [e.id, e]));
  return {
    adicionados: depois.filter((e) => !mapA.has(e.id)),
    removidos: antes.filter((e) => !mapD.has(e.id)),
    alterados: depois
      .filter((e) => mapA.has(e.id) && JSON.stringify(mapA.get(e.id)) !== JSON.stringify(e))
      .map((e) => ({ antes: mapA.get(e.id), depois: e }))
  };
};

// Mudança nos lançamentos de um mês (usado por setCurrentEntries e pelas importações)
const registrarHistoricoMes = (mes, antes, depois, acao) => {
  const d = diffListas(antes || [], depois || []);
  snapshotsMes[mes] = cloneDados(depois); // próximo diff parte daqui
  if (!d.adicionados.length && !d.removidos.length && !d.alterados.length) return null;
  if (!acao) {
    const partes = [];
    if (d.adicionados.length) partes.push(d.adicionados.length === 1 ? `adicionou ${resumoLancamento(d.adicionados[0])}` : `adicionou ${d.adicionados.length} lançamentos`);
    if (d.removidos.length) partes.push(d.removidos.length === 1 ? `excluiu ${resumoLancamento(d.removidos[0])}` : `excluiu ${d.removidos.length} lançamentos`);
    if (d.alterados.length) partes.push(d.alterados.length === 1 ? `alterou ${resumoLancamento(d.alterados[0].depois)}` : `alterou ${d.alterados.length} lançamentos`);
    acao = partes.join(' · ');
  }
  const reg = { tipo: 'mes', mes, acao, reversivel: true, ...d };
  novoRegistroHistorico(reg);
  return reg;
};

// Mudança num item de módulo (metas, reservas, investimentos…) — chamado pelo app-modules
const registrarHistoricoModulo = (colecao, antes, depois) => {
  if (JSON.stringify(antes ?? null) === JSON.stringify(depois ?? null)) return;
  const alvo = depois ?? antes ?? {};
  const nome = alvo.nome || alvo.instituicao || alvo.description || alvo.tipo || '';
  const verbo = !antes ? 'adicionou' : !depois ? 'excluiu' : 'alterou';
  novoRegistroHistorico({
    tipo: 'modulo', colecao, acao: `${NOMES_COLECAO[colecao] || colecao}: ${verbo} ${nome ? `“${nome}”` : 'item'}`,
    antes: antes ?? null, depois: depois ?? null, reversivel: true
  });
};

// Só auditoria (sem desfazer): ex. mudança nas categorias
const registrarHistoricoInfo = (acao) => novoRegistroHistorico({ tipo: 'info', acao, reversivel: false });

const desfazerRegistroHistorico = (id) => {
  const reg = getHistorico().find((r) => r.id === id);
  if (!reg || !reg.reversivel || reg.desfeito) return false;

  if (reg.tipo === 'mes') {
    const antesLista = allData[reg.mes] || [];
    const addIds = new Set((reg.adicionados || []).map((e) => e.id));
    const nova = antesLista.filter((e) => !addIds.has(e.id));
    (reg.alterados || []).forEach(({ antes }) => {
      const i = nova.findIndex((e) => e.id === antes.id);
      if (i >= 0) nova[i] = antes; else nova.push(antes);
    });
    (reg.removidos || []).forEach((e) => { if (!nova.some((x) => x.id === e.id)) nova.push(e); });
    allData[reg.mes] = nova.map(normalizeEntry);
    reg.desfeito = true;
    registrarHistoricoMes(reg.mes, antesLista, allData[reg.mes], `desfez: ${reg.acao}`);
    if (reg.mes !== getMonthKey(currentDate)) { currentDate = dayjs(`${reg.mes}-01`); syncSelectors(); }
  } else if (reg.tipo === 'modulo') {
    if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
    if (!Array.isArray(allData.__app[reg.colecao])) allData.__app[reg.colecao] = [];
    const lista = allData.__app[reg.colecao];
    const alvoId = (reg.depois ?? reg.antes)?.id;
    const i = lista.findIndex((x) => x.id === alvoId);
    if (reg.antes) { if (i >= 0) lista[i] = reg.antes; else lista.push(reg.antes); }
    else if (i >= 0) lista.splice(i, 1);
    reg.desfeito = true;
    novoRegistroHistorico({ tipo: 'modulo', colecao: reg.colecao, acao: `desfez: ${reg.acao}`, antes: reg.depois ?? null, depois: reg.antes ?? null, reversivel: true });
  } else {
    return false;
  }

  saveData();
  render();
  return true;
};

const abrirHistorico = async () => {
  const h = getHistorico();
  const linhas = h.slice(0, 80).map((r) => `
    <div class="hist-row${r.desfeito ? ' is-undone' : ''}">
      <span class="hist-row__when">${dayjs(r.quando).format('DD/MM HH:mm')}</span>
      <span class="hist-row__what">${escapeHtml(r.acao)}${r.mes ? ` <span class="hist-row__mes">${dayjs(`${r.mes}-01`).format('MMM/YY')}</span>` : ''}${r.desfeito ? ' <span class="hist-row__tag">desfeito</span>' : ''}</span>
      ${r.reversivel && !r.desfeito
        ? `<button type="button" class="hist-row__undo" data-undo="${r.id}" title="Voltar como estava antes desta mudança"><i class="bi bi-arrow-counterclockwise"></i> Desfazer</button>`
        : '<span></span>'}
    </div>`).join('');

  await Swal.fire({
    title: 'Histórico de alterações',
    html: `<div class="hist">
      ${linhas || '<p class="text-muted mb-0">Nada registrado ainda. A partir de agora toda mudança fica aqui.</p>'}
      <p class="hist__hint">Guarda as últimas ${HISTORICO_MAX} mudanças. Desfazer também entra no histórico, então dá para desfazer o desfazer.</p>
    </div>`,
    width: '42rem',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Fechar',
    didOpen: () => {
      Swal.getPopup().querySelectorAll('[data-undo]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const ok = desfazerRegistroHistorico(btn.dataset.undo);
          Swal.close();
          notify[ok ? 'success' : 'error'](ok ? 'Mudança desfeita.' : 'Não foi possível desfazer.');
          if (ok) setTimeout(abrirHistorico, 150);
        });
      });
    }
  });
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
  entries[index] = { ...entries[index], card_items: items, value: total };
  expandedCardEntries.add(entryId);
  pendingCardFocusEntryId = entryId;
  setCurrentEntries(entries);
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

  entries[index] = syncCardEntryFromItems({ ...entries[index], card_items: items });
  editingCardItems.delete(`${entryId}:${itemId}`);
  expandedCardEntries.add(entryId);
  pendingCardFocusEntryId = entryId;
  setCurrentEntries(entries);
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

  entries[index] = { ...entries[index], card_items: items };
  expandedCardEntries.add(entryId);
  setCurrentEntries(entries);
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

  entries[index] = syncCardEntryFromItems({
    ...entries[index],
    card_items: items,
    value: total
  });
  expandedCardEntries.add(entryId);
  setCurrentEntries(entries);
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

  entries[index] = { ...entries[index], card_items: next };
  expandedCardEntries.add(entryId);
  setCurrentEntries(entries);
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

// Quantos lançamentos usam cada categoria (todos os meses)
const contarUsoCategorias = () => {
  const uso = {};
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    (allData[k] || []).forEach((e) => { uso[e.category] = (uso[e.category] || 0) + 1; });
  });
  return uso;
};

const renomearCategoriaNosDados = (de, para) => {
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    allData[k] = (allData[k] || []).map((e) => (e.category === de ? { ...e, category: para } : e));
    snapshotsMes[k] = cloneDados(allData[k]); // mudança já auditada pelo registro de categorias
  });
};

const gerenciarCategorias = async () => {
  const uso = contarUsoCategorias();
  const linhas = CATEGORIAS.map((cat, i) => {
    const comPapel = categoriasComPapel().has(cat);
    const usos = uso[cat] || 0;
    return `<div class="cat-manager__row" data-idx="${i}">
      <input type="text" class="cat-manager__name" value="${escapeAttr(cat)}" data-original="${escapeAttr(cat)}"
        title="${comPapel ? 'Pode renomear (corrige todos os meses). Não pode ser excluída: o app usa esta categoria.' : 'Renomear corrige todos os meses'}" aria-label="Nome da categoria">
      <span class="cat-manager__uso">${usos ? `${usos} uso(s)` : '—'}</span>
      ${comPapel
        ? '<span class="cat-manager__lock" title="Usada pelo app: pode renomear, não excluir"><i class="bi bi-lock-fill"></i></span>'
        : `<button type="button" class="cat-manager__del" data-del="${i}" title="Excluir (lançamentos vão para Outros)" aria-label="Excluir ${escapeAttr(cat)}"><i class="bi bi-trash"></i></button>`}
    </div>`;
  }).join('');

  const { value: resultado, isConfirmed } = await Swal.fire({
    title: 'Categorias',
    html: `<div class="cat-manager">
      ${linhas}
      <div class="cat-manager__row cat-manager__row--add">
        <input type="text" class="cat-manager__name" id="catNova" placeholder="Nova categoria" maxlength="40">
        <span class="cat-manager__uso"></span><span></span>
      </div>
      <p class="cat-manager__hint">Renomear corrige os lançamentos de <strong>todos os meses</strong> (vale para as de cartão também). Excluir manda os lançamentos para “${escapeHtml(catPapel('outros'))}”. As com cadeado o app usa internamente: dá para renomear, não excluir.</p>
    </div>`,
    width: '34rem',
    showCancelButton: true,
    confirmButtonText: 'Salvar',
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      Swal.getPopup().querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', () => {
          btn.closest('.cat-manager__row').classList.toggle('is-deleting');
        });
      });
    },
    preConfirm: () => {
      const popup = Swal.getPopup();
      const renames = [];
      const excluir = [];
      const finais = [];
      let erro = '';

      popup.querySelectorAll('.cat-manager__row:not(.cat-manager__row--add)').forEach((row) => {
        const input = row.querySelector('.cat-manager__name');
        const original = input.dataset.original;
        if (row.classList.contains('is-deleting')) { excluir.push(original); return; }
        const nome = input.value.trim();
        if (!nome) { erro = 'Categoria sem nome.'; return; }
        if (nome !== original) renames.push([original, nome]);
        finais.push(nome);
      });

      const nova = popup.querySelector('#catNova').value.trim();
      if (nova) finais.push(nova);

      const vistos = new Set();
      finais.forEach((n) => {
        const chave = n.toLowerCase();
        if (vistos.has(chave)) erro = `Categoria duplicada: ${n}`;
        vistos.add(chave);
      });
      if (erro) { Swal.showValidationMessage(erro); return false; }
      return { renames, excluir, nova, finais };
    }
  });
  if (!isConfirmed || !resultado) return;

  const { renames, excluir, nova, finais } = resultado;
  if (!renames.length && !excluir.length && !nova) return;

  renames.forEach(([de, para]) => {
    const papel = papelDaCategoria(de);
    if (papel) PAPEIS_CATEGORIA[papel] = para; // o papel acompanha o novo nome
    renomearCategoriaNosDados(de, para);
  });
  excluir.forEach((cat) => renomearCategoriaNosDados(cat, catPapel('outros')));
  CATEGORIAS = finais;
  const mudancas = [
    ...renames.map(([de, para]) => `renomeou “${de}” → “${para}”`),
    ...excluir.map((c) => `excluiu “${c}” (lançamentos → Outros)`),
    ...(nova ? [`adicionou “${nova}”`] : [])
  ];
  registrarHistoricoInfo(`Categorias: ${mudancas.join(' · ')}`);
  salvarCategorias();
  populateCategories();
  render();
  notify.success('Categorias atualizadas.');
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
    .sort(sortByPersonThenDescription),
  expense: entries
    .filter((e) => e.type === 'despesa')
    .sort(sortByPersonThenDescription),
  investment: entries
    .filter((e) => e.type === 'investimento')
    .sort(sortByPersonThenDescription)
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

// ---- Vínculo lançamento mensal (tipo investimento) -> carteira (aba Investimentos) ----
const getInvestimentosCarteira = () =>
  (Array.isArray(allData.__app?.investimentos) ? allData.__app.investimentos : []);

const investimentoLabel = (inv) =>
  [inv.tipo, inv.instituicao].filter(Boolean).join(' · ') || 'Investimento';

const getInvestimentoLabelById = (id) => {
  if (!id) return '';
  const inv = getInvestimentosCarteira().find((i) => i.id === id);
  return inv ? investimentoLabel(inv) : '';
};

const populateInvestimentoSelects = () => {
  const opts = [
    '<option value="">Sem vínculo (só conta neste mês)</option>',
    ...getInvestimentosCarteira().map((i) => `<option value="${escapeAttr(i.id)}">${escapeHtml(investimentoLabel(i))}</option>`),
    '<option value="__novo__">＋ Novo investimento (começa do zero)</option>'
  ].join('');
  [dom.inputInvestimento, dom.editInvestimento].forEach((sel) => {
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = opts;
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
  });
};

const toggleInvestimentoField = (typeSel, wrap) => {
  if (!typeSel || !wrap) return;
  const mostrar = typeSel.value === 'investimento';
  wrap.hidden = !mostrar;
  if (mostrar) populateInvestimentoSelects();
};

// "+ Novo investimento" direto do formulário do mês: nasce zerado e os lançamentos somam nele
const criarInvestimentoRapido = async (nomeSugerido) => {
  const { value, isConfirmed } = await Swal.fire({
    title: 'Novo investimento',
    text: 'Começa do zero: os lançamentos mensais vinculados vão somando nele. Tipo e valor atual você ajusta na aba Investimentos.',
    input: 'text',
    inputValue: nomeSugerido || '',
    inputPlaceholder: 'Ex: CDB Nubank, Tesouro Selic',
    inputValidator: (v) => (String(v).trim() ? undefined : 'Dê um nome ao investimento'),
    showCancelButton: true,
    confirmButtonText: 'Criar',
    cancelButtonText: 'Cancelar'
  });
  if (!isConfirmed) return null;
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  if (!Array.isArray(allData.__app.investimentos)) allData.__app.investimentos = [];
  const inv = {
    id: generateId(), tipo: 'Outros', instituicao: String(value).trim(),
    valorAplicado: 0, valorAtual: 0, data: dayjs().format('YYYY-MM-DD')
  };
  allData.__app.investimentos.push(inv);
  registrarHistoricoModulo('investimentos', null, inv);
  saveData();
  notify.success(`Investimento "${inv.instituicao}" criado. Veja na aba Investimentos.`);
  return inv.id;
};

const onInvestimentoSelectChange = async (sel, descInput) => {
  if (!sel || sel.value !== '__novo__') return;
  const novoId = await criarInvestimentoRapido(descInput?.value?.trim());
  populateInvestimentoSelects();
  sel.value = novoId || '';
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
  ...(formData.type === 'investimento' && formData.investimento_id && formData.investimento_id !== '__novo__'
    ? { investimento_id: formData.investimento_id } : {})
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
  toggleInvestimentoField(dom.editType, dom.editInvestimentoWrap);
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
    investimento_id: dom.editInvestimento?.value || ''
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

  const copied = newEntries.map(({ description, category, type, person, value, due_day, observation, card_items }) => normalizeEntry({
    id: generateId(),
    description,
    category,
    type,
    person: person ?? '',
    value,
    status: 'nao_pago',
    due_day: due_day ?? null,
    observation: observation ?? '',
    card_items: Array.isArray(card_items) ? card_items.map((item) => ({ ...item, id: generateId() })) : []
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
    // `Restou;${formatValuePlain(afterExpenses)}`,
    `Sobra;${formatValuePlain(surplus)}`,
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
    // ['Restou', afterExpenses],
    ['Sobra', surplus],
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
      // ['Restou', formatCurrency(afterExpenses)],
      ['Sobra', formatCurrency(surplus)],
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
  const category = String(row.categoria ?? row.category ?? catPapel('outros')).trim();
  const type = mapTipo(row.tipo ?? row.type);
  const value = parseValue(String(row.valor ?? row.value ?? '0'));
  const status = mapStatus(row.status);
  const observation = String(row.observacao ?? row.observation ?? '').trim();
  const person = mapPerson(row.tag ?? row.pessoa ?? row.responsavel ?? row.responsável);

  if (!desc || !type || value <= 0) return null;

  return normalizeEntry({
    id: generateId(),
    description: desc,
    category: type === 'investimento'
      ? catPapel('investimentos')
      : (CATEGORIAS.includes(category) ? category : catPapel('outros')),
    type,
    person,
    value,
    status,
    observation,
    card_items: []
  });
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
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  saveData();
  render();
  notify.success('Backup restaurado com sucesso!');
};

const importEntriesFromRows = async (rows, { title, text } = {}) => {
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

// ============================================
// Importação de extrato bancário (OFX, CSV, QIF)
// ============================================

// Valor com sinal: aceita "1.234,56", "-1234.56", "(123,45)" e "123,45-"
const parseSignedValue = (raw) => {
  let s = String(raw ?? '').trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');       // BR: 1.234,56
  else if (lastComma > -1) s = s.replace(/,/g, '');                          // US: 1,234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');          // 1.234 = milhar BR

  const n = parseFloat(s);
  if (Number.isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
};

// Datas de banco: DD/MM/YYYY, YYYY-MM-DD, DD/MM/YY e YYYYMMDD (OFX)
const parseBankDate = (raw) => {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) m = [m[0], m[3], m[2], m[1]];
  }
  if (!m) {
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
    if (m) m = [m[0], `20${m[3]}`, m[2], m[1]];
  }
  if (!m) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX: 20260815120000[-3:BRT]
    if (m && +m[2] >= 1 && +m[2] <= 12) m = [m[0], m[1], m[2], m[3]];
    else m = null;
  }
  if (!m) return null;

  const [, y, mo, d] = m;
  const month = String(mo).padStart(2, '0');
  const day = String(d).padStart(2, '0');
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || +y < 1990 || +y > 2100) return null;
  return `${y}-${month}-${day}`;
};

// Nome limpo para o que o banco manda embolado: "SHOPEE *VENDEDORX",
// "MERCADOLIVRE*LOJAY", "MP *FULANO", "EBN*SPOTIFY", "IFD*RESTAURANTE"...
const BANK_MERCHANTS = [
  // [regex, marca, usa o resto como vendedor?]
  [/(?:^|\W)shopee\s*\*?\s*(.*)/i, 'Shopee', true],
  [/(?:^|\W)(?:mercadolivre|mercado\s*livre|meli)\s*\*?\s*(.*)/i, 'Mercado Livre', true],
  [/(?:^|\W)(?:mercadopago|mercado\s*pago|\bmp)\s*\*\s*(.*)/i, 'Mercado Pago', true],
  [/(?:^|\W)(?:pg|pag)\s*\*\s*(.*)/i, 'PagSeguro', true],
  [/(?:^|\W)paypal\s*\*\s*(.*)/i, 'PayPal', true],
  [/(?:^|\W)(?:ifd|ifood)\s*\*?\s*(.*)/i, 'iFood', true],
  [/(?:^|\W)(?:amazon|amzn)(?:\.com\.?(?:br)?)?\s*\*?\s*(.*)/i, 'Amazon', true],
  [/(?:^|\W)aliexpress/i, 'AliExpress', false],
  [/(?:^|\W)spotify/i, 'Spotify', false],
  [/(?:^|\W)netflix/i, 'Netflix', false],
  [/(?:^|\W)uber\s*(?:\*\s*)?eats/i, 'Uber Eats', false],
  [/(?:^|\W)uber\b/i, 'Uber', false],
  [/(?:^|\W)99\s*(?:app|pop|\*)/i, '99', false],
  [/(?:^|\W)rappi/i, 'Rappi', false],
  [/(?:^|\W)apple\.com\/bill|(?:^|\W)apple\s*\*/i, 'Apple', false],
  [/(?:^|\W)(?:dl\s*\*\s*)?google\s*\*?\s*(.*)/i, 'Google', true],
  [/(?:^|\W)steam(?:games|\s|\*|$)/i, 'Steam', false],
  [/(?:^|\W)playstation|(?:^|\W)sony\s*\*/i, 'PlayStation', false],
  [/(?:^|\W)(?:americanas|b2w)/i, 'Americanas', false],
  [/(?:^|\W)(?:magalu|magazine\s*luiza)/i, 'Magalu', false],
  [/(?:^|\W)shein/i, 'Shein', false],
  [/(?:^|\W)airbnb/i, 'Airbnb', false]
];

const normalizeBankDesc = (raw) => {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Extrato Nubank: "Transferência enviada pelo Pix - NOME - •••.123.456-•• - BANCO"
  let m = s.match(/^transfer[êe]ncia (enviada|recebida)(?: pelo pix)? -\s*([^-]+?)\s*(?:-|$)/i);
  if (m) {
    const via = /pelo pix/i.test(s) ? 'Pix' : 'Transferência';
    const dir = m[1].toLowerCase() === 'enviada' ? 'enviado' : 'recebido';
    const nome = titleCaseDesc(m[2].trim());
    return via === 'Pix' ? `Pix ${dir} · ${nome}` : `Transferência (${dir}) · ${nome}`;
  }
  m = s.match(/^pagamento de boleto(?: efetuado)?\s*-?\s*(.*)/i);
  if (m) return m[1].trim() ? `Boleto · ${titleCaseDesc(m[1].trim())}` : 'Pagamento de boleto';
  if (/^pagamento de fatura/i.test(s)) return 'Pagamento de fatura';
  if (/^aplica[çc][ãa]o rdb/i.test(s)) return 'Aplicação RDB';
  if (/^resgate rdb/i.test(s)) return 'Resgate RDB';

  // Remove prefixos de operação que só poluem
  s = s.replace(/^(compra\s+(?:no\s+)?(?:cartao|cartão|debito|débito|credito|crédito)(?:\s+a\s+vista)?|compra\s+com\s+cart[aã]o)\s*[-:]?\s*/i, '');

  // Anotação do dono feita no app do banco — "Uber(Carro Mecânica)" — volta no final
  const nota = s.match(/\(([^()]{3,})\)\s*$/);
  if (nota) s = s.slice(0, nota.index).trim();

  // Parcela ("- Parcela 3/12", "PARC 03/10", "3/12") vira sufixo padronizado
  const parcela = s.match(/(?:-\s*)?(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
  if (parcela) s = s.slice(0, parcela.index).replace(/[\s-]+$/, '');

  // Sujeira comum: máscara de cartão ("*0000"), código de loja no fim, underscores
  s = s.replace(/\*+\d+(?=\s|$)/g, '').replace(/[-\s]+\d{3,}$/, '').replace(/_/g, ' ')
    .replace(/\s+/g, ' ').trim();

  let nome = '';
  for (const [re, marca, comVendedor] of BANK_MERCHANTS) {
    const bm = s.match(re);
    if (!bm) continue;
    let vendedor = '';
    if (comVendedor && bm[1]) {
      vendedor = bm[1].replace(/[*_#-]+/g, ' ').replace(/\s+/g, ' ').trim();
      // descarta restos sem informação (códigos, "br", número do pedido)
      if (/^\d+$/.test(vendedor) || vendedor.length < 3 || /^brasil$|^br$/i.test(vendedor)) vendedor = '';
    }
    nome = vendedor ? `${marca} · ${titleCaseDesc(vendedor)}` : marca;
    break;
  }

  if (!nome) nome = (s === s.toUpperCase() && s.length > 3) ? titleCaseDesc(s) : s;

  if (parcela) nome += ` ${+parcela[1]}/${+parcela[2]}`;
  if (nota) nome += ` (${nota[1].trim()})`;
  return nome;
};

const titleCaseDesc = (s) => String(s).toLowerCase().replace(/(^|\s|\.)([a-zà-ú])/g, (_, sep, ch) => sep + ch.toUpperCase());

// Categoria sugerida pela descrição (só usa categorias que já existem no app)
const BANK_CATEGORY_HINTS = [
  [/mercado|supermerc|atacad|carrefour|assai|assaí|extra\b|pao de acucar|hortifruti|sacolao|sacolão/i, 'Mercado'],
  [/posto|combust|ipiranga|shell|petrobras|br mania|gasolina|etanol/i, 'Combustível'],
  [/farmac|farmác|drogaria|drogasil|pacheco|raia|panvel|remedio|remédio/i, 'Farmácia'],
  [/energia|\bluz\b|cemig|copel|enel|cpfl|light|celesc|coelba/i, 'Luz'],
  [/\bagua\b|\bágua\b|saneamento|sabesp|copasa|sanepar|embasa/i, 'Água'],
  [/internet|vivo\b|claro\b|tim\b|\boi\b|net\b.*virtua|fibra/i, 'Internet'],
  [/aluguel|imobiliaria|imobiliária/i, 'Aluguel'],
  [/cdb|rdb|tesouro|lci\b|lca\b|aplicacao|aplicação|poupanca|poupança|invest/i, 'Investimentos']
];

const guessBankCategory = (desc) => {
  for (const [re, cat] of BANK_CATEGORY_HINTS) {
    if (re.test(desc)) {
      const nome = cat === 'Investimentos' ? catPapel('investimentos') : cat;
      return CATEGORIAS.includes(nome) ? nome : catPapel('outros');
    }
  }
  return catPapel('outros');
};

// Linhas de saldo do extrato não são transações
const isBalanceLine = (desc) =>
  /^s\s*a\s*l\s*d\s*o(\s|$)|saldo\s+(do\s+dia|anterior|final|em\s+conta|disponivel|disponível)|^saldo$/i.test(String(desc).trim());

// OFX costuma vir em latin-1; decodifica UTF-8 e cai para latin-1 se aparecer U+FFFD
const readBankFileText = async (file) => {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
};

const parseOFX = (text) => {
  const txs = [];
  text.split(/<STMTTRN>/i).slice(1).forEach((block) => {
    const chunk = block.split(/<\/STMTTRN>/i)[0];
    const tag = (name) => {
      const m = chunk.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const date = parseBankDate(tag('DTPOSTED'));
    const amount = parseSignedValue(tag('TRNAMT'));
    const desc = tag('MEMO') || tag('NAME') || tag('PAYEE');
    const fitid = tag('FITID');
    const trntype = tag('TRNTYPE').toUpperCase();
    if (date && amount !== 0 && desc) txs.push({ date, amount, desc, fitid, ...(trntype ? { trntype } : {}) });
  });
  return txs;
};

const parseQIF = (text) => {
  const txs = [];
  let cur = {};
  text.split(/\r?\n/).forEach((line) => {
    const code = line[0];
    const val = line.slice(1).trim();
    if (code === 'D') cur.date = parseBankDate(val);
    else if (code === 'T' || code === 'U') cur.amount = parseSignedValue(val);
    else if (code === 'P' || code === 'M') cur.desc = cur.desc || val;
    else if (code === '^') {
      if (cur.date && cur.amount && cur.desc) txs.push(cur);
      cur = {};
    }
  });
  return txs;
};

// CSV com células entre aspas (Nubank usa vírgula dentro da descrição)
const parseCsvLineQuoted = (line, sep) => {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
};

const parseBankCSV = (text) => {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { txs: [], hint: null };

  // separador: o que aparecer mais fora de aspas na primeira linha útil
  const conta = (l, ch) => l.replace(/"[^"]*"/g, '').split(ch).length;
  const sep = conta(lines[0], ';') >= conta(lines[0], ',') ? ';' : ',';
  const rows = lines.map((l) => parseCsvLineQuoted(l, sep));

  // Cabeçalho: primeira linha cujo texto casa com nomes conhecidos
  const isHeader = (cells) => cells.some((c) => /^(data|date|dia)/i.test(normalizeHeader(c)))
    && cells.some((c) => /desc|titulo|title|historico|lancamento|memo|estabelecimento/.test(normalizeHeader(c)));

  let dateCol = -1; let descCol = -1; let valueCol = -1; let idCol = -1; let start = 0;
  let hint = null; // 'conta' | 'cartao', quando o cabeçalho identifica o arquivo

  if (isHeader(rows[0])) {
    const headers = rows[0].map(normalizeHeader);
    dateCol = headers.findIndex((h) => /^(data|date|dia)/.test(h));
    descCol = headers.findIndex((h) => /desc|titulo|title|historico|lancamento|memo|estabelecimento/.test(h));
    valueCol = headers.findIndex((h) => /^(valor|amount|value|quantia)/.test(h));
    idCol = headers.findIndex((h) => /^identificador|^identifier|^id$/.test(h)); // Nubank: UUID por transação

    // Assinaturas do Nubank: fatura = date,title,amount · extrato tem Identificador
    if (headers.includes('date') && headers.includes('title') && headers.includes('amount')) hint = 'cartao';
    else if (idCol >= 0) hint = 'conta';
    start = 1;
  } else {
    // Sem cabeçalho (Itaú): infere pelas primeiras linhas de dados
    const amostra = rows[0];
    dateCol = amostra.findIndex((c) => parseBankDate(c));
    const numericas = amostra.map((c, i) => (i !== dateCol && c && parseSignedValue(c) !== 0 && /\d/.test(c) && !/[a-z]{3,}/i.test(c) ? i : -1)).filter((i) => i >= 0);
    valueCol = numericas.length ? numericas[0] : -1;
    descCol = amostra.findIndex((c, i) => i !== dateCol && i !== valueCol && /[a-z]{3,}/i.test(c));
  }

  if (dateCol < 0 || valueCol < 0 || descCol < 0) return { txs: [], hint: null };

  const txs = [];
  rows.slice(start).forEach((cells) => {
    const date = parseBankDate(cells[dateCol]);
    const amount = parseSignedValue(cells[valueCol]);
    const desc = String(cells[descCol] ?? '').trim();
    if (!date || amount === 0 || !desc || isBalanceLine(desc)) return;
    const tx = { date, amount, desc };
    const fitid = idCol >= 0 ? String(cells[idCol] ?? '').trim() : '';
    if (fitid) tx.fitid = fitid;
    txs.push(tx);
  });
  return { txs, hint };
};

const parseBankFile = async (file) => {
  const text = await readBankFileText(file);
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'ofx' || /<OFX>|<STMTTRN>/i.test(text)) {
    // OFX de cartão de crédito usa <CCSTMTRS>/<CREDITCARDMSGSRSV1>
    const hint = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(text) ? 'cartao' : 'conta';
    const dtend = (text.match(/<DTEND>(\d{6})/i) || [])[1];
    const org = (text.match(/<ORG>([^<\r\n]+)/i) || [])[1] || '';
    return { txs: parseOFX(text), formato: 'OFX', hint, fim: dtend ? `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}` : null, org };
  }
  if (ext === 'qif' || /^!Type:/im.test(text)) {
    const hint = /^!Type:CCard/im.test(text) ? 'cartao' : 'conta';
    return { txs: parseQIF(text), formato: 'QIF', hint };
  }
  const { txs, hint } = parseBankCSV(text);
  return { txs, formato: 'CSV', hint };
};

// Fatura: de que lado está o gasto? OFX marca TRNTYPE (CREDIT = pagamento/estorno);
// sem TRNTYPE (CSV/QIF), o gasto é o sinal majoritário do arquivo — no CSV de fatura
// do Nubank o gasto é positivo, no OFX é negativo.
const makeCardExpenseTest = (txs) => {
  const negativas = txs.filter((t) => t.amount < 0).length;
  const sinalGasto = negativas > txs.length - negativas ? -1 : 1;
  return (t) => (t.trntype ? !/CREDIT/.test(t.trntype) : (t.amount < 0 ? -1 : 1) === sinalGasto);
};

const bankIssuerName = (org, fileName) => {
  const fonte = `${org || ''} ${fileName || ''}`;
  if (/nu\s*pagamentos|nubank/i.test(fonte)) return 'Nubank';
  if (org) return titleCaseDesc(org.toLowerCase().replace(/\s+s\.?a\.?$/i, '').trim());
  return 'Cartão';
};

// Última importação fica registrada (junto dos dados, então sincroniza) para
// o "Desfazer última importação" reverter com precisão.
const registrarUndoImportacao = (log) => {
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  allData.__app.ultimaImportacao = { quando: dayjs().toISOString(), ...log };
};

// Fatura importada vira itens DENTRO do lançamento do cartão (o mesmo painel
// com drag & drop), em vez de dezenas de despesas soltas no mês.
const importFaturaAsCardItems = (txs, { mes, categoria }, { dueDay, nomeCartao }) => {
  const ehGasto = makeCardExpenseTest(txs);
  const gastos = txs.filter(ehGasto);
  const pagamentos = txs.length - gastos.length;
  if (!gastos.length) { notify.info('O arquivo só tinha pagamentos/estornos — nada a importar.'); return; }

  const lista = [...(allData[mes] || [])];
  const antesLista = allData[mes] || [];
  let index = lista.findIndex((e) => isCreditCardEntry(e) && e.category === categoria);
  const entryCriada = index === -1;
  const valorAnterior = entryCriada ? 0 : Number(lista[index].value) || 0;
  let entry;
  if (index === -1) {
    entry = {
      id: generateId(), description: nomeCartao, category: categoria, type: 'despesa',
      person: personFromCardCategory(categoria) || '', value: 0, status: 'nao_pago',
      due_day: dueDay || null, observation: '', card_items: []
    };
    lista.push(entry);
    index = lista.length - 1;
  } else {
    entry = { ...lista[index], card_items: [...(lista[index].card_items ?? [])] };
    lista[index] = entry;
  }

  let items = entry.card_items;
  // O item-base "Cartão" sozinho é só um placeholder do total: sai quando entram itens reais
  let defaultRemovido = null;
  if (items.length === 1 && isDefaultCardItem(items[0])) {
    defaultRemovido = items[0];
    items = [];
  }

  const fitids = new Set();
  const chavesComData = new Set(); // itens de importações anteriores (guardam txdate)
  const chavesManuais = new Set(); // itens digitados à mão (sem txdate)
  items.forEach((i) => {
    if (i.fitid) fitids.add(i.fitid);
    const base = `${String(i.description).toLowerCase()}|${(Number(i.value) || 0).toFixed(2)}`;
    if (i.txdate) chavesComData.add(`${i.txdate}|${base}`);
    else chavesManuais.add(base);
  });

  let importados = 0;
  let pulados = 0;
  const itemIdsNovos = [];
  gastos.forEach((t) => {
    const description = normalizeBankDesc(t.desc) || String(t.desc).trim();
    const value = Math.abs(t.amount);
    const base = `${description.toLowerCase()}|${value.toFixed(2)}`;
    const comData = `${t.date}|${base}`;
    if ((t.fitid && fitids.has(t.fitid)) || chavesComData.has(comData) || chavesManuais.has(base)) {
      pulados++;
      return;
    }
    chavesComData.add(comData);
    if (t.fitid) fitids.add(t.fitid);
    const item = {
      id: generateId(), description, value, recurring: false, txdate: t.date,
      ...(t.fitid ? { fitid: t.fitid } : {})
    };
    items.push(item);
    itemIdsNovos.push(item.id);
    importados++;
  });

  if (!importados) {
    notify.info(pulados ? 'Tudo já estava na fatura — nenhum item novo.' : 'Nenhum item válido.');
    return;
  }

  entry.card_items = items;
  entry.value = sumCardItems(items);
  allData[mes] = lista.map(normalizeEntry);
  registrarHistoricoMes(mes, antesLista, allData[mes], `importou fatura do banco (${importados} itens em “${entry.description}”)`);
  expandedCardEntries.add(entry.id);
  registrarUndoImportacao({
    tipo: 'cartao', mes, entryId: entry.id, entryCriada,
    itemIds: itemIdsNovos, valorAnterior, defaultRemovido
  });
  saveData();

  if (mes !== getMonthKey(currentDate)) {
    currentDate = dayjs(`${mes}-01`);
    syncSelectors();
  }
  render();
  const nomeMes = dayjs(`${mes}-01`).format('MMMM [de] YYYY');
  notify.success(`${importados} item(ns) na fatura de ${nomeMes}`
    + (pulados ? ` · ${pulados} já existia(m)` : '')
    + (pagamentos ? ` · ${pagamentos} pagamento(s)/estorno(s) ignorado(s)` : ''));
};

const importBankStatement = async (file) => {
  const { txs, formato, hint, fim, org } = await parseBankFile(file);
  if (!txs.length) {
    notify.error('Nenhuma transação encontrada. Exporte o extrato em OFX, CSV ou QIF.');
    return;
  }

  // Modo sugerido: assinatura do arquivo (cabeçalho Nubank, OFX de cartão) tem
  // prioridade; senão, fatura costuma ser quase toda de um sinal só
  const positivas = txs.filter((t) => t.amount >= 0).length;
  const dominancia = Math.max(positivas, txs.length - positivas) / txs.length;
  const sugestao = hint ?? (dominancia >= 0.8 ? 'cartao' : 'conta');

  const porMes = {};
  txs.forEach((t) => { const k = t.date.slice(0, 7); porMes[k] = (porMes[k] || 0) + 1; });
  const resumoMeses = Object.keys(porMes).sort().map((k) =>
    `<li>${dayjs(`${k}-01`).format('MMMM [de] YYYY')}: <strong>${porMes[k]}</strong> transação(ões)</li>`).join('');

  // Nubank exporta como "Nubank_2026-09-10": a data no nome é o vencimento da fatura
  const nomeData = file.name.match(/(\d{4})-(\d{2})-(\d{2})/);
  const mesFaturaDefault = (nomeData ? `${nomeData[1]}-${nomeData[2]}` : null)
    || fim || Object.keys(porMes).sort().pop();
  const diaVencimento = nomeData ? +nomeData[3] : null;
  const cardCats = [catPapel('cartaoGabriel'), catPapel('cartaoBabi'), catPapel('cartao')].filter((c) => CATEGORIAS.includes(c));
  const nomeCartao = bankIssuerName(org, file.name);

  const { value: escolha, isConfirmed } = await Swal.fire({
    title: `Importar ${formato}?`,
    html: `<div style="text-align:left;font-size:.92rem">
      <p class="mb-1"><strong>${txs.length}</strong> transação(ões) encontradas:</p>
      <ul style="padding-left:1.2rem;margin-bottom:.7rem">${resumoMeses}</ul>
      <label style="display:block;margin:.3rem 0;cursor:pointer">
        <input type="radio" name="bankMode" value="cartao"${sugestao === 'cartao' ? ' checked' : ''}>
        <strong>Fatura de cartão</strong> — vira itens dentro do lançamento do cartão
      </label>
      <div id="bankCardOpts" style="margin:.2rem 0 .55rem 1.45rem;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center">
        <label style="margin:0">Mês da fatura <input type="month" id="bankCardMes" value="${mesFaturaDefault}" style="padding:.2rem .3rem"></label>
        <label style="margin:0">Cartão <select id="bankCardCat" style="padding:.25rem .3rem;max-width:14rem">
          ${cardCats.map((c) => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('')}
        </select></label>
      </div>
      <label style="display:block;margin:.3rem 0;cursor:pointer">
        <input type="radio" name="bankMode" value="conta"${sugestao === 'conta' ? ' checked' : ''}>
        <strong>Extrato de conta</strong> — cada transação vira um lançamento no mês da própria data
      </label>
      <p class="mb-0" style="font-size:.85rem;color:#888">Duplicados são pulados — pode importar OFX e CSV do mesmo período.</p>
    </div>`,
    showCancelButton: true,
    confirmButtonText: 'Importar',
    cancelButtonText: 'Cancelar',
    didOpen: () => {
      const popup = Swal.getPopup();
      const opts = popup.querySelector('#bankCardOpts');
      const sync = () => {
        const modo = popup.querySelector('input[name="bankMode"]:checked')?.value;
        opts.style.opacity = modo === 'cartao' ? '1' : '.45';
      };
      popup.querySelectorAll('input[name="bankMode"]').forEach((r) => r.addEventListener('change', sync));
      sync();
    },
    preConfirm: () => {
      const popup = Swal.getPopup();
      const tipo = popup.querySelector('input[name="bankMode"]:checked')?.value;
      if (!tipo) { Swal.showValidationMessage('Escolha o tipo do arquivo.'); return false; }
      if (tipo === 'conta') return { tipo };
      const mes = popup.querySelector('#bankCardMes').value;
      const categoria = popup.querySelector('#bankCardCat').value;
      if (!/^\d{4}-\d{2}$/.test(mes)) { Swal.showValidationMessage('Informe o mês da fatura.'); return false; }
      return { tipo, mes, categoria };
    }
  });
  if (!isConfirmed || !escolha) return;

  if (escolha.tipo === 'cartao') {
    importFaturaAsCardItems(txs, escolha, { dueDay: diaVencimento, nomeCartao });
    return;
  }

  // ---- Extrato de conta: cada transação vira um lançamento ----
  const fitids = new Set();
  const chavesComDia = new Set(); // lançamentos com dia conhecido (importados antes)
  const chavesSemDia = new Set(); // lançamentos manuais sem due_day
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    (allData[k] || []).forEach((e) => {
      if (e.fitid) fitids.add(e.fitid);
      const base = `${k}|${String(e.description).toLowerCase()}|${(Number(e.value) || 0).toFixed(2)}|${e.type}`;
      if (e.due_day) chavesComDia.add(`${e.due_day}|${base}`);
      else chavesSemDia.add(base);
    });
  });

  let importados = 0;
  let pulados = 0;
  const mesesTocados = new Set();
  const entradasNovas = [];
  const antesPorMes = {};

  txs.forEach((t) => {
    const value = Math.abs(t.amount);
    let type = t.amount < 0 ? 'despesa' : 'entrada';

    const description = normalizeBankDesc(t.desc);
    let category = guessBankCategory(`${t.desc} ${description}`);
    // Só vira investimento quando o dinheiro SAI (aplicação); resgate é entrada normal
    if (category === catPapel('investimentos') && t.amount < 0) type = 'investimento';
    if (type === 'investimento') category = catPapel('investimentos');
    else if (type === 'entrada') category = catPapel('outros');

    const mes = t.date.slice(0, 7);
    const dia = Number(t.date.slice(8, 10)) || null;
    const base = `${mes}|${description.toLowerCase()}|${value.toFixed(2)}|${type}`;
    if ((t.fitid && fitids.has(t.fitid)) || chavesComDia.has(`${dia}|${base}`) || chavesSemDia.has(base)) {
      pulados++;
      return;
    }
    chavesComDia.add(`${dia}|${base}`);
    if (t.fitid) fitids.add(t.fitid);

    const entry = normalizeEntry({
      id: generateId(),
      description,
      category,
      type,
      person: '',
      value,
      status: 'pago',
      due_day: dia,
      observation: '',
      card_items: [],
      ...(t.fitid ? { fitid: t.fitid } : {})
    });

    if (!antesPorMes[mes]) antesPorMes[mes] = [...(allData[mes] || [])];
    if (!allData[mes]) allData[mes] = [];
    allData[mes].push(entry);
    entradasNovas.push({ mes, id: entry.id });
    mesesTocados.add(mes);
    importados++;
  });

  if (!importados) {
    notify.info(pulados ? 'Tudo já estava importado — nenhum lançamento novo.' : 'Nenhum lançamento válido.');
    return;
  }

  Object.keys(antesPorMes).forEach((m) => registrarHistoricoMes(m, antesPorMes[m], allData[m], `importou extrato do banco (${entradasNovas.filter((x) => x.mes === m).length} lançamentos)`));
  registrarUndoImportacao({ tipo: 'conta', entradas: entradasNovas });
  saveData();

  // Mostra o mês mais recente entre os importados
  const destino = [...mesesTocados].sort().pop();
  if (destino && destino !== getMonthKey(currentDate)) {
    currentDate = dayjs(`${destino}-01`);
    syncSelectors();
  }
  render();
  notify.success(`${importados} lançamento(s) importado(s)${pulados ? ` · ${pulados} duplicado(s)/pulado(s)` : ''}!`);
};

// Desfaz a última importação registrada; sem registro (importação feita numa
// versão anterior), remove pelo rastro: lançamentos com fitid e itens com txdate.
const desfazerUltimaImportacao = async () => {
  const log = allData.__app?.ultimaImportacao;

  if (log?.tipo === 'cartao') {
    const lista = [...(allData[log.mes] || [])];
    const idx = lista.findIndex((e) => e.id === log.entryId);
    if (idx === -1) {
      delete allData.__app.ultimaImportacao;
      saveData();
      notify.error('O lançamento daquela fatura não existe mais — nada a desfazer.');
      return;
    }
    const alvo = lista[idx];
    const nomeMes = dayjs(`${log.mes}-01`).format('MMMM [de] YYYY');
    const ok = await confirmAction({
      title: 'Desfazer importação?',
      text: log.entryCriada
        ? `O lançamento "${alvo.description}" (${nomeMes}) criado pela importação será excluído com seus itens.`
        : `${log.itemIds.length} item(ns) importado(s) saem da fatura "${alvo.description}" (${nomeMes}); o que era manual fica.`,
      icon: 'warning',
      confirmText: 'Sim, desfazer'
    });
    if (!ok) return;

    if (log.entryCriada) {
      lista.splice(idx, 1);
    } else {
      const ids = new Set(log.itemIds);
      let items = (alvo.card_items ?? []).filter((i) => !ids.has(i.id));
      if (log.defaultRemovido) items = [log.defaultRemovido, ...items];
      const value = (items.length === 1 && isDefaultCardItem(items[0]))
        ? (Number(log.valorAnterior) || 0)
        : sumCardItems(items);
      lista[idx] = { ...alvo, card_items: items, value };
    }
    const antesFatura = allData[log.mes] || [];
    allData[log.mes] = lista.map(normalizeEntry);
    registrarHistoricoMes(log.mes, antesFatura, allData[log.mes], 'desfez importação de fatura');
    delete allData.__app.ultimaImportacao;
    saveData();
    render();
    notify.success('Importação desfeita.');
    return;
  }

  if (log?.tipo === 'conta') {
    const ok = await confirmAction({
      title: 'Desfazer importação?',
      text: `${log.entradas.length} lançamento(s) importado(s) do extrato serão excluídos.`,
      icon: 'warning',
      confirmText: 'Sim, desfazer'
    });
    if (!ok) return;
    const porMes = {};
    log.entradas.forEach(({ mes, id }) => { (porMes[mes] = porMes[mes] || new Set()).add(id); });
    Object.entries(porMes).forEach(([mes, ids]) => {
      const antesMes = allData[mes] || [];
      allData[mes] = antesMes.filter((e) => !ids.has(e.id)).map(normalizeEntry);
      registrarHistoricoMes(mes, antesMes, allData[mes], 'desfez importação de extrato');
    });
    delete allData.__app.ultimaImportacao;
    saveData();
    render();
    notify.success('Importação desfeita.');
    return;
  }

  // ---- Sem registro: remove pelo rastro dos marcadores ----
  const entradas = [];
  const faturas = [];
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    (allData[k] || []).forEach((e) => {
      if (e.fitid) { entradas.push({ mes: k, id: e.id }); return; }
      const marcados = (e.card_items ?? []).filter((i) => i.txdate || i.fitid);
      if (marcados.length) {
        faturas.push({
          mes: k, id: e.id, desc: e.description, qtd: marcados.length,
          soImportados: marcados.length === (e.card_items ?? []).length
        });
      }
    });
  });

  if (!entradas.length && !faturas.length) {
    notify.info('Nenhuma importação de banco encontrada para desfazer.');
    return;
  }

  const resumo = [
    ...faturas.map((f) => `${f.soImportados ? 'excluir o lançamento' : `remover ${f.qtd} item(ns) importado(s) de`} "${f.desc}" (${dayjs(`${f.mes}-01`).format('MMM/YYYY')})`),
    ...(entradas.length ? [`excluir ${entradas.length} lançamento(s) importado(s) de extrato`] : [])
  ].join('; ');
  const ok = await confirmAction({
    title: 'Remover tudo que veio do banco?',
    text: `Vai ${resumo}. Itens e lançamentos manuais ficam.`,
    icon: 'warning',
    confirmText: 'Sim, remover'
  });
  if (!ok) return;

  const entradasPorMes = {};
  entradas.forEach(({ mes, id }) => { (entradasPorMes[mes] = entradasPorMes[mes] || new Set()).add(id); });
  const faturasPorMes = {};
  faturas.forEach((f) => { (faturasPorMes[f.mes] = faturasPorMes[f.mes] || []).push(f); });

  new Set([...Object.keys(entradasPorMes), ...Object.keys(faturasPorMes)]).forEach((mes) => {
    let lista = allData[mes] || [];
    const idsEntradas = entradasPorMes[mes];
    if (idsEntradas) lista = lista.filter((e) => !idsEntradas.has(e.id));
    (faturasPorMes[mes] || []).forEach((f) => {
      if (f.soImportados) {
        lista = lista.filter((e) => e.id !== f.id);
        return;
      }
      lista = lista.map((e) => {
        if (e.id !== f.id) return e;
        const items = (e.card_items ?? []).filter((i) => !i.txdate && !i.fitid);
        return { ...e, card_items: items, value: sumCardItems(items) };
      });
    });
    const antesMes = allData[mes] || [];
    allData[mes] = lista.map(normalizeEntry);
    registrarHistoricoMes(mes, antesMes, allData[mes], 'removeu importações do banco');
  });

  saveData();
  render();
  notify.success('Importações do banco removidas.');
};

const onImportBank = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    await importBankStatement(file);
  } catch {
    notify.error('Não consegui ler este arquivo. Exporte no formato OFX, CSV ou QIF.');
  }
  dom.inputImportBank.value = '';
};

const handleImportClick = (type) => {
  if (type === 'json') dom.inputImportJson.click();
  if (type === 'sheet') dom.inputImportSheet.click();
  if (type === 'bank') dom.inputImportBank.click();
  if (type === 'undo-bank') desfazerUltimaImportacao();
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
  return label ? ` <span class="invest-link-tag" title="Soma na carteira (aba Investimentos)"><i class="bi bi-graph-up-arrow"></i> ${escapeHtml(label)}</span>` : '';
};

const renderEntryRow = (entry, valueClass) => {
  if (isCreditCardEntry(entry)) return renderCreditCardRows(entry, valueClass);

  return `
  <tr data-id="${entry.id}">
    <td class="cell-description">${escapeHtml(entry.description)}${investLinkTag(entry)}</td>
    <td>${renderPersonTag(entry.person)}</td>
    <td><span class="category-tag">${escapeHtml(entry.category)}</span></td>
    <td class="${valueClass}">${formatCurrency(entry.value)}</td>
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
        <span class="entry-card__value ${valueClass}">${formatCurrency(entry.value)}</span>
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
        <span class="entry-card__value ${valueClass}">${formatCurrency(entry.value)}</span>
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
  const { afterExpenses, surplus } = getMonthBalances(summary);
  const { income: incomeList, expense: expenseList, investment: investmentList } = splitEntries(entries);

  dom.totalIncome.textContent = formatCurrency(summary.income);
  dom.totalExpense.textContent = formatCurrency(summary.expense);
  dom.totalInvestment.textContent = formatCurrency(summary.investment);
  dom.totalPaid.textContent = formatCurrency(summary.paid);
  dom.totalReserved.textContent = formatCurrency(summary.reserved);
  dom.totalUnpaid.textContent = formatCurrency(summary.unpaid);

  // Restou (entradas − despesas) — desativado na UI; descomente index.html + bloco abaixo
  // if (dom.calcAfterExpenses) {
  //   dom.calcAfterExpenses.textContent = formatCurrency(afterExpenses);
  //   dom.calcAfterExpenses.style.color = afterExpenses >= 0 ? 'var(--app-balance)' : 'var(--app-expense)';
  // }
  if (dom.calcSurplus) {
    dom.calcSurplus.textContent = formatCurrency(surplus);
    dom.calcSurplus.style.color = surplus >= 0 ? 'var(--app-investment)' : 'var(--app-expense)';
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

// ============================================
// Drag & drop dos itens da fatura
// ============================================

const CARD_DRAG_THRESHOLD = 4;   // px antes de considerar arraste (evita roubar cliques)
const CARD_DRAG_EDGE = 72;       // zona de autoscroll perto das bordas da viewport
const CARD_DRAG_SPEED = 16;      // px por frame no autoscroll

const cardDrag = {
  pointerId: null,
  handle: null,
  row: null,
  list: null,
  placeholder: null,
  entryId: null,
  itemId: null,
  startY: 0,
  lastY: 0,
  grabOffset: 0,
  borderTop: 0,
  rowHeight: 0,
  startIds: [],
  started: false,
  raf: 0
};

// Linhas que participam da ordenação: ignora o vazio e a linha flutuante
// (o placeholder carrega o data-item-id do item arrastado, ocupando o lugar dele).
const cardDragRowsOf = (list) => [...list.children].filter((li) =>
  li.classList.contains('card-item')
  && !li.classList.contains('card-item--empty')
  && !li.classList.contains('card-item--dragging'));

const cardDragIdsOf = (list) => cardDragRowsOf(list).map((li) => li.dataset.itemId);

const resetCardDrag = () => {
  cardDrag.pointerId = null;
  cardDrag.handle = null;
  cardDrag.row = null;
  cardDrag.list = null;
  cardDrag.placeholder = null;
  cardDrag.entryId = null;
  cardDrag.itemId = null;
  cardDrag.startIds = [];
  cardDrag.started = false;
  cardDrag.raf = 0;
};

const activateCardDrag = () => {
  const { row, list } = cardDrag;
  const rect = row.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const style = getComputedStyle(list);

  // A linha flutuante é absoluta dentro da lista (top/left contam da borda interna),
  // então guardamos a borda para casar com a posição original.
  cardDrag.borderTop = parseFloat(style.borderTopWidth) || 0;
  cardDrag.rowHeight = rect.height;
  cardDrag.startIds = cardDragIdsOf(list);
  cardDrag.grabOffset = cardDrag.startY - rect.top;

  const placeholder = document.createElement('li');
  placeholder.className = 'card-item card-item--placeholder';
  placeholder.dataset.itemId = cardDrag.itemId;
  placeholder.style.height = `${rect.height}px`;
  list.insertBefore(placeholder, row);
  cardDrag.placeholder = placeholder;

  row.classList.add('card-item--dragging');
  row.style.width = `${rect.width}px`;
  row.style.height = `${rect.height}px`;
  row.style.left = `${rect.left - listRect.left - (parseFloat(style.borderLeftWidth) || 0)}px`;

  document.body.classList.add('is-dragging-card-item');
  cardDrag.started = true;
  cardDrag.raf = requestAnimationFrame(cardDragAutoScroll);
  moveCardDrag(cardDrag.startY);
};

const moveCardDrag = (clientY) => {
  const { row, list, placeholder } = cardDrag;
  const listRect = list.getBoundingClientRect();
  const rawTop = clientY - cardDrag.grabOffset - listRect.top - cardDrag.borderTop;
  const maxTop = Math.max(list.clientHeight - cardDrag.rowHeight, 0);

  // O visual fica preso dentro da lista...
  row.style.top = `${Math.min(Math.max(rawTop, 0), maxTop)}px`;

  // ...mas o alvo usa o centro sem limite: preso, o centro empataria exatamente com o
  // meio da primeira/última linha e as pontas ficariam inalcançáveis.
  const center = clientY - cardDrag.grabOffset + cardDrag.rowHeight / 2;
  const targets = cardDragRowsOf(list).filter((li) => li !== placeholder);
  const ref = targets.find((li) => {
    const r = li.getBoundingClientRect();
    return center < r.top + r.height / 2;
  }) ?? null;

  if (placeholder.nextElementSibling !== ref) list.insertBefore(placeholder, ref);
};

const cardDragAutoScroll = () => {
  if (!cardDrag.started) return;

  const y = cardDrag.lastY;
  const bottomGap = window.innerHeight - y;
  let dy = 0;
  if (y < CARD_DRAG_EDGE) dy = -CARD_DRAG_SPEED * (1 - Math.max(y, 0) / CARD_DRAG_EDGE);
  else if (bottomGap < CARD_DRAG_EDGE) dy = CARD_DRAG_SPEED * (1 - Math.max(bottomGap, 0) / CARD_DRAG_EDGE);

  if (dy) {
    const before = window.scrollY;
    window.scrollBy(0, dy);
    if (window.scrollY !== before) moveCardDrag(y);
  }

  cardDrag.raf = requestAnimationFrame(cardDragAutoScroll);
};

const finishCardDrag = (commit) => {
  if (cardDrag.raf) cancelAnimationFrame(cardDrag.raf);

  const { row, list, placeholder, entryId, itemId, startIds, started, handle, pointerId } = cardDrag;
  try { handle?.releasePointerCapture?.(pointerId); } catch { /* já liberado */ }

  if (!started) { resetCardDrag(); return; }

  const ids = cardDragIdsOf(list);
  const alive = list.isConnected; // uma re-renderização no meio do arraste invalida a ordem
  placeholder.remove();
  row.classList.remove('card-item--dragging');
  row.removeAttribute('style');
  document.body.classList.remove('is-dragging-card-item');
  resetCardDrag();

  // Cancelado: o item nunca saiu do lugar no DOM, só o placeholder se movia
  if (!commit || !alive || ids.join('|') === startIds.join('|')) return;

  pendingCardItemFocusId = itemId;
  if (!reorderCardItems(entryId, ids)) pendingCardItemFocusId = null;
};

const handleCardItemPointerDown = (e) => {
  if (cardDrag.pointerId !== null) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const handle = e.target.closest('[data-card-drag]');
  if (!handle) return;

  const row = handle.closest('.card-item');
  const list = row?.parentElement;
  const panel = row?.closest('.card-items-panel');
  if (!row || !list?.classList.contains('card-items-list') || !panel) return;
  if (cardDragRowsOf(list).length < 2) return;

  e.preventDefault();
  cardDrag.pointerId = e.pointerId;
  cardDrag.handle = handle;
  cardDrag.row = row;
  cardDrag.list = list;
  cardDrag.entryId = panel.dataset.cardId;
  cardDrag.itemId = row.dataset.itemId;
  cardDrag.startY = e.clientY;
  cardDrag.lastY = e.clientY;
  cardDrag.started = false;
  handle.focus({ preventScroll: true }); // habilita ↑ ↓ logo após clicar no handle
  try { handle.setPointerCapture?.(e.pointerId); } catch { /* sem captura: cai nos listeners do document */ }
};

const handleCardItemPointerMove = (e) => {
  if (cardDrag.pointerId === null || e.pointerId !== cardDrag.pointerId) return;

  cardDrag.lastY = e.clientY;

  if (!cardDrag.started) {
    if (Math.abs(e.clientY - cardDrag.startY) < CARD_DRAG_THRESHOLD) return;
    activateCardDrag();
  }

  e.preventDefault();
  moveCardDrag(e.clientY);
};

const handleCardItemPointerUp = (e) => {
  if (cardDrag.pointerId === null || e.pointerId !== cardDrag.pointerId) return;
  finishCardDrag(e.type === 'pointerup');
};

const bindCardDragEvents = () => {
  document.addEventListener('pointermove', handleCardItemPointerMove, { passive: false });
  document.addEventListener('pointerup', handleCardItemPointerUp);
  document.addEventListener('pointercancel', handleCardItemPointerUp);
  window.addEventListener('blur', () => { if (cardDrag.pointerId !== null) finishCardDrag(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardDrag.pointerId !== null) finishCardDrag(false);
  });
};

const focusCardItemHandle = (itemId) => {
  const handles = [...document.querySelectorAll(`.card-item[data-item-id="${itemId}"] [data-card-drag]`)];
  (handles.find((el) => el.offsetParent !== null) ?? handles[0])?.focus();
};

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

  if (action === 'edit') openEditModal(id);
  if (action === 'delete') deleteEntry(id);
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
  toggleInvestimentoField(dom.inputType, dom.inputInvestimentoWrap);
};

const onEditTypeChange = () => {
  if (dom.editType.value === 'investimento') {
    dom.editCategory.value = catPapel('investimentos');
  }
  toggleInvestimentoField(dom.editType, dom.editInvestimentoWrap);
};

// ============================================
// Init
// ============================================

// Carrega os dados e desenha a tela (chamado quando o armazenamento está pronto)
const startApp = async () => {
  await loadData();
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  toggleInvestimentoField(dom.inputType, dom.inputInvestimentoWrap);
  render();
};

// ============================================
// PWA — versão e service worker
// ============================================

// Fonte única da versão: a meta do index.html, que é o mesmo valor do ?v= dos arquivos
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content?.trim() || 'dev';

const showAppVersion = () => {
  if (!dom.appVersion) return;
  dom.appVersion.textContent = `v${APP_VERSION}`;
  dom.appVersion.hidden = false;
  // Recarregar basta: o service worker busca o HTML sempre na rede
  dom.appVersion.addEventListener('click', () => location.reload());
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
      scope: './',
      updateViaCache: 'none' // o próprio sw.js nunca vem do cache do navegador
    });

    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      // Sem controller é a primeira instalação: não há "versão nova" a anunciar
      if (!novo || !navigator.serviceWorker.controller) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'activated') {
          notify.info('Nova versão instalada. Recarregue a página para usá-la.');
        }
      });
    });

    // Ao voltar para a aba, procura versão nova (útil em aba aberta há dias)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  } catch {
    /* O app funciona igual sem service worker — o PWA é um extra */
  }
};

const init = () => {
  dayjs.locale('pt-br');
  showAppVersion();
  window.addEventListener('load', registerServiceWorker);
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
