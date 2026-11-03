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

// "Mês" falso no formato do dayjs que o app usa: key YYYY-MM, format() e subtract(n, 'month')
const mes = (key) => {
  const [y, m] = key.split('-').map(Number);
  const shift = (n) => {
    const d = new Date(Date.UTC(y, m - 1 - n, 1));
    return mes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  return { key, format: () => key, subtract: (n) => shift(n), month: () => m - 1, year: () => y };
};

// Detecção de sugestões + helpers e conta manual das Contas fixas (app-modules.js)
const loadContasFixas = async (allData, { armazenado = {}, mesAberto = '2026-11' } = {}) => {
  const modules = await read('app-modules.js');
  const trecho = slice(modules, 'const subscriptionSkipCategories =', 'const Assinaturas = {');
  const storage = { ...armazenado };
  const historicoMes = [];
  const historicoModulo = [];
  const avisos = [];
  let seq = 0;
  if (!allData.__app) allData.__app = {};
  const context = {
    allData,
    PERSON_LABELS,
    MESES: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
    MES_KEY_RE: /^\d{4}-\d{2}$/,
    CATEGORIAS: ['Aluguel', 'Mercado', 'Cartão de crédito Gabriel', 'Investimentos', 'Outros'],
    getMonthKey: (d) => d.key,
    currentDate: mes(mesAberto),
    catPapel: (p) => ({ outros: 'Outros', cartaoGabriel: 'Cartão de crédito Gabriel', cartaoBabi: 'Cartão de crédito Babi', cartao: 'Cartão de crédito', investimentos: 'Investimentos' })[p] || p,
    isCreditCardEntry: (e) => String(e.category || '').toLowerCase().includes('cartão'),
    sum: (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0),
    coll: (nome) => { if (!Array.isArray(allData.__app[nome])) allData.__app[nome] = []; return allData.__app[nome]; },
    upsert: (nome, item) => {
      const lista = context.coll(nome);
      const i = lista.findIndex((x) => x.id === item.id);
      if (i >= 0) lista[i] = item; else lista.push(item);
    },
    generateId: () => `novo-${++seq}`,
    notify: { success: (m) => avisos.push(m), error: (m) => avisos.push(`ERRO: ${m}`), info: (m) => avisos.push(m) },
    cloneDados: (x) => JSON.parse(JSON.stringify(x)),
    registrarHistoricoMes: (mesKey, antes, depois, acao) => historicoMes.push({ mesKey, acao, antes: antes.length, depois: depois.length }),
    registrarHistoricoModulo: (colecao, antes, depois) => historicoModulo.push({ colecao, antes, depois }),
    saveData: () => {},
    window: {},
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); }
    }
  };
  runInNewContext(`${trecho}
globalThis.__t = { detectSubscriptionCandidates, recurringEntriesForMonth, recurringCardItemsForMonth, groupByPerson, fixedSpendByPersonForMonth, cfAberto, handleContasFixasToggle, contasManuais, contasManuaisDoMes, criarContaFixaManual, lerContaManual, pagosComStatus, migrarContasManuaisDoMes };`, context);
  return { t: context.__t, context, storage, historicoMes, historicoModulo, avisos };
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

test('Açougue R$ 250 em "Nova conta fixa" fica só nas Contas fixas e não vai para o Mês a mês', async () => {
  const dados = novembro();
  const mesAntes = JSON.stringify(dados['2026-11']);
  const { t, context, avisos } = await loadContasFixas(dados);

  assert.equal(t.criarContaFixaManual({ descricao: ' Açougue ', pessoa: 'casa', categoria: 'Mercado', valor: 250, vencimento: '', status: 'nao_pago', observacao: '' }), true);

  assert.equal(JSON.stringify(dados['2026-11']), mesAntes, 'nenhum lançamento novo no Mês a mês');
  assert.equal(Object.keys(dados).filter((k) => /^\d{4}-\d{2}$/.test(k)).length, 2, 'nenhum mês novo criado');
  const [acougue] = plain(t.contasManuais());
  assert.equal(acougue.nome, 'Açougue');
  assert.equal(acougue.valor, 250);
  assert.equal(acougue.pessoa, 'casa');
  assert.equal(acougue.manual, true);
  assert.equal(acougue.desde, '2026-11', 'vale a partir do mês em que foi cadastrada');
  assert.deepEqual(acougue.pagos, {});
  assert.match(avisos.at(-1), /não vai para o Mês a mês/);

  assert.deepEqual(plain(t.contasManuaisDoMes('2026-11').map((a) => [a.nome, a.valor, a.status])), [['Açougue', 250, 'nao_pago']]);
  assert.equal(t.contasManuaisDoMes('2026-12').length, 1, 'repete nos meses seguintes');
  assert.equal(t.contasManuaisDoMes('2026-10').length, 0, 'não aparece antes de existir');

  assert.equal(t.fixedSpendByPersonForMonth('2026-11').casa, 250, 'entra no gasto fixo da Casa');
  assert.equal(t.fixedSpendByPersonForMonth('2026-10').casa, undefined);

  assert.equal(t.criarContaFixaManual({ descricao: 'açougue', pessoa: 'casa', valor: 300 }), false, 'mesma conta da mesma pessoa não duplica');
  assert.match(avisos.at(-1), /já está nas contas fixas/);
  assert.equal(t.criarContaFixaManual({ descricao: 'Feira', pessoa: '', valor: 120 }), false, 'precisa dizer de quem é');
  assert.equal(t.criarContaFixaManual({ descricao: 'Feira', pessoa: 'barbara', valor: 0 }), false, 'precisa de valor');
  assert.equal(t.contasManuais().length, 1);
  assert.equal(context.coll('assinaturas').length, 1);
});

test('pago de conta manual é por mês e serviços antigos (sem manual) continuam ocultos', async () => {
  const dados = novembro();
  dados.__app = {
    assinaturas: [
      { id: 's1', nome: 'Netflix', valor: 55.9, status: 'ativa' },
      { id: 'm1', manual: true, nome: 'Feira', pessoa: 'barbara', categoria: 'Mercado', valor: 120, vencimentoDia: 5, desde: '2026-10', pagos: { '2026-10': 'pago' }, status: 'ativa' }
    ]
  };
  const { t } = await loadContasFixas(dados);

  assert.deepEqual(plain(t.contasManuais().map((a) => a.id)), ['m1'], 'Netflix (serviço antigo) não aparece');
  assert.equal(t.contasManuaisDoMes('2026-10')[0].status, 'pago');
  assert.equal(t.contasManuaisDoMes('2026-11')[0].status, 'nao_pago', 'mês novo começa não pago');
  assert.equal(t.contasManuaisDoMes('2026-11')[0].vencimentoDia, 5);

  assert.deepEqual(plain(t.pagosComStatus({ '2026-10': 'pago' }, '2026-11', 'pago')), { '2026-10': 'pago', '2026-11': 'pago' });
  assert.deepEqual(plain(t.pagosComStatus({ '2026-10': 'pago', '2026-11': 'pago' }, '2026-11', 'nao_pago')), { '2026-10': 'pago' });

  assert.deepEqual(plain(t.fixedSpendByPersonForMonth('2026-11')), { gabriel: 705.43, barbara: 727.96, '': 10 },
    'despesas fixas + Feira + cartão; Netflix fora');
});

test('Compras do mês e Feira que foram para o Mês a mês voltam para as Contas fixas', async () => {
  const dados = {
    '2026-11': [
      { id: 'cm', description: 'Compras do mês', category: 'Mercado', type: 'despesa', person: 'casa', value: 800, status: 'pago', due_day: 5, observation: '', recurring: true, manual: true },
      { id: 'fe', description: 'Feira', category: 'Mercado', type: 'despesa', person: 'barbara', value: 120, status: 'nao_pago', due_day: null, observation: 'sábado', recurring: true, manual: true },
      { id: 'al', description: 'Aluguel', category: 'Aluguel', type: 'despesa', person: 'casa', value: 1800, status: 'nao_pago', recurring: true }
    ],
    '2026-12': [
      { id: 'cm2', description: 'Compras do mês', category: 'Mercado', type: 'despesa', person: 'casa', value: 850, status: 'nao_pago', recurring: true, manual: true }
    ]
  };
  const { t, historicoMes, historicoModulo } = await loadContasFixas(dados);

  assert.equal(t.migrarContasManuaisDoMes(), true);
  assert.deepEqual(plain(dados['2026-11'].map((e) => e.description)), ['Aluguel'], 'só as manuais saem do Mês a mês');
  assert.deepEqual(plain(dados['2026-12']), []);
  assert.deepEqual(plain(historicoMes.map((h) => [h.mesKey, h.antes, h.depois])), [['2026-11', 3, 1], ['2026-12', 1, 0]], 'saída registrada no Histórico (reversível e sincronizada)');
  assert.match(historicoMes[0].acao, /moveu “Compras do mês”, “Feira” do Mês a mês para Contas fixas/);

  const contas = plain(t.contasManuais());
  assert.deepEqual(contas.map((a) => [a.id, a.nome, a.pessoa, a.valor, a.desde]), [
    ['manual-cm', 'Compras do mês', 'casa', 850, '2026-11'],
    ['manual-fe', 'Feira', 'barbara', 120, '2026-11']
  ], 'uma conta por nome+pessoa, valor mais recente, desde o primeiro mês');
  assert.deepEqual(contas[0].pagos, { '2026-11': 'pago' }, 'o pago de novembro é mantido');
  assert.equal(contas[0].vencimentoDia, 5);
  assert.equal(contas[1].observacao, 'sábado');
  assert.equal(historicoModulo.length, 2);

  assert.equal(t.migrarContasManuaisDoMes(), false, 'rodar de novo não faz nada');

  dados['2026-12'].push({ id: 'cm3', description: 'Compras do mês', category: 'Mercado', type: 'despesa', person: 'casa', value: 850, status: 'nao_pago', recurring: true, manual: true });
  assert.equal(t.migrarContasManuaisDoMes(), true, 'lançamento atrasado de outro aparelho também sai');
  assert.equal(t.contasManuais().length, 2, 'sem duplicar a conta que já existe');
});

test('sugestões ignoram o que já é fixo ou conta manual e marcam o lançamento existente', async () => {
  const despesa = (id, description, person, value, extra = {}) => ({ id, description, category: 'Outros', type: 'despesa', person, value, status: 'nao_pago', ...extra });
  const dados = {
    '2026-11': [despesa('n-dina', 'Dina', 'barbara', 125), despesa('n-mei', 'MEI Babi', 'barbara', 86.05, { recurring: true })],
    '2026-10': [despesa('o-dina', 'Dina', 'barbara', 125), despesa('o-mei', 'MEI Babi', 'barbara', 86.05), despesa('o-unha', 'Unhas de gel', 'barbara', 160, { due_day: 5 }), despesa('o-feira', 'Feira', 'barbara', 120)],
    '2026-09': [despesa('s-unha', 'Unhas de gel', 'barbara', 160, { due_day: 5 }), despesa('s-feira', 'Feira', 'barbara', 120), despesa('s-viagem', 'Viagem', 'gabriel', 900)],
    __app: { assinaturas: [{ id: 'm1', manual: true, nome: 'Feira', pessoa: 'barbara', valor: 120, desde: '2026-11' }] }
  };
  const { t } = await loadContasFixas(dados);
  const sugestoes = plain(t.detectSubscriptionCandidates(3));

  assert.deepEqual(sugestoes.map((s) => [s.nome, s.idMesAtual]), [
    ['Unhas de gel (Barbara)', ''],
    ['Dina (Barbara)', 'n-dina']
  ], 'MEI já é fixo, Feira já é conta manual, Viagem só apareceu uma vez');
  const unha = sugestoes[0];
  assert.equal(unha.descricao, 'Unhas de gel');
  assert.equal(unha.person, 'barbara');
  assert.equal(unha.vencimentoDia, 5);
  assert.equal(unha.categoria, 'Outros');
});

test('colapsos começam abertos e lembram o que foi fechado neste aparelho', async () => {
  const { t, storage } = await loadContasFixas(novembro(), {
    armazenado: { financas_casa_contas_fixas_colapsos: JSON.stringify({ 'p:fixos:barbara': false }) }
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

test('tela de contas fixas: seções e ações das contas manuais; Mês a mês sem conta manual', async () => {
  const modules = await read('app-modules.js');
  const entries = await read('js/30-entries.js');
  const render = await read('js/60-render.js');
  const tela = slice(modules, 'const Assinaturas = {', '// MÓDULO: DASHBOARD');
  const renderTela = slice(tela, '// Gasto fixo do mês = despesas fixas do Mês a mês + contas manuais + recorrentes do cartão', '\n  };');

  assert.match(tela, /<details class="mod-card-recurring cf-sec/);
  assert.match(tela, /<details class="cf-pessoa"/);
  assert.match(renderTela, /const totalFixoMes = Math\.round\(\(fixoEntries \+ fixoManuais \+ fixoCartao\) \* 100\) \/ 100;/);
  assert.match(renderTela, /data-mod="assinaturas" data-act="add"[^>]*>.*Nova conta fixa/);
  assert.doesNotMatch(renderTela, /Serviços cadastrados|mod-grid/, 'cards dos serviços antigos continuam fora');

  const ordem = ['renderRecurringEntriesMonth()', 'renderContasManuais()', 'renderCardRecurringMonth()', 'renderTendencia()', 'renderSuggestions()'];
  const posicoes = ordem.map((m) => renderTela.lastIndexOf(m));
  posicoes.forEach((p, i) => assert.notEqual(p, -1, `faltou na tela: ${ordem[i]}`));
  assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a - b), 'ordem: fixos, manuais, cartão, mês a mês e sugestões');

  for (const act of ['pago', 'edit', 'del']) assert.match(tela, new RegExp(`data-mod="assinaturas" data-act="${act}"`), `ação ${act} na conta manual`);
  assert.match(modules, /else if \(act === 'pago'\) await M\.togglePago\(id\);/);
  assert.match(modules, /if \(migrarContasManuaisDoMes\(\)\)/, 'a mudança roda quando os dados chegam');
  assert.match(modules, /addEventListener\('toggle', handleContasFixasToggle, true\)/);

  const fora = modules.replace(slice(modules, 'const contasManuais =', '// MÓDULO: DASHBOARD'), '');
  assert.doesNotMatch(fora, /coll\('assinaturas'\)/, 'Dashboard e alertas só enxergam contas manuais (nunca os serviços ocultos)');
  assert.equal((fora.match(/contasManuaisMes\(\)/g) || []).length, 2, 'vencimentos do Dashboard e do sino incluem contas manuais');

  assert.doesNotMatch(entries, /manual/, 'Mês a mês não cria nem copia conta manual');
  assert.doesNotMatch(render, /cf-manual-tag/);
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

test('campos de formulário têm fundo e borda próprios nos dois temas', async () => {
  const style = await read('style.css');
  const modules = await read('modules.css');
  // seletor no começo da linha (não pega ".x .cat-manager__name {")
  const regra = (css, seletor) => {
    const i = css.search(new RegExp(`(^|\\n)${seletor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`));
    assert.notEqual(i, -1, `regra não encontrada: ${seletor}`);
    return css.slice(i, css.indexOf('}', i));
  };

  const fm = regra(modules, '.fm-input');
  assert.match(fm, /border: 1px solid var\(--app-input-border\)/, 'campo dos modais com borda');
  assert.doesNotMatch(fm, /border: none/);
  assert.match(fm, /background: var\(--app-surface-2\)/, 'fundo diferente do modal (--app-surface)');
  assert.match(modules, /\.mod-filters \.fm-input \{ background: var\(--app-surface\); \}/, 'filtros dos Relatórios não somem no painel');

  const temas = style.slice(0, style.indexOf('[data-theme="dark"] {') + 600);
  assert.equal((temas.match(/--app-input-border:/g) || []).length, 2, 'cor de borda dos campos nos temas claro e escuro');
  assert.match(temas, /color-scheme: light;/);
  assert.match(temas, /color-scheme: dark;/, 'seta do select e calendário claros no tema escuro');
  for (const seletor of ['.cat-manager__name', '.history-search']) {
    assert.match(regra(style, seletor), /var\(--app-input-border\)/, `${seletor} usa a borda de campo`);
  }
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
