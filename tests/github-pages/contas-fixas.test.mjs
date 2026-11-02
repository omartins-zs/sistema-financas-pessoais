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

const PERSON_LABELS = { gabriel: 'Gabriel', barbara: 'Barbara', casa: 'Casa', familia: 'Família' };

const loadContasFixas = async (allData, armazenado = {}) => {
  const modules = await read('app-modules.js');
  const trecho = slice(modules, 'const PERSON_ORDER =', 'const Assinaturas = {');
  const storage = { ...armazenado };
  const context = {
    allData,
    PERSON_LABELS,
    getMonthKey: (d) => d.key,
    currentDate: { key: '2026-11' },
    isCreditCardEntry: (e) => String(e.category || '').toLowerCase().includes('cartão'),
    sum: (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0),
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); }
    }
  };
  runInNewContext(`${trecho}
globalThis.__t = { recurringEntriesForMonth, recurringCardItemsForMonth, groupByPerson, fixedSpendByPersonForMonth, cfAberto, handleContasFixasToggle };`, context);
  return { t: context.__t, storage };
};

const novembro = () => ({
  '2026-11': [
    { id: 'a', description: 'Contribuição casa', category: 'Contribuição para casa', type: 'despesa', person: 'gabriel', value: 500, status: 'pago', recurring: true },
    { id: 'b', description: 'Convênio', category: 'Outros', type: 'despesa', person: 'barbara', value: 607.96, status: 'nao_pago', recurring: true },
    { id: 'c', description: 'Mercado', category: 'Mercado', type: 'despesa', person: 'casa', value: 900, status: 'nao_pago', recurring: false },
    { id: 'd', description: 'Sem dono', category: 'Outros', type: 'despesa', person: '', value: 10, status: 'nao_pago', recurring: true },
    { id: 'e', description: 'Salário', category: 'Outros', type: 'entrada', person: 'gabriel', value: 5000, status: 'pago', recurring: true },
    {
      id: 'k', description: 'Nubank', category: 'Cartão de crédito Gabriel', type: 'despesa', person: 'gabriel', value: 400, status: 'pago',
      card_items: [
        { id: 'k1', description: 'Seguro do Carro', value: 205.43, recurring: true },
        { id: 'k2', description: 'Cartão', value: 50, recurring: true },
        { id: 'k3', description: 'Avulso', value: 144.57, recurring: false }
      ]
    }
  ],
  '2026-10': [
    { id: 'o1', description: 'Contribuição casa', category: 'Outros', type: 'despesa', person: 'gabriel', value: 500, status: 'pago', recurring: true }
  ]
});

test('contas fixas: só despesas marcadas e itens recorrentes do cartão, com status da fatura', async () => {
  const { t } = await loadContasFixas(novembro());

  const fixos = t.recurringEntriesForMonth('2026-11');
  assert.deepEqual(plain(fixos.map((i) => i.nome)), ['Contribuição casa', 'Convênio', 'Sem dono'],
    'entrada, despesa não marcada e cartão ficam de fora; ordem Gabriel, Barbara, sem tag');

  const cartao = t.recurringCardItemsForMonth('2026-11');
  assert.deepEqual(plain(cartao), [{ id: 'k1', nome: 'Seguro do Carro', valor: 205.43, cartao: 'Nubank', person: 'gabriel', status: 'pago' }],
    'item "Cartão" (valor base) e itens avulsos não contam');
});

test('contas fixas: agrupa por pessoa na ordem do app e soma cada grupo em centavos', async () => {
  const { t } = await loadContasFixas(novembro());
  const itens = [...t.recurringEntriesForMonth('2026-11'), ...t.recurringCardItemsForMonth('2026-11')];
  const grupos = plain(t.groupByPerson(itens).map((g) => ({ person: g.person, label: g.label, n: g.itens.length, total: g.total })));

  assert.deepEqual(grupos, [
    { person: 'gabriel', label: 'Gabriel', n: 2, total: 705.43 },
    { person: 'barbara', label: 'Barbara', n: 1, total: 607.96 },
    { person: '', label: 'Sem tag', n: 1, total: 10 }
  ]);
});

test('mês a mês: gasto fixo por pessoa não inclui serviços cadastrados', async () => {
  const dados = novembro();
  dados.__app = { assinaturas: [{ id: 's1', nome: 'Netflix', valor: 55.9, status: 'ativa' }] };
  const { t } = await loadContasFixas(dados);

  assert.deepEqual(plain(t.fixedSpendByPersonForMonth('2026-11')), { gabriel: 705.43, barbara: 607.96, '': 10 });
  assert.deepEqual(plain(t.fixedSpendByPersonForMonth('2026-10')), { gabriel: 500 });
  assert.deepEqual(plain(t.fixedSpendByPersonForMonth('2026-09')), {}, 'mês sem lançamentos não quebra');
});

test('colapsos começam abertos e lembram o que foi fechado neste aparelho', async () => {
  const { t, storage } = await loadContasFixas(novembro(), {
    financas_casa_contas_fixas_colapsos: JSON.stringify({ 'p:fixos:barbara': false })
  });

  assert.equal(t.cfAberto('sec:fixos'), true, 'padrão aberto, como a tela já era');
  assert.equal(t.cfAberto('p:fixos:barbara'), false, 'respeita o que foi salvo');

  const details = { open: false, dataset: { cfKey: 'sec:cartao' }, matches: (sel) => sel === 'details[data-cf-key]' };
  t.handleContasFixasToggle({ target: details });
  assert.equal(t.cfAberto('sec:cartao'), false);
  assert.equal(JSON.parse(storage.financas_casa_contas_fixas_colapsos)['sec:cartao'], false);

  t.handleContasFixasToggle({ target: { matches: () => false } });
  assert.equal(Object.keys(JSON.parse(storage.financas_casa_contas_fixas_colapsos)).length, 2, 'ignora outros <details>');
});

test('tela de contas fixas: colapsos por seção e pessoa, total sem serviços e cards no fim', async () => {
  const modules = await read('app-modules.js');
  const render = slice(modules, 'const Assinaturas = {', '// MÓDULO: DASHBOARD');

  assert.match(render, /<details class="mod-card-recurring cf-sec/);
  assert.match(render, /<details class="cf-pessoa"/);
  assert.match(render, /const totalFixoMes = Math\.round\(\(fixoEntries \+ fixoCartao\) \* 100\) \/ 100;/, 'serviços fora do total');
  const ordem = ['renderRecurringEntriesMonth()', 'renderCardRecurringMonth()', 'renderTendencia()', 'renderSuggestions()', 'Serviços cadastrados</h3>', '<div class="mod-grid">${cards}</div>'];
  const posicoes = ordem.map((m) => render.lastIndexOf(m));
  posicoes.forEach((p, i) => assert.notEqual(p, -1, `faltou na tela: ${ordem[i]}`));
  assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a - b), 'ordem: fixos, cartão, mês a mês, sugestões e cards no fim');
  assert.match(modules, /addEventListener\('toggle', handleContasFixasToggle, true\)/);
});

test('carro: falta pagar, saldo depois de cada pagamento, previsão e quitado', async () => {
  const modules = await read('app-modules.js');
  const trecho = slice(modules, 'const carroAtivo =', '// Detecção de assinaturas recorrentes');
  const fakeDay = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return { isValid: () => Boolean(y), format: () => String(d).padStart(2, '0'), month: () => m - 1, year: () => y };
  };
  const context = {
    allData: {},
    coll: () => [],
    sum: (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0),
    formatCurrency: (v) => `R$ ${Number(v).toFixed(2)}`,
    formatValuePlain: String,
    escapeHtml: (s) => String(s),
    fmtDate: (iso) => iso,
    dayjs: fakeDay,
    emptyBlock: () => '',
    MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  };
  runInNewContext(`${trecho}\nglobalThis.__t = { Carro, carroSaldo };`, context);
  const { Carro, carroSaldo } = context.__t;

  const carro = {
    id: 'c1', nome: 'AirCross', valorTotal: 21890, dataInicio: '2026-11-02',
    pagamentos: [{ id: 'p2', valor: 500, data: '2026-12-02' }, { id: 'p1', valor: 200, data: '2026-11-02' }]
  };
  assert.equal(carroSaldo(carro), 21190);
  const html = Carro.card(carro);
  assert.match(html, /Falta pagar[\s\S]*R\$ 21190\.00/);
  assert.match(html, /3% pago/);
  assert.match(html, /Pagamento 2 · restou R\$ 21190\.00/);
  assert.ok(html.indexOf('restou R$ 21190.00') < html.indexOf('Pagamento 1 · restou R$ 21690.00'), 'mais novo primeiro, saldo em ordem de data');
  assert.match(html, /faltam cerca de <strong>61 pagamentos<\/strong>/, 'R$ 21.190 ÷ média de R$ 350');
  assert.match(html, /data-act="edit"[\s\S]*data-act="del"/, 'editar e excluir como ícones no topo');

  const pequeno = Carro.card({ ...carro, pagamentos: [{ id: 'p', valor: 50, data: '2026-11-02' }] });
  assert.match(pequeno, /<1% pago/, 'menos de 1% não aparece como 0%');

  const quitado = Carro.card({ ...carro, valorTotal: 700 });
  assert.match(quitado, /carro-card--quitado/);
  assert.match(quitado, /Carro quitado/);
  assert.match(quitado, /data-act="pag" data-id="c1" disabled/);
});

test('versão aparece no padrão BR (dia/mês/ano e horário) sem mudar o formato interno', async () => {
  const bootstrap = await read('js/80-bootstrap-pwa.js');
  const html = await read('index.html');
  const trecho = slice(bootstrap, 'const formatAppVersion =', 'const updateState =');
  const context = {};
  runInNewContext(`${trecho}\nglobalThis.__t = { formatAppVersion };`, context);
  const { formatAppVersion } = context.__t;

  assert.equal(formatAppVersion('20261102-1407'), '02/11/2026 14:07');
  assert.equal(formatAppVersion('20261231-0005'), '31/12/2026 00:05');
  assert.equal(formatAppVersion('dev'), 'dev', 'formatos antigos aparecem como estão');
  assert.equal(formatAppVersion(''), '');

  assert.match(html, /<meta name="app-version" content="\d{8}-\d{4}">/, 'meta continua AAAAMMDD-HHMM para o ?v=');
  assert.match(bootstrap, /textContent = `v\$\{formatAppVersion\(APP_VERSION\)\}`/);
});
