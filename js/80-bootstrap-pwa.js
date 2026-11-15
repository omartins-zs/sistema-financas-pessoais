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
// Tentativas de atualização forçada por versão (na mesma aba) antes de pedir ação manual
const MAX_UPDATE_ATTEMPTS = 3;
const UPDATE_URL_PARAM = 'atualizar';

// Só atualiza para uma versão MAIS NOVA (AAAAMMDD-HHMM); uma resposta antiga de cache/CDN
// não pode puxar o app para trás nem causar recarga em loop.
const isNewerVersion = (remote, local) => {
  const re = /^\d{8}-\d{4}$/;
  if (re.test(String(remote || '')) && re.test(String(local || ''))) return String(remote) > String(local);
  return Boolean(remote) && remote !== local;
};

const readUpdateAttempts = (version) => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
    return raw && raw.version === version ? Number(raw.attempts) || 0 : 0;
  } catch { return 0; }
};

const registerUpdateAttempt = (version) => {
  const attempts = readUpdateAttempts(version) + 1;
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ version, attempts })); } catch {}
  return attempts;
};

// Na tela a versão aparece no padrão BR (dia/mês/ano e horário); por dentro continua
// AAAAMMDD-HHMM, que é o que o hook grava e o que vai no ?v= dos arquivos.
const formatAppVersion = (version) => {
  const m = String(version || '').match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : String(version || '');
};
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
  stuckNoticeShown: false,
  retryTimer: null
};

const hasUnsavedFormDraft = () => {
  const fields = [dom.inputDescription, dom.inputValue, dom.inputDueDay, dom.inputObservation];
  if (fields.some((field) => String(field?.value || '').trim())) return true;
  return [...document.querySelectorAll('.card-item-desc, .card-item-val, .terceiro-desc, .terceiro-pessoa, .terceiro-val')]
    .some((field) => String(field.value || '').trim());
};

// Atualizações nunca descartam formulário, diálogo ou edição em linha que ainda esteja aberta.
const hasOpenEditingSurface = () => {
  if (hasUnsavedFormDraft()) return true;
  if (document.querySelector('.modal.show, .card-item--editing')) return true;
  try { return Boolean(window.Swal?.isVisible?.()); } catch { return false; }
};

// Com a nuvem travada para esta versão antiga, a pendência não sobe mesmo: ela já está no
// espelho local e a versão nova envia depois de recarregar. Não deixa isso travar a atualização.
const canUpdateWithLocalPending = () =>
  Boolean(AppStorage.isOutdated?.()) && AppStorage.localSaveOk?.() !== false;

const savingBlocksUpdate = (saved) =>
  (saved === false || AppStorage.isDirty?.()) && !canUpdateWithLocalPending();

const showStuckUpdateNotice = (version) => {
  if (updateState.stuckNoticeShown) return;
  updateState.stuckNoticeShown = true;
  notify.error(`Não consegui atualizar sozinho para a versão ${formatAppVersion(version)}. Feche e abra o app ou pressione Ctrl+Shift+R. Suas alterações estão guardadas neste aparelho.`);
};

// Equivale ao Ctrl+Shift+F5: tira o service worker deste app e os caches "financas-*"
// e abre a página com um parâmetro novo, que fura o cache do navegador e da CDN.
const hardReloadForVersion = async (version) => {
  const scope = new URL('./', window.location.href).href;
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.filter((reg) => reg.scope === scope).map((reg) => reg.unregister()));
  } catch {}
  try {
    const names = (await caches?.keys?.()) || [];
    await Promise.all(names.filter((name) => name.startsWith('financas-')).map((name) => caches.delete(name)));
  } catch {}
  const url = new URL(window.location.href);
  url.searchParams.set(UPDATE_URL_PARAM, version);
  window.location.replace(url.toString());
};

const hasPendingUpdate = () => Boolean(
  updateState.targetVersion || updateState.waitingWorker || updateState.manualRefresh
);

const showPendingUpdateNotice = () => {
  if (updateState.noticeShown) return;
  updateState.noticeShown = true;
  const version = updateState.targetVersion ? ` v${formatAppVersion(updateState.targetVersion)}` : '';
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
    if (savingBlocksUpdate(saved) || hasOpenEditingSurface()) {
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
    // Versão nova publicada: recarrega sem cache. Limite por aba evita loop caso a CDN
    // ainda entregue a página antiga; depois disso pede para fechar/abrir o app.
    if (readUpdateAttempts(updateState.targetVersion) >= MAX_UPDATE_ATTEMPTS) {
      updateState.reloading = false;
      showStuckUpdateNotice(updateState.targetVersion);
      return;
    }
    registerUpdateAttempt(updateState.targetVersion);
    // Só remove os caches "financas-*" e o service worker deste app, nada de outros sites do domínio.
    await hardReloadForVersion(updateState.targetVersion);
    return;
  }
  window.location.reload();
};

const attemptPendingUpdate = async () => {
  if (!hasPendingUpdate() || updateState.applying || updateState.reloading || !navigator.onLine) return;
  if (hasOpenEditingSurface()) return;

  updateState.applying = true;
  try {
    const saved = await AppStorage.flush?.();
    if (savingBlocksUpdate(saved) || hasOpenEditingSurface()) return;

    const waiting = updateState.waitingWorker?.state === 'installed'
      ? updateState.waitingWorker
      : updateState.registration?.waiting;
    if (!waiting && updateState.waitingWorker) {
      // O sw.js novo já assumiu sozinho (skipWaiting na instalação): nada a ativar.
      // A página nova chega pela checagem de versão, que recarrega quando for seguro.
      updateState.waitingWorker = null;
      setTimeout(checkRemoteAppVersion, 0);
    }
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
    if (!isNewerVersion(remoteVersion, APP_VERSION)) return;
    if (readUpdateAttempts(remoteVersion) >= MAX_UPDATE_ATTEMPTS) {
      showStuckUpdateNotice(remoteVersion);
      return;
    }
    markUpdatePending({ version: remoteVersion });
  } catch {
    /* Sem rede no momento */
  }
};

const showAppVersion = () => {
  if (!dom.appVersion) return;
  dom.appVersion.textContent = `v${formatAppVersion(APP_VERSION)}`;
  dom.appVersion.title = `Versão ${formatAppVersion(APP_VERSION)} (${APP_VERSION}) — toque para buscar atualização`;
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

// Depois de uma atualização forçada: limpa o contador e o parâmetro ?atualizar= da barra.
const finishForcedUpdate = () => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
    if (raw && !isNewerVersion(raw.version, APP_VERSION)) sessionStorage.removeItem(RELOAD_GUARD_KEY);
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(UPDATE_URL_PARAM)) {
      url.searchParams.delete(UPDATE_URL_PARAM);
      history.replaceState(history.state, '', url.toString());
    }
  } catch {}
};

// A nuvem avisou que outro aparelho já usa versão mais nova: atualiza assim que for seguro.
const handleOutdatedClient = (event) => {
  const version = event?.detail?.versao;
  if (!version || !isNewerVersion(version, APP_VERSION)) return;
  notify.info(`Há uma versão mais nova do app (v${formatAppVersion(version)}). Suas alterações ficam guardadas neste aparelho e sobem para a nuvem depois de atualizar.`);
  updateState.noticeShown = true;
  markUpdatePending({ version });
};

const init = () => {
  dayjs.locale('pt-br');
  finishForcedUpdate();
  window.addEventListener('app:versao-desatualizada', handleOutdatedClient);
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
