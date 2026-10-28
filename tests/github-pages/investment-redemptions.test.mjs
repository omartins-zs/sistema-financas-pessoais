import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('saldo disponível soma aportes, desconta resgates e permite ignorar o lançamento editado', async () => {
  const entries = await read('js/30-entries.js');
  const erros = [];
  const context = {
    allData: {
      __app: { investimentos: [{ id: 'carteira-1', rendimento: 20 }] },
      '2026-01': [{ id: 'aporte-1', type: 'investimento', investimento_id: 'carteira-1', value: 100 }],
      '2026-02': [
        { id: 'aporte-2', type: 'investimento', investimento_id: 'carteira-1', value: 200 },
        { id: 'resgate-1', type: 'resgate', investimento_id: 'carteira-1', value: 50 }
      ]
    },
    notify: { error: (message) => erros.push(message) },
    formatCurrency: (value) => `R$ ${value.toFixed(2)}`,
    normalizeEntry: (entry) => entry
  };

  runInNewContext(`${entries}\nglobalThis.__investmentTests = { resumoMovimentosInvestimento, saldoDisponivelInvestimento, validateEntry };`, context);

  assert.equal(context.__investmentTests.saldoDisponivelInvestimento('carteira-1'), 270);
  assert.equal(context.__investmentTests.saldoDisponivelInvestimento('carteira-1', 'resgate-1'), 320);
  assert.equal(context.__investmentTests.validateEntry({
    id: 'novo-resgate', description: 'Resgate', person: 'gabriel', type: 'resgate',
    investimento_id: 'carteira-1', value: 271
  }), false);
  assert.match(erros.at(-1), /saldo disponível de R\$ 270\.00/);
  assert.equal(context.__investmentTests.validateEntry({
    id: 'novo-resgate', description: 'Resgate', person: 'gabriel', type: 'resgate',
    investimento_id: 'carteira-1', value: 270
  }), true);
});

test('resgate é exibido no grupo de investimentos e reduz a movimentação líquida mensal', async () => {
  const navigation = await read('js/20-navigation-dashboard.js');
  const start = navigation.indexOf('const calculateSummary =');
  const end = navigation.indexOf('// Gráficos', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const pureCalculations = navigation.slice(start, end);
  const context = {
    PERSON_LABELS: { gabriel: 'Gabriel' },
    TYPE_LABELS: { entrada: 'Entrada', despesa: 'Despesa', investimento: 'Aporte', resgate: 'Resgate' },
    STATUS_LABELS: { pago: 'Pago' },
    sortByPersonThenDescription: (a, b) => a.description.localeCompare(b.description),
    formatValuePlain: String
  };

  runInNewContext(`${pureCalculations}\nglobalThis.__investmentTests = { calculateSummary, getMonthBalances, splitEntries };`, context);
  const entries = [
    { type: 'entrada', value: 500, status: 'pago', person: 'gabriel', description: 'Salário' },
    { type: 'despesa', value: 200, status: 'pago', person: 'gabriel', description: 'Conta' },
    { type: 'investimento', value: 100, status: 'pago', person: 'gabriel', description: 'Aporte' },
    { type: 'resgate', value: 40, status: 'pago', person: 'gabriel', description: 'Resgate' }
  ];
  const summary = context.__investmentTests.calculateSummary(entries);
  const split = context.__investmentTests.splitEntries(entries);

  assert.equal(summary.investment, 60);
  assert.equal(context.__investmentTests.getMonthBalances(summary).surplus, 240);
  assert.equal(summary.paid, 300, 'resgate não é contado como despesa paga');
  assert.equal(split.investment.length, 2);
  assert.ok(split.investment.some((entry) => entry.type === 'resgate'));
});

test('CSV de resgate conserva o vínculo com a categoria e rejeita resgate sem categoria', async () => {
  const exports = await read('js/40-exports.js');
  const categoria = { id: 'carteira-1', instituicao: 'Caixinha Turbo' };
  const context = {
    CATEGORIAS: ['Investimentos', 'Outros'],
    TYPE_LABELS: { resgate: 'Resgate de investimento' },
    PERSON_LABELS: { gabriel: 'Gabriel' },
    STATUS_LABELS: { pago: 'Pago' },
    catPapel: (role) => role === 'investimentos' ? 'Investimentos' : 'Outros',
    parseValue: (value) => Number(String(value).replace(/\./g, '').replace(',', '.')),
    mapPerson: () => 'gabriel',
    getInvestimentosCarteira: () => [categoria],
    investimentoLabel: (item) => item.instituicao,
    normalizeEntry: (entry) => entry,
    generateId: () => 'novo-lancamento'
  };

  runInNewContext(`${exports}\nglobalThis.__investmentTests = { parseSheetRows };`, context);
  const header = ['Descrição', 'Tipo', 'Tag', 'Categoria', 'Valor', 'Status', 'Observação', 'Investimento'];
  const row = ['Resgate — Caixinha Turbo', 'Resgate de investimento', 'Gabriel', 'Investimentos', '50,00', 'Pago', '', 'Caixinha Turbo'];
  const [entry] = context.__investmentTests.parseSheetRows([header, row]);

  assert.equal(entry.type, 'resgate');
  assert.equal(entry.investimento_id, 'carteira-1');
  assert.equal(entry.value, 50);
  assert.deepEqual(context.__investmentTests.parseSheetRows([header, [...row.slice(0, 7), '']]), []);
});

test('tela oferece resgate na categoria e no Mês a mês com registro reversível', async () => {
  const html = await read('index.html');
  const modules = await read('app-modules.js');
  const entries = await read('js/30-entries.js');
  const audit = await read('js/11-history-audit.js');

  assert.equal((html.match(/<option value="resgate">Resgate de investimento/g) || []).length, 2);
  assert.match(modules, /data-act="resgatar"/);
  assert.match(modules, /registrarResgateInvestimento\(/);
  assert.match(entries, /saldoDisponivelInvestimento\(entry\.investimento_id, entry\.id\)/);
  assert.match(audit, /e\?\.type === 'resgate' \? 'resgate de '/);
  assert.match(audit, /reversivel: true/);
});
