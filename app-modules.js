/**
 * ============================================================
 *  Finanças da Casa — Módulos avançados
 * ============================================================
 *  Estende o app existente (script.js) SEM reescrevê-lo.
 *  Reaproveita os globais já declarados em script.js:
 *    allData, saveData, formatCurrency, formatValuePlain,
 *    parseValue, generateId, confirmAction, notify, dayjs,
 *    CATEGORIAS, PERSON_LABELS, STATUS_LABELS, MESES,
 *    currentDate, getMonthKey, calculateSummary, escapeHtml,
 *    downloadBlob, CHART_COLORS, getChartTheme.
 *
 *  Os dados das novas entidades vivem em allData.__app,
 *  chave que NÃO colide com as chaves de mês ("YYYY-MM"),
 *  então nenhuma função existente os trata como lançamentos.
 *  O backup/restauração JSON já os inclui automaticamente.
 * ============================================================
 */

(() => {
  'use strict';

  // ----------------------------------------------------------
  // Camada de dados global
  // ----------------------------------------------------------
  const STORE_KEY = '__app';

  const getStore = () => {
    if (!allData[STORE_KEY] || typeof allData[STORE_KEY] !== 'object') {
      allData[STORE_KEY] = {};
    }
    return allData[STORE_KEY];
  };

  const coll = (name) => {
    const s = getStore();
    if (!Array.isArray(s[name])) s[name] = [];
    return s[name];
  };

  const persist = () => {
    saveData();
    refreshActiveView();
    refreshAlerts();
  };

  // Toda mudança de módulo vai para o histórico (antes/depois do item), reversível
  const upsert = (name, item) => {
    const list = coll(name);
    const idx = list.findIndex((x) => x.id === item.id);
    const antes = idx >= 0 ? list[idx] : null;
    if (idx >= 0) list[idx] = item;
    else list.push(item);
    if (typeof registrarHistoricoModulo === 'function') registrarHistoricoModulo(name, antes, item);
    persist();
  };

  const removeItem = (name, id) => {
    const s = getStore();
    const antes = coll(name).find((x) => x.id === id) || null;
    s[name] = coll(name).filter((x) => x.id !== id);
    if (antes && typeof registrarHistoricoModulo === 'function') registrarHistoricoModulo(name, antes, null);
    persist();
  };

  // ----------------------------------------------------------
  // Helpers de formatação / datas
  // ----------------------------------------------------------
  const today = () => dayjs();
  const fmtDate = (iso) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '—');
  const daysUntil = (iso) => (iso ? dayjs(iso).startOf('day').diff(today().startOf('day'), 'day') : null);
  const pct = (atual, alvo) => (alvo > 0 ? Math.min(100, Math.round((atual / alvo) * 100)) : 0);
  const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
  const moneyColor = (v) => (v >= 0 ? 'var(--app-income)' : 'var(--app-expense)');

  // Próximo vencimento (dia do mês) a partir de hoje → data ISO
  const nextDueDate = (day) => {
    if (!day) return null;
    let d = today().date(Math.min(day, today().daysInMonth()));
    if (d.isBefore(today(), 'day')) {
      const nm = today().add(1, 'month');
      d = nm.date(Math.min(day, nm.daysInMonth()));
    }
    return d.format('YYYY-MM-DD');
  };

  // ----------------------------------------------------------
  // Modal de formulário genérico (via SweetAlert2)
  // ----------------------------------------------------------
  const fieldHtml = (f) => {
    const id = `fm_${f.name}`;
    const val = f.value ?? '';
    if (f.type === 'select') {
      const opts = (f.options || [])
        .map((o) => `<option value="${escapeHtml(String(o.value))}" ${String(o.value) === String(val) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');
      return `<div class="fm-field ${f.wide ? 'fm-wide' : ''}"><label for="${id}">${escapeHtml(f.label)}</label><select id="${id}" class="fm-input">${opts}</select></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="fm-field fm-wide"><label for="${id}">${escapeHtml(f.label)}</label><textarea id="${id}" class="fm-input" rows="2">${escapeHtml(String(val))}</textarea></div>`;
    }
    const inputType = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
    const extra = f.type === 'money' ? 'inputmode="decimal" placeholder="0,00"' : (f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : '');
    const step = f.type === 'number' ? 'step="any"' : '';
    return `<div class="fm-field ${f.wide ? 'fm-wide' : ''}"><label for="${id}">${escapeHtml(f.label)}</label><input id="${id}" type="${inputType}" class="fm-input" value="${escapeHtml(String(val))}" ${extra} ${step}></div>`;
  };

  const formModal = async ({ title, icon = 'pencil-square', fields, confirmText = 'Salvar' }) => {
    const html = `<div class="fm-grid">${fields.map(fieldHtml).join('')}</div>`;
    const { value } = await Swal.fire({
      title: `<span class="fm-title"><i class="bi bi-${icon}"></i> ${escapeHtml(title)}</span>`,
      html,
      width: 640,
      showCancelButton: true,
      confirmButtonText: `<i class="bi bi-check-lg"></i> ${confirmText}`,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#4f6ef7',
      cancelButtonColor: '#94a3b8',
      reverseButtons: true,
      focusConfirm: false,
      preConfirm: () => {
        const out = {};
        for (const f of fields) {
          const elx = document.getElementById(`fm_${f.name}`);
          let v = elx ? elx.value : '';
          if (f.type === 'money') v = parseValue(v);
          else if (f.type === 'number') v = v === '' ? null : Number(v);
          else v = String(v).trim();
          if (f.required && (v === '' || v === null || (f.type === 'money' && v <= 0))) {
            Swal.showValidationMessage(`Preencha: ${f.label}`);
            return false;
          }
          out[f.name] = v;
        }
        return out;
      }
    });
    return value || null;
  };

  // ----------------------------------------------------------
  // Componentes reutilizáveis
  // ----------------------------------------------------------
  const emptyBlock = (icon, msg) =>
    `<div class="mod-empty"><i class="bi bi-${icon}"></i><p class="mb-0">${msg}</p></div>`;

  const actionBtns = (entity, id, extra = '') => `
    <div class="mod-card__actions">
      ${extra}
      <button class="mod-btn" data-mod="${entity}" data-act="edit" data-id="${id}" title="Editar"><i class="bi bi-pencil-fill"></i></button>
      <button class="mod-btn mod-btn--danger" data-mod="${entity}" data-act="del" data-id="${id}" title="Excluir"><i class="bi bi-trash-fill"></i></button>
    </div>`;

  const progressBar = (atual, alvo, color = 'var(--app-income)') => {
    const p = pct(atual, alvo);
    return `
      <div class="mod-progress"><div class="mod-progress__bar" style="width:${p}%;background:${color}"></div></div>
      <div class="mod-progress__label"><span>${formatCurrency(atual)}</span><span>${p}% de ${formatCurrency(alvo)}</span></div>`;
  };

  // Charts: registro para destruir antes de recriar
  const charts = {};
  const drawChart = (id, config) => {
    const cv = document.getElementById(id);
    if (!cv) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(cv, config);
  };

  // ==========================================================
  // MÓDULO: METAS
  // ==========================================================
  const PRIORIDADE = { alta: ['Alta', 'red'], media: ['Média', 'amber'], baixa: ['Baixa', 'gray'] };
  const META_STATUS = { ativa: ['Ativa', 'blue'], concluida: ['Concluída', 'green'], pausada: ['Pausada', 'gray'] };

  const metaAtual = (m) => sum(m.aportes || [], (a) => a.valor);

  const Metas = {
    fields: (m = {}) => [
      { name: 'nome', label: 'Nome da meta', type: 'text', required: true, value: m.nome, placeholder: 'Ex: Viagem, Reserva de emergência', wide: true },
      { name: 'valorObjetivo', label: 'Valor objetivo (R$)', type: 'money', required: true, value: m.valorObjetivo ? formatValuePlain(m.valorObjetivo) : '' },
      { name: 'dataAlvo', label: 'Data alvo', type: 'date', value: m.dataAlvo },
      { name: 'prioridade', label: 'Prioridade', type: 'select', value: m.prioridade || 'media', options: Object.entries(PRIORIDADE).map(([v, [l]]) => ({ value: v, label: l })) },
      { name: 'status', label: 'Status', type: 'select', value: m.status || 'ativa', options: Object.entries(META_STATUS).map(([v, [l]]) => ({ value: v, label: l })) }
    ],
    async add() {
      const v = await formModal({ title: 'Nova meta', icon: 'bullseye', fields: this.fields() });
      if (!v) return;
      upsert('metas', { id: generateId(), aportes: [], ...v });
      notify.success('Meta criada!');
    },
    async edit(id) {
      const m = coll('metas').find((x) => x.id === id);
      if (!m) return;
      const v = await formModal({ title: 'Editar meta', icon: 'bullseye', fields: this.fields(m) });
      if (!v) return;
      upsert('metas', { ...m, ...v });
      notify.success('Meta atualizada!');
    },
    async aporte(id) {
      const m = coll('metas').find((x) => x.id === id);
      if (!m) return;
      const v = await formModal({
        title: `Aporte — ${m.nome}`, icon: 'piggy-bank', confirmText: 'Adicionar aporte',
        fields: [
          { name: 'valor', label: 'Valor do aporte (R$)', type: 'money', required: true },
          { name: 'data', label: 'Data', type: 'date', value: today().format('YYYY-MM-DD') }
        ]
      });
      if (!v) return;
      m.aportes = m.aportes || [];
      m.aportes.push({ id: generateId(), valor: v.valor, data: v.data || today().format('YYYY-MM-DD') });
      if (metaAtual(m) >= m.valorObjetivo) m.status = 'concluida';
      upsert('metas', m);
      notify.success('Aporte registrado!');
    },
    card(m) {
      const atual = metaAtual(m);
      const [pl, pc] = PRIORIDADE[m.prioridade] || PRIORIDADE.media;
      const [sl, sc] = META_STATUS[m.status] || META_STATUS.ativa;
      const dias = daysUntil(m.dataAlvo);
      const atraso = dias !== null && dias < 0 && m.status !== 'concluida';
      const prazo = m.dataAlvo
        ? `<span class="mod-card__sub">${atraso ? '<i class="bi bi-exclamation-triangle-fill text-danger"></i> atrasada' : `faltam ${dias} dia(s)`} • ${fmtDate(m.dataAlvo)}</span>`
        : '';
      return `
        <div class="mod-card">
          <div class="mod-card__top">
            <div><h3 class="mod-card__title">${escapeHtml(m.nome)}</h3>${prazo}</div>
            <span class="mod-badge mod-badge--${sc}">${sl}</span>
          </div>
          ${progressBar(atual, m.valorObjetivo)}
          <div class="mod-card__row"><span>Prioridade</span><span class="mod-badge mod-badge--${pc}">${pl}</span></div>
          ${actionBtns('metas', m.id, `<button class="mod-btn mod-btn--primary" data-mod="metas" data-act="aporte" data-id="${m.id}"><i class="bi bi-plus-lg"></i> Aporte</button>`)}
        </div>`;
    },
    render(c) {
      const list = [...coll('metas')].sort((a, b) => metaAtual(b) / (b.valorObjetivo || 1) - metaAtual(a) / (a.valorObjetivo || 1));
      const totObj = sum(list, (m) => m.valorObjetivo || 0);
      const totAtual = sum(list, metaAtual);
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-bullseye app-icon"></i> Metas financeiras</h2>
          <p class="view-header__hint">Objetivos com aportes, progresso e prazo</p></div>
          <button class="btn btn-primary" data-mod="metas" data-act="add"><i class="bi bi-plus-lg"></i> Nova meta</button>
        </div>
        ${list.length ? `<div class="mod-summary">
          <div class="mod-summary__item"><span>Metas ativas</span><strong>${list.filter((m) => m.status === 'ativa').length}</strong></div>
          <div class="mod-summary__item"><span>Total objetivo</span><strong>${formatCurrency(totObj)}</strong></div>
          <div class="mod-summary__item"><span>Total acumulado</span><strong style="color:var(--app-income)">${formatCurrency(totAtual)}</strong></div>
          <div class="mod-summary__item"><span>Progresso geral</span><strong>${pct(totAtual, totObj)}%</strong></div>
        </div>` : ''}
        ${list.length ? `<div class="mod-grid">${list.map((m) => this.card(m)).join('')}</div>` : emptyBlock('bullseye', 'Nenhuma meta ainda. Crie sua primeira meta!')}`;
    }
  };

  // ==========================================================
  // MÓDULO: RESERVAS
  // ==========================================================
  const reservaSaldo = (r) => sum(r.movimentacoes || [], (m) => (m.tipo === 'deposito' ? m.valor : -m.valor));

  const Reservas = {
    fields: (r = {}) => [
      { name: 'nome', label: 'Nome da reserva', type: 'text', required: true, value: r.nome, placeholder: 'Ex: IPVA, Emergência, Viagem', wide: true },
      { name: 'objetivo', label: 'Objetivo (R$) — opcional', type: 'money', value: r.objetivo ? formatValuePlain(r.objetivo) : '' }
    ],
    async add() {
      const v = await formModal({ title: 'Nova reserva', icon: 'safe2', fields: this.fields() });
      if (!v) return;
      upsert('reservas', { id: generateId(), movimentacoes: [], ...v });
      notify.success('Reserva criada!');
    },
    async edit(id) {
      const r = coll('reservas').find((x) => x.id === id);
      if (!r) return;
      const v = await formModal({ title: 'Editar reserva', icon: 'safe2', fields: this.fields(r) });
      if (!v) return;
      upsert('reservas', { ...r, ...v });
      notify.success('Reserva atualizada!');
    },
    async mov(id, tipo) {
      const r = coll('reservas').find((x) => x.id === id);
      if (!r) return;
      const v = await formModal({
        title: `${tipo === 'deposito' ? 'Depositar em' : 'Retirar de'} ${r.nome}`,
        icon: tipo === 'deposito' ? 'box-arrow-in-down' : 'box-arrow-up',
        confirmText: tipo === 'deposito' ? 'Depositar' : 'Retirar',
        fields: [
          { name: 'valor', label: 'Valor (R$)', type: 'money', required: true },
          { name: 'data', label: 'Data', type: 'date', value: today().format('YYYY-MM-DD') },
          { name: 'obs', label: 'Observação', type: 'text', wide: true }
        ]
      });
      if (!v) return;
      if (tipo === 'saque' && v.valor > reservaSaldo(r)) {
        notify.error('Saldo insuficiente na reserva.');
        return;
      }
      r.movimentacoes = r.movimentacoes || [];
      r.movimentacoes.push({ id: generateId(), tipo, valor: v.valor, data: v.data || today().format('YYYY-MM-DD'), obs: v.obs || '' });
      upsert('reservas', r);
      notify.success('Movimentação registrada!');
    },
    card(r) {
      const saldo = reservaSaldo(r);
      const movs = [...(r.movimentacoes || [])].sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 4);
      const hist = movs.length
        ? `<ul class="mod-history">${movs.map((m) => `<li><span>${fmtDate(m.data)} ${m.obs ? '· ' + escapeHtml(m.obs) : ''}</span><strong style="color:${m.tipo === 'deposito' ? 'var(--app-income)' : 'var(--app-expense)'}">${m.tipo === 'deposito' ? '+' : '−'} ${formatCurrency(m.valor)}</strong></li>`).join('')}</ul>`
        : '<p class="mod-card__sub mb-0">Sem movimentações</p>';
      return `
        <div class="mod-card">
          <div class="mod-card__top">
            <div><h3 class="mod-card__title">${escapeHtml(r.nome)}</h3>
            <span class="mod-card__sub">Saldo atual</span></div>
            <span class="mod-badge mod-badge--blue">${formatCurrency(saldo)}</span>
          </div>
          ${r.objetivo ? progressBar(saldo, r.objetivo, 'var(--app-balance)') : ''}
          ${hist}
          ${actionBtns('reservas', r.id, `
            <button class="mod-btn" data-mod="reservas" data-act="dep" data-id="${r.id}" title="Depositar"><i class="bi bi-plus-circle text-success"></i></button>
            <button class="mod-btn" data-mod="reservas" data-act="saq" data-id="${r.id}" title="Retirar"><i class="bi bi-dash-circle text-danger"></i></button>`)}
        </div>`;
    },
    render(c) {
      const list = coll('reservas');
      const total = sum(list, reservaSaldo);
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-safe2 app-icon"></i> Reservas financeiras</h2>
          <p class="view-header__hint">Separe dinheiro por objetivo (IPVA, emergência, viagem…)</p></div>
          <button class="btn btn-primary" data-mod="reservas" data-act="add"><i class="bi bi-plus-lg"></i> Nova reserva</button>
        </div>
        ${list.length ? `<div class="mod-summary">
          <div class="mod-summary__item"><span>Total reservado</span><strong style="color:var(--app-balance)">${formatCurrency(total)}</strong></div>
          <div class="mod-summary__item"><span>Nº de reservas</span><strong>${list.length}</strong></div>
        </div>` : ''}
        ${list.length ? `<div class="mod-grid">${list.map((r) => this.card(r)).join('')}</div>` : emptyBlock('safe2', 'Nenhuma reserva ainda.')}`;
    }
  };

  // ==========================================================
  // MÓDULO: CARTÕES DE CRÉDITO
  // ==========================================================
  const Cartoes = {
    fields: (k = {}) => [
      { name: 'nome', label: 'Nome do cartão', type: 'text', required: true, value: k.nome, placeholder: 'Ex: Nubank, Itaú Visa', wide: true },
      { name: 'bandeira', label: 'Bandeira', type: 'select', value: k.bandeira || 'Visa', options: ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outro'].map((b) => ({ value: b, label: b })) },
      { name: 'limite', label: 'Limite (R$)', type: 'money', value: k.limite ? formatValuePlain(k.limite) : '' },
      { name: 'fechamento', label: 'Dia de fechamento', type: 'number', value: k.fechamento, placeholder: '1-31' },
      { name: 'vencimento', label: 'Dia de vencimento', type: 'number', value: k.vencimento, placeholder: '1-31' }
    ],
    async add() {
      const v = await formModal({ title: 'Novo cartão', icon: 'credit-card-2-front', fields: this.fields() });
      if (!v) return;
      upsert('cartoes', { id: generateId(), ...v });
      notify.success('Cartão cadastrado!');
    },
    async edit(id) {
      const k = coll('cartoes').find((x) => x.id === id);
      if (!k) return;
      const v = await formModal({ title: 'Editar cartão', icon: 'credit-card-2-front', fields: this.fields(k) });
      if (!v) return;
      upsert('cartoes', { ...k, ...v });
      notify.success('Cartão atualizado!');
    },
    async compra(cartaoId) {
      const k = coll('cartoes').find((x) => x.id === cartaoId);
      if (!k) return;
      const v = await formModal({
        title: `Compra — ${k.nome}`, icon: 'bag-plus', confirmText: 'Lançar compra',
        fields: [
          { name: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
          { name: 'valor', label: 'Valor total (R$)', type: 'money', required: true },
          { name: 'parcelas', label: 'Parcelas', type: 'number', value: 1 },
          { name: 'data', label: 'Data da compra', type: 'date', value: today().format('YYYY-MM-DD') },
          { name: 'categoria', label: 'Categoria', type: 'select', value: 'Outros', options: CATEGORIAS.map((x) => ({ value: x, label: x })) }
        ]
      });
      if (!v) return;
      upsert('comprasCartao', {
        id: generateId(), cartaoId, descricao: v.descricao, valor: v.valor,
        parcelas: Math.max(1, v.parcelas || 1), data: v.data || today().format('YYYY-MM-DD'), categoria: v.categoria
      });
      notify.success('Compra lançada!');
    },
    // Valor da fatura de um cartão para um mês de referência (dayjs)
    faturaMes(cartaoId, ref) {
      return sum(coll('comprasCartao').filter((c) => c.cartaoId === cartaoId), (c) => {
        const start = dayjs(c.data).startOf('month');
        const diff = ref.startOf('month').diff(start, 'month');
        return diff >= 0 && diff < (c.parcelas || 1) ? c.valor / (c.parcelas || 1) : 0;
      });
    },
    totalCartao(cartaoId) {
      // soma das parcelas ainda não quitadas (deste mês em diante)
      return sum(coll('comprasCartao').filter((c) => c.cartaoId === cartaoId), (c) => {
        const start = dayjs(c.data).startOf('month');
        const paid = Math.max(0, today().startOf('month').diff(start, 'month'));
        const restantes = Math.max(0, (c.parcelas || 1) - paid);
        return (c.valor / (c.parcelas || 1)) * restantes;
      });
    },
    card(k) {
      const ref = currentDate;
      const fatura = this.faturaMes(k.id, ref);
      const aberto = this.totalCartao(k.id);
      const usoPct = k.limite ? pct(aberto, k.limite) : 0;
      const comprasDoMes = coll('comprasCartao').filter((c) => c.cartaoId === k.id).length;
      return `
        <div class="mod-card">
          <div class="mod-card__top">
            <div><div class="mod-icon" style="background:color-mix(in srgb,var(--app-investment) 14%,transparent);color:var(--app-investment)"><i class="bi bi-credit-card-2-front"></i></div></div>
            <div style="flex:1;margin-left:.6rem"><h3 class="mod-card__title">${escapeHtml(k.nome)}</h3>
            <span class="mod-card__sub">${escapeHtml(k.bandeira || '')} · fecha dia ${k.fechamento || '—'} · vence dia ${k.vencimento || '—'}</span></div>
          </div>
          <div class="mod-card__row"><span>Fatura de ${MESES[ref.month()]}</span><strong style="color:var(--app-expense)">${formatCurrency(fatura)}</strong></div>
          <div class="mod-card__row"><span>Total em aberto</span><strong>${formatCurrency(aberto)}</strong></div>
          <div class="mod-card__row"><span>Compras lançadas</span><strong>${comprasDoMes}</strong></div>
          ${k.limite ? `${progressBar(aberto, k.limite, usoPct > 80 ? 'var(--app-expense)' : 'var(--app-reserved)')}<div class="mod-card__row"><span>Limite</span><strong>${formatCurrency(k.limite)}</strong></div>` : ''}
          ${actionBtns('cartoes', k.id, `<button class="mod-btn mod-btn--primary" data-mod="cartoes" data-act="compra" data-id="${k.id}"><i class="bi bi-bag-plus"></i> Compra</button>`)}
        </div>`;
    },
    render(c) {
      const list = coll('cartoes');
      const totalFatura = sum(list, (k) => this.faturaMes(k.id, currentDate));
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-credit-card-2-front app-icon"></i> Cartões de crédito</h2>
          <p class="view-header__hint">Limite, fechamento, vencimento e faturas (mês: ${MESES[currentDate.month()]}/${currentDate.year()})</p></div>
          <button class="btn btn-primary" data-mod="cartoes" data-act="add"><i class="bi bi-plus-lg"></i> Novo cartão</button>
        </div>
        ${list.length ? `<div class="mod-summary">
          <div class="mod-summary__item"><span>Total das faturas do mês</span><strong style="color:var(--app-expense)">${formatCurrency(totalFatura)}</strong></div>
          <div class="mod-summary__item"><span>Cartões</span><strong>${list.length}</strong></div>
        </div>` : ''}
        ${list.length ? `<div class="mod-grid">${list.map((k) => this.card(k)).join('')}</div>` : emptyBlock('credit-card-2-front', 'Nenhum cartão cadastrado.')}`;
    }
  };

  // ==========================================================
  // MÓDULO: INVESTIMENTOS (portfólio)
  // ==========================================================
  const TIPOS_INVEST = ['Poupança', 'CDB', 'Tesouro Direto', 'Fundos', 'Ações', 'FIIs', 'Criptomoedas', 'Outros'];

  // Lançamentos do mês do tipo "investimento" vinculados a um item da carteira
  const aportesMensaisDe = (id) => {
    let total = 0;
    let qtd = 0;
    Object.keys(allData).forEach((k) => {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      (allData[k] || []).forEach((e) => {
        if (e.type === 'investimento' && e.investimento_id === id) { total += Number(e.value) || 0; qtd++; }
      });
    });
    return { total, qtd };
  };

  // Lançamentos "investimento" sem vínculo (ou apontando para item já apagado)
  const aportesSemVinculo = () => {
    const ids = new Set(coll('investimentos').map((i) => i.id));
    let total = 0;
    let qtd = 0;
    Object.keys(allData).forEach((k) => {
      if (!/^\d{4}-\d{2}$/.test(k)) return;
      (allData[k] || []).forEach((e) => {
        if (e.type === 'investimento' && !ids.has(e.investimento_id)) { total += Number(e.value) || 0; qtd++; }
      });
    });
    return { total, qtd };
  };

  // Quanto foi investido em cada um dos últimos N meses (todos os lançamentos "investimento")
  const aportesPorMes = (meses = 12) => {
    const out = [];
    for (let i = meses - 1; i >= 0; i--) {
      const d = currentDate.subtract(i, 'month');
      const lista = (allData[d.format('YYYY-MM')] || []).filter((e) => e.type === 'investimento');
      out.push({ label: d.format('MMM/YY'), total: sum(lista, (e) => Number(e.value) || 0) });
    }
    return out;
  };

  // Todos os lançamentos do tipo Investimento, de todos os meses, agrupados pelo nome
  const gruposLancamentosInvestimento = () => {
    const grupos = new Map();
    Object.keys(allData).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort().forEach((k) => {
      (allData[k] || []).forEach((e) => {
        if (e.type !== 'investimento') return;
        const chave = String(e.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!grupos.has(chave)) grupos.set(chave, { chave, nome: String(e.description || '').trim(), total: 0, meses: [], vinculos: new Set() });
        const g = grupos.get(chave);
        g.total += Number(e.value) || 0;
        g.meses.push({ mes: k, id: e.id, valor: Number(e.value) || 0, status: e.status, person: e.person });
        if (e.investimento_id) g.vinculos.add(e.investimento_id);
      });
    });
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  };

  const rotuloInvestimento = (i) => [i.tipo, i.instituicao].filter(Boolean).join(' · ') || 'Investimento';

  // Vincula (ou desvincula) TODOS os lançamentos de um grupo, em todos os meses
  const vincularGrupoInvestimento = (chave, valor) => {
    const g = gruposLancamentosInvestimento().find((x) => x.chave === chave);
    if (!g) return;
    let invId = valor;
    if (valor === '__novo__') {
      const item = { id: generateId(), tipo: 'Outros', instituicao: g.nome, valorAplicado: 0, valorAtual: 0, data: `${g.meses[0].mes}-01` };
      upsert('investimentos', item);
      invId = item.id;
    }
    const desvincular = !invId || invId === '__none__';
    const inv = desvincular ? null : coll('investimentos').find((i) => i.id === invId);
    if (!desvincular && !inv) return;

    const porMes = {};
    g.meses.forEach((x) => { (porMes[x.mes] = porMes[x.mes] || []).push(x.id); });
    Object.entries(porMes).forEach(([mes, ids]) => {
      const antes = JSON.parse(JSON.stringify(allData[mes] || []));
      allData[mes] = (allData[mes] || []).map((e) => {
        if (!ids.includes(e.id)) return e;
        const { investimento_id, ...resto } = e;
        return desvincular ? resto : { ...resto, investimento_id: invId };
      });
      if (typeof registrarHistoricoMes === 'function') {
        registrarHistoricoMes(mes, antes, allData[mes], desvincular ? `desvinculou “${g.nome}” da carteira` : `vinculou “${g.nome}” a ${rotuloInvestimento(inv)}`);
      }
    });
    saveData();
    notify.success(desvincular ? `“${g.nome}” desvinculado.` : `“${g.nome}” vinculado a ${rotuloInvestimento(inv)} em ${Object.keys(porMes).length} mês(es).`);
    render();
  };

  const handleInvestGroupChange = (e) => {
    const sel = e.target.closest?.('[data-inv-group]');
    if (!sel || !sel.value) return;
    vincularGrupoInvestimento(sel.dataset.invGroup, sel.value);
  };

  const Investimentos = {
    grupoHtml(g, list) {
      const vinc = [...g.vinculos];
      const inv = vinc.length === 1 ? list.find((i) => i.id === vinc[0]) : null;
      const estado = !vinc.length ? 'sem vínculo'
        : inv ? `→ ${escapeHtml(rotuloInvestimento(inv))}`
        : (vinc.length > 1 ? 'vínculos mistos' : 'vínculo com item apagado');
      const opcoes = [
        `<option value="">${vinc.length ? 'Trocar vínculo…' : 'Vincular a…'}</option>`,
        ...list.map((i) => `<option value="${escapeAttr(i.id)}">${escapeHtml(rotuloInvestimento(i))}</option>`),
        '<option value="__novo__">＋ Criar investimento com este nome (do zero)</option>',
        ...(vinc.length ? ['<option value="__none__">Desvincular</option>'] : [])
      ].join('');
      const linhas = g.meses.map((x) => `<tr>
          <td>${dayjs(`${x.mes}-01`).format('MMM/YYYY')}</td>
          <td>${escapeHtml(PERSON_LABELS[x.person] || '—')}</td>
          <td>${escapeHtml(STATUS_LABELS[x.status] || x.status || '')}</td>
          <td class="num">${formatCurrency(x.valor)}</td>
        </tr>`).join('');
      const nMeses = new Set(g.meses.map((x) => x.mes)).size;
      return `<details class="inv-group">
        <summary class="inv-group__sum">
          <span class="inv-group__name">${escapeHtml(g.nome)}</span>
          <span class="inv-group__meta">${g.meses.length} lanç. · ${nMeses} mês(es) · <span class="inv-group__state${vinc.length ? ' is-linked' : ''}">${estado}</span></span>
          <strong class="inv-group__total">${formatCurrency(g.total)}</strong>
        </summary>
        <div class="inv-group__body">
          <label class="inv-group__link">Carteira <select class="fm-input" data-inv-group="${escapeAttr(g.chave)}">${opcoes}</select></label>
          <div class="mod-table-wrap"><table class="mod-table">
            <thead><tr><th>Mês</th><th>Tag</th><th>Status</th><th class="num">Valor</th></tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot><tr><td colspan="3">Total em todos os meses</td><td class="num">${formatCurrency(g.total)}</td></tr></tfoot>
          </table></div>
        </div>
      </details>`;
    },
    fields: (i = {}) => [
      { name: 'tipo', label: 'Tipo', type: 'select', value: i.tipo || 'CDB', options: TIPOS_INVEST.map((t) => ({ value: t, label: t })) },
      { name: 'instituicao', label: 'Nome / instituição', type: 'text', value: i.instituicao, placeholder: 'Ex: CDB Nubank, Tesouro Selic', wide: true },
      { name: 'valorAplicado', label: 'Aporte inicial (R$) — deixe 0 para começar do zero', type: 'money', value: i.valorAplicado ? formatValuePlain(i.valorAplicado) : '' },
      { name: 'valorAtual', label: 'Valor atual informado (R$) — opcional', type: 'money', value: i.valorAtual ? formatValuePlain(i.valorAtual) : '' },
      { name: 'data', label: 'Data de início', type: 'date', value: i.data || today().format('YYYY-MM-DD') }
    ],
    async add() {
      const v = await formModal({ title: 'Novo investimento', icon: 'graph-up-arrow', fields: this.fields() });
      if (!v) return;
      const item = { id: generateId(), ...v };
      if (item.valorAtual > 0) item.valorAtualEm = today().format('YYYY-MM-DD');
      upsert('investimentos', item);
      notify.success('Investimento adicionado! Vincule os lançamentos do mês a ele no formulário.');
    },
    async edit(id) {
      const i = coll('investimentos').find((x) => x.id === id);
      if (!i) return;
      const v = await formModal({ title: 'Editar investimento', icon: 'graph-up-arrow', fields: this.fields(i) });
      if (!v) return;
      const item = { ...i, ...v };
      if (v.valorAtual > 0) {
        if (v.valorAtual !== (Number(i.valorAtual) || 0)) item.valorAtualEm = today().format('YYYY-MM-DD');
      } else {
        delete item.valorAtualEm;
      }
      upsert('investimentos', item);
      notify.success('Investimento atualizado!');
    },
    // aplicado = aporte inicial + tudo que entrou pelos lançamentos mensais
    aplicado(i) { return (Number(i.valorAplicado) || 0) + aportesMensaisDe(i.id).total; },
    // atual = o que você informou; sem informar, vale o aplicado
    atual(i) { const v = Number(i.valorAtual) || 0; return v > 0 ? v : this.aplicado(i); },
    rent(i) {
      const ap = this.aplicado(i);
      const v = Number(i.valorAtual) || 0;
      if (!ap || v <= 0) return 0;
      return ((v - ap) / ap) * 100;
    },
    totais() {
      const list = coll('investimentos');
      const aplicado = sum(list, (i) => this.aplicado(i));
      const atual = sum(list, (i) => this.atual(i));
      const semVinculo = aportesSemVinculo();
      return { aplicado, atual, semVinculo, total: atual + semVinculo.total };
    },
    render(c) {
      const list = coll('investimentos');
      const t = this.totais();
      const rentTotal = t.aplicado ? ((t.atual - t.aplicado) / t.aplicado) * 100 : 0;
      const porMes = aportesPorMes(12);
      const grupos = gruposLancamentosInvestimento();
      const totalMensal = sum(grupos, (g) => g.total);
      const temMensal = grupos.length > 0;

      const rows = list.map((i) => {
        const men = aportesMensaisDe(i.id);
        const ap = this.aplicado(i);
        const at = this.atual(i);
        const r = this.rent(i);
        const informado = (Number(i.valorAtual) || 0) > 0;
        return `<tr>
          <td><span class="mod-badge mod-badge--violet">${escapeHtml(i.tipo)}</span></td>
          <td>${escapeHtml(i.instituicao || '—')}</td>
          <td class="num">${formatCurrency(ap)}<div class="mod-sub">inicial ${formatCurrency(i.valorAplicado || 0)}${men.qtd ? ` · ${men.qtd} lanç. ${formatCurrency(men.total)}` : ''}</div></td>
          <td class="num">${formatCurrency(at)}<div class="mod-sub">${informado ? `informado${i.valorAtualEm ? ` em ${fmtDate(i.valorAtualEm)}` : ''}` : '= aplicado'}</div></td>
          <td class="num" style="color:${moneyColor(r)}">${informado ? `${r >= 0 ? '+' : ''}${r.toFixed(2)}%` : '—'}</td>
          <td>${fmtDate(i.data)}</td>
          <td class="num">${actionBtns('investimentos', i.id).replace('mod-card__actions', 'mod-card__actions justify-content-end')}</td>
        </tr>`;
      }).join('');

      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-graph-up-arrow app-icon"></i> Investimentos</h2>
          <p class="view-header__hint">Carteira + o que entra mês a mês pelos lançamentos do tipo Investimento</p></div>
          <button class="btn btn-primary" data-mod="investimentos" data-act="add"><i class="bi bi-plus-lg"></i> Novo investimento</button>
        </div>
        ${(list.length || temMensal) ? `<div class="mod-summary">
          <div class="mod-summary__item"><span>Total investido hoje</span><strong style="color:var(--app-investment)">${formatCurrency(t.total)}</strong></div>
          <div class="mod-summary__item"><span>Aplicado na carteira</span><strong>${formatCurrency(t.aplicado)}</strong></div>
          <div class="mod-summary__item"><span>Lançamentos mensais (todos os meses)</span><strong>${formatCurrency(totalMensal)}</strong></div>
          <div class="mod-summary__item"><span>Rentabilidade</span><strong style="color:${moneyColor(rentTotal)}">${rentTotal >= 0 ? '+' : ''}${rentTotal.toFixed(2)}%</strong></div>
          ${t.semVinculo.qtd ? `<div class="mod-summary__item"><span>Sem vínculo (${t.semVinculo.qtd} lanç.)</span><strong>${formatCurrency(t.semVinculo.total)}</strong></div>` : ''}
        </div>
        <div class="row g-3 mb-3">
          ${list.length ? '<div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Alocação por tipo</h3><canvas id="chartInvestAloc" height="200"></canvas></div></div>' : ''}
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Investido por mês (12 meses)</h3><canvas id="chartInvestMensal" height="200"></canvas></div></div>
        </div>` : ''}
        ${list.length ? `<div class="mod-table-wrap"><table class="mod-table">
          <thead><tr><th>Tipo</th><th>Nome</th><th class="num">Aplicado</th><th class="num">Atual</th><th class="num">Rent.</th><th>Início</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : emptyBlock('graph-up-arrow', 'Nenhum investimento na carteira. Crie um (pode começar do zero) e vincule os lançamentos do tipo Investimento a ele.')}
        ${grupos.length ? `<h3 class="chart-box__title mt-4 mb-1"><i class="bi bi-calendar-check"></i> Lançamentos mensais de investimento — todos os meses</h3>
        <p class="mod-hint mb-2"><i class="bi bi-info-circle"></i> Tudo que você lançou como Investimento, mês a mês, agrupado pelo nome. Abra um grupo para ver cada mês e vincule à carteira (ou crie um investimento do zero com o mesmo nome) para somar lá em cima.</p>
        <div class="inv-groups">${grupos.map((g) => this.grupoHtml(g, list)).join('')}</div>` : ''}`;

      const { grid, text } = getChartTheme();
      if (list.length) {
        const byTipo = {};
        list.forEach((i) => { byTipo[i.tipo] = (byTipo[i.tipo] || 0) + this.atual(i); });
        drawChart('chartInvestAloc', {
          type: 'doughnut',
          data: { labels: Object.keys(byTipo), datasets: [{ data: Object.values(byTipo), backgroundColor: CHART_COLORS, borderWidth: 0 }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: text, font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } } }
        });
      }
      if (list.length || temMensal) {
        drawChart('chartInvestMensal', {
          type: 'bar',
          data: { labels: porMes.map((p) => p.label), datasets: [{ data: porMes.map((p) => p.total), backgroundColor: '#8b5cf6', borderRadius: 5, maxBarThickness: 26 }] },
          options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
        });
      }
    }
  };

  // ==========================================================
  // MÓDULO: PATRIMÔNIO
  // ==========================================================
  const TIPOS_BEM = ['Imóvel', 'Carro', 'Moto', 'Investimentos', 'Eletrônicos', 'Móveis', 'Outros'];

  const Patrimonio = {
    fields: (b = {}) => [
      { name: 'nome', label: 'Nome do bem', type: 'text', required: true, value: b.nome, placeholder: 'Ex: Apartamento, Civic 2020', wide: true },
      { name: 'tipo', label: 'Tipo', type: 'select', value: b.tipo || 'Outros', options: TIPOS_BEM.map((t) => ({ value: t, label: t })) },
      { name: 'valorCompra', label: 'Valor de compra (R$)', type: 'money', value: b.valorCompra ? formatValuePlain(b.valorCompra) : '' },
      { name: 'valorAtual', label: 'Valor atual (R$)', type: 'money', required: true, value: b.valorAtual ? formatValuePlain(b.valorAtual) : '' },
      { name: 'dataAquisicao', label: 'Data de aquisição', type: 'date', value: b.dataAquisicao },
      { name: 'obs', label: 'Observações', type: 'textarea', value: b.obs }
    ],
    async add() {
      const v = await formModal({ title: 'Novo bem', icon: 'house-add', fields: this.fields() });
      if (!v) return;
      upsert('patrimonio', { id: generateId(), ...v });
      notify.success('Bem adicionado ao patrimônio!');
    },
    async edit(id) {
      const b = coll('patrimonio').find((x) => x.id === id);
      if (!b) return;
      const v = await formModal({ title: 'Editar bem', icon: 'house-gear', fields: this.fields(b) });
      if (!v) return;
      upsert('patrimonio', { ...b, ...v });
      notify.success('Bem atualizado!');
    },
    card(b) {
      const dep = (b.valorCompra && b.valorAtual) ? b.valorAtual - b.valorCompra : null;
      return `
        <div class="mod-card">
          <div class="mod-card__top">
            <div><h3 class="mod-card__title">${escapeHtml(b.nome)}</h3>
            <span class="mod-badge mod-badge--gray">${escapeHtml(b.tipo)}</span></div>
            <strong style="font-size:1.1rem">${formatCurrency(b.valorAtual || 0)}</strong>
          </div>
          ${b.valorCompra ? `<div class="mod-card__row"><span>Compra</span><strong>${formatCurrency(b.valorCompra)}</strong></div>` : ''}
          ${dep !== null ? `<div class="mod-card__row"><span>Variação</span><strong style="color:${moneyColor(dep)}">${dep >= 0 ? '+' : ''}${formatCurrency(dep)}</strong></div>` : ''}
          ${b.dataAquisicao ? `<div class="mod-card__row"><span>Aquisição</span><strong>${fmtDate(b.dataAquisicao)}</strong></div>` : ''}
          ${b.obs ? `<p class="mod-card__sub mb-0">${escapeHtml(b.obs)}</p>` : ''}
          ${actionBtns('patrimonio', b.id)}
        </div>`;
    },
    render(c) {
      const list = coll('patrimonio');
      const total = sum(list, (b) => b.valorAtual || 0);
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-houses app-icon"></i> Patrimônio</h2>
          <p class="view-header__hint">Bens: imóveis, veículos, eletrônicos…</p></div>
          <button class="btn btn-primary" data-mod="patrimonio" data-act="add"><i class="bi bi-plus-lg"></i> Novo bem</button>
        </div>
        ${list.length ? `<div class="mod-summary"><div class="mod-summary__item"><span>Patrimônio total</span><strong style="color:var(--app-balance)">${formatCurrency(total)}</strong></div>
          <div class="mod-summary__item"><span>Itens</span><strong>${list.length}</strong></div></div>` : ''}
        ${list.length ? `<div class="mod-grid">${list.map((b) => this.card(b)).join('')}</div>` : emptyBlock('houses', 'Nenhum bem cadastrado.')}`;
    }
  };

  // ==========================================================
  // Detecção de assinaturas recorrentes (últimos N meses)
  // ==========================================================
  // categorias com papel (nomes podem ter sido renomeados)
  const subscriptionSkipCategories = () => new Set([
    catPapel('cartaoGabriel'), catPapel('cartaoBabi'), catPapel('cartao'), catPapel('investimentos')
  ]);

  const isOneOffExpense = (desc) => {
    const d = String(desc || '').toLowerCase();
    return /\b(parcela|multa|viagem|dívida|divida|emergência|emergencia|único|unico|reembolso)\b/.test(d)
      || /\d+\s*[ªaº.]?\s*parcela/.test(d);
  };

  const normalizeSubName = (desc) => String(desc || '')
    .replace(/\s*\([^)]*parcela[^)]*\)/gi, '')
    .replace(/\s*-\s*\d+\s*[ªaº.]?\s*parcela.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const subscriptionDisplayName = (entry) => {
    const base = normalizeSubName(entry.description);
    if (!base) return '';
    if (entry.person && PERSON_LABELS[entry.person]) {
      return `${base} (${PERSON_LABELS[entry.person]})`;
    }
    return base;
  };

  const subscriptionAlreadyRegistered = (name) => {
    const key = normalizeSubName(name).toLowerCase();
    return coll('assinaturas').some((a) => {
      const existing = normalizeSubName(a.nome).toLowerCase();
      return existing === key || existing.includes(key) || key.includes(existing);
    });
  };

  const valuesAreSimilar = (values) => {
    if (!values.length) return false;
    const avg = sum(values) / values.length;
    if (avg <= 0) return false;
    return values.every((v) => Math.abs(v - avg) / avg <= 0.18);
  };

  const mostCommon = (arr) => {
    const counts = {};
    arr.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0) || null;
  };

  const getRecentMonthKeys = (count = 3) => {
    const keys = [];
    for (let i = 0; i < count; i++) keys.push(currentDate.subtract(i, 'month').format('YYYY-MM'));
    return keys;
  };

  const monthKeyLabel = (key) => {
    const [, m] = key.split('-');
    const y = key.slice(2, 4);
    return `${MESES[Number(m) - 1].slice(0, 3)}/${y}`;
  };

  const inferPaymentForm = (category) => {
    const c = String(category || '').toLowerCase();
    if (c.includes('internet') || c.includes('luz') || c.includes('água') || c.includes('agua')) return 'Boleto';
    return 'Cartão';
  };

  const detectSubscriptionCandidates = (months = 3) => {
    const monthKeys = getRecentMonthKeys(months);
    const buckets = new Map();

    monthKeys.forEach((monthKey) => {
      (allData[monthKey] || []).forEach((entry) => {
        if (entry.type !== 'despesa') return;
        if (subscriptionSkipCategories().has(entry.category)) return;
        if (typeof isCreditCardEntry === 'function' && isCreditCardEntry(entry)) return;
        if (isOneOffExpense(entry.description)) return;

        const displayName = subscriptionDisplayName(entry);
        if (!displayName) return;
        if (subscriptionAlreadyRegistered(displayName)) return;

        const bucketKey = `${normalizeSubName(entry.description).toLowerCase()}|${entry.person || '_'}`;
        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, {
            nome: displayName,
            months: new Set(),
            values: [],
            dueDays: [],
            category: entry.category
          });
        }

        const bucket = buckets.get(bucketKey);
        if (bucket.months.has(monthKey)) return;
        bucket.months.add(monthKey);
        bucket.values.push(Number(entry.value) || 0);
        if (entry.due_day) bucket.dueDays.push(entry.due_day);
      });
    });

    const minMonths = Math.min(2, monthKeys.length);
    return [...buckets.values()]
      .filter((b) => b.months.size >= minMonths && valuesAreSimilar(b.values))
      .map((b) => {
        const meses = [...b.months].sort().reverse();
        const valor = Math.round((sum(b.values) / b.values.length) * 100) / 100;
        return {
          nome: b.nome,
          valor,
          meses,
          mesesLabel: meses.map(monthKeyLabel).join(', '),
          ocorrencias: b.months.size,
          vencimentoDia: mostCommon(b.dueDays),
          forma: inferPaymentForm(b.category)
        };
      })
      .sort((a, b) => b.ocorrencias - a.ocorrencias || b.valor - a.valor);
  };

  // ==========================================================
  // MÓDULO: CONTAS FIXAS (assinaturas / serviços recorrentes)
  // ==========================================================
  const PERSON_ORDER = { gabriel: 0, barbara: 1, casa: 2, familia: 3 };

  const recurringCardItemsMonth = () => {
    const out = [];
    (allData[getMonthKey(currentDate)] || []).forEach((entry) => {
      const cat = String(entry.category ?? '').toLowerCase();
      if (!cat.includes('cartão') && !cat.includes('cartao')) return;
      (entry.card_items || []).forEach((item) => {
        if (!item.recurring) return;
        const desc = String(item.description ?? '').trim();
        if (/^cart[aã]o$/i.test(desc) || /^fatura/i.test(desc)) return;
        out.push({
          nome: item.description,
          valor: item.value || 0,
          cartao: entry.description,
          person: entry.person
        });
      });
    });
    return out.sort((a, b) => {
      const pa = PERSON_ORDER[a.person] ?? 99;
      const pb = PERSON_ORDER[b.person] ?? 99;
      if (pa !== pb) return pa - pb;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  };

  const Assinaturas = {
    _suggestions: [],
    fields: (a = {}) => [
      { name: 'nome', label: 'Serviço', type: 'text', required: true, value: a.nome, placeholder: 'Ex: Netflix, Spotify', wide: true },
      { name: 'valor', label: 'Valor mensal (R$)', type: 'money', required: true, value: a.valor ? formatValuePlain(a.valor) : '' },
      { name: 'vencimentoDia', label: 'Dia de vencimento', type: 'number', value: a.vencimentoDia, placeholder: '1-31' },
      { name: 'forma', label: 'Forma de pagamento', type: 'select', value: a.forma || 'Cartão', options: ['Cartão', 'Débito', 'Pix', 'Boleto', 'Outro'].map((x) => ({ value: x, label: x })) },
      { name: 'status', label: 'Status', type: 'select', value: a.status || 'ativa', options: [{ value: 'ativa', label: 'Ativa' }, { value: 'cancelada', label: 'Cancelada' }] }
    ],
    async add() {
      const v = await formModal({ title: 'Nova conta fixa', icon: 'repeat', fields: this.fields() });
      if (!v) return;
      upsert('assinaturas', { id: generateId(), ...v });
      notify.success('Conta fixa cadastrada!');
    },
    async edit(id) {
      const a = coll('assinaturas').find((x) => x.id === id);
      if (!a) return;
      const v = await formModal({ title: 'Editar conta fixa', icon: 'repeat', fields: this.fields(a) });
      if (!v) return;
      upsert('assinaturas', { ...a, ...v });
      notify.success('Conta fixa atualizada!');
    },
    async addFromSuggestion(idx) {
      const sug = (this._suggestions || [])[Number(idx)];
      if (!sug) return;
      const v = await formModal({
        title: 'Adicionar conta fixa sugerida',
        icon: 'magic',
        fields: this.fields({
          nome: sug.nome,
          valor: sug.valor,
          vencimentoDia: sug.vencimentoDia,
          forma: sug.forma
        }),
        confirmText: 'Cadastrar'
      });
      if (!v) return;
      upsert('assinaturas', { id: generateId(), status: 'ativa', ...v });
      notify.success(`"${sug.nome}" adicionada às contas fixas!`);
    },
    renderSuggestions() {
      this._suggestions = detectSubscriptionCandidates(3);
      const list = this._suggestions;
      if (!list.length) {
        return `<div class="mod-suggest mod-suggest--empty">
          <p class="mod-suggest__title"><i class="bi bi-search"></i> Análise dos últimos 3 meses</p>
          <p class="mod-suggest__hint mb-0">Nenhuma despesa recorrente nova encontrada. Cadastre lançamentos em meses anteriores ou adicione manualmente.</p>
        </div>`;
      }
      const items = list.map((s, i) => `
        <div class="mod-suggest__item">
          <div class="mod-suggest__body">
            <strong>${escapeHtml(s.nome)}</strong>
            <span class="mod-suggest__meta">${escapeHtml(s.mesesLabel)} · ${s.ocorrencias} de 3 meses · ~${formatCurrency(s.valor)}/mês</span>
          </div>
          <button type="button" class="btn btn-sm btn-outline-primary" data-mod="assinaturas" data-act="add-sug" data-idx="${i}">
            <i class="bi bi-plus-lg"></i> Adicionar
          </button>
        </div>`).join('');
      return `<div class="mod-suggest">
        <div class="mod-suggest__head">
          <p class="mod-suggest__title"><i class="bi bi-stars"></i> Sugestões dos últimos 3 meses</p>
          <span class="mod-badge mod-badge--blue">${list.length} encontrada(s)</span>
        </div>
        <p class="mod-suggest__hint">Despesas que apareceram em pelo menos 2 dos últimos 3 meses, com valor parecido. Revise e adicione às contas fixas.</p>
        <div class="mod-suggest__list">${items}</div>
      </div>`;
    },
    renderCardRecurringMonth() {
      const items = recurringCardItemsMonth();
      if (!items.length) return '';

      const total = sum(items, (i) => i.valor || 0);
      const rows = items.map((item) => `
        <li class="card-recurring-row">
          <div class="card-recurring-row__body">
            <strong>${escapeHtml(item.nome)}</strong>
            <span class="card-recurring-row__meta">${escapeHtml(item.cartao)} · ${escapeHtml(PERSON_LABELS[item.person] || '—')}</span>
          </div>
          <strong class="card-recurring-row__value">${formatCurrency(item.valor)}</strong>
        </li>`).join('');

      return `
        <div class="mod-card-recurring">
          <div class="mod-card-recurring__head">
            <p class="mod-card-recurring__title"><i class="bi bi-credit-card-2-front"></i> Recorrentes no cartão — ${MESES[currentDate.month()]}</p>
            <span class="mod-badge mod-badge--amber">${formatCurrency(total)}</span>
          </div>
          <ul class="mod-card-recurring__list">${rows}</ul>
        </div>`;
    },
    render(c) {
      const list = coll('assinaturas');
      const ativas = list.filter((a) => a.status !== 'cancelada');
      const totalMes = sum(ativas, (a) => a.valor || 0);
      const cards = list.map((a) => {
        const dias = a.vencimentoDia ? daysUntil(nextDueDate(a.vencimentoDia)) : null;
        const proximo = dias !== null && dias <= 5;
        const cancelada = a.status === 'cancelada';
        return `<div class="mod-card">
          <div class="mod-card__top">
            <div><h3 class="mod-card__title">${escapeHtml(a.nome)}</h3>
            <span class="mod-card__sub">${escapeHtml(a.forma || '')}${a.vencimentoDia ? ' · vence dia ' + a.vencimentoDia : ''}</span></div>
            <span class="mod-badge mod-badge--${cancelada ? 'gray' : 'green'}">${cancelada ? 'Cancelada' : 'Ativa'}</span>
          </div>
          <div class="mod-card__row"><span>Mensal</span><strong>${formatCurrency(a.valor || 0)}</strong></div>
          ${!cancelada && proximo ? `<div class="mod-badge mod-badge--amber"><i class="bi bi-bell-fill"></i> Vence em ${dias} dia(s)</div>` : ''}
          ${actionBtns('assinaturas', a.id)}
        </div>`;
      }).join('');
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-arrow-repeat app-icon"></i> Contas fixas</h2>
          <p class="view-header__hint">Serviços recorrentes</p></div>
          <button class="btn btn-primary" data-mod="assinaturas" data-act="add"><i class="bi bi-plus-lg"></i> Nova conta fixa</button>
        </div>
        ${this.renderSuggestions()}
        ${this.renderCardRecurringMonth()}
        ${list.length ? `<div class="mod-summary">
          <div class="mod-summary__item"><span>Gasto mensal (ativas)</span><strong style="color:var(--app-expense)">${formatCurrency(totalMes)}</strong></div>
          <div class="mod-summary__item"><span>Gasto anual</span><strong>${formatCurrency(totalMes * 12)}</strong></div>
          <div class="mod-summary__item"><span>Contas ativas</span><strong>${ativas.length}</strong></div>
        </div>` : ''}
        ${list.length ? `<div class="mod-grid">${cards}</div>` : emptyBlock('arrow-repeat', 'Nenhuma conta fixa cadastrada.')}`;
    }
  };

  // ==========================================================
  // MÓDULO: DASHBOARD
  // ==========================================================
  const Dashboard = {
    render(c) {
      const entries = allData[getMonthKey(currentDate)] || [];
      const s = calculateSummary(entries);
      const saldo = s.income - s.expense - s.investment;
      const patrimonioTotal = sum(coll('patrimonio'), (b) => b.valorAtual || 0);
      const investTotal = Investimentos.totais().total; // carteira + lançamentos mensais
      const reservasTotal = sum(coll('reservas'), reservaSaldo);
      const metasAtivas = coll('metas').filter((m) => m.status === 'ativa');
      const faturasTotal = sum(coll('cartoes'), (k) => Cartoes.faturaMes(k.id, currentDate));

      const venc = this.proximosVencimentos();

      const tile = (mod, label, value, icon) =>
        `<div class="dash-tile dash-tile--${mod}"><span class="dash-tile__label"><i class="bi bi-${icon}"></i> ${label}</span><span class="dash-tile__value">${value}</span></div>`;

      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-speedometer2 app-icon"></i> Dashboard</h2>
          <p class="view-header__hint">Visão geral — ${MESES[currentDate.month()]} de ${currentDate.year()}</p></div>
        </div>
        <div class="dash-grid mb-4">
          ${tile('income', 'Receita do mês', formatCurrency(s.income), 'arrow-down-circle')}
          ${tile('expense', 'Despesas do mês', formatCurrency(s.expense), 'arrow-up-circle')}
          ${tile('balance', 'Saldo do mês', formatCurrency(saldo), 'wallet2')}
          ${tile('', 'Pago', formatCurrency(s.paid), 'check-circle')}
          ${tile('', 'Pendente', formatCurrency(s.unpaid), 'exclamation-circle')}
          ${tile('', 'Reservado (mês)', formatCurrency(s.reserved), 'clock-history')}
          ${tile('invest', 'Investimentos', formatCurrency(investTotal), 'graph-up-arrow')}
          ${tile('', 'Reservas', formatCurrency(reservasTotal), 'safe2')}
          ${tile('balance', 'Patrimônio', formatCurrency(patrimonioTotal), 'houses')}
          ${tile('expense', 'Faturas cartão', formatCurrency(faturasTotal), 'credit-card-2-front')}
          ${tile('', 'Metas ativas', metasAtivas.length, 'bullseye')}
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Receitas x Despesas x Investimentos</h3><canvas id="dashChartIE" height="200"></canvas></div></div>
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Evolução do saldo (12 meses)</h3><canvas id="dashChartSaldo" height="200"></canvas></div></div>
        </div>
        <div class="row g-3">
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Progresso das metas</h3>
            ${metasAtivas.length ? metasAtivas.slice(0, 5).map((m) => `<div class="mb-2"><div class="mod-card__row"><span>${escapeHtml(m.nome)}</span><span>${pct(metaAtual(m), m.valorObjetivo)}%</span></div>${progressBar(metaAtual(m), m.valorObjetivo)}</div>`).join('') : '<p class="text-muted mb-0">Nenhuma meta ativa.</p>'}
          </div></div>
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Próximos vencimentos</h3>
            ${venc.length ? `<ul class="mod-history">${venc.slice(0, 8).map((v) => `<li><span><i class="bi bi-${v.icon} me-1" style="color:${v.color}"></i>${escapeHtml(v.title)}</span><strong>${v.dias <= 0 ? 'hoje/atrasado' : 'em ' + v.dias + 'd'}</strong></li>`).join('')}</ul>` : '<p class="text-muted mb-0">Nada vencendo em breve.</p>'}
          </div></div>
        </div>`;

      this.drawCharts(entries, s);
    },
    proximosVencimentos() {
      const out = [];
      // lançamentos do mês com dia de vencimento
      (allData[getMonthKey(currentDate)] || []).forEach((e) => {
        if (e.due_day && e.status !== 'pago' && e.type !== 'entrada') {
          const dias = daysUntil(nextDueDate(e.due_day));
          if (dias !== null && dias <= 7) out.push({ title: e.description, dias, icon: 'cash-coin', color: 'var(--app-expense)' });
        }
      });
      coll('assinaturas').filter((a) => a.status !== 'cancelada' && a.vencimentoDia).forEach((a) => {
        const dias = daysUntil(nextDueDate(a.vencimentoDia));
        if (dias !== null && dias <= 7) out.push({ title: a.nome + ' (conta fixa)', dias, icon: 'arrow-repeat', color: 'var(--app-reserved)' });
      });
      coll('cartoes').filter((k) => k.vencimento).forEach((k) => {
        const dias = daysUntil(nextDueDate(k.vencimento));
        if (dias !== null && dias <= 7) out.push({ title: 'Fatura ' + k.nome, dias, icon: 'credit-card-2-front', color: 'var(--app-investment)' });
      });
      return out.sort((a, b) => a.dias - b.dias);
    },
    drawCharts(entries, s) {
      const { grid, text } = getChartTheme();
      drawChart('dashChartIE', {
        type: 'bar',
        data: { labels: ['Entradas', 'Despesas', 'Investimentos'], datasets: [{ data: [s.income, s.expense, s.investment], backgroundColor: ['#10b981', '#ef4444', '#8b5cf6'], borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });
      // evolução do saldo dos últimos 12 meses
      const labels = [], data = [];
      for (let i = 11; i >= 0; i--) {
        const d = currentDate.subtract(i, 'month');
        const es = allData[getMonthKey(d)] || [];
        const sm = calculateSummary(es);
        labels.push(MESES[d.month()].slice(0, 3));
        data.push(sm.income - sm.expense - sm.investment);
      }
      drawChart('dashChartSaldo', {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.15)', fill: true, tension: 0.35, pointRadius: 3 }] },
        options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });
    }
  };

  // ==========================================================
  // MÓDULO: PLANEJAMENTO ANUAL
  // ==========================================================
  const Anual = {
    render(c) {
      const ano = currentDate.year();
      let tot = { rec: 0, desp: 0, inv: 0 };
      const serie = { rec: [], desp: [], inv: [] };
      const rows = MESES.map((mes, i) => {
        const key = dayjs(`${ano}-${String(i + 1).padStart(2, '0')}-01`).format('YYYY-MM');
        const s = calculateSummary(allData[key] || []);
        const saldo = s.income - s.expense - s.investment;
        tot.rec += s.income; tot.desp += s.expense; tot.inv += s.investment;
        serie.rec.push(s.income); serie.desp.push(s.expense); serie.inv.push(s.investment);
        return `<tr>
          <td>${mes}</td>
          <td class="num" style="color:var(--app-income)">${formatCurrency(s.income)}</td>
          <td class="num" style="color:var(--app-expense)">${formatCurrency(s.expense)}</td>
          <td class="num" style="color:var(--app-investment)">${formatCurrency(s.investment)}</td>
          <td class="num" style="color:${moneyColor(saldo)};font-weight:700">${formatCurrency(saldo)}</td>
        </tr>`;
      }).join('');
      const saldoAno = tot.rec - tot.desp - tot.inv;
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-calendar3 app-icon"></i> Planejamento anual</h2>
          <p class="view-header__hint">Janeiro a dezembro de ${ano} (mude o ano no topo)</p></div>
        </div>
        <div class="mod-summary">
          <div class="mod-summary__item"><span>Entradas no ano</span><strong style="color:var(--app-income)">${formatCurrency(tot.rec)}</strong></div>
          <div class="mod-summary__item"><span>Despesas no ano</span><strong style="color:var(--app-expense)">${formatCurrency(tot.desp)}</strong></div>
          <div class="mod-summary__item"><span>Investimentos</span><strong style="color:var(--app-investment)">${formatCurrency(tot.inv)}</strong></div>
          <div class="mod-summary__item"><span>Saldo do ano</span><strong style="color:${moneyColor(saldoAno)}">${formatCurrency(saldoAno)}</strong></div>
        </div>
        <div class="mod-table-wrap"><table class="mod-table">
          <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Despesas</th><th class="num">Investimentos</th><th class="num">Saldo</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${formatCurrency(tot.rec)}</td><td class="num">${formatCurrency(tot.desp)}</td><td class="num">${formatCurrency(tot.inv)}</td><td class="num">${formatCurrency(saldoAno)}</td></tr></tfoot>
        </table></div>
        <div class="row g-3 mt-1"><div class="col-12"><div class="chart-box"><h3 class="chart-box__title">Entradas, despesas e investimentos por mês</h3><canvas id="anualChart" height="120"></canvas></div></div></div>`;

      const { grid, text } = getChartTheme();
      drawChart('anualChart', {
        type: 'bar',
        data: { labels: MESES.map((m) => m.slice(0, 3)), datasets: [
          { label: 'Entradas', data: serie.rec, backgroundColor: '#10b981', borderRadius: 5, maxBarThickness: 22 },
          { label: 'Despesas', data: serie.desp, backgroundColor: '#ef4444', borderRadius: 5, maxBarThickness: 22 },
          { label: 'Investimentos', data: serie.inv, backgroundColor: '#8b5cf6', borderRadius: 5, maxBarThickness: 22 }
        ] },
        options: { responsive: true, plugins: { legend: { labels: { color: text, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${formatCurrency(x.raw)}` } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });
    }
  };

  // ==========================================================
  // MÓDULO: RELATÓRIOS
  // ==========================================================
  const REL_FILTROS_VAZIOS = { de: '', ate: '', tipo: '', categoria: '', tag: '', status: '', busca: '' };

  // Colunas ordenáveis: chave -> valor usado na comparação
  const REL_ORDENACAO = {
    mes: (e) => e.mes,
    descricao: (e) => String(e.description || '').toLowerCase(),
    categoria: (e) => String(e.category || '').toLowerCase(),
    valor: (e) => Number(e.value) || 0
  };

  const Relatorios = {
    state: { ...REL_FILTROS_VAZIOS, ordem: 'mes', dir: 'desc' },

    // varre todos os meses, marcando cada lançamento com o mês de origem
    allEntries() {
      const out = [];
      Object.keys(allData).forEach((key) => {
        if (!/^\d{4}-\d{2}$/.test(key)) return;
        (allData[key] || []).forEach((e) => out.push({ ...e, mes: key }));
      });
      return out;
    },

    filtered() {
      const f = this.state;
      const busca = f.busca.trim().toLowerCase();
      const lista = this.allEntries().filter((e) => {
        if (f.de && e.mes < f.de) return false;
        if (f.ate && e.mes > f.ate) return false;
        if (f.categoria && e.category !== f.categoria) return false;
        if (f.tag && e.person !== f.tag) return false;
        if (f.status && e.status !== f.status) return false;
        if (f.tipo && e.type !== f.tipo) return false;
        if (busca && !`${e.description} ${e.category} ${e.observation || ''}`.toLowerCase().includes(busca)) return false;
        return true;
      });
      return this.ordenar(lista);
    },

    ordenar(lista) {
      const chave = REL_ORDENACAO[this.state.ordem] || REL_ORDENACAO.mes;
      const sinal = this.state.dir === 'asc' ? 1 : -1;
      return lista.sort((a, b) => {
        const x = chave(a);
        const y = chave(b);
        if (x !== y) return (x < y ? -1 : 1) * sinal;
        // empate: mês mais recente primeiro, para a ordem não variar entre renders
        return a.mes < b.mes ? 1 : (a.mes > b.mes ? -1 : 0);
      });
    },

    toggleSort(chave) {
      if (!REL_ORDENACAO[chave]) return;
      if (this.state.ordem === chave) {
        this.state.dir = this.state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        this.state.ordem = chave;
        // texto começa de A→Z; mês e valor começam do maior
        this.state.dir = (chave === 'descricao' || chave === 'categoria') ? 'asc' : 'desc';
      }
      this.renderResult();
    },

    totais(lista) {
      const t = { entrada: 0, despesa: 0, investimento: 0 };
      lista.forEach((e) => { t[e.type] = (t[e.type] || 0) + (Number(e.value) || 0); });
      t.saldo = t.entrada - t.despesa - t.investimento;
      return t;
    },

    // Maiores despesas por categoria, para o gráfico
    porCategoria(lista) {
      const mapa = new Map();
      lista.forEach((e) => {
        if (e.type !== 'despesa') return;
        mapa.set(e.category, (mapa.get(e.category) || 0) + (Number(e.value) || 0));
      });
      return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    },

    mesLabel: (mes) => dayjs(`${mes}-01`).format('MMM/YYYY'),

    filtrosDescritos() {
      const f = this.state;
      const partes = [];
      if (f.de) partes.push(`de ${this.mesLabel(f.de)}`);
      if (f.ate) partes.push(`até ${this.mesLabel(f.ate)}`);
      if (f.tipo) partes.push(TYPE_LABELS[f.tipo] || f.tipo);
      if (f.categoria) partes.push(f.categoria);
      if (f.tag) partes.push(PERSON_LABELS[f.tag] || f.tag);
      if (f.status) partes.push(STATUS_LABELS[f.status] || f.status);
      if (f.busca.trim()) partes.push(`busca "${f.busca.trim()}"`);
      return partes.length ? partes.join(' · ') : 'todos os lançamentos';
    },
    render(c) {
      const f = this.state;
      const opt = (val, label, sel) => `<option value="${val}" ${val === sel ? 'selected' : ''}>${label}</option>`;
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-funnel app-icon"></i> Relatórios</h2>
          <p class="view-header__hint">Filtre e exporte seus lançamentos</p></div>
        </div>
        <div class="mod-filters">
          <div class="fm-field"><label for="rep_busca">Buscar</label><input type="search" id="rep_busca" class="fm-input" placeholder="Descrição, categoria ou observação" value="${escapeAttr(f.busca)}"></div>
          <div class="fm-field"><label for="rep_de">De (mês)</label><input type="month" id="rep_de" class="fm-input" value="${f.de}"></div>
          <div class="fm-field"><label for="rep_ate">Até (mês)</label><input type="month" id="rep_ate" class="fm-input" value="${f.ate}"></div>
          <div class="fm-field"><label for="rep_tipo">Tipo</label><select id="rep_tipo" class="fm-input">${opt('', 'Todos', f.tipo)}${opt('entrada', 'Entrada', f.tipo)}${opt('despesa', 'Despesa', f.tipo)}${opt('investimento', 'Investimento', f.tipo)}</select></div>
          <div class="fm-field"><label for="rep_categoria">Categoria</label><select id="rep_categoria" class="fm-input">${opt('', 'Todas', f.categoria)}${CATEGORIAS.map((x) => opt(x, x, f.categoria)).join('')}</select></div>
          <div class="fm-field"><label for="rep_tag">Tag</label><select id="rep_tag" class="fm-input">${opt('', 'Todas', f.tag)}${Object.entries(PERSON_LABELS).map(([v, l]) => opt(v, l, f.tag)).join('')}</select></div>
          <div class="fm-field"><label for="rep_status">Status</label><select id="rep_status" class="fm-input">${opt('', 'Todos', f.status)}${Object.entries(STATUS_LABELS).map(([v, l]) => opt(v, l, f.status)).join('')}</select></div>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-3 align-items-center">
          <span class="rep-hint"><i class="bi bi-lightning-charge-fill"></i> Os filtros aplicam sozinhos</span>
          <button class="btn btn-outline-secondary btn-sm" data-rep="clear"><i class="bi bi-x-circle"></i> Limpar filtros</button>
          <span class="flex-grow-1"></span>
          <button class="btn btn-outline-success btn-sm" data-rep="csv"><i class="bi bi-filetype-csv"></i> CSV</button>
          <button class="btn btn-outline-success btn-sm" data-rep="excel"><i class="bi bi-file-earmark-excel"></i> Excel</button>
          <button class="btn btn-outline-danger btn-sm" data-rep="pdf"><i class="bi bi-file-earmark-pdf"></i> PDF</button>
        </div>
        <div id="repResult"></div>`;
      this.renderResult();
    },
    // Cabeçalho clicável para ordenar
    th(chave, label, classe = '') {
      const ativo = this.state.ordem === chave;
      const icone = ativo ? (this.state.dir === 'asc' ? 'sort-up' : 'sort-down') : 'arrow-down-up';
      return `<th class="mod-th-sort${ativo ? ' is-active' : ''}${classe ? ' ' + classe : ''}" data-rep-sort="${chave}"
        tabindex="0" role="button" aria-label="Ordenar por ${label}"
        aria-sort="${ativo ? (this.state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${label} <i class="bi bi-${icone}"></i></th>`;
    },

    renderResult() {
      const el = document.getElementById('repResult');
      if (!el) return;

      const list = this.filtered();
      if (!list.length) {
        const temDados = this.allEntries().length > 0;
        el.innerHTML = emptyBlock('inbox', temDados
          ? 'Nenhum lançamento para os filtros selecionados.'
          : 'Ainda não há lançamentos para relatar.');
        return;
      }

      const tot = this.totais(list);
      const categorias = this.porCategoria(list);
      const rows = list.map((e) => `<tr>
          <td>${this.mesLabel(e.mes)}</td>
          <td>${escapeHtml(e.description)}</td>
          <td>${escapeHtml(TYPE_LABELS[e.type] || e.type)}</td>
          <td>${escapeHtml(e.category)}</td>
          <td>${escapeHtml(PERSON_LABELS[e.person] || '—')}</td>
          <td>${escapeHtml(STATUS_LABELS[e.status] || e.status)}</td>
          <td class="num">${formatCurrency(e.value)}</td>
        </tr>`).join('');

      el.innerHTML = `
        <div class="mod-summary">
          <div class="mod-summary__item"><span>Lançamentos</span><strong>${list.length}</strong></div>
          <div class="mod-summary__item"><span>Entradas</span><strong style="color:var(--app-income)">${formatCurrency(tot.entrada)}</strong></div>
          <div class="mod-summary__item"><span>Despesas</span><strong style="color:var(--app-expense)">${formatCurrency(tot.despesa)}</strong></div>
          <div class="mod-summary__item"><span>Investimentos</span><strong style="color:var(--app-investment)">${formatCurrency(tot.investimento)}</strong></div>
          <div class="mod-summary__item"><span>Saldo</span><strong style="color:${moneyColor(tot.saldo)}">${formatCurrency(tot.saldo)}</strong></div>
        </div>
        <div class="mod-table-wrap"><table class="mod-table">
          <thead><tr>
            ${this.th('mes', 'Mês')}
            ${this.th('descricao', 'Descrição')}
            <th>Tipo</th>
            ${this.th('categoria', 'Categoria')}
            <th>Tag</th>
            <th>Status</th>
            ${this.th('valor', 'Valor', 'num')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
        ${categorias.length ? `<div class="chart-box mt-3">
          <h3 class="chart-box__title">Despesas por categoria${categorias.length === 8 ? ' (top 8)' : ''}</h3>
          <div class="chart-box__area" style="height:${Math.max(180, categorias.length * 34)}px"><canvas id="repChart"></canvas></div>
        </div>` : ''}`;

      if (categorias.length) {
        const { grid, text } = getChartTheme();
        drawChart('repChart', {
          type: 'bar',
          data: {
            labels: categorias.map(([nome]) => nome),
            datasets: [{ data: categorias.map(([, valor]) => valor), backgroundColor: '#ef4444', borderRadius: 5 }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } },
            scales: {
              x: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } },
              y: { ticks: { color: text }, grid: { display: false } }
            }
          }
        });
      }
    },

    readFilters() {
      const g = (id) => document.getElementById(id)?.value || '';
      // preserva ordem/direção: só os filtros vêm da tela
      this.state = {
        ...this.state,
        busca: g('rep_busca'), de: g('rep_de'), ate: g('rep_ate'), tipo: g('rep_tipo'),
        categoria: g('rep_categoria'), tag: g('rep_tag'), status: g('rep_status')
      };
    },
    exportData(format) {
      this.readFilters(); // garante que a exportação use o que está na tela agora
      const list = this.filtered();
      if (!list.length) { notify.error('Nada para exportar com esses filtros.'); return; }

      const COL_VALOR = 6;
      const tot = this.totais(list);
      const header = ['Mês', 'Descrição', 'Tipo', 'Categoria', 'Tag', 'Status', 'Valor'];
      const rows = list.map((e) => [e.mes, e.description, TYPE_LABELS[e.type] || e.type, e.category, PERSON_LABELS[e.person] || '', STATUS_LABELS[e.status] || e.status, e.value]);
      const resumo = [
        ['', '', '', '', '', 'Entradas', tot.entrada],
        ['', '', '', '', '', 'Despesas', tot.despesa],
        ['', '', '', '', '', 'Investimentos', tot.investimento],
        ['', '', '', '', '', 'Saldo', tot.saldo]
      ];
      const stamp = dayjs().format('YYYY-MM-DD');

      if (format === 'csv') {
        // Aspas, ";" e quebras de linha na descrição quebrariam as colunas
        const celula = (v) => {
          const s = String(v ?? '');
          return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const linha = (r) => r.map((v, i) => celula(i === COL_VALOR && v !== '' ? formatValuePlain(v) : v)).join(';');
        const texto = [header.join(';'), ...rows.map(linha), '', ...resumo.map(linha)].join('\n');
        downloadBlob(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }), `relatorio-${stamp}.csv`);
      } else if (format === 'excel') {
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows, [], ...resumo]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, `relatorio-${stamp}.xlsx`);
      } else if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(15);
        doc.text('Relatório — Finanças da Casa', 14, 16);

        doc.setFontSize(9);
        const linhasFiltro = doc.splitTextToSize(`Filtros: ${this.filtrosDescritos()}`, 182);
        doc.text(linhasFiltro, 14, 22);

        const yTotais = 22 + linhasFiltro.length * 4.5;
        const linhasTotais = doc.splitTextToSize(
          `${list.length} lançamentos · Entradas ${formatCurrency(tot.entrada)} · Despesas ${formatCurrency(tot.despesa)} · Investimentos ${formatCurrency(tot.investimento)} · Saldo ${formatCurrency(tot.saldo)}`, 182);
        doc.text(linhasTotais, 14, yTotais);

        doc.autoTable({
          startY: yTotais + linhasTotais.length * 4.5 + 3,
          head: [header],
          body: rows.map((r) => r.map((v, i) => (i === COL_VALOR ? formatCurrency(v) : String(v)))),
          theme: 'striped',
          headStyles: { fillColor: [79, 110, 247] },
          styles: { fontSize: 8 },
          columnStyles: { [COL_VALOR]: { halign: 'right' } }
        });
        doc.save(`relatorio-${stamp}.pdf`);
      }
      notify.success('Relatório exportado!');
    }
  };

  // ==========================================================
  // ALERTAS
  // ==========================================================
  const computeAlerts = () => {
    const out = [];
    const entries = allData[getMonthKey(currentDate)] || [];
    entries.forEach((e) => {
      if (e.type === 'entrada' || e.status === 'pago' || !e.due_day) return;
      const dias = daysUntil(nextDueDate(e.due_day));
      if (dias === null) return;
      if (dias < 0) out.push({ level: 'red', icon: 'exclamation-octagon-fill', title: `${e.description} atrasada`, desc: `Venceu dia ${e.due_day} · ${formatCurrency(e.value)}` });
      else if (dias <= 3) out.push({ level: 'amber', icon: 'clock-fill', title: `${e.description} vence em ${dias}d`, desc: `Dia ${e.due_day} · ${formatCurrency(e.value)}` });
    });
    coll('metas').forEach((m) => {
      if (m.status === 'concluida' || !m.dataAlvo) return;
      const dias = daysUntil(m.dataAlvo);
      if (dias !== null && dias < 0) out.push({ level: 'amber', icon: 'bullseye', title: `Meta atrasada: ${m.nome}`, desc: `Faltam ${formatCurrency((m.valorObjetivo || 0) - metaAtual(m))}` });
    });
    coll('assinaturas').filter((a) => a.status !== 'cancelada' && a.vencimentoDia).forEach((a) => {
      const dias = daysUntil(nextDueDate(a.vencimentoDia));
      if (dias !== null && dias <= 3) out.push({ level: 'blue', icon: 'arrow-repeat', title: `${a.nome} vence em ${dias}d`, desc: `Conta fixa · ${formatCurrency(a.valor || 0)}` });
    });
    coll('cartoes').filter((k) => k.vencimento).forEach((k) => {
      const dias = daysUntil(nextDueDate(k.vencimento));
      if (dias !== null && dias <= 3) out.push({ level: 'amber', icon: 'credit-card-2-front', title: `Fatura ${k.nome} em ${dias}d`, desc: `Vence dia ${k.vencimento} · ${formatCurrency(Cartoes.faturaMes(k.id, currentDate))}` });
    });
    coll('reservas').filter((r) => r.objetivo).forEach((r) => {
      const saldo = reservaSaldo(r);
      if (saldo < r.objetivo * 0.5) out.push({ level: 'blue', icon: 'safe2', title: `Reserva baixa: ${r.nome}`, desc: `${pct(saldo, r.objetivo)}% do objetivo` });
    });
    return out.sort((a, b) => ({ red: 0, amber: 1, blue: 2 }[a.level] - { red: 0, amber: 1, blue: 2 }[b.level]));
  };

  const refreshAlerts = () => {
    const alerts = computeAlerts();
    const badge = document.getElementById('alertCount');
    if (badge) { badge.textContent = alerts.length; badge.hidden = alerts.length === 0; }
    const panel = document.getElementById('alertPanel');
    if (panel) {
      panel.innerHTML = alerts.length
        ? alerts.map((a) => `<div class="alert-item alert-item--${a.level}"><i class="bi bi-${a.icon} alert-item__icon"></i><div class="alert-item__body"><div class="alert-item__title">${escapeHtml(a.title)}</div><div class="alert-item__desc">${escapeHtml(a.desc)}</div></div></div>`).join('')
        : '<div class="alert-item"><div class="alert-item__body"><div class="alert-item__desc">Nenhum alerta no momento 🎉</div></div></div>';
    }
  };

  // ==========================================================
  // CONTROLADOR DE NAVEGAÇÃO
  // ==========================================================
  const MODULES = {
    metas: Metas, reservas: Reservas, cartoes: Cartoes,
    investimentos: Investimentos, patrimonio: Patrimonio,
    assinaturas: Assinaturas, dashboard: Dashboard, anual: Anual, relatorios: Relatorios
  };

  let activeTab = 'mes';

  const refreshActiveView = () => {
    if (activeTab === 'mes') return;
    const mod = MODULES[activeTab];
    const container = document.getElementById(`view-${activeTab}`);
    if (mod && container) mod.render(container);
  };

  const activate = (tab) => {
    activeTab = tab;
    document.querySelectorAll('.app-tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${tab}`));
    if (tab !== 'mes') refreshActiveView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delegação de eventos para todos os botões dos módulos
  const handleModuleClick = async (e) => {
    const tab = e.target.closest('.app-tab');
    if (tab) { activate(tab.dataset.tab); return; }

    const btn = e.target.closest('[data-mod]');
    if (btn) {
      const { mod, act, id } = btn.dataset;
      const M = MODULES[mod];
      if (!M) return;
      if (act === 'add') await M.add();
      else if (act === 'add-sug') await M.addFromSuggestion(btn.dataset.idx);
      else if (act === 'edit') await M.edit(id);
      else if (act === 'aporte') await M.aporte(id);
      else if (act === 'compra') await M.compra(id);
      else if (act === 'dep') await M.mov(id, 'deposito');
      else if (act === 'saq') await M.mov(id, 'saque');
      else if (act === 'del') {
        const ok = await confirmAction({ title: 'Excluir?', text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Sim, excluir' });
        if (ok) { removeItem(mod, id); notify.info('Item excluído.'); }
      }
      return;
    }

    const ordenar = e.target.closest('[data-rep-sort]');
    if (ordenar) { Relatorios.toggleSort(ordenar.dataset.repSort); return; }

    const rep = e.target.closest('[data-rep]');
    if (rep) {
      const act = rep.dataset.rep;
      if (act === 'clear') {
        Relatorios.state = { ...Relatorios.state, ...REL_FILTROS_VAZIOS };
        Relatorios.render(document.getElementById('view-relatorios'));
      } else Relatorios.exportData(act);
    }
  };

  // Filtros de relatório valem na hora: nada de clicar em "Aplicar" e esquecer
  const handleRelatorioFilter = (e) => {
    const alvo = e.target;
    if (!alvo?.id?.startsWith('rep_') || !alvo.closest('#view-relatorios')) return;
    // a busca reage a cada tecla; selects e datas, só ao mudar
    if (e.type === 'input' && alvo.id !== 'rep_busca') return;
    if (e.type === 'change' && alvo.id === 'rep_busca') return;
    Relatorios.readFilters();
    Relatorios.renderResult();
  };

  const handleRelatorioKeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const ordenar = e.target.closest?.('[data-rep-sort]');
    if (!ordenar) return;
    e.preventDefault();
    Relatorios.toggleSort(ordenar.dataset.repSort);
  };

  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================
  const TABS = [
    ['mes', 'house-door', 'Mês'],
    ['dashboard', 'speedometer2', 'Dashboard'],
    ['anual', 'calendar3', 'Anual'],
    ['metas', 'bullseye', 'Metas'],
    ['reservas', 'safe2', 'Reservas'],
    ['cartoes', 'credit-card-2-front', 'Cartões'],
    ['investimentos', 'graph-up-arrow', 'Investimentos'],
    ['patrimonio', 'houses', 'Patrimônio'],
    ['assinaturas', 'arrow-repeat', 'Contas fixas'],
    ['relatorios', 'funnel', 'Relatórios']
  ];

  const buildTabs = () => {
    const nav = document.getElementById('appTabsScroll');
    if (!nav) return;
    nav.innerHTML = TABS.map(([id, icon, label]) =>
      `<button type="button" class="app-tab ${id === 'mes' ? 'is-active' : ''}" data-tab="${id}"><i class="bi bi-${icon}"></i> ${label}</button>`
    ).join('');
  };

  const init = () => {
    buildTabs();
    document.addEventListener('click', handleModuleClick);
    document.addEventListener('input', handleRelatorioFilter);
    document.addEventListener('change', handleRelatorioFilter);
    document.addEventListener('change', handleInvestGroupChange);
    document.addEventListener('keydown', handleRelatorioKeydown);

    // Mantém dashboard/anual/relatórios sincronizados ao trocar de mês/ano
    ['selectMonth', 'selectYear'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => setTimeout(refreshActiveView, 0)));
    ['btnPrevMonth', 'btnNextMonth'].forEach((id) => document.getElementById(id)?.addEventListener('click', () => setTimeout(refreshActiveView, 0)));

    refreshAlerts();
  };

  // Hook chamado por render() em script.js após cada atualização de dados
  window.AppModules = {
    onDataRender() { refreshAlerts(); if (activeTab !== 'mes') refreshActiveView(); },
    activate
  };

  document.addEventListener('DOMContentLoaded', init);
})();
