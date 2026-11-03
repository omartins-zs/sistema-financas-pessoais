import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const slice = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `trecho não encontrado: ${startMarker}`);
  assert.notEqual(end, -1, `fim do trecho não encontrado: ${endMarker}`);
  return source.slice(start, end);
};

// Arrays/objetos criados dentro do vm são de outro realm: normaliza antes do deepEqual
const plain = (x) => JSON.parse(JSON.stringify(x));

const CAT = { cartaoGabriel: 'Cartão de crédito Gabriel', cartaoBabi: 'Cartão de crédito Babi', cartao: 'Cartão de crédito', investimentos: 'Investimentos', outros: 'Outros' };
const PERSON_LABELS = { gabriel: 'Gabriel', barbara: 'Barbara', casa: 'Casa', familia: 'Família' };

// Funções do cartão (00-core.js) + resumo do mês (20-navigation-dashboard.js)
const loadTotais = async () => {
  const core = await read('js/00-core.js');
  const nav = await read('js/20-navigation-dashboard.js');
  const cartao = slice(core, 'const isCreditCardEntry =', 'const personFromCardCategory =');
  const resumo = slice(nav, '// Cartão com terceiros entra pelo valor sem terceiros', '// Gráficos');
  let seq = 0;
  const context = {
    catPapel: (p) => CAT[p] || p,
    generateId: () => `gerado-${++seq}`,
    PERSON_LABELS,
    TYPE_LABELS: {},
    STATUS_LABELS: {},
    sortByPersonThenDescription: () => 0,
    formatValuePlain: String
  };
  runInNewContext(`${cartao}\n${resumo}
globalThis.__t = { valorContabil, totalSemTerceiros, calculateSummary, getExpensesByCategory };`, context);
  return context.__t;
};

test('fatura com terceiros: Despesas, Pago e % comprometido contam só o valor sem terceiros', async () => {
  const t = await loadTotais();
  const nubank = {
    id: 'k1', description: 'Nubank', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 2000, status: 'pago',
    card_items: [{ id: 'i1', description: 'Outback', value: 600 }, { id: 'i2', description: 'Outros', value: 1400 }],
    terceiros: [{ id: 't1', descricao: 'Outback', pessoa: 'Pai', valor: 300 }, { id: 't2', descricao: 'Outback', pessoa: 'Irmão', valor: 100 }]
  };
  const salario = { id: 's', description: 'Salário', category: 'Outros', type: 'entrada', person: 'gabriel', value: 5000, status: 'pago' };
  const luz = { id: 'l', description: 'Luz', category: 'Luz', type: 'despesa', person: 'gabriel', value: 200, status: 'nao_pago' };

  assert.equal(t.valorContabil(nubank), 1600, 'R$ 2.000 − R$ 400 de terceiros');
  assert.equal(t.valorContabil(luz), 200, 'despesa comum não muda');
  assert.equal(nubank.value, 2000, 'o lançamento continua guardando a fatura cheia');

  const s = t.calculateSummary([salario, nubank, luz]);
  assert.equal(s.expense, 1800, 'Despesas do mês: 1.600 do cartão + 200 da luz');
  assert.equal(s.paid, 1600, 'Pago: a fatura paga entra sem terceiros');
  assert.equal(s.unpaid, 200);
  assert.equal(s.gabrielExpense, 1600, 'gasto do Gabriel (base do % comprometido) sem terceiros');
  assert.equal(((s.gabrielExpense / s.gabrielIncome) * 100).toFixed(1), '32.0', '% comprometido: 1.600 de 5.000');
  assert.equal(s.income - s.expense - s.investment, 3200, 'Sobra considera o que realmente é seu');

  assert.deepEqual(plain(t.getExpensesByCategory([nubank, luz])), { [CAT.cartaoGabriel]: 1600, Luz: 200 }, 'gráfico por categoria igual ao resumo');

  const semTerceiros = { ...nubank, terceiros: [] };
  assert.equal(t.calculateSummary([semTerceiros]).expense, 2000, 'sem terceiros, conta a fatura inteira');
  const itensLimpos = { ...nubank, value: 0, card_items: [] };
  assert.equal(t.totalSemTerceiros(itensLimpos), 0, 'terceiros maiores que a fatura nunca deixam o total negativo');
});

// Botão "Limpar itens" (11-history-audit.js)
const loadLimpar = async (entries, respostaDialogo) => {
  const core = await read('js/00-core.js');
  const audit = await read('js/11-history-audit.js');
  const terceiros = slice(core, '// ---- Valores de terceiros da fatura', '// ---- fim: valores de terceiros ----');
  const limpar = slice(audit, '// Limpa a fatura (ex.: para reimportar)', '// Reordena apenas os ids informados');
  const registros = [];
  const avisos = [];
  const backups = [];
  const context = {
    state: { entries },
    allData: { __app: { ultimaImportacao: { tipo: 'cartao', entryId: 'k1', mes: '2026-11', itemIds: ['i1'] } } },
    getCurrentEntries: () => context.state.entries,
    setCurrentEntries: (next, acao) => { registros.push(acao); context.state.entries = next; },
    cloneDados: (x) => JSON.parse(JSON.stringify(x)),
    generateId: () => 'novo',
    isDefaultCardItem: (i) => i.isDefault === true,
    sumCardItems: (items = []) => Math.round(items.reduce((a, i) => a + (Number(i.value) || 0), 0) * 100) / 100,
    formatCurrency: (v) => `R$ ${Number(v).toFixed(2)}`,
    escapeHtml: (s) => String(s),
    expandedCardEntries: new Set(),
    render: () => {},
    notify: { info: (m) => avisos.push(m), success: (m) => avisos.push(m), error: (m) => avisos.push(`ERRO: ${m}`) },
    AppStorage: { backupNow: async (dados, motivo) => { backups.push(motivo); } },
    Swal: { fire: async () => respostaDialogo, getPopup: () => null }
  };
  runInNewContext(`${terceiros}\n${limpar}\nglobalThis.__t = { clearCardItems };`, context);
  return { t: context.__t, context, registros, avisos, backups };
};

const faturaCheia = () => ({
  id: 'k1', description: 'Nubank', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 425, status: 'nao_pago',
  card_items: [
    { id: 'i1', description: 'Mercado', value: 300, recurring: false },
    { id: 'i2', description: 'Spotify', value: 25, recurring: true },
    { id: 'i3', description: 'Uber', value: 100, recurring: false }
  ],
  terceiros: [{ id: 't1', descricao: 'Mercado', pessoa: 'Mãe', valor: 50 }]
});

test('limpar itens: tira os avulsos, mantém os recorrentes, apaga terceiros e vai para o Histórico', async () => {
  const { t, context, registros, avisos, backups } = await loadLimpar([faturaCheia()], { isConfirmed: true, value: { manterRecorrentes: true, limparTerceiros: true } });
  await t.clearCardItems('k1');
  const [nubank] = context.state.entries;

  assert.deepEqual(plain(nubank.card_items.map((i) => i.description)), ['Spotify'], 'recorrente fica');
  assert.equal(nubank.value, 25, 'valor da fatura acompanha os itens que ficaram');
  assert.deepEqual(plain(nubank.terceiros), []);
  assert.match(registros.at(-1), /limpou 2 item\(ns\) da fatura “Nubank” \(manteve 1 recorrente\(s\)\) e os valores de terceiros/);
  assert.match(backups[0], /antes de: limpar itens de “Nubank”/, 'cópia local antes de limpar');
  assert.equal(context.allData.__app.ultimaImportacao, undefined, '"Desfazer última importação" desta fatura sai (os itens não existem mais)');
  assert.match(avisos.at(-1), /ficaram 1 recorrente/);
});

test('limpar itens: pode tirar tudo e manter os terceiros; cancelar não mexe em nada', async () => {
  const tudo = await loadLimpar([faturaCheia()], { isConfirmed: true, value: { manterRecorrentes: false, limparTerceiros: false } });
  await tudo.t.clearCardItems('k1');
  const [limpo] = tudo.context.state.entries;
  assert.deepEqual(plain(limpo.card_items), []);
  assert.equal(limpo.value, 0);
  assert.equal(limpo.terceiros.length, 1, 'terceiros mantidos para reimportar');

  const cancelado = await loadLimpar([faturaCheia()], { isConfirmed: false });
  await cancelado.t.clearCardItems('k1');
  assert.equal(cancelado.context.state.entries[0].card_items.length, 3);
  assert.equal(cancelado.registros.length, 0);
  assert.equal(cancelado.backups.length, 0);

  const vazio = await loadLimpar([{ ...faturaCheia(), card_items: [{ id: 'd', description: 'Cartão', value: 0, isDefault: true }], terceiros: [] }], { isConfirmed: true, value: {} });
  await vazio.t.clearCardItems('k1');
  assert.match(vazio.avisos.at(-1), /já está sem itens/);
  assert.equal(vazio.registros.length, 0);
});

// Importação da fatura (51-import-workflows.js)
const loadImportacao = async (allData, mesAberto = '2026-11') => {
  const imp = await read('js/51-import-workflows.js');
  const trecho = slice(imp, '// Mesmo cartão em meses diferentes', 'const importBankStatement');
  const avisos = [];
  const historico = [];
  let seq = 0;
  const context = {
    allData,
    PERSON_LABELS,
    catPapel: (p) => CAT[p] || p,
    isCreditCardEntry: (e) => String(e?.category || '').startsWith('Cartão de crédito'),
    personFromCardCategory: (c) => (c === CAT.cartaoGabriel ? 'gabriel' : c === CAT.cartaoBabi ? 'barbara' : ''),
    formatCurrency: (v) => `R$ ${Number(v).toFixed(2)}`,
    escapeHtml: (s) => String(s),
    escapeAttr: (s) => String(s),
    dayjs: (s) => ({ format: () => String(s).slice(0, 7) }),
    makeCardExpenseTest: () => (tx) => tx.amount < 0,
    normalizeBankDesc: (d) => String(d).trim(),
    generateId: () => `novo-${++seq}`,
    isDefaultCardItem: (i) => i.isDefault === true,
    sumCardItems: (items = []) => Math.round(items.reduce((a, i) => a + (Number(i.value) || 0), 0) * 100) / 100,
    normalizeEntry: (e) => e,
    registrarHistoricoMes: (mes, antes, depois, acao) => historico.push({ mes, acao }),
    registrarUndoImportacao: () => {},
    expandedCardEntries: new Set(),
    saveData: () => {},
    getMonthKey: (d) => d.key,
    currentDate: { key: mesAberto },
    syncSelectors: () => {},
    render: () => {},
    notify: { info: (m) => avisos.push(m), success: (m) => avisos.push(m), error: (m) => avisos.push(`ERRO: ${m}`) }
  };
  runInNewContext(`${trecho}\nglobalThis.__t = { opcoesCartaoImportacao, opcoesCartaoHtml, importFaturaAsCardItems };`, context);
  return { t: context.__t, avisos, historico };
};

const cartoesNovembro = () => ({
  '2026-11': [
    { id: 'nu-g', description: 'Nubank', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 500, status: 'nao_pago', due_day: 10, card_items: [{ id: 'a', description: 'Antigo', value: 500 }] },
    { id: 'sa-g', description: 'Santander Gabriel', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 0, status: 'nao_pago', due_day: 15, card_items: [{ id: 'd', description: 'Cartão', value: 0, isDefault: true }] },
    { id: 'nu-b', description: 'Nubank', category: CAT.cartaoBabi, type: 'despesa', person: 'barbara', value: 300, status: 'nao_pago', card_items: [] },
    { id: 'luz', description: 'Luz', category: 'Luz', type: 'despesa', person: 'casa', value: 150, status: 'nao_pago' }
  ],
  '2026-10': [
    { id: 'it-g', description: 'Itaú Gabriel', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 90, status: 'pago', due_day: 20, card_items: [] },
    { id: 'nu-g-out', description: 'Nubank', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 450, status: 'pago', card_items: [] }
  ]
});

test('importação lista os cartões do mês (Nubank e Santander do Gabriel) e pré-seleciona pelo banco', async () => {
  const { t } = await loadImportacao(cartoesNovembro());
  const cats = [CAT.cartaoGabriel, CAT.cartaoBabi, CAT.cartao];

  const santander = plain(t.opcoesCartaoImportacao('2026-11', 'Santander', cats));
  assert.deepEqual(santander.opcoes.map((o) => [o.grupo, o.value]), [
    ['mes', 'entry:nu-g'], ['mes', 'entry:sa-g'], ['mes', 'entry:nu-b'],
    ['outros', 'modelo:it-g'],
    ['novo', `novo:${CAT.cartaoGabriel}`], ['novo', `novo:${CAT.cartaoBabi}`], ['novo', `novo:${CAT.cartao}`]
  ], 'cartões do mês, depois os de outros meses (Nubank de outubro já está em novembro), depois novo');
  assert.equal(santander.selecionado, 'entry:sa-g', 'arquivo do Santander já vem no Santander Gabriel');
  assert.match(santander.opcoes[1].label, /Santander Gabriel · Gabriel — R\$ 0\.00/);

  assert.equal(t.opcoesCartaoImportacao('2026-11', 'Nubank', cats).selecionado, 'entry:nu-g');
  assert.equal(t.opcoesCartaoImportacao('2026-12', 'Santander', cats).selecionado, 'modelo:sa-g', 'mês sem cartões: oferece criar o Santander');
  assert.equal(t.opcoesCartaoImportacao('2026-11', 'Cartão', cats).selecionado, 'entry:nu-g', 'banco desconhecido: primeiro cartão do mês');

  const html = t.opcoesCartaoHtml(santander, '2026-11');
  assert.match(html, /<optgroup label="Cartões lançados em 2026-11">/);
  assert.match(html, /<option value="entry:sa-g" selected>/);
});

test('fatura do Santander entra no Santander, não no primeiro cartão do Gabriel', async () => {
  const dados = cartoesNovembro();
  const { t, historico } = await loadImportacao(dados);
  const txs = [
    { date: '2026-11-03', desc: 'Posto', amount: -120 },
    { date: '2026-11-04', desc: 'Farmácia', amount: -45.5 },
    { date: '2026-11-05', desc: 'Pagamento recebido', amount: 500 }
  ];

  t.importFaturaAsCardItems(txs, { mes: '2026-11', alvo: 'entry:sa-g' }, { dueDay: 15, nomeCartao: 'Santander' });
  const santander = dados['2026-11'].find((e) => e.id === 'sa-g');
  const nubank = dados['2026-11'].find((e) => e.id === 'nu-g');
  assert.deepEqual(plain(santander.card_items.map((i) => i.description)), ['Posto', 'Farmácia'], 'placeholder "Cartão" sai, pagamento ignorado');
  assert.equal(santander.value, 165.5);
  assert.deepEqual(plain(nubank.card_items.map((i) => i.description)), ['Antigo'], 'Nubank não foi tocado');
  assert.match(historico.at(-1).acao, /“Santander Gabriel”/);
});

test('importar em mês sem o cartão cria igual ao de outro mês e não duplica na segunda vez', async () => {
  const dados = cartoesNovembro();
  const { t, avisos } = await loadImportacao(dados);

  t.importFaturaAsCardItems([{ date: '2026-12-02', desc: 'Mercado', amount: -80 }], { mes: '2026-12', alvo: 'modelo:sa-g' }, { dueDay: null, nomeCartao: 'Santander' });
  assert.equal(dados['2026-12'].length, 1);
  const [criado] = dados['2026-12'];
  assert.deepEqual(plain({ d: criado.description, c: criado.category, p: criado.person, dia: criado.due_day, v: criado.value }),
    { d: 'Santander Gabriel', c: CAT.cartaoGabriel, p: 'gabriel', dia: 15, v: 80 }, 'mesmo nome, pessoa e vencimento do cartão de novembro');

  t.importFaturaAsCardItems([{ date: '2026-12-09', desc: 'Padaria', amount: -20 }], { mes: '2026-12', alvo: 'modelo:sa-g' }, { dueDay: null, nomeCartao: 'Santander' });
  assert.equal(dados['2026-12'].length, 1, 'segunda importação usa o mesmo lançamento');
  assert.equal(dados['2026-12'][0].value, 100);

  t.importFaturaAsCardItems([{ date: '2026-11-09', desc: 'Loja', amount: -30 }], { mes: '2026-11', alvo: `novo:${CAT.cartaoBabi}` }, { dueDay: null, nomeCartao: 'Nubank' });
  assert.equal(dados['2026-11'].filter((e) => e.category === CAT.cartaoBabi).length, 1, '"novo" Nubank da Babi reaproveita o que já existe');

  t.importFaturaAsCardItems([{ date: '2026-11-09', desc: 'X', amount: -1 }], { mes: '2026-11', alvo: 'entry:sumiu' }, { dueDay: null, nomeCartao: 'Nubank' });
  assert.match(avisos.at(-1), /^ERRO: Esse cartão não está mais neste mês/);
});

test('banco do arquivo: CSV sem cabeçalho de banco usa o nome do arquivo', async () => {
  const parsers = await read('js/50-import-parsers.js');
  const trecho = slice(parsers, 'const bankIssuerName =', '\n};') + '\n};';
  const context = { titleCaseDesc: (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()) };
  runInNewContext(`${trecho}\nglobalThis.__t = { bankIssuerName };`, context);
  const { bankIssuerName } = context.__t;

  assert.equal(bankIssuerName('', 'Nubank_2026-11-10.csv'), 'Nubank');
  assert.equal(bankIssuerName('', 'Santander_2026-11-15.csv'), 'Santander');
  assert.equal(bankIssuerName('', 'fatura-itau-novembro.csv'), 'Itaú');
  assert.equal(bankIssuerName('BANCO XYZ S.A.', 'extrato.ofx'), 'Banco Xyz', 'OFX continua usando o banco do arquivo');
  assert.equal(bankIssuerName('', 'extrato.csv'), 'Cartão');
});

test('cartão de crédito pode ser cadastrado sem valor; despesa comum continua exigindo valor', async () => {
  const entriesJs = await read('js/30-entries.js');
  const erros = [];
  const context = {
    allData: { __app: {} },
    notify: { error: (m) => erros.push(m) },
    formatCurrency: (v) => `R$ ${Number(v).toFixed(2)}`,
    normalizeEntry: (e) => e,
    isCreditCardEntry: (e) => String(e?.category || '').startsWith('Cartão de crédito')
  };
  runInNewContext(`${entriesJs}\nglobalThis.__t = { validateEntry, toggleValorObrigatorio };`, context);
  const { validateEntry, toggleValorObrigatorio } = context.__t;

  const bradesco = { id: 'b', description: 'Bradesco', category: CAT.cartaoGabriel, type: 'despesa', person: 'gabriel', value: 0 };
  assert.equal(validateEntry(bradesco), true, 'cartão novo com R$ 0,00, para importar os itens depois');
  assert.equal(validateEntry({ ...bradesco, category: 'Luz' }), false);
  assert.match(erros.at(-1), /valor maior que zero/);
  assert.equal(validateEntry({ ...bradesco, person: '' }), false, 'continua exigindo de quem é');

  const valor = { required: true, placeholder: '0,00', title: '' };
  toggleValorObrigatorio({ value: CAT.cartaoBabi }, valor);
  assert.equal(valor.required, false, 'no cartão o campo Valor não é obrigatório');
  assert.match(valor.placeholder, /opcional/);
  toggleValorObrigatorio({ value: 'Mercado' }, valor);
  assert.equal(valor.required, true);
  assert.equal(valor.placeholder, '0,00');

  const events = await read('js/70-events.js');
  assert.equal((events.match(/toggleValorObrigatorio\(dom\.inputCategory, dom\.inputValue\)/g) || []).length, 2, 'troca de categoria e de tipo no novo lançamento');
  assert.equal((events.match(/toggleValorObrigatorio\(dom\.editCategory, dom\.editValue\)/g) || []).length, 2, 'troca de categoria e de tipo na edição');
  assert.match(entriesJs, /toggleValorObrigatorio\(dom\.editCategory, dom\.editValue\);/, 'ao abrir a edição');
});

test('tela: botão Limpar itens na fatura e diálogo de importação com o cartão escolhido', async () => {
  const render = await read('js/60-render.js');
  const events = await read('js/70-events.js');
  const imp = await read('js/51-import-workflows.js');
  assert.match(render, /data-action="clear-card-items"/);
  assert.match(events, /if \(action === 'clear-card-items'\) \{\s*clearCardItems\(id\);/);
  assert.match(imp, /<select id="bankCardAlvo"/);
  assert.doesNotMatch(imp, /bankCardCat/, 'não escolhe mais só a categoria');
  assert.match(imp, /mesInput\.addEventListener\('change'/, 'trocar o mês atualiza a lista de cartões');
  assert.match(render, /conta só o valor sem terceiros/);
});
