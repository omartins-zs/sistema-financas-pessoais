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

const CARTAO = 'Cartão de crédito Gabriel';

// Arrays criados dentro do vm são de outro realm: normaliza antes do deepEqual
const plain = (x) => JSON.parse(JSON.stringify(x));

// Funções puras do cartão (00-core.js): normalizeEntry + valores de terceiros
const loadCore = async () => {
  const core = await read('js/00-core.js');
  const trecho = slice(core, 'const isCreditCardEntry =', 'const personFromCardCategory =');
  let seq = 0;
  const context = {
    catPapel: (papel) => ({ cartaoGabriel: CARTAO, cartaoBabi: 'Cartão de crédito Babi', cartao: 'Cartão de crédito' })[papel] || papel,
    generateId: () => `gerado-${++seq}`
  };
  runInNewContext(`${trecho}
globalThis.__t = { normalizeEntry, migrarTerceirosDosItens, getCardTerceiros, sumCardTerceiros, totalSemTerceiros, terceirosPorPessoa, arredondaCentavos };`, context);
  return context.__t;
};

const faturaOutback = () => ({
  id: 'k1', description: 'Nubank', category: CARTAO, type: 'despesa', person: 'gabriel', value: 1000, status: 'nao_pago',
  card_items: [{ id: 'i1', description: 'Outback', value: 1000, recurring: false }],
  terceiros: [
    { id: 't1', descricao: 'Outback', pessoa: 'Pai', valor: 300 },
    { id: 't2', descricao: 'Outback', pessoa: 'Irmão', valor: 300 }
  ]
});

test('terceiros: soma, total sem terceiros e agrupamento por pessoa (exemplo do Outback)', async () => {
  const t = await loadCore();
  const entry = faturaOutback();

  assert.equal(t.sumCardTerceiros(entry), 600);
  assert.equal(t.totalSemTerceiros(entry), 400, 'R$ 1.000 − R$ 600 de terceiros = R$ 400 seus');

  entry.terceiros.push({ id: 't3', descricao: 'Uber', pessoa: 'pai', valor: 25.5 });
  const porPessoa = t.terceirosPorPessoa(entry);
  assert.equal(porPessoa.length, 2, '"Pai" e "pai" são a mesma pessoa');
  assert.deepEqual(JSON.parse(JSON.stringify(porPessoa)), [
    { pessoa: 'Pai', valor: 325.5 },
    { pessoa: 'Irmão', valor: 300 }
  ]);

  assert.equal(t.sumCardTerceiros(undefined), 0, 'lançamento ausente não quebra o histórico');
  assert.equal(t.sumCardTerceiros({ id: 'x', value: 50, card_items: [] }), 0);
});

test('terceiros: formato antigo (um valor por item) migra para a lista sem duplicar', async () => {
  const t = await loadCore();
  const legado = {
    id: 'k2', description: 'Nubank', category: CARTAO, type: 'despesa', person: 'barbara', value: 1457.6, status: 'nao_pago',
    card_items: [
      { id: 'geo', description: 'Geo Cosmeticos 2/2', value: 138.09, terceiros: 40, terceirosNome: 'Mae' },
      { id: 'out', description: 'Outro', value: 1319.51 },
      { id: 'exc', description: 'Exagerado', value: 10, terceiros: 99, terceirosNome: 'X' }
    ]
  };

  const migrado = t.migrarTerceirosDosItens(legado);
  assert.equal(migrado.card_items.some((i) => 'terceiros' in i || 'terceirosNome' in i), false, 'campos antigos saem dos itens');
  assert.deepEqual(JSON.parse(JSON.stringify(migrado.terceiros)), [
    { id: 'geo-terceiros', descricao: 'Geo Cosmeticos 2/2', pessoa: 'Mae', valor: 40 },
    { id: 'exc-terceiros', descricao: 'Exagerado', pessoa: 'X', valor: 10 }
  ], 'id determinístico e valor limitado ao valor do item');
  assert.equal(legado.card_items[0].terceiros, 40, 'não muta o lançamento original');

  const deNovo = t.migrarTerceirosDosItens({ ...migrado, card_items: [...migrado.card_items, { id: 'geo', description: 'Geo', value: 138.09, terceiros: 40 }] });
  assert.equal(deNovo.terceiros.filter((x) => x.id === 'geo-terceiros').length, 1, 'migrar de novo não duplica');

  assert.equal(t.sumCardTerceiros(legado), 50, 'a tela já enxerga o formato antigo antes de salvar');
});

test('normalizeEntry migra terceiros do cartão e não mexe no valor da fatura nem em outros lançamentos', async () => {
  const t = await loadCore();
  const cartao = t.normalizeEntry({
    id: 'k3', description: 'Nubank', category: CARTAO, type: 'despesa', person: 'gabriel', value: 1000, status: 'nao_pago',
    card_items: [
      { id: 'a', description: 'Outback', value: 600, terceiros: 400, terceirosNome: 'Pai' },
      { id: 'b', description: 'Mercado', value: 400 }
    ]
  });
  assert.equal(cartao.value, 1000, 'despesas do mês continuam com a fatura cheia');
  assert.deepEqual(JSON.parse(JSON.stringify(cartao.terceiros)), [{ id: 'a-terceiros', descricao: 'Outback', pessoa: 'Pai', valor: 400 }]);
  assert.equal(cartao.card_items.some((i) => 'terceiros' in i), false);

  const limpo = t.normalizeEntry({ ...faturaOutback(), terceiros: [{ id: 'z', descricao: ' Bar ', pessoa: ' João ', valor: '12.345' }, { id: 'zero', pessoa: 'Ninguém', valor: 0 }] });
  assert.deepEqual(JSON.parse(JSON.stringify(limpo.terceiros)), [{ id: 'z', descricao: 'Bar', pessoa: 'João', valor: 12.35 }], 'apara textos, arredonda centavos e descarta valor zero');

  const comum = { id: 'd1', description: 'Aluguel', category: 'Aluguel', type: 'despesa', value: 1800, terceiros: 'qualquer', card_items: [] };
  assert.equal(t.normalizeEntry(comum).terceiros, 'qualquer', 'despesa que não é cartão não é tocada');
});

// Operações de terceiros (11-history-audit.js) com o estado do mês em memória
const loadOps = async (entries) => {
  const core = await read('js/00-core.js');
  const audit = await read('js/11-history-audit.js');
  const puras = slice(core, '// ---- Valores de terceiros da fatura', '// ---- fim: valores de terceiros ----');
  const ops = slice(audit, 'let pendingTerceiroFocusEntryId', 'const canDeleteCardItem');
  const registros = [];
  const avisos = [];
  let seq = 0;
  const context = {
    state: { entries },
    getCurrentEntries: () => context.state.entries,
    setCurrentEntries: (next, acao) => { registros.push(acao); context.state.entries = next; },
    cloneDados: (x) => JSON.parse(JSON.stringify(x)),
    generateId: () => `novo-${++seq}`,
    formatCurrency: (v) => `R$ ${Number(v).toFixed(2)}`,
    parseValue: (v) => Number(String(v).replace(',', '.')) || 0,
    expandedCardEntries: new Set(),
    render: () => {},
    notify: { success: (m) => avisos.push(m), error: (m) => avisos.push(`ERRO: ${m}`), info: (m) => avisos.push(m) }
  };
  runInNewContext(`${puras}\n${ops}
globalThis.__t = { addCardTerceiro, removeCardTerceiro, erroTerceiro, submitCardTerceiroAdd };`, context);
  return { t: context.__t, context, registros, avisos };
};

test('validação: exige valor e pessoa e não deixa os terceiros passarem da fatura', async () => {
  const { t } = await loadOps([faturaOutback()]);
  const entry = faturaOutback();

  assert.match(t.erroTerceiro(entry, { pessoa: 'Mãe', valor: 0 }), /Informe o valor/);
  assert.match(t.erroTerceiro(entry, { pessoa: '', valor: 10 }), /de quem/);
  assert.equal(t.erroTerceiro(entry, { pessoa: 'Mãe', valor: 400 }), '', 'exatamente o que sobra da fatura pode');
  assert.match(t.erroTerceiro(entry, { pessoa: 'Mãe', valor: 400.01 }), /passariam do total da fatura/);
  assert.equal(t.erroTerceiro(entry, { pessoa: 'Pai', valor: 700 }, 't1'), '', 'ao editar, a própria linha não conta duas vezes');
});

test('adicionar e remover valor de terceiros grava com histórico e migra o formato antigo', async () => {
  const legado = {
    id: 'k1', description: 'Nubank', category: CARTAO, type: 'despesa', value: 1000,
    card_items: [{ id: 'i1', description: 'Outback', value: 1000, terceiros: 300, terceirosNome: 'Pai' }]
  };
  const { t, context, registros, avisos } = await loadOps([legado]);

  assert.equal(t.addCardTerceiro('k1', { descricao: ' Outback ', pessoa: ' Irmão ', valor: 300 }), true);
  let entry = context.state.entries[0];
  assert.deepEqual(plain(entry.terceiros.map((x) => [x.pessoa, x.valor])), [['Pai', 300], ['Irmão', 300]]);
  assert.equal(entry.card_items[0].terceiros, undefined, 'formato antigo removido ao salvar');
  assert.equal(entry.value, 1000, 'valor da fatura não muda');
  assert.equal(legado.card_items[0].terceiros, 300, 'o array vivo não foi mutado antes do diff');
  assert.match(registros.at(-1), /terceiros em “Nubank”: adicionou Irmão R\$ 300\.00 \(Outback\)/);

  assert.equal(t.addCardTerceiro('k1', { descricao: 'Sobremesa', pessoa: 'Mãe', valor: 500 }), false, 'passaria da fatura');
  assert.match(avisos.at(-1), /^ERRO: .*passariam do total da fatura/);
  assert.equal(context.state.entries[0].terceiros.length, 2);

  t.removeCardTerceiro('k1', 'i1-terceiros');
  entry = context.state.entries[0];
  assert.deepEqual(plain(entry.terceiros.map((x) => x.pessoa)), ['Irmão']);
  assert.match(registros.at(-1), /removeu Pai R\$ 300\.00 \(Outback\)/);

  const campos = { '.terceiro-desc': { value: 'Bar' }, '.terceiro-pessoa': { value: 'João' }, '.terceiro-val': { value: '50,25' } };
  const painel = {
    querySelector: (sel) => campos[sel],
    querySelectorAll: () => Object.values(campos)
  };
  t.submitCardTerceiroAdd(painel, 'k1');
  assert.deepEqual(plain(context.state.entries[0].terceiros.map((x) => [x.pessoa, x.valor])), [['Irmão', 300], ['João', 50.25]]);
  assert.deepEqual(Object.values(campos).map((c) => c.value), ['', '', ''], 'formulário limpa depois de adicionar');
});

test('tela: seção de terceiros no fim da fatura, dois valores no cartão e rascunho protegido na atualização', async () => {
  const render = await read('js/60-render.js');
  const events = await read('js/70-events.js');
  const bootstrap = await read('js/80-bootstrap-pwa.js');
  const audit = await read('js/11-history-audit.js');

  assert.match(render, /Valores de terceiros/);
  assert.match(render, /Total sem terceiros/);
  assert.match(render, /\$\{renderTerceirosSection\(entry, items, ctx\)\}\s*<\/div>`;/, 'seção fica no fim do painel da fatura');
  assert.equal((render.match(/cardValorComTerceiros\(entry\)/g) || []).length, 2, 'tabela e card do celular mostram os dois valores');
  assert.doesNotMatch(render, /edit-card-terceiros|card-item__terceiros/, 'sem botão de terceiros em cada item');

  for (const acao of ['add-card-terceiro', 'edit-card-terceiro', 'remove-card-terceiro']) {
    assert.match(events, new RegExp(`'${acao}'`));
  }
  assert.match(events, /\.terceiro-desc, \.terceiro-pessoa, \.terceiro-val/, 'Enter adiciona');
  assert.match(bootstrap, /\.terceiro-desc, \.terceiro-pessoa, \.terceiro-val/, 'atualização do PWA espera o rascunho');
  assert.match(audit, /terceiros \$\{formatCurrency\(terceirosA\)\} → \$\{formatCurrency\(terceirosD\)\}/);
});
