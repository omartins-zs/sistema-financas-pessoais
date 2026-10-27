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

  await restaurarDadosCompletos(imported, `arquivo ${file.name || 'JSON'}`);
  notify.success('Backup restaurado com sucesso!');
};
