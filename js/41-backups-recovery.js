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

const ROTULOS_LOG = { salvou: 'Salvou', abriu: 'Abriu', erro: 'Erro', restaurou: 'Restaurou', recuperou: 'Recuperou' };

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

const abrirBackupsLogs = async () => {
  const st = AppStorage.getStatus?.() || {};
  const statusHtml = `
    <div class="bkp__status">
      <div><i class="bi bi-person-badge"></i> Este aparelho: <strong>${escapeHtml(st.nomeAparelho || 'sem nome')}</strong> <small class="text-muted">(${escapeHtml(st.aparelho || '')})</small></div>
      <div><i class="bi bi-cloud-check"></i> Último salvamento na nuvem: <strong>${fmtDataHoraCompleta(st.ultimoSalvoNuvem)}</strong></div>
      <div><i class="bi ${st.pendente ? 'bi-hourglass-split text-warning' : 'bi-check-circle text-success'}"></i> ${st.pendente ? 'Há alterações aguardando envio para a nuvem' : 'Nada pendente: tudo enviado'}</div>
    </div>`;

  let acaoPendente = null;
  await Swal.fire({
    title: 'Backups e logs',
    width: '54rem',
    html: `<div class="bkp">
      ${statusHtml}
      <div class="bkp__actions">
        <button type="button" class="btn btn-sm btn-primary" data-bkp-action="backup"><i class="bi bi-shield-plus"></i> Fazer backup agora</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bkp-action="export"><i class="bi bi-filetype-json"></i> Baixar tudo (JSON)</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bkp-action="device"><i class="bi bi-person-gear"></i> Nome do aparelho</button>
      </div>
      <div class="bkp__tabs" role="tablist">
        <button type="button" class="bkp__tab is-active" data-bkp-tab="backups">Backups</button>
        <button type="button" class="bkp__tab" data-bkp-tab="logs">Log de alterações</button>
      </div>
      <div class="bkp__panel" data-bkp-panel="backups"><p class="text-muted"><span class="sync-spin bi bi-arrow-repeat"></span> Carregando backups...</p></div>
      <div class="bkp__panel" data-bkp-panel="logs" hidden><p class="text-muted"><span class="sync-spin bi bi-arrow-repeat"></span> Carregando log...</p></div>
    </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Fechar',
    didOpen: async (popup) => {
      const painel = (nome) => popup.querySelector(`[data-bkp-panel="${nome}"]`);

      popup.querySelectorAll('[data-bkp-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
          popup.querySelectorAll('[data-bkp-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
          popup.querySelectorAll('[data-bkp-panel]').forEach((p) => { p.hidden = p.dataset.bkpPanel !== tab.dataset.bkpTab; });
        });
      });

      popup.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.bkpAction) {
          acaoPendente = { tipo: btn.dataset.bkpAction };
          Swal.close();
        } else if (btn.dataset.bkpRecover || btn.dataset.bkpRestore || btn.dataset.bkpDownload) {
          acaoPendente = {
            tipo: btn.dataset.bkpRecover ? 'recover' : btn.dataset.bkpRestore ? 'restore' : 'download',
            id: btn.dataset.bkpRecover || btn.dataset.bkpRestore || btn.dataset.bkpDownload,
            origem: btn.dataset.bkpOrigem
          };
          Swal.close();
        }
      });

      try {
        const backups = await AppStorage.listarBackups();
        if (painel('backups')) painel('backups').innerHTML = renderListaBackups(backups);
      } catch {
        if (painel('backups')) painel('backups').innerHTML = '<p class="text-danger">Não foi possível listar os backups.</p>';
      }
      try {
        const logs = await AppStorage.listarLogs(200);
        if (painel('logs')) painel('logs').innerHTML = renderListaLogs(logs);
      } catch {
        if (painel('logs')) painel('logs').innerHTML = '<p class="text-danger">Não foi possível carregar o log.</p>';
      }
    }
  });

  if (!acaoPendente) return;
  const { tipo, id, origem } = acaoPendente;

  if (tipo === 'backup') {
    const r = await AppStorage.backupNow(allData, 'manual');
    if (r.okNuvem) notify.success('Backup criado na nuvem e neste aparelho!');
    else if (r.okLocal) notify.info('Backup criado neste aparelho. (Nuvem indisponível: veja o FIREBASE.md para ativar.)');
    else notify.error('Não foi possível criar o backup.');
    return;
  }
  if (tipo === 'export') { exportJSON(); return; }
  if (tipo === 'device') { await perguntarNomeAparelho(true); return; }

  let snapshot = null;
  try {
    snapshot = await AppStorage.obterBackup(origem, id);
  } catch {
    snapshot = null;
  }
  if (!snapshot) { notify.error('Não foi possível abrir este backup.'); return; }
  const rotulo = `backup ${origem === 'nuvem' ? 'da nuvem' : 'do aparelho'}`;

  if (tipo === 'download') {
    downloadBlob(
      new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
      `financas-casa-${origem}-${id}.json`
    );
    return;
  }

  if (tipo === 'recover') {
    const n = recuperarItensFaltantes(snapshot, rotulo);
    notify[n ? 'success' : 'info'](n ? `${n} item(ns) recuperado(s)!` : 'Nada para recuperar: tudo deste backup já existe hoje.');
    return;
  }

  if (tipo === 'restore') {
    const ok = await confirmAction({
      title: 'Restaurar tudo deste backup?',
      text: 'Os dados voltam exatamente como estavam neste backup (antes disso uma cópia do estado atual é guardada, então dá para voltar atrás).',
      icon: 'warning',
      confirmText: 'Sim, restaurar'
    });
    if (!ok) return;
    await restaurarDadosCompletos(snapshot, rotulo);
    notify.success('Backup restaurado!');
  }
};

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
