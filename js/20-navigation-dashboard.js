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
  toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'));
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
  const now = Date.now();
  const touchedIds = [];
  Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).forEach((k) => {
    allData[k] = (allData[k] || []).map((e) => {
      if (e.category !== de) return e;
      touchedIds.push(e.id);
      const prevAt = Number(e._updatedAt) || 0;
      return { ...e, category: para, _updatedAt: Math.max(now, prevAt + 1) };
    });
    snapshotsMes[k] = cloneDados(allData[k]); // mudança já auditada pelo registro de categorias
  });
  if (touchedIds.length) desmarcarExclusaoIds(touchedIds);
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
    (acc, { type, value, status, person }) => {
      if (type === 'entrada') acc.income += value;
      else if (type === 'investimento') acc.investment += value;
      else if (type === 'resgate') acc.investment -= value;
      else acc.expense += value;

      if (type !== 'entrada' && type !== 'resgate') {
        if (status === 'pago') acc.paid += value;
        else if (status === 'reservado') acc.reserved += value;
        else acc.unpaid += value;
      }

      if (status === 'pago' && type !== 'resgate') {
        if (person === 'gabriel') {
          if (type === 'entrada') acc.gabrielIncome += value;
          else acc.gabrielExpense += value;
        } else if (person === 'barbara') {
          if (type === 'entrada') acc.barbaraIncome += value;
          else acc.barbaraExpense += value;
        }
      }

      return acc;
    },
    {
      income: 0, expense: 0, investment: 0, paid: 0, reserved: 0, unpaid: 0,
      gabrielIncome: 0, gabrielExpense: 0, barbaraIncome: 0, barbaraExpense: 0
    }
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
    .filter((e) => e.type === 'investimento' || e.type === 'resgate')
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
