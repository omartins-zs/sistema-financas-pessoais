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
    // Investimentos (e outros módulos) alimentam as tiles/Sobra da própria aba Mês
    // (ex.: categoria criada com Data de início no mês atual) — mantém em dia mesmo
    // sem o usuário sair da aba do módulo.
    if (typeof render === 'function') render();
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
    // Campos de dinheiro ganham a mesma máscara do lançamento do mês (separador de
    // milhar, vírgula decimal, só números) — os inputs nascem como texto puro porque
    // o IMask só é aplicado depois que o SweetAlert2 desenha o popup (didOpen).
    const moneyMasks = {};
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
      didOpen: () => {
        fields.filter((f) => f.type === 'money').forEach((f) => {
          const el = document.getElementById(`fm_${f.name}`);
          if (el) moneyMasks[f.name] = IMask(el, moneyMaskOptions);
        });
      },
      preConfirm: () => {
        const out = {};
        for (const f of fields) {
          const elx = document.getElementById(`fm_${f.name}`);
          let v = elx ? elx.value : '';
          if (f.type === 'money') v = getMaskValue(moneyMasks[f.name]);
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
  // MÓDULO: INVESTIMENTOS (refeito do zero)
  // ----------------------------------------------------------
  //  Regra única:
  //   • Categoria (Reserva de emergência, Enxoval do bebê, Caixinha Turbo…) é
  //     criada aqui e guarda só nome, onde está aplicada, meta e rendimento.
  //   • Dinheiro entra SÓ pelos lançamentos do Mês a mês com Tipo = Investimento
  //     e a categoria escolhida (entry.investimento_id).
  //   • Investido = soma desses lançamentos, de todos os meses.
  //   • Rendimento = ajuste em R$ (saldo do banco − investido) gravado quando o
  //     usuário clica em "Atualizar saldo". Novos aportes continuam somando no
  //     saldo sem o rendimento "envelhecer".
  // ==========================================================
  const TIPOS_INVEST = ['Caixinha / Conta remunerada', 'Poupança', 'CDB', 'Tesouro Direto', 'Fundos', 'Ações', 'FIIs', 'Criptomoedas', 'Outros'];
  const MES_KEY_RE = /^\d{4}-\d{2}$/;
  const invMesLabel = (k) => { const [y, m] = k.split('-'); return `${MESES[Number(m) - 1].slice(0, 3)}/${y}`; };
  const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const fmtSinal = (v) => `${sinal(v)} ${formatCurrency(Math.abs(v))}`.trim();

  // Todos os lançamentos de investimento de todos os meses (ordem cronológica)
  const invAportes = () => {
    const out = [];
    Object.keys(allData).filter((k) => MES_KEY_RE.test(k)).forEach((k) => {
      (allData[k] || []).forEach((e) => {
        if (!e || e.type !== 'investimento') return;
        out.push({ mes: k, id: e.id, catId: e.investimento_id || '', descricao: e.description || '', valor: Number(e.value) || 0 });
      });
    });
    return out.sort((a, b) => a.mes.localeCompare(b.mes));
  };

  // Lista contínua de meses (inclui os meses sem aporte, que aparecem com "—")
  const invMeses = (aportes) => {
    if (!aportes.length) return [];
    const atual = getMonthKey(currentDate);
    const fim = aportes[aportes.length - 1].mes > atual ? aportes[aportes.length - 1].mes : atual;
    const out = [];
    let d = dayjs(`${aportes[0].mes}-01`);
    while (d.format('YYYY-MM') <= fim && out.length < 240) { out.push(d.format('YYYY-MM')); d = d.add(1, 'month'); }
    return out;
  };

  const Investimentos = {
    fields: (i = {}) => [
      { name: 'instituicao', label: 'Nome da categoria', type: 'text', required: true, value: i.instituicao, placeholder: 'Ex: Reserva de emergência, Enxoval do bebê', wide: true },
      { name: 'tipo', label: 'Onde está aplicado', type: 'select', value: TIPOS_INVEST.includes(i.tipo) ? i.tipo : 'Outros', options: TIPOS_INVEST.map((t) => ({ value: t, label: t })) },
      { name: 'meta', label: 'Meta em R$ (opcional)', type: 'money', value: i.meta ? formatValuePlain(i.meta) : '' }
    ],
    async add() {
      const v = await formModal({ title: 'Nova categoria de investimento', icon: 'graph-up-arrow', fields: this.fields(), confirmText: 'Criar' });
      if (!v) return;
      upsert('investimentos', { id: generateId(), instituicao: v.instituicao, tipo: v.tipo, meta: v.meta || 0, rendimento: 0 });
      notify.success('Categoria criada! No Mês a mês, lance com Tipo "Investimento" e escolha esta categoria.');
    },
    async edit(id) {
      const i = coll('investimentos').find((x) => x.id === id);
      if (!i) return;
      const v = await formModal({ title: 'Editar categoria', icon: 'pencil-square', fields: this.fields(i) });
      if (!v) return;
      upsert('investimentos', { id: i.id, instituicao: v.instituicao, tipo: v.tipo, meta: v.meta || 0, rendimento: Number(i.rendimento) || 0, ...(i.rendimentoEm ? { rendimentoEm: i.rendimentoEm } : {}) });
      notify.success('Categoria atualizada!');
    },
    async excluir(id) {
      const i = coll('investimentos').find((x) => x.id === id);
      if (!i) return;
      const n = invAportes().filter((a) => a.catId === id).length;
      const ok = await confirmAction({
        title: `Excluir "${i.instituicao}"?`,
        text: n ? `${n} lançamento(s) do Mês a mês estão nesta categoria. Eles NÃO serão apagados — vão aparecer como "Sem categoria".` : 'Nenhum lançamento usa esta categoria.',
        icon: 'warning',
        confirmText: 'Sim, excluir'
      });
      if (!ok) return;
      removeItem('investimentos', id);
      notify.info('Categoria excluída.');
    },
    // Usuário informa o saldo que o banco mostra hoje → rendimento = saldo − investido
    async saldo(id) {
      const i = coll('investimentos').find((x) => x.id === id);
      if (!i) return;
      const r = this.resumo(i, invAportes());
      const v = await formModal({
        title: `Atualizar saldo — ${i.instituicao}`,
        icon: 'arrow-repeat',
        confirmText: 'Atualizar',
        fields: [{ name: 'saldo', label: `Saldo que aparece hoje no banco (investido: ${formatCurrency(r.investido)})`, type: 'money', required: true, value: formatValuePlain(r.saldo), wide: true }]
      });
      if (!v) return;
      const rendimento = Math.round((v.saldo - r.investido) * 100) / 100;
      upsert('investimentos', { ...i, rendimento, rendimentoEm: today().format('YYYY-MM-DD') });
      notify.success(`Rendimento: ${fmtSinal(rendimento)}`);
    },
    resumo(cat, aportes) {
      const lista = aportes.filter((a) => a.catId === cat.id);
      const investido = sum(lista, (a) => a.valor);
      const rendimento = Number(cat.rendimento) || 0;
      return { lista, investido, rendimento, saldo: investido + rendimento, pct: investido > 0 ? (rendimento / investido) * 100 : 0 };
    },
    totais() {
      const aportes = invAportes();
      const cats = coll('investimentos');
      const ids = new Set(cats.map((c) => c.id));
      const semCat = aportes.filter((a) => !ids.has(a.catId));
      const investido = sum(aportes, (a) => a.valor);
      const rendimento = sum(cats, (c) => Number(c.rendimento) || 0);
      return { aportes, cats, semCat, investido, rendimento, total: investido + rendimento };
    },
    card(cat, r) {
      const corR = r.rendimento > 0 ? 'var(--app-income)' : r.rendimento < 0 ? 'var(--app-expense)' : 'var(--app-text-muted)';
      const ultimo = r.lista[r.lista.length - 1];
      const meta = Number(cat.meta) || 0;
      return `
        <article class="mod-card inv-card">
          <div class="mod-card__top align-items-start">
            <div>
              <h3 class="mod-card__title">${escapeHtml(cat.instituicao)}</h3>
              <span class="mod-badge mod-badge--violet">${escapeHtml(cat.tipo || 'Outros')}</span>
            </div>
            <div class="d-flex gap-1">
              <button class="mod-btn" data-mod="investimentos" data-act="edit" data-id="${cat.id}" title="Editar"><i class="bi bi-pencil-fill"></i></button>
              <button class="mod-btn mod-btn--danger" data-mod="investimentos" data-act="excluir" data-id="${cat.id}" title="Excluir"><i class="bi bi-trash-fill"></i></button>
            </div>
          </div>
          <div class="inv-card__saldo">
            <span>Saldo atualizado</span>
            <strong>${formatCurrency(r.saldo)}</strong>
            <small>${cat.rendimentoEm ? `Saldo conferido em ${fmtDate(cat.rendimentoEm)}` : 'Rendimento ainda não informado'}</small>
          </div>
          <div class="inv-card__grid">
            <div><span>Investido</span><strong>${formatCurrency(r.investido)}</strong><small>${r.lista.length} aporte(s)</small></div>
            <div><span>Rendimento</span><strong style="color:${corR}">${fmtSinal(r.rendimento)}</strong><small style="color:${corR}">${sinal(r.pct)}${Math.abs(r.pct).toFixed(2)}%</small></div>
          </div>
          ${meta > 0 ? `<div class="mt-2">${progressBar(r.saldo, meta, 'var(--app-investment)')}</div>` : ''}
          ${r.lista.length ? (() => {
            let acc = 0;
            const itens = r.lista.map((a) => ({ ...a, acc: (acc += a.valor) })).reverse();
            return `
            <details class="inv-det">
              <summary class="inv-det__sum">
                <span><i class="bi bi-list-ul"></i> Aportes <span class="inv-det__count">${r.lista.length}</span></span>
                <span class="inv-det__last">último em ${invMesLabel(ultimo.mes)} <i class="bi bi-chevron-down inv-det__chev"></i></span>
              </summary>
              <ul class="inv-tl">
                ${itens.map((a) => {
                  const [y, m] = a.mes.split('-');
                  return `<li class="inv-tl__item">
                    <div class="inv-tl__date"><strong>${MESES[Number(m) - 1].slice(0, 3)}</strong><small>${y}</small></div>
                    <div class="inv-tl__body">
                      <span class="inv-tl__desc">${escapeHtml(a.descricao || 'Aporte')}</span>
                      <small class="inv-tl__acc">Acumulado: ${formatCurrency(a.acc)}</small>
                    </div>
                    <strong class="inv-tl__val">+ ${formatCurrency(a.valor)}</strong>
                  </li>`;
                }).join('')}
              </ul>
            </details>`;
          })() : '<p class="mod-card__sub mt-2 mb-0"><i class="bi bi-info-circle"></i> Nenhum aporte ainda. Lance no Mês a mês com Tipo "Investimento".</p>'}
          <button class="btn btn-sm btn-outline-primary w-100 mt-3" data-mod="investimentos" data-act="saldo" data-id="${cat.id}">
            <i class="bi bi-arrow-repeat"></i> Atualizar saldo (rendimento)
          </button>
        </article>`;
    },
    tabela(t, resumos) {
      const meses = invMeses(t.aportes);
      if (!meses.length) return '';
      const cols = t.cats.map((c) => ({ id: c.id, nome: c.instituicao }));
      if (t.semCat.length) cols.push({ id: '__sem', nome: 'Sem categoria' });
      const ids = new Set(t.cats.map((c) => c.id));
      const colDe = (a) => (ids.has(a.catId) ? a.catId : '__sem');
      const mapa = {}; // mapa[mes][col] = soma
      t.aportes.forEach((a) => { const c = colDe(a); (mapa[a.mes] ||= {}); mapa[a.mes][c] = (mapa[a.mes][c] || 0) + a.valor; });
      const totCol = {};
      t.aportes.forEach((a) => { const c = colDe(a); totCol[c] = (totCol[c] || 0) + a.valor; });
      const rendCol = (id) => (resumos[id] ? resumos[id].rendimento : 0);
      const cel = (v) => (v ? formatCurrency(v) : '<span class="inv-zero">—</span>');
      const mesAtual = getMonthKey(currentDate);

      const linhas = meses.map((m) => {
        const tot = sum(cols, (c) => mapa[m]?.[c.id] || 0);
        return `<tr class="${m === mesAtual ? 'inv-row--atual' : ''}">
          <td>${invMesLabel(m)}</td>
          ${cols.map((c) => `<td class="num">${cel(mapa[m]?.[c.id] || 0)}</td>`).join('')}
          <td class="num"><strong>${cel(tot)}</strong></td>
        </tr>`;
      }).join('');

      const rendTotal = sum(cols, (c) => rendCol(c.id));
      return `
        <div class="chart-box mt-4">
          <h3 class="chart-box__title"><i class="bi bi-table"></i> Aportes mês a mês</h3>
          <div class="mod-table-wrap"><table class="mod-table inv-table">
            <thead><tr><th>Mês</th>${cols.map((c) => `<th class="num">${escapeHtml(c.nome)}</th>`).join('')}<th class="num">Total do mês</th></tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot>
              <tr><td>Total investido</td>${cols.map((c) => `<td class="num">${formatCurrency(totCol[c.id] || 0)}</td>`).join('')}<td class="num">${formatCurrency(t.investido)}</td></tr>
              <tr class="inv-foot-sub"><td>Rendimento</td>${cols.map((c) => `<td class="num" style="color:${moneyColor(rendCol(c.id))}">${fmtSinal(rendCol(c.id)) || formatCurrency(0)}</td>`).join('')}<td class="num" style="color:${moneyColor(rendTotal)}">${fmtSinal(rendTotal) || formatCurrency(0)}</td></tr>
              <tr><td>Saldo atualizado</td>${cols.map((c) => `<td class="num" style="color:var(--app-investment)">${formatCurrency((totCol[c.id] || 0) + rendCol(c.id))}</td>`).join('')}<td class="num" style="color:var(--app-investment)">${formatCurrency(t.total)}</td></tr>
            </tfoot>
          </table></div>
        </div>`;
    },
    render(c) {
      const t = this.totais();
      const resumos = {};
      t.cats.forEach((cat) => { resumos[cat.id] = this.resumo(cat, t.aportes); });
      const pctTotal = t.investido > 0 ? (t.rendimento / t.investido) * 100 : 0;
      const mesAtual = getMonthKey(currentDate);
      const doMes = sum(t.aportes.filter((a) => a.mes === mesAtual), (a) => a.valor);
      const ordenadas = [...t.cats].sort((a, b) => resumos[b.id].saldo - resumos[a.id].saldo);

      c.innerHTML = `
        <div class="view-header">
          <div>
            <h2 class="h4"><i class="bi bi-graph-up-arrow app-icon"></i> Investimentos</h2>
            <p class="view-header__hint">O investido de cada categoria é a soma dos lançamentos do Mês a mês com Tipo "Investimento".</p>
          </div>
          <button class="btn btn-primary" data-mod="investimentos" data-act="add"><i class="bi bi-plus-lg"></i> Nova categoria</button>
        </div>
        ${t.cats.length || t.aportes.length ? `
          <div class="mod-summary">
            <div class="mod-summary__item"><span>Total investido</span><strong>${formatCurrency(t.investido)}</strong></div>
            <div class="mod-summary__item"><span>Rendimento</span><strong style="color:${moneyColor(t.rendimento)}">${fmtSinal(t.rendimento) || formatCurrency(0)} <small>(${sinal(pctTotal)}${Math.abs(pctTotal).toFixed(2)}%)</small></strong></div>
            <div class="mod-summary__item"><span>Saldo atualizado</span><strong style="color:var(--app-investment)">${formatCurrency(t.total)}</strong></div>
            <div class="mod-summary__item"><span>Aportado em ${invMesLabel(mesAtual)}</span><strong>${formatCurrency(doMes)}</strong></div>
          </div>
          ${t.cats.length ? `<div class="mod-grid">${ordenadas.map((cat) => this.card(cat, resumos[cat.id])).join('')}</div>` : emptyBlock('graph-up-arrow', 'Crie uma categoria (ex: Reserva de emergência) para organizar seus aportes.')}
          ${this.tabela(t, resumos)}
        ` : emptyBlock('graph-up-arrow', 'Nenhuma categoria ainda. Clique em "Nova categoria" (ex: Reserva de emergência, Enxoval do bebê) e depois lance os aportes no Mês a mês com Tipo "Investimento".')}`;
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
      // Tile/gráfico "Investimentos" também somam o que foi cadastrado direto na aba
      // Investimentos com Data de início neste mês — mas o Saldo NÃO usa esse extra:
      // é dinheiro que já existia, só catalogado agora, não saiu do caixa este mês.
      s.investmentExibido = s.investment + investimentoAtribuidoAoMes(getMonthKey(currentDate));
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
        <div class="row g-3 mb-3">
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Despesas por categoria (mês)</h3><canvas id="dashChartCat" height="220"></canvas></div></div>
          <div class="col-md-6"><div class="chart-box"><h3 class="chart-box__title">Despesas por pessoa (mês)</h3><canvas id="dashChartPessoa" height="220"></canvas></div></div>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-8"><div class="chart-box"><h3 class="chart-box__title">Entradas x Despesas (12 meses)</h3><canvas id="dashChartRecDesp" height="160"></canvas></div></div>
          <div class="col-md-4"><div class="chart-box"><h3 class="chart-box__title">Investimentos por categoria</h3><canvas id="dashChartInv" height="220"></canvas></div></div>
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
        data: { labels: ['Entradas', 'Despesas', 'Investimentos'], datasets: [{ data: [s.income, s.expense, s.investmentExibido ?? s.investment], backgroundColor: ['#10b981', '#ef4444', '#8b5cf6'], borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => formatCurrency(x.raw) } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });
      // evolução do saldo dos últimos 12 meses — só com lançamentos reais (mesma regra
      // do Mês tab: o que foi catalogado direto na carteira não sai do caixa)
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

      // Rosca reutilizável: mostra valor e % no tooltip; sem dados = aviso no lugar do gráfico
      const rosca = (id, labels, valores, cores = CHART_COLORS) => {
        const cv = document.getElementById(id);
        if (!cv) return;
        const total = sum(valores);
        if (!total) {
          if (charts[id]) { charts[id].destroy(); delete charts[id]; }
          cv.replaceWith(Object.assign(document.createElement('p'), { className: 'text-muted mb-0', textContent: 'Sem dados neste período.' }));
          return;
        }
        drawChart(id, {
          type: 'doughnut',
          data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 0, hoverOffset: 8 }] },
          options: { responsive: true, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: text, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => `${x.label}: ${formatCurrency(x.raw)} (${((x.raw / total) * 100).toFixed(1)}%)` } } } }
        });
      };

      const despesas = entries.filter((e) => e.type === 'despesa');

      // Despesas por categoria — top 7 + "Outras"
      const porCat = {};
      despesas.forEach((e) => { const k = e.category || 'Sem categoria'; porCat[k] = (porCat[k] || 0) + (Number(e.value) || 0); });
      const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
      const topCats = cats.slice(0, 7);
      if (cats.length > 7) topCats.push(['Outras', sum(cats.slice(7), (c) => c[1])]);
      rosca('dashChartCat', topCats.map((c) => c[0]), topCats.map((c) => c[1]));

      // Despesas por pessoa
      const porPessoa = {};
      despesas.forEach((e) => { const k = e.person || 'casa'; porPessoa[k] = (porPessoa[k] || 0) + (Number(e.value) || 0); });
      const pessoas = Object.keys(porPessoa);
      const corPessoa = { gabriel: '#3b82f6', barbara: '#ec4899', casa: '#f59e0b' };
      rosca('dashChartPessoa', pessoas.map((p) => (typeof PERSON_LABELS !== 'undefined' && PERSON_LABELS[p]) || p), pessoas.map((p) => porPessoa[p]), pessoas.map((p, i) => corPessoa[p] || CHART_COLORS[i % CHART_COLORS.length]));

      // Entradas x Despesas — 12 meses
      const rec = [], desp = [];
      for (let i = 11; i >= 0; i--) {
        const sm = calculateSummary(allData[getMonthKey(currentDate.subtract(i, 'month'))] || []);
        rec.push(sm.income); desp.push(sm.expense);
      }
      drawChart('dashChartRecDesp', {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Entradas', data: rec, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.12)', fill: true, tension: 0.35, pointRadius: 3 },
          { label: 'Despesas', data: desp, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.10)', fill: true, tension: 0.35, pointRadius: 3 }
        ] },
        options: { responsive: true, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: text, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${formatCurrency(x.raw)}` } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });

      // Investimentos por categoria (saldo atualizado de cada uma)
      const t = Investimentos.totais();
      const invCats = t.cats.map((c) => [c.instituicao, Investimentos.resumo(c, t.aportes).saldo]);
      if (t.semCat.length) invCats.push(['Sem categoria', sum(t.semCat, (a) => a.valor)]);
      rosca('dashChartInv', invCats.map((c) => c[0]), invCats.map((c) => c[1]));
    }
  };

  // ==========================================================
  // MÓDULO: PLANEJAMENTO ANUAL
  // ==========================================================
  const Anual = {
    render(c) {
      const ano = currentDate.year();
      // Investimentos ficam só na aba Investimentos — aqui o saldo é Entradas − Despesas.
      let tot = { rec: 0, desp: 0 };
      const serie = { rec: [], desp: [] };
      const rows = MESES.map((mes, i) => {
        const key = dayjs(`${ano}-${String(i + 1).padStart(2, '0')}-01`).format('YYYY-MM');
        const s = calculateSummary(allData[key] || []);
        const saldo = s.income - s.expense;
        tot.rec += s.income; tot.desp += s.expense;
        serie.rec.push(s.income); serie.desp.push(s.expense);
        return `<tr>
          <td>${mes}</td>
          <td class="num" style="color:var(--app-income)">${formatCurrency(s.income)}</td>
          <td class="num" style="color:var(--app-expense)">${formatCurrency(s.expense)}</td>
          <td class="num" style="color:${moneyColor(saldo)};font-weight:700">${formatCurrency(saldo)}</td>
        </tr>`;
      }).join('');
      const saldoAno = tot.rec - tot.desp;
      c.innerHTML = `
        <div class="view-header">
          <div><h2 class="h4"><i class="bi bi-calendar3 app-icon"></i> Planejamento anual</h2>
          <p class="view-header__hint">Janeiro a dezembro de ${ano} (mude o ano no topo)</p></div>
        </div>
        <div class="mod-summary">
          <div class="mod-summary__item"><span>Entradas no ano</span><strong style="color:var(--app-income)">${formatCurrency(tot.rec)}</strong></div>
          <div class="mod-summary__item"><span>Despesas no ano</span><strong style="color:var(--app-expense)">${formatCurrency(tot.desp)}</strong></div>
          <div class="mod-summary__item"><span>Saldo do ano</span><strong style="color:${moneyColor(saldoAno)}">${formatCurrency(saldoAno)}</strong></div>
        </div>
        <div class="mod-table-wrap"><table class="mod-table">
          <thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Despesas</th><th class="num">Saldo</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Total</td><td class="num">${formatCurrency(tot.rec)}</td><td class="num">${formatCurrency(tot.desp)}</td><td class="num">${formatCurrency(saldoAno)}</td></tr></tfoot>
        </table></div>
        <div class="row g-3 mt-1"><div class="col-12"><div class="chart-box"><h3 class="chart-box__title">Entradas e despesas por mês</h3><canvas id="anualChart" height="120"></canvas></div></div></div>`;

      const { grid, text } = getChartTheme();
      drawChart('anualChart', {
        type: 'bar',
        data: { labels: MESES.map((m) => m.slice(0, 3)), datasets: [
          { label: 'Entradas', data: serie.rec, backgroundColor: '#10b981', borderRadius: 5, maxBarThickness: 22 },
          { label: 'Despesas', data: serie.desp, backgroundColor: '#ef4444', borderRadius: 5, maxBarThickness: 22 }
        ] },
        options: { responsive: true, plugins: { legend: { labels: { color: text, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${formatCurrency(x.raw)}` } } }, scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { beginAtZero: true, ticks: { color: text, callback: (v) => formatCurrency(v) }, grid: { color: grid } } } }
      });
    }
  };

  // ==========================================================
  // MÓDULO: PASSEIOS (do casal)
  // ==========================================================
  const TIPOS_PASSEIO = [
    'Praia', 'Restaurante', 'Parque', 'Trilha / Natureza', 'Cultural (museu, show)',
    'Bar / Balada', 'Viagem / Cidade', 'Evento', 'Outro'
  ];

  const passeioRankPrioridade = { alta: 0, media: 1, baixa: 2 };

  // Ícone + cor de destaque por categoria — dá pra reconhecer o tipo de passeio de longe
  const PASSEIO_CATEGORIA_META = {
    'Praia': { icon: 'water', cor: '#0ea5e9' },
    'Restaurante': { icon: 'cup-hot-fill', cor: '#f59e0b' },
    'Parque': { icon: 'tree-fill', cor: '#22c55e' },
    'Trilha / Natureza': { icon: 'signpost-split-fill', cor: '#16a34a' },
    'Cultural (museu, show)': { icon: 'easel2-fill', cor: '#8b5cf6' },
    'Bar / Balada': { icon: 'cup-straw', cor: '#ec4899' },
    'Viagem / Cidade': { icon: 'buildings-fill', cor: '#6366f1' },
    'Evento': { icon: 'mic-fill', cor: '#f43f5e' },
    'Outro': { icon: 'geo-alt-fill', cor: '#94a3b8' }
  };
  const PASSEIO_PRIOR_ICON = { alta: 'fire', media: 'star-fill', baixa: 'hourglass-split' };


  // Listas que o usuário passou no chat — pré-carregadas no importador em lote como modelo
  const PASSEIOS_SEED_VISITADOS = ["MC Donald's", "Burger King", "Popeyes", "Kyoichi Sushi (Rodízio de Japa)", "Greggus Lanches (Lanche Grego)", "Parque Villa Lobos", "Cinema (Center Norte)", "Casa das Rosas", "Mequi 1000", "Av. Paulista", "Mirante Sesc", "Hamburgueria ZDelli", "Show Pagode (Dilsinho, Péricles - Juventus)", "Show Reggae (Armandinho - Áudio Club)", "Stand-up (Um Show Comedy)", "Corrida/caminhada de rua (Corrida do Café)", "Açaí (Eloá)", "Estância Caipira", "Bosque Maia", "Butequim do Espeto", "The Best Açaí", "Vivenda do camarão", "Berlim (pizzaria na Zona Norte)"];
  const PASSEIOS_SEED_DESEJO = ["CTN", "Show de sertanejo (J&M ou H&J ou Zé Neto e Cristiano)", "Bar dos Arcos", "Bar da Geladeira", "Rodízio de Lanches", "Rodízio de Pizza", "Kinoplex (Cinema Luxo)", "Hamburgueria São Carlos", "Hamburgueria Tradi (Ipiranga)", "Hamburgueria Johns Burguer (Casa Verde)", "Motel 5 Estrelas kkkkkkkk"];

  // Chute de categoria a partir do nome, no mesmo espírito de guessBankCategory
  const PASSEIO_CATEGORIA_HINTS = [
    [/hamburgueria|rodízio|rodizio|lanches|pizza|açaí|acai|espeto|camar[aã]o|sushi|mc\s*donald|burger king|popeyes|mequi|estancia|estância|churrasc/i, 'Restaurante'],
    [/\bbar\b|balada|geladeira|arcos|butequim/i, 'Bar / Balada'],
    [/show|stand-?up|comedy|pagode|reggae|sertanejo/i, 'Evento'],
    [/corrida|caminhada/i, 'Evento'],
    [/cinema|kinoplex|teatro|museu|casa das rosas/i, 'Cultural (museu, show)'],
    [/parque|bosque|mirante/i, 'Parque'],
    [/\bav\.|avenida|paulista/i, 'Viagem / Cidade'],
    [/motel/i, 'Outro']
  ];
  const guessPasseioCategoria = (nome) => {
    for (const [re, cat] of PASSEIO_CATEGORIA_HINTS) if (re.test(nome)) return cat;
    return 'Outro';
  };


  const Passeios = {
    filtro: 'todos', // 'todos' | 'visitados' | 'pendentes'

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
          <button class="btn btn-light text-muted fw-semibold shadow-sm btn-sm" data-rep="clear"><i class="bi bi-x-circle"></i> Limpar filtros</button>
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
    assinaturas: Assinaturas, dashboard: Dashboard, anual: Anual, relatorios: Relatorios, passeios: Passeios
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
      else if (act === 'visit') await M.marcarVisitado(id);
      else if (act === 'unvisit') await M.desmarcarVisitado(id);
      else if (act === 'saldo') await M.saldo(id);
      else if (act === 'excluir') await M.excluir(id);
      
      else if (act === 'del') {
        const ok = await confirmAction({ title: 'Excluir?', text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Sim, excluir' });
        if (ok) { removeItem(mod, id); notify.info('Item excluído.'); }
      }
      return;
    }

    const ordenar = e.target.closest('[data-rep-sort]');
    if (ordenar) { Relatorios.toggleSort(ordenar.dataset.repSort); return; }

    const filtroPasseio = e.target.closest('[data-passeio-filtro]');
    if (filtroPasseio) { Passeios.filtro = filtroPasseio.dataset.passeioFiltro; refreshActiveView(); return; }

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
    ['investimentos', 'graph-up-arrow', 'Investimentos'],
    ['passeios', 'geo-alt', 'Passeios'],
    ['metas', 'bullseye', 'Metas'],
    ['reservas', 'safe2', 'Reservas'],
    ['cartoes', 'credit-card-2-front', 'Cartões'],
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


