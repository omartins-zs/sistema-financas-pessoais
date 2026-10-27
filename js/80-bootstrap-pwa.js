// ============================================
// Init
// ============================================

// Carrega os dados e desenha a tela (chamado quando o armazenamento está pronto)
const startApp = async () => {
  // 1. Exibe imediatamente o espelho local (0ms) enquanto busca a nuvem em segundo plano
  const cached = AppStorage.loadCached?.();
  if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
    allData = cached;
    iniciarSnapshotsHistorico();
    aplicarCategoriasSalvas();
    populateCategories();
    populateInvestimentoSelects();
    toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'));
    render();
  }

  // 2. Carrega e sincroniza com o servidor (Firestore)
  await loadData();
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'));
  render();
};

// Recebe atualizações em tempo real da nuvem (outro aparelho/aba) sem perder edições locais
const handleRemoteUpdate = (remoteData, skipMirror = false) => {
  if (!remoteData || typeof remoteData !== 'object') return;
  const isLocalDirty = Boolean(AppStorage.isDirty?.());
  allData = AppStorage.mergeAllData ? AppStorage.mergeAllData(allData, remoteData, isLocalDirty) : remoteData;
  Object.keys(allData).forEach((month) => {
    if (month.startsWith('__')) return;
    if (Array.isArray(allData[month])) {
      allData[month] = allData[month].map(normalizeEntry);
    }
  });
  if (!skipMirror) {
    AppStorage.mirrorLocal?.(allData);
  }
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  render();
};

// ============================================
// PWA — versão e service worker
// ============================================

// Fonte única da versão: a meta do index.html, que é o mesmo valor do ?v= dos arquivos
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content?.trim() || 'dev';
const RELOAD_GUARD_KEY = 'financas_casa_reloaded_version';
const updateState = {
  registration: null,
  waitingWorker: null,
  targetVersion: '',
  manualRefresh: false,
  activationRequested: false,
  controllerChanged: false,
  applying: false,
  reloading: false,
  noticeShown: false,
  retryTimer: null
};

const hasUnsavedFormDraft = () => {
  const fields = [dom.inputDescription, dom.inputValue, dom.inputDueDay, dom.inputObservation];
  if (fields.some((field) => String(field?.value || '').trim())) return true;
  return [...document.querySelectorAll('.card-item-desc, .card-item-val')]
    .some((field) => String(field.value || '').trim());
};

// Atualizações nunca descartam formulário, diálogo ou edição em linha que ainda esteja aberta.
const hasOpenEditingSurface = () => {
  if (hasUnsavedFormDraft()) return true;
  if (document.querySelector('.modal.show, .card-item--editing')) return true;
  try { return Boolean(window.Swal?.isVisible?.()); } catch { return false; }
};

const hasPendingUpdate = () => Boolean(
  updateState.targetVersion || updateState.waitingWorker || updateState.manualRefresh
);

const showPendingUpdateNotice = () => {
  if (updateState.noticeShown) return;
  updateState.noticeShown = true;
  const version = updateState.targetVersion ? ` v${updateState.targetVersion}` : '';
  notify.info(`Atualização${version} disponível. Vou salvar as alterações e aplicar quando não houver formulário aberto.`);
};

const startUpdateRetry = () => {
  if (updateState.retryTimer || !hasPendingUpdate()) return;
  updateState.retryTimer = setInterval(() => {
    if (!hasPendingUpdate()) {
      clearInterval(updateState.retryTimer);
      updateState.retryTimer = null;
      return;
    }
    attemptPendingUpdate();
  }, 5000);
};

const markUpdatePending = ({ version = '', worker = null, manual = false } = {}) => {
  if (version) updateState.targetVersion = version;
  if (worker) updateState.waitingWorker = worker;
  if (manual) updateState.manualRefresh = true;
  if (hasOpenEditingSurface() || AppStorage.isDirty?.()) showPendingUpdateNotice();
  startUpdateRetry();
  setTimeout(attemptPendingUpdate, 0);
};

const reloadForUpdate = async () => {
  if (updateState.reloading || hasOpenEditingSurface() || !navigator.onLine) return;
  updateState.reloading = true;
  try {
    const saved = await AppStorage.flush?.();
    if (saved === false || AppStorage.isDirty?.() || hasOpenEditingSurface()) {
      updateState.reloading = false;
      startUpdateRetry();
      return;
    }
  } catch {
    updateState.reloading = false;
    startUpdateRetry();
    return;
  }

  if (updateState.targetVersion) {
    try { sessionStorage.setItem(RELOAD_GUARD_KEY, updateState.targetVersion); } catch {}
  }
  // O service worker remove somente os caches "financas-*" ao ativar a versão nova.
  // Não apagamos caches de outros recursos/aplicações do mesmo domínio.
  window.location.reload();
};

const attemptPendingUpdate = async () => {
  if (!hasPendingUpdate() || updateState.applying || updateState.reloading || !navigator.onLine) return;
  if (hasOpenEditingSurface()) return;

  updateState.applying = true;
  try {
    const saved = await AppStorage.flush?.();
    if (saved === false || AppStorage.isDirty?.() || hasOpenEditingSurface()) return;

    const waiting = updateState.waitingWorker?.state === 'installed'
      ? updateState.waitingWorker
      : updateState.registration?.waiting;
    if (waiting) {
      updateState.waitingWorker = waiting;
      if (!updateState.activationRequested) {
        updateState.activationRequested = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      return;
    }

    if (updateState.controllerChanged || updateState.manualRefresh || updateState.targetVersion) {
      await reloadForUpdate();
    }
  } catch {
    // Se a gravação ou a ativação falhar, mantém a versão atual e tenta novamente depois.
  } finally {
    updateState.applying = false;
  }
};

const requestSafeRefresh = () => {
  markUpdatePending({ manual: true });
  if (!updateState.noticeShown) {
    updateState.noticeShown = true;
    notify.info('Salvando alterações antes de atualizar o app.');
  }
};

// Verifica na rede se há uma nova versão publicada; não recarrega enquanto o usuário edita.
const checkRemoteAppVersion = async () => {
  if (location.protocol === 'file:' || !navigator.onLine || updateState.reloading) return;
  try {
    const res = await fetch(`./index.html?_vcheck=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!res.ok) return;
    const html = await res.text();
    const match = html.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i);
    const remoteVersion = match?.[1]?.trim();
    if (!remoteVersion || remoteVersion === APP_VERSION) return;
    try {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY) === remoteVersion) return;
    } catch {}
    markUpdatePending({ version: remoteVersion });
  } catch {
    /* Sem rede no momento */
  }
};

const showAppVersion = () => {
  if (!dom.appVersion) return;
  dom.appVersion.textContent = `v${APP_VERSION}`;
  dom.appVersion.hidden = false;
  // Atualização manual também aguarda o formulário e a sincronização terminarem.
  dom.appVersion.addEventListener('click', requestSafeRefresh);
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
      scope: './',
      updateViaCache: 'none' // o próprio sw.js nunca vem do cache do navegador
    });
    updateState.registration = reg;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateState.activationRequested) return;
      updateState.controllerChanged = true;
      setTimeout(attemptPendingUpdate, 0);
    });

    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      const haviaControlador = Boolean(navigator.serviceWorker.controller);
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && haviaControlador) markUpdatePending({ worker: novo });
      });
    });

    // Também trata uma atualização que já estava aguardando quando a página abriu.
    if (navigator.serviceWorker.controller && reg.waiting) {
      markUpdatePending({ worker: reg.waiting });
    }

    // Checa nova versão ao abrir o PWA, ao voltar para a janela/app e a cada 60s
    setTimeout(checkRemoteAppVersion, 1500);
    setInterval(() => {
      reg.update().catch(() => {});
      checkRemoteAppVersion();
    }, 60000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        reg.update().catch(() => {});
        checkRemoteAppVersion();
      }
    });

    window.addEventListener('focus', () => {
      reg.update().catch(() => {});
      checkRemoteAppVersion();
    });

    // Eventos só tentam aplicar uma atualização já detectada; não consultam a rede a cada clique.
    ['click', 'input', 'change', 'submit'].forEach((eventName) => {
      document.addEventListener(eventName, () => {
        if (hasPendingUpdate()) setTimeout(attemptPendingUpdate, 0);
      });
    });
    document.addEventListener('hidden.bs.modal', () => setTimeout(attemptPendingUpdate, 0));
    window.addEventListener('online', () => {
      if (hasPendingUpdate()) attemptPendingUpdate();
      else checkRemoteAppVersion();
    });
  } catch {
    /* O app funciona igual sem service worker — o PWA é um extra */
  }
};

const init = () => {
  dayjs.locale('pt-br');
  showAppVersion();
  window.addEventListener('load', registerServiceWorker);
  initTheme();
  populateSelectors();
  populateCategories();
  populatePersonSelect();
  initMoneyMasks();
  editModal = new bootstrap.Modal(dom.editModalEl);
  bindEvents();

  // Inicia o armazenamento: em modo nuvem aguarda o login e escuta mudanças em tempo real;
  // em modo local dispara startApp() imediatamente.
  AppStorage.init(startApp, handleRemoteUpdate);
};

document.addEventListener('DOMContentLoaded', init);
