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
let isReloadingForUpdate = false;

// Limpa todos os caches do PWA/Service Worker e recarrega buscando a versão mais recente da rede
const forceHardReload = async (targetVersion = '') => {
  if (isReloadingForUpdate) return;
  isReloadingForUpdate = true;
  if (typeof targetVersion === 'string' && targetVersion) {
    try { sessionStorage.setItem(RELOAD_GUARD_KEY, targetVersion); } catch {}
  }
  try {
    await AppStorage.flush?.();
  } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
  } catch {}
  window.location.reload();
};

// Verifica direto na rede se o index.html publicado tem uma versão mais nova que a aberta no PWA
const checkRemoteAppVersion = async () => {
  if (location.protocol === 'file:' || !navigator.onLine || isReloadingForUpdate) return;
  // Não recarrega no meio de um salvamento ou com modal de edição aberto
  if (AppStorage.isDirty?.() || dom.editModalEl?.classList.contains('show')) return;
  try {
    const res = await fetch(`./index.html?_vcheck=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!res.ok) return;
    const html = await res.text();
    const match = html.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i);
    const remoteVersion = match?.[1]?.trim();
    if (remoteVersion && remoteVersion !== APP_VERSION) {
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === remoteVersion) return;
      } catch {}
      notify.info(`Atualizando para a nova versão (v${remoteVersion})...`);
      setTimeout(() => forceHardReload(remoteVersion), 400);
    }
  } catch {
    /* Sem rede no momento */
  }
};

const showAppVersion = () => {
  if (!dom.appVersion) return;
  dom.appVersion.textContent = `v${APP_VERSION}`;
  dom.appVersion.hidden = false;
  // Clicar no selo de versão limpa o cache do PWA e recarrega a versão mais recente
  dom.appVersion.addEventListener('click', () => forceHardReload());
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
      scope: './',
      updateViaCache: 'none' // o próprio sw.js nunca vem do cache do navegador
    });

    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (!novo || !navigator.serviceWorker.controller) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          novo.postMessage({ type: 'SKIP_WAITING' });
        }
        if (novo.state === 'activated') {
          forceHardReload();
        }
      });
    });

    // Checa nova versão ao abrir o PWA, ao voltar para a janela/app e a cada 60s
    setTimeout(checkRemoteAppVersion, 1500);
    setInterval(checkRemoteAppVersion, 60000);

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
