// ============================================
// Backups, recuperação e log de auditoria
// ============================================
const MODULOS_BACKUP = ['metas', 'reservas', 'cartoes', 'comprasCartao', 'investimentos', 'patrimonio', 'assinaturas', 'passeios'];
const isChaveMes = (k) => /^\d{4}-\d{2}$/.test(k);

// Percorre todos os ids (lançamentos, itens de módulos e sub-itens) de um conjunto de dados
const coletarIdsDados = (data) => {
  const ids = new Set();
  if (!data || typeof data !== 'object') return ids;
  Object.keys(data).filter(isChaveMes).forEach((k) => {
    (Array.isArray(data[k]) ? data[k] : []).forEach((e) => { if (e?.id) ids.add(e.id); });
  });
  const app = data.__app || {};
  MODULOS_BACKUP.forEach((c) => {
    (Array.isArray(app[c]) ? app[c] : []).forEach((it) => {
      if (it?.id) ids.add(it.id);
      (it?.aportes || []).forEach((a) => { if (a?.id) ids.add(a.id); });
      (it?.movimentacoes || []).forEach((m) => { if (m?.id) ids.add(m.id); });
    });
  });
  return ids;
};

const recarregarTelaAposDados = () => {
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  render();
};

// Restaura EXATAMENTE o estado de um backup de um jeito que a sincronização respeite:
// tudo que está no backup ganha carimbo novo (vence a nuvem) e o que não existia
// no backup vira exclusão registrada. Antes, tira uma cópia completa do estado atual.
const restaurarDadosCompletos = async (snapshot, origem = 'backup') => {
  if (!snapshot || typeof snapshot !== 'object') return false;
  try { await AppStorage.backupNow?.(allData, `antes de restaurar ${origem}`); } catch {}

  const restored = JSON.parse(JSON.stringify(snapshot));
  const now = Date.now();
  if (!restored.__app || typeof restored.__app !== 'object') restored.__app = {};

  const idsBackup = coletarIdsDados(restored);
  const carimbar = (item) => { if (item && typeof item === 'object' && item.id) item._updatedAt = now; };
  Object.keys(restored).filter(isChaveMes).forEach((k) => {
    if (Array.isArray(restored[k])) restored[k].forEach(carimbar);
  });
  MODULOS_BACKUP.forEach((c) => {
    (Array.isArray(restored.__app[c]) ? restored.__app[c] : []).forEach((it) => {
      carimbar(it);
      (it?.aportes || []).forEach(carimbar);
      (it?.movimentacoes || []).forEach(carimbar);
    });
  });

  const deleted = { ...(allData.__app?._deleted || {}), ...(restored.__app._deleted || {}) };
  idsBackup.forEach((id) => delete deleted[id]);
  coletarIdsDados(allData).forEach((id) => {
    if (!idsBackup.has(id)) deleted[id] = now;
  });
  restored.__app._deleted = deleted;
  // Mantém a auditoria atual (o histórico nunca é apagado por uma restauração)
  restored.__app.historico = cloneDados(allData.__app?.historico || []);
  if (restored.__app.categorias) restored.__app._categoriasUpdatedAt = now;

  AppStorage.markDirtyIds?.([...idsBackup]);
  allData = restored;
  registrarHistoricoInfo(`restaurou ${origem}`);
  recarregarTelaAposDados();
  saveData();
  AppStorage.registrarLog?.('restaurou', `restaurou ${origem}`, { contagem: AppStorage.contarDados?.(restored) });
  return true;
};

// Recupera só o que SUMIU (itens do backup que não existem mais), sem mexer em nada que já está aí
const recuperarItensFaltantes = (snapshot, origem = 'backup') => {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  let total = 0;
  const now = Date.now();

  Object.keys(snapshot).filter(isChaveMes).forEach((mes) => {
    const atual = Array.isArray(allData[mes]) ? allData[mes] : [];
    const idsAtuais = new Set(atual.map((e) => e.id));
    const faltando = (Array.isArray(snapshot[mes]) ? snapshot[mes] : []).filter((e) => e?.id && !idsAtuais.has(e.id));
    if (!faltando.length) return;
    const antes = cloneDados(atual);
    const depois = [...cloneDados(atual), ...faltando.map((e) => normalizeEntry({ ...cloneDados(e), _updatedAt: now }))];
    registrarHistoricoMes(mes, antes, depois, `recuperou ${faltando.length} lançamento(s) de ${origem}`);
    allData[mes] = depois;
    total += faltando.length;
  });

  const appS = snapshot.__app || {};
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  MODULOS_BACKUP.forEach((c) => {
    if (!Array.isArray(allData.__app[c])) allData.__app[c] = [];
    const lista = allData.__app[c];
    const idsAtuais = new Set(lista.map((x) => x.id));
    (Array.isArray(appS[c]) ? appS[c] : []).forEach((item) => {
      if (!item?.id || idsAtuais.has(item.id)) return;
      const novo = { ...cloneDados(item), _updatedAt: now };
      desmarcarExclusaoIds([item.id]);
      lista.push(novo);
      registrarHistoricoModulo(c, null, novo);
      total += 1;
    });
  });

  if (total) {
    recarregarTelaAposDados();
    saveData();
    AppStorage.registrarLog?.('recuperou', `recuperou ${total} item(ns) de ${origem}`);
  }
  return total;
};

// Nome deste aparelho (aparece no histórico e no log — vocês usam o mesmo login)
const perguntarNomeAparelho = async (forcar = false) => {
  if (!AppStorage.getDeviceName) return;
  if (!forcar) {
    if (AppStorage.getDeviceName()) return;
    try {
      if (sessionStorage.getItem('financas_casa_device_prompted')) return;
      sessionStorage.setItem('financas_casa_device_prompted', '1');
    } catch {}
    if (Swal.isVisible() || dom.editModalEl?.classList.contains('show')) return;
  }
  const { value, isConfirmed } = await Swal.fire({
    title: 'Quem usa este aparelho?',
    html: '<p class="mb-1">Vocês entram com o mesmo login, então este nome aparece no <strong>histórico</strong> e no <strong>log</strong> para saber quem alterou o quê.</p>',
    input: 'text',
    inputValue: AppStorage.getDeviceName() || '',
    inputPlaceholder: 'Ex.: Barbara, Gabriel, Notebook do Gabriel',
    showCancelButton: true,
    confirmButtonText: 'Salvar',
    cancelButtonText: 'Depois',
    confirmButtonColor: '#4f6ef7',
    reverseButtons: true,
    inputValidator: (v) => (!v || !v.trim() ? 'Digite um nome.' : undefined)
  });
  if (isConfirmed && value) {
    AppStorage.setDeviceName(value);
    notify.success(`Aparelho identificado como “${value.trim()}”.`);
  }
};

const fmtDataHoraCompleta = (ms) => (ms ? dayjs(ms).format('DD/MM/YYYY HH:mm:ss') : '—');

const resumoContagemBackup = (b) => {
  const meses = Object.keys(b?.meses || {}).length;
  return `${b?.lancamentos ?? 0} lançamentos · ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
};

const AVISO_REGRAS_FIREBASE = `
  <div class="bkp__warn">
    <i class="bi bi-exclamation-triangle-fill"></i>
    <div>
      <strong>Backups e logs na nuvem ainda desativados.</strong>
      Publique as novas regras do Firestore (passo a passo no <code>FIREBASE.md</code>, seção “Regras de segurança”).
      Enquanto isso, as cópias e o log estão sendo guardados <strong>neste aparelho</strong>.
    </div>
  </div>`;

const renderListaBackups = (dados) => {
  const linha = (b, origem) => `
    <div class="bkp-row">
      <div class="bkp-row__info">
        <strong>${fmtDataHoraCompleta(b.quando)}</strong>
        <span class="bkp-row__meta">${escapeHtml(b.motivo || 'automático')} · ${escapeHtml(b.autor || '—')} (${escapeHtml(b.aparelho || '')})</span>
        <span class="bkp-row__meta">${escapeHtml(resumoContagemBackup(b))}</span>
      </div>
      <div class="bkp-row__btns">
        <button type="button" class="hist-row__undo" data-bkp-recover="${escapeAttr(b.id)}" data-bkp-origem="${origem}" title="Traz de volta só o que sumiu, sem apagar nada do que existe hoje"><i class="bi bi-life-preserver"></i> Recuperar o que sumiu</button>
        <button type="button" class="hist-row__undo" data-bkp-restore="${escapeAttr(b.id)}" data-bkp-origem="${origem}" title="Volta tudo exatamente como estava neste backup"><i class="bi bi-arrow-counterclockwise"></i> Restaurar tudo</button>
        <button type="button" class="hist-row__undo" data-bkp-download="${escapeAttr(b.id)}" data-bkp-origem="${origem}" title="Baixar este backup em JSON"><i class="bi bi-download"></i></button>
      </div>
    </div>`;

  const nuvem = dados.nuvem.map((b) => linha(b, 'nuvem')).join('');
  const aparelho = dados.aparelho.map((b) => linha(b, 'aparelho')).join('');
  return `
    ${dados.erroNuvem === 'permission-denied' ? AVISO_REGRAS_FIREBASE : ''}
    <h6 class="bkp__h"><i class="bi bi-cloud-check"></i> Na nuvem (1 por hora nas últimas 24h + 1 por dia, para sempre)</h6>
    ${nuvem || '<p class="text-muted small mb-2">Nenhum backup na nuvem ainda.</p>'}
    <h6 class="bkp__h"><i class="bi bi-phone"></i> Neste aparelho (a cada ~3 min de uso + 1 por dia por 45 dias)</h6>
    ${aparelho || '<p class="text-muted small mb-0">Nenhum backup neste aparelho ainda.</p>'}`;
};

const ROTULOS_LOG = { salvou: 'Salvou', abriu: 'Abriu', erro: 'Erro', restaurou: 'Restaurou', recuperou: 'Recuperou', alteracao: 'Alteração' };

const renderListaLogs = (dados) => {
  const linhas = dados.logs.map((l) => {
    let det = {};
    try { det = l.detalhesJson ? JSON.parse(l.detalhesJson) : {}; } catch {}
    const mudancas = Array.isArray(det.mudancasContagem) ? det.mudancasContagem : [];
    const diminuiu = mudancas.some((m) => {
      const [, de, para] = String(m).match(/:\s*(\d+)\s*→\s*(\d+)/) || [];
      return Number(para) < Number(de);
    });
    return `
      <div class="hist-row bkp-log${l.tipo === 'erro' || diminuiu ? ' is-alert' : ''}">
        <span class="hist-row__when">${dayjs(l.quando).format('DD/MM HH:mm:ss')}</span>
        <span class="hist-row__what">
          <span class="hist-row__tag bkp-log__tipo">${escapeHtml(ROTULOS_LOG[l.tipo] || l.tipo || '')}</span>
          <span class="hist-row__mes" title="${escapeAttr(l.aparelho || '')}">${escapeHtml(l.autor || 'Sem nome')}</span>
          ${escapeHtml(l.resumo || '')}
          ${mudancas.length ? `<br><small class="${diminuiu ? 'text-danger' : 'text-muted'}">Lançamentos por mês: ${escapeHtml(mudancas.join(', '))}</small>` : ''}
        </span>
        <span></span>
      </div>`;
  }).join('');
  return `
    ${dados.erroNuvem === 'permission-denied' ? AVISO_REGRAS_FIREBASE : ''}
    <div class="hist">${linhas || '<p class="text-muted mb-0">Nenhum registro ainda.</p>'}</div>
    <p class="hist__hint">Cada gravação registra quem fez (nome do aparelho), a hora exata, o que mudou e quantos lançamentos ficaram em cada mês. Linhas em vermelho indicam erro ou mês que perdeu lançamentos.</p>`;
};

const historicoPagina = {
  aba: 'alteracoes',
  busca: '',
  mes: '',
  tipo: 'todas',
  visibleCount: 100,
  visibleLogs: 100,
  logs: [],
  cursor: null,
  temMais: false,
  carregando: false,
  logsCarregados: false,
  backups: null,
  backupsCarregados: false,
  erro: ''
};

const lerDetalhesLog = (log) => {
  try { return log.detalhesJson ? JSON.parse(log.detalhesJson) : {}; } catch { return {}; }
};

const reunirEventosHistorico = () => {
  const eventos = new Map();
  const incluir = (evento, origem = '') => {
    if (!evento?.id) return;
    const anterior = eventos.get(evento.id) || {};
    eventos.set(evento.id, {
      ...anterior,
      ...evento,
      autor: evento.autor || anterior.autor || '',
      aparelho: evento.aparelho || anterior.aparelho || '',
      origem: origem || anterior.origem || 'histórico'
    });
  };

  (window.HistoricoAuditoria?.listar?.() || []).forEach((evento) => incluir(evento));
  historicoPagina.logs.forEach((log) => {
    const detalhes = lerDetalhesLog(log);
    if (detalhes.evento) incluir({ ...detalhes.evento, autor: detalhes.evento.autor || log.autor, aparelho: detalhes.evento.aparelho || log.aparelho }, log.origem);
    (Array.isArray(detalhes.acoes) ? detalhes.acoes : []).forEach((evento) => {
      incluir({ ...evento, autor: evento.autor || log.autor, aparelho: evento.aparelho || log.aparelho }, log.origem);
    });
  });
  return [...eventos.values()].sort((a, b) => (Date.parse(b.quando) || Number(b.quando) || 0) - (Date.parse(a.quando) || Number(a.quando) || 0));
};

const renderDetalhesEventoHistorico = (evento) => {
  const linhas = [];
  const nome = (item) => item?.description || item?.nome || item?.descricao || item?.instituicao || item?.id || 'item';
  const dinheiro = (item) => item && Number.isFinite(Number(item.value ?? item.valorAtual ?? item.valor))
    ? formatCurrency(Number(item.value ?? item.valorAtual ?? item.valor)) : '';
  const json = (label, item) => `<details><summary>${label}</summary><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></details>`;
  (evento.adicionados || []).forEach((item) => linhas.push(`<li><strong>Adicionado:</strong> ${escapeHtml(nome(item))}${dinheiro(item) ? ` · ${escapeHtml(dinheiro(item))}` : ''}${json('Ver todos os campos', item)}</li>`));
  (evento.removidos || []).forEach((item) => linhas.push(`<li><strong>Removido:</strong> ${escapeHtml(nome(item))}${dinheiro(item) ? ` · ${escapeHtml(dinheiro(item))}` : ''}${json('Ver todos os campos', item)}</li>`));
  (evento.alterados || []).forEach(({ antes, depois }) => {
    const a = dinheiro(antes);
    const d = dinheiro(depois);
    const alteracao = a && d && a !== d ? `${a} → ${d}` : `${nome(antes)} → ${nome(depois)}`;
    linhas.push(`<li><strong>Alterado:</strong> ${escapeHtml(alteracao)}<details><summary>Ver todos os campos antes e depois</summary><div class="audit-event__comparison"><div><strong>Antes</strong><pre>${escapeHtml(JSON.stringify(antes, null, 2))}</pre></div><div><strong>Depois</strong><pre>${escapeHtml(JSON.stringify(depois, null, 2))}</pre></div></div></details></li>`);
  });
  if (evento.antes || evento.depois) {
    const antes = evento.antes ? JSON.stringify(evento.antes, null, 2) : '—';
    const depois = evento.depois ? JSON.stringify(evento.depois, null, 2) : '—';
    linhas.push(`<li><strong>Antes</strong><pre>${escapeHtml(antes)}</pre></li><li><strong>Depois</strong><pre>${escapeHtml(depois)}</pre></li>`);
  }
  if (!linhas.length) linhas.push(`<li>${escapeHtml(evento.acao || 'Sem detalhes adicionais.')}</li>`);
  return `<ul class="audit-event__details">${linhas.join('')}</ul>`;
};

const filtrarEventosHistoricoPagina = () => {
  const eventos = reunirEventosHistorico();
  const meses = [...new Set(eventos.map((e) => e.mes).filter(Boolean))].sort().reverse();
  const query = historicoPagina.busca.trim().toLocaleLowerCase('pt-BR');
  const filtrados = eventos.filter((evento) => {
    if (historicoPagina.mes && evento.mes !== historicoPagina.mes) return false;
    if (historicoPagina.tipo !== 'todas' && evento.tipo !== historicoPagina.tipo) return false;
    const haystack = `${evento.acao || ''} ${evento.autor || ''} ${evento.aparelho || ''} ${evento.mes || ''}`.toLocaleLowerCase('pt-BR');
    return !query || haystack.includes(query);
  });
  return { eventos, meses, filtrados };
};

const renderEventosHistoricoPagina = (container) => {
  const { eventos, meses, filtrados } = filtrarEventosHistoricoPagina();
  const rows = filtrados.slice(0, historicoPagina.visibleCount).map((evento) => {
    const timestamp = Date.parse(evento.quando) || Number(evento.quando) || 0;
    const reversivel = evento.reversivel && !evento.desfeito;
    return `<article class="audit-event${evento.desfeito ? ' is-undone' : ''}">
      <div class="audit-event__date"><strong>${timestamp ? dayjs(timestamp).format('DD/MM/YYYY') : 'Data indisponível'}</strong><span>${timestamp ? dayjs(timestamp).format('HH:mm:ss') : ''}</span></div>
      <div class="audit-event__body"><div class="audit-event__meta"><span class="audit-event__type">${escapeHtml(evento.tipo === 'mes' ? 'Lançamentos' : evento.tipo === 'modulo' ? (NOMES_COLECAO[evento.colecao] || evento.colecao || 'Módulo') : 'Registro')}</span>${evento.mes ? `<span class="audit-event__pill">${escapeHtml(dayjs(`${evento.mes}-01`).format('MMM/YY'))}</span>` : ''}${evento.autor ? `<span class="audit-event__pill">${escapeHtml(evento.autor)}</span>` : ''}${evento.desfeito ? '<span class="audit-event__pill is-undone">Desfeito</span>' : ''}</div>
        <p class="audit-event__summary">${escapeHtml(window.HistoricoAuditoria?.formatar?.(evento) || evento.acao || 'Alteração')}</p>
        <details class="audit-event__more"><summary>Ver valores e detalhes</summary>${renderDetalhesEventoHistorico(evento)}</details>
      </div>
      <div class="audit-event__actions">${reversivel ? `<button type="button" class="audit-undo" data-audit-undo="${escapeAttr(evento.id)}"><i class="bi bi-arrow-counterclockwise"></i> Desfazer</button>` : '<span class="audit-event__status">Somente leitura</span>'}</div>
    </article>`;
  }).join('');
  const list = container.querySelector('[data-history-results]');
  if (list) list.innerHTML = rows || '<div class="audit-empty"><i class="bi bi-journal-check"></i><strong>Nenhuma alteração encontrada</strong><span>Ajuste os filtros ou carregue mais registros.</span></div>';
  const count = container.querySelector('[data-history-count]');
  if (count) count.textContent = `${Math.min(filtrados.length, historicoPagina.visibleCount)} de ${filtrados.length} alteração(ões) exibida(s) · ${eventos.length} carregada(s)`;
  const monthSelect = container.querySelector('#historyMonth');
  if (monthSelect) monthSelect.innerHTML = `<option value="">Todos os meses</option>${meses.map((mes) => `<option value="${escapeAttr(mes)}" ${mes === historicoPagina.mes ? 'selected' : ''}>${escapeHtml(dayjs(`${mes}-01`).format('MMMM [de] YYYY'))}</option>`).join('')}`;
  const more = container.querySelector('[data-history-load-more]');
  if (more) {
    more.hidden = filtrados.length <= historicoPagina.visibleCount && !historicoPagina.temMais;
    more.textContent = filtrados.length > historicoPagina.visibleCount ? 'Mostrar mais alterações carregadas' : 'Carregar registros anteriores';
  }
};

const mesclarLogsPaginaHistorico = (base, novos) => {
  const map = new Map(base.map((item) => [item.id, item]));
  novos.forEach((item) => map.set(item.id, { ...(map.get(item.id) || {}), ...item }));
  return [...map.values()].sort((a, b) => (b.quando || 0) - (a.quando || 0));
};

const carregarLogsHistorico = async (container, mais = false) => {
  if (historicoPagina.carregando) return;
  historicoPagina.carregando = true;
  historicoPagina.erro = '';
  const status = container.querySelector('[data-history-data-status]');
  if (status) status.textContent = 'Carregando alterações e logs…';
  try {
    if (AppStorage.listarLogsPaginado) {
      const resultado = await AppStorage.listarLogsPaginado(100, mais ? historicoPagina.cursor : null);
      historicoPagina.logs = mesclarLogsPaginaHistorico(mais ? historicoPagina.logs : [], [...resultado.local, ...resultado.nuvem]);
      historicoPagina.cursor = resultado.cursor;
      historicoPagina.temMais = resultado.temMais;
      historicoPagina.erro = resultado.erroNuvem || '';
    } else {
      const resultado = await AppStorage.listarLogs(1000);
      historicoPagina.logs = resultado.logs || [];
      historicoPagina.temMais = false;
      historicoPagina.erro = resultado.erroNuvem || '';
    }
    historicoPagina.logsCarregados = true;
  } catch {
    historicoPagina.erro = 'Não foi possível carregar os logs agora.';
  } finally {
    historicoPagina.carregando = false;
  }
  if (container.isConnected) renderHistoricoPagina(container);
};

const carregarBackupsHistorico = async (container) => {
  try {
    historicoPagina.backups = await AppStorage.listarBackups();
  } catch {
    historicoPagina.backups = null;
  }
  historicoPagina.backupsCarregados = true;
  if (container.isConnected) renderHistoricoPagina(container);
};

const executarAcaoBackupHistorico = async (button, container) => {
  const action = button.dataset.bkpAction;
  if (action === 'backup') {
    const result = await AppStorage.backupNow(allData, 'manual');
    if (result.okNuvem) notify.success('Backup criado na nuvem e neste aparelho!');
    else if (result.okLocal) notify.info('Backup criado neste aparelho.');
    else notify.error('Não foi possível criar o backup.');
    historicoPagina.backupsCarregados = false;
    await carregarBackupsHistorico(container);
    return;
  }
  if (action === 'export') { exportJSON(); return; }
  if (action === 'device') {
    await perguntarNomeAparelho(true);
    renderHistoricoPagina(container);
    return;
  }

  const id = button.dataset.bkpRecover || button.dataset.bkpRestore || button.dataset.bkpDownload;
  const origem = button.dataset.bkpOrigem;
  const tipo = button.dataset.bkpRecover ? 'recover' : button.dataset.bkpRestore ? 'restore' : 'download';
  let snapshot = null;
  try { snapshot = await AppStorage.obterBackup(origem, id); } catch {}
  if (!snapshot) { notify.error('Não foi possível abrir este backup.'); return; }
  const rotulo = `backup ${origem === 'nuvem' ? 'da nuvem' : 'do aparelho'}`;
  if (tipo === 'download') {
    downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), `financas-casa-${origem}-${id}.json`);
  } else if (tipo === 'recover') {
    const total = recuperarItensFaltantes(snapshot, rotulo);
    notify[total ? 'success' : 'info'](total ? `${total} item(ns) recuperado(s)!` : 'Nada para recuperar: tudo deste backup já existe hoje.');
  } else {
    const ok = await confirmAction({
      title: 'Restaurar tudo deste backup?',
      text: 'Esta ação substitui o estado atual pelo backup. Antes disso, o estado atual será copiado para outro backup.',
      icon: 'warning',
      confirmText: 'Sim, restaurar'
    });
    if (!ok) return;
    await restaurarDadosCompletos(snapshot, rotulo);
    notify.success('Backup restaurado!');
  }
  renderHistoricoPagina(container);
};

const renderHistoricoPagina = (container) => {
  if (!container) return;
  const status = AppStorage.getStatus?.() || {};
  const eventos = reunirEventosHistorico();
  container.innerHTML = `<div class="history-page">
    <header class="history-page__header"><div><span class="history-page__eyebrow">REGISTRO E RECUPERAÇÃO</span><h1>Histórico completo</h1><p>Veja quem alterou cada informação, compare os valores e desfaça mudanças com segurança.</p></div><div class="history-page__header-actions"><button type="button" class="history-action" data-history-device><i class="bi bi-person-gear"></i> Identificar aparelho</button><button type="button" class="history-refresh" data-history-refresh><i class="bi bi-arrow-clockwise"></i> Atualizar</button></div></header>
    <section class="history-status" aria-label="Estado do salvamento"><div><span>Este aparelho</span><strong>${escapeHtml(status.nomeAparelho || 'Sem nome')}</strong><small>${escapeHtml(status.aparelho || '')}</small></div><div><span>Último salvamento na nuvem</span><strong>${escapeHtml(fmtDataHoraCompleta(status.ultimoSalvoNuvem))}</strong><small>${status.pendente ? 'Há alterações aguardando envio' : 'Nenhuma alteração pendente'}</small></div><div><span>Alterações carregadas</span><strong data-history-count>${eventos.length} alteração(ões)</strong><small data-history-data-status>${historicoPagina.logsCarregados ? 'Histórico e logs sincronizados' : 'Preparando registro completo…'}</small></div></section>
    <nav class="history-tabs" aria-label="Seções do histórico"><button type="button" data-history-tab="alteracoes" class="${historicoPagina.aba === 'alteracoes' ? 'is-active' : ''}"><i class="bi bi-journal-text"></i> Alterações</button><button type="button" data-history-tab="logs" class="${historicoPagina.aba === 'logs' ? 'is-active' : ''}"><i class="bi bi-cloud-check"></i> Logs de salvamento</button><button type="button" data-history-tab="backups" class="${historicoPagina.aba === 'backups' ? 'is-active' : ''}"><i class="bi bi-shield-check"></i> Backups</button></nav>
    <section class="history-panel" data-history-panel="alteracoes" ${historicoPagina.aba !== 'alteracoes' ? 'hidden' : ''}><div class="history-panel__heading"><div><h2>Alterações registradas</h2><p>Filtros por mês e busca por descrição ou aparelho. Ações antigas só podem ser desfeitas quando o registro atual ainda corresponde ao valor esperado.</p></div><button type="button" class="history-export" data-history-export><i class="bi bi-download"></i> Exportar histórico</button></div><div class="history-filters"><label class="history-search"><i class="bi bi-search"></i><input id="historySearch" type="search" value="${escapeAttr(historicoPagina.busca)}" placeholder="Buscar descrição, pessoa ou aparelho"></label><select id="historyMonth" aria-label="Filtrar por mês"><option value="">Todos os meses</option></select><select id="historyType" aria-label="Filtrar por tipo"><option value="todas" ${historicoPagina.tipo === 'todas' ? 'selected' : ''}>Todos os tipos</option><option value="mes" ${historicoPagina.tipo === 'mes' ? 'selected' : ''}>Lançamentos</option><option value="modulo" ${historicoPagina.tipo === 'modulo' ? 'selected' : ''}>Módulos</option><option value="info" ${historicoPagina.tipo === 'info' ? 'selected' : ''}>Informações</option></select></div><div data-history-results class="audit-events"></div><button type="button" class="history-load-more" data-history-load-more ${historicoPagina.temMais ? '' : 'hidden'}>Carregar registros anteriores</button></section>
    <section class="history-panel" data-history-panel="logs" ${historicoPagina.aba !== 'logs' ? 'hidden' : ''}><div class="history-panel__heading"><div><h2>Logs de salvamento</h2><p>Eventos de sincronização, recuperação e erros. As alterações detalhadas aparecem na seção Alterações.</p></div></div>${historicoPagina.erro ? `<p class="history-warning"><i class="bi bi-exclamation-triangle"></i> ${escapeHtml(historicoPagina.erro)}</p>` : ''}<div class="audit-log-list">${historicoPagina.logsCarregados ? renderListaLogs({ logs: historicoPagina.logs.slice(0, historicoPagina.visibleLogs), erroNuvem: historicoPagina.erro }) : '<p class="audit-loading"><span class="sync-spin bi bi-arrow-repeat"></span> Carregando logs…</p>'}</div><button type="button" class="history-load-more" data-history-load-more ${historicoPagina.logs.length > historicoPagina.visibleLogs || historicoPagina.temMais ? '' : 'hidden'}>${historicoPagina.logs.length > historicoPagina.visibleLogs ? 'Mostrar mais logs carregados' : 'Carregar logs anteriores'}</button></section>
    <section class="history-panel" data-history-panel="backups" ${historicoPagina.aba !== 'backups' ? 'hidden' : ''}><div class="history-panel__heading"><div><h2>Backups e recuperação</h2><p>Recuperar itens faltantes adiciona dados sem remover o que existe. Restaurar tudo substitui o estado atual.</p></div></div><div class="bkp__actions"><button type="button" class="history-action history-action--primary" data-bkp-action="backup"><i class="bi bi-shield-plus"></i> Fazer backup agora</button><button type="button" class="history-action" data-bkp-action="export"><i class="bi bi-filetype-json"></i> Baixar tudo (JSON)</button><button type="button" class="history-action" data-bkp-action="device"><i class="bi bi-person-gear"></i> Nome do aparelho</button></div><div class="audit-backups">${historicoPagina.backupsCarregados ? (historicoPagina.backups ? renderListaBackups(historicoPagina.backups) : '<p class="history-warning">Não foi possível carregar os backups.</p>') : '<p class="audit-loading"><span class="sync-spin bi bi-arrow-repeat"></span> Carregando backups…</p>'}</div></section>
  </div>`;
  if (!container.dataset.historyBound) {
    container.dataset.historyBound = 'true';
    container.addEventListener('click', async (event) => {
      const tab = event.target.closest('[data-history-tab]');
      if (tab) { historicoPagina.aba = tab.dataset.historyTab; renderHistoricoPagina(container); return; }
      if (event.target.closest('[data-history-refresh]')) {
        historicoPagina.logs = [];
        historicoPagina.cursor = null;
        historicoPagina.temMais = false;
        historicoPagina.logsCarregados = false;
        historicoPagina.backupsCarregados = false;
        historicoPagina.visibleCount = 100;
        historicoPagina.visibleLogs = 100;
        renderHistoricoPagina(container);
        carregarLogsHistorico(container);
        carregarBackupsHistorico(container);
        return;
      }
      if (event.target.closest('[data-history-device]')) {
        await perguntarNomeAparelho(true);
        renderHistoricoPagina(container);
        return;
      }
      if (event.target.closest('[data-history-load-more]')) {
        if (historicoPagina.aba === 'logs') {
          if (historicoPagina.logs.length > historicoPagina.visibleLogs) {
            historicoPagina.visibleLogs += 100;
            renderHistoricoPagina(container);
          } else {
            await carregarLogsHistorico(container, true);
          }
          return;
        }
        const { filtrados } = filtrarEventosHistoricoPagina();
        if (filtrados.length > historicoPagina.visibleCount) {
          historicoPagina.visibleCount += 100;
          renderEventosHistoricoPagina(container);
        } else {
          await carregarLogsHistorico(container, true);
        }
        return;
      }
      if (event.target.closest('[data-history-export]')) {
        downloadBlob(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), alteracoes: reunirEventosHistorico(), logs: historicoPagina.logs }, null, 2)], { type: 'application/json' }), 'financas-casa-historico.json');
        return;
      }
      const undo = event.target.closest('[data-audit-undo]');
      if (undo) {
        const registro = reunirEventosHistorico().find((item) => item.id === undo.dataset.auditUndo);
        const ok = registro && window.HistoricoAuditoria?.desfazer?.(registro);
        if (!ok) notify.error('Não foi possível desfazer: o registro pode ter mudado depois desta ação. Nenhum dado foi alterado.');
        else notify.success('Alteração desfeita e registrada no histórico.');
        renderHistoricoPagina(container);
        return;
      }
      if (event.target.closest('[data-bkp-action], [data-bkp-recover], [data-bkp-restore], [data-bkp-download]')) {
        await executarAcaoBackupHistorico(event.target.closest('[data-bkp-action], [data-bkp-recover], [data-bkp-restore], [data-bkp-download]'), container);
      }
    });
    container.addEventListener('input', (event) => {
      if (event.target.id !== 'historySearch') return;
      historicoPagina.busca = event.target.value;
      historicoPagina.visibleCount = 100;
      renderEventosHistoricoPagina(container);
    });
    container.addEventListener('change', (event) => {
      if (event.target.id === 'historyMonth') historicoPagina.mes = event.target.value;
      if (event.target.id === 'historyType') historicoPagina.tipo = event.target.value;
      if (event.target.id === 'historyMonth' || event.target.id === 'historyType') {
        historicoPagina.visibleCount = 100;
        renderEventosHistoricoPagina(container);
      }
    });
  }
  renderEventosHistoricoPagina(container);
  if (!historicoPagina.logsCarregados && !historicoPagina.carregando) carregarLogsHistorico(container);
  if (historicoPagina.aba === 'backups' && !historicoPagina.backupsCarregados) carregarBackupsHistorico(container);
};

const abrirBackupsLogs = async () => window.HistoricoPage?.openTab('backups');

window.HistoricoPage = {
  render: renderHistoricoPagina,
  openTab(tab = 'alteracoes') {
    historicoPagina.aba = tab;
    window.AppModules?.activate('historico');
    const container = document.getElementById('view-historico');
    if (container) renderHistoricoPagina(container);
  }
};

window.abrirBackupsLogs = abrirBackupsLogs;

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
