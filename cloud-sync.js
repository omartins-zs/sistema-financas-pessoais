/**
 * ============================================================
 *  AppStorage — camada de armazenamento e sincronização
 * ============================================================
 *  - Espelha SEMPRE e instantaneamente (0ms) no localStorage
 *    para nunca perder dados ao fechar/recarregar a página.
 *  - Com Firebase ativo: sincroniza em tempo real (onSnapshot),
 *    faz merge inteligente item a item (_updatedAt / _deleted)
 *    para que um dispositivo/aba nunca sobrescreva alterações
 *    feitas em outro, e exibe indicador visual de status no topo.
 * ============================================================
 */

const AppStorage = (() => {
  const LS_KEY = 'financas_casa_dados';
  const LS_META_KEY = 'financas_casa_sync_meta';
  const isCloud = typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED;

  let onReady = () => {};
  let onRemoteUpdate = null;
  let auth = null;
  let db = null;
  let uid = null;
  let saveTimer = null;
  let booted = false;
  let unsubscribeSnapshot = null;
  let inFlightPromise = null;
  let isWriting = false;
  let isInitialLoadComplete = false;
  let pendingData = null;
  let latestUnmergedRemote = null;
  let lastWrittenJson = '';
  let lastWriteErrorCode = '';
  const dirtyIdsSet = new Set();
  const clientId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const MAX_FIRESTORE_DATA_BYTES = 900 * 1024;

  // ---------- DOM do login e indicador de sincronização ----------
  const el = (id) => document.getElementById(id);

  // Aviso flutuante e bem visível de salvamento ("Salvando..." → "Tudo salvo"),
  // para ninguém fechar o app achando que salvou quando ainda está enviando.
  let toastState = 'idle';
  let toastHideTimer = null;
  let lastCloudSavedAt = 0;
  let lastLocalSaveFailed = false;

  const getSaveToast = () => {
    let toast = el('saveToast');
    if (!toast && document.body) {
      toast = document.createElement('div');
      toast.id = 'saveToast';
      toast.className = 'save-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.hidden = true;
      document.body.appendChild(toast);
    }
    return toast;
  };

  const escToast = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const updateSaveToast = (state, detail = '') => {
    const toast = getSaveToast();
    if (!toast) return;
    clearTimeout(toastHideTimer);
    const prev = toastState;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Só mostra "salvo" se antes estava salvando/carregando/com erro (evita piscar à toa)
    if (state === 'saved' && (prev === 'idle' || prev === 'saved')) return;

    toastState = state;
    toast.classList.remove('is-saving', 'is-saved', 'is-offline', 'is-error');

    if (state === 'loading') {
      toast.classList.add('is-saving');
      toast.innerHTML = '<i class="bi bi-arrow-repeat sync-spin"></i><span>Carregando seus dados da nuvem...</span>';
      toast.hidden = false;
    } else if (state === 'saving') {
      toast.classList.add('is-saving');
      toast.innerHTML = '<i class="bi bi-arrow-repeat sync-spin"></i><span>Salvando na nuvem... <small>não feche o app</small></span>';
      toast.hidden = false;
    } else if (state === 'saved') {
      toast.classList.add('is-saved');
      toast.innerHTML = `<i class="bi bi-cloud-check-fill"></i><span>Tudo salvo na nuvem · ${hora}</span>`;
      toast.hidden = false;
      toastHideTimer = setTimeout(() => {
        toast.hidden = true;
        toastState = 'idle';
      }, 2600);
    } else if (state === 'offline') {
      toast.classList.add('is-offline');
      toast.innerHTML = `<i class="bi bi-wifi-off"></i><span>${escToast(detail || 'Sem internet: salvo neste aparelho. Envio automático quando a conexão voltar.')}</span>`;
      toast.hidden = false;
    } else if (state === 'error') {
      toast.classList.add('is-error');
      const localStatus = lastLocalSaveFailed
        ? ' Não foi possível confirmar o salvamento neste aparelho.'
        : ' Seus dados estão guardados neste aparelho.';
      toast.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i><span>${escToast(detail || 'Falha ao salvar na nuvem.')}${localStatus}</span><button type="button" class="save-toast__retry" data-save-retry>Tentar agora</button>`;
      toast.hidden = false;
    } else {
      toast.hidden = true;
      toastState = 'idle';
    }
  };

  const setSyncUI = (state, detail = '') => {
    if (state === 'saved') lastCloudSavedAt = Date.now();
    updateSaveToast(state, detail);
    if (state === 'loading') state = 'saving';
    const btn = el('btnSyncStatus');
    const icon = el('syncStatusIcon');
    const text = el('syncStatusText');
    if (!btn || !icon || !text) return;

    btn.hidden = false;
    btn.classList.remove('is-saving', 'is-saved', 'is-offline', 'is-error');
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (state === 'saving') {
      btn.classList.add('is-saving');
      icon.className = 'bi bi-arrow-repeat sync-spin';
      text.textContent = 'Salvando...';
      btn.title = 'Gravando alterações no banco Google (Firestore)...';
    } else if (state === 'saved') {
      btn.classList.add('is-saved');
      icon.className = 'bi bi-cloud-check-fill';
      text.textContent = 'Salvo';
      btn.title = detail || `Sincronizado na nuvem às ${hora} — clique para verificar/sincronizar agora`;
    } else if (state === 'offline') {
      btn.classList.add('is-offline');
      icon.className = 'bi bi-cloud-arrow-up-fill';
      text.textContent = 'Pendente';
      btn.title = detail || 'Salvo neste aparelho — aguardando conexão para enviar à nuvem (clique para tentar agora)';
    } else if (state === 'error') {
      btn.classList.add('is-error');
      icon.className = 'bi bi-exclamation-triangle-fill';
      text.textContent = 'Erro sync';
      btn.title = detail || 'Falha ao sincronizar com a nuvem — clique para tentar novamente';
    } else {
      btn.classList.add('is-saved');
      icon.className = 'bi bi-hdd-check-fill';
      text.textContent = 'Salvo local';
      btn.title = 'Dados salvos neste navegador';
    }
  };

  const showOverlay = (show) => {
    const overlay = el('authOverlay');
    if (overlay) overlay.hidden = !show;
    document.body.classList.toggle('auth-locked', show);
  };

  const setAuthError = (msg) => {
    const box = el('authError');
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  };

  const friendlyError = (code) => ({
    'auth/invalid-email': 'E-mail inválido.',
    'auth/missing-password': 'Informe a senha.',
    'auth/weak-password': 'A senha deve ter ao menos 6 caracteres.',
    'auth/email-already-in-use': 'Este e-mail já está cadastrado. Faça login.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'Conta não encontrada. Crie uma conta primeiro.',
    'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.'
  }[code] || 'Não foi possível autenticar. Tente novamente.');

  const notifySafe = (msg, type = 'success') => {
    try { window.appNotify?.[type]?.(msg); } catch {}
  };

  // ---------- Persistência local imediata (espelho síncrono) ----------
  const getLocalMeta = () => {
    try {
      const raw = localStorage.getItem(LS_META_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return { updatedAt: 0, dirty: false, uid: null, syncedAt: 0, dirtyIds: [] };
      }
      return {
        updatedAt: Number(parsed.updatedAt) || 0,
        dirty: Boolean(parsed.dirty),
        uid: parsed.uid || null,
        syncedAt: Number(parsed.syncedAt) || 0,
        dirtyIds: Array.isArray(parsed.dirtyIds) ? parsed.dirtyIds : []
      };
    } catch {
      return { updatedAt: 0, dirty: false, uid: null, syncedAt: 0, dirtyIds: [] };
    }
  };

  // Inicializa o conjunto de IDs sujos pendentes de sincronização a partir do localStorage
  getLocalMeta().dirtyIds.forEach((id) => {
    if (id) dirtyIdsSet.add(id);
  });

  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const localSave = (data, dirty = false) => {
    try {
      const prevMeta = getLocalMeta();
      if (!dirty) {
        dirtyIdsSet.clear();
      }
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      localStorage.setItem(LS_META_KEY, JSON.stringify({
        updatedAt: Date.now(),
        dirty: Boolean(dirty),
        uid: uid || prevMeta.uid || null,
        syncedAt: dirty ? (prevMeta.syncedAt || 0) : Date.now(),
        dirtyIds: dirty ? [...dirtyIdsSet] : []
      }));
      lastLocalSaveFailed = false;
      return true;
    } catch (err) {
      lastLocalSaveFailed = true;
      console.error('[AppStorage] Falha ao gravar no armazenamento local:', err);
      return false;
    }
  };

  const markDirtyIds = (ids = []) => {
    if (!Array.isArray(ids) || !ids.length) return;
    ids.forEach((id) => {
      if (id) dirtyIdsSet.add(id);
    });
    try {
      const prevMeta = getLocalMeta();
      localStorage.setItem(LS_META_KEY, JSON.stringify({
        ...prevMeta,
        updatedAt: Date.now(),
        dirty: true,
        uid: uid || prevMeta.uid || null,
        dirtyIds: [...dirtyIdsSet]
      }));
    } catch {}
  };

  const markLocalClean = () => {
    try {
      dirtyIdsSet.clear();
      const meta = getLocalMeta();
      localStorage.setItem(LS_META_KEY, JSON.stringify({
        ...meta,
        dirty: false,
        dirtyIds: [],
        uid: uid || meta.uid || null,
        syncedAt: Date.now()
      }));
    } catch {}
  };

  const hasEntries = (obj) =>
    obj && typeof obj === 'object' && Object.keys(obj).some((k) => k !== '__app' ? (Array.isArray(obj[k]) && obj[k].length > 0) : Object.keys(obj.__app || {}).length > 0);

  // ---------- Merge inteligente (sem perda entre dispositivos/abas) ----------
  const stripMeta = (item) => {
    if (!item || typeof item !== 'object') return item;
    const { _updatedAt, ...rest } = item;
    return rest;
  };

  const mergeSubListById = (listA = [], listB = [], deletedMap = {}) => {
    const map = new Map();
    [...listA, ...listB].forEach((item) => {
      if (!item || !item.id) return;
      const delAt = Number(deletedMap[item.id]) || 0;
      const itemAt = Number(item._updatedAt) || 0;
      if (delAt > 0 && delAt >= itemAt) return;
      const prev = map.get(item.id);
      if (!prev || itemAt >= (Number(prev._updatedAt) || 0)) {
        map.set(item.id, item);
      }
    });
    return [...map.values()];
  };

  const pickWinnerItem = (localItem, remoteItem, preferLocalOnTie = false, syncedAt = 0, deletedMap = {}) => {
    if (!localItem) return remoteItem;
    if (!remoteItem) return localItem;

    // Se o conteúdo útil é idêntico, preserva o maior timestamp
    const sameContent = JSON.stringify(stripMeta(localItem)) === JSON.stringify(stripMeta(remoteItem));
    const tL = Number(localItem._updatedAt) || 0;
    const tR = Number(remoteItem._updatedAt) || 0;

    if (sameContent) {
      const base = tL >= tR ? { ...localItem } : { ...remoteItem };
      if (Math.max(tL, tR) > 0) base._updatedAt = Math.max(tL, tR);
      return base;
    }

    const id = localItem.id || remoteItem.id;
    const isItemDirtyLocally = Boolean(
      (id && dirtyIdsSet.has(id)) ||
      (preferLocalOnTie && syncedAt > 0 && tL > syncedAt)
    );

    let winner;
    if (isItemDirtyLocally) {
      // Item foi editado neste dispositivo e ainda não sincronizou: vence local, a menos que remoto seja ainda mais novo
      winner = (tR > tL) ? { ...remoteItem } : { ...localItem };
    } else if (!preferLocalOnTie || dirtyIdsSet.size > 0 || syncedAt > 0) {
      // Este dispositivo NÃO tem edição pendente neste item: a versão que veio da nuvem é a mais atual
      winner = { ...remoteItem };
      if (Math.max(tL, tR) > 0) winner._updatedAt = Math.max(tL, tR);
    } else {
      // Fallback por timestamp quando preferLocalOnTie=true mas sem registro em dirtyIdsSet
      if (tL > 0 && tR > 0) {
        winner = tL >= tR ? { ...localItem } : { ...remoteItem };
      } else if (tR > 0) {
        winner = { ...remoteItem };
      } else {
        winner = { ...localItem };
      }
    }

    // Preserva sub-listas de aportes (metas) e movimentações (reservas)
    if (Array.isArray(localItem.aportes) || Array.isArray(remoteItem.aportes)) {
      winner.aportes = mergeSubListById(remoteItem.aportes, localItem.aportes, deletedMap);
    }
    if (Array.isArray(localItem.movimentacoes) || Array.isArray(remoteItem.movimentacoes)) {
      winner.movimentacoes = mergeSubListById(remoteItem.movimentacoes, localItem.movimentacoes, deletedMap);
    }
    return winner;
  };

  const mergeListById = (localList = [], remoteList = [], deletedMap = {}, preferLocalOnTie = false, syncedAt = 0) => {
    const mapL = new Map();
    const mapR = new Map();
    const order = [];
    const seen = new Set();

    const isAlive = (item) => {
      if (!item || !item.id) return false;
      const delAt = Number(deletedMap[item.id]) || 0;
      const itemAt = Number(item._updatedAt) || 0;
      return !(delAt > 0 && delAt >= itemAt);
    };

    remoteList.forEach((item) => {
      if (!isAlive(item)) return;
      mapR.set(item.id, item);
      if (!seen.has(item.id)) {
        seen.add(item.id);
        order.push(item.id);
      }
    });

    localList.forEach((item) => {
      if (!isAlive(item)) return;
      mapL.set(item.id, item);
      if (!seen.has(item.id)) {
        seen.add(item.id);
        order.push(item.id);
      }
    });

    return order.map((id) => {
      const itemL = mapL.get(id);
      const itemR = mapR.get(id);
      if (itemL && itemR) {
        return pickWinnerItem(itemL, itemR, preferLocalOnTie, syncedAt, deletedMap);
      }
      return itemL || itemR;
    }).filter(Boolean);
  };

  const mergeHistorico = (histA = [], histB = []) => {
    const map = new Map();
    [...histA, ...histB].forEach((r) => {
      if (!r || !r.id) return;
      const prev = map.get(r.id);
      if (!prev) {
        map.set(r.id, { ...r });
      } else {
        map.set(r.id, {
          ...prev,
          ...r,
          desfeito: Boolean(prev.desfeito || r.desfeito)
        });
      }
    });
    const merged = [...map.values()].sort((a, b) => String(b.quando || '').localeCompare(String(a.quando || '')));
    while (merged.length > 150) merged.pop();
    while (merged.length > 1 && JSON.stringify(merged).length > 150000) merged.pop();
    return merged;
  };

  // Combina localData e remoteData preservando as edições mais recentes de cada lançamento,
  // módulo e histórico (nenhum dispositivo apaga o que o outro salvou).
  const mergeAllData = (localData = {}, remoteData = {}, preferLocalOnTie = true) => {
    if (!hasEntries(remoteData)) return JSON.parse(JSON.stringify(localData || {}));
    if (!hasEntries(localData)) return JSON.parse(JSON.stringify(remoteData || {}));

    const local = JSON.parse(JSON.stringify(localData));
    const remote = JSON.parse(JSON.stringify(remoteData));
    const out = {};
    const syncedAt = getLocalMeta().syncedAt || 0;

    const appL = (local.__app && typeof local.__app === 'object') ? local.__app : {};
    const appR = (remote.__app && typeof remote.__app === 'object') ? remote.__app : {};

    // Mapa unificado de exclusões (tombstones)
    const deletedMap = { ...(appR._deleted || {}), ...(appL._deleted || {}) };
    Object.keys(appR._deleted || {}).forEach((id) => {
      const tR = Number(appR._deleted[id]) || 0;
      const tL = Number(appL._deleted?.[id]) || 0;
      deletedMap[id] = Math.max(tR, tL);
    });
    // Limpa tombstones com mais de 90 dias para não crescer indefinidamente
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    Object.keys(deletedMap).forEach((id) => {
      if (deletedMap[id] < cutoff) delete deletedMap[id];
    });

    // Meses (YYYY-MM)
    const monthKeys = new Set([
      ...Object.keys(remote).filter((k) => /^\d{4}-\d{2}$/.test(k)),
      ...Object.keys(local).filter((k) => /^\d{4}-\d{2}$/.test(k))
    ]);

    monthKeys.forEach((mes) => {
      const listL = Array.isArray(local[mes]) ? local[mes] : [];
      const listR = Array.isArray(remote[mes]) ? remote[mes] : [];
      out[mes] = mergeListById(listL, listR, deletedMap, preferLocalOnTie, syncedAt);
    });

    // Módulos em __app
    const collections = ['metas', 'reservas', 'cartoes', 'comprasCartao', 'investimentos', 'patrimonio', 'assinaturas', 'passeios'];
    const mergedApp = { ...appR, ...appL, _deleted: deletedMap };

    collections.forEach((col) => {
      const listL = Array.isArray(appL[col]) ? appL[col] : [];
      const listR = Array.isArray(appR[col]) ? appR[col] : [];
      mergedApp[col] = mergeListById(listL, listR, deletedMap, preferLocalOnTie, syncedAt);
    });

    // Categorias: vence a atualizada mais recentemente
    const catAtL = Number(appL._categoriasUpdatedAt) || 0;
    const catAtR = Number(appR._categoriasUpdatedAt) || 0;
    if (catAtR >= catAtL && catAtR > 0) {
      if (appR.categorias) mergedApp.categorias = appR.categorias;
      if (appR.categoriasPapel) mergedApp.categoriasPapel = appR.categoriasPapel;
      mergedApp._categoriasUpdatedAt = catAtR;
    } else if (catAtL > 0) {
      mergedApp._categoriasUpdatedAt = catAtL;
    } else if (appR.categorias) {
      mergedApp.categorias = appR.categorias;
      if (appR.categoriasPapel) mergedApp.categoriasPapel = appR.categoriasPapel;
    }

    // Histórico: união completa sem perda
    mergedApp.historico = mergeHistorico(appL.historico, appR.historico);
    mergedApp._updatedAt = Math.max(Number(appL._updatedAt) || 0, Number(appR._updatedAt) || 0, Date.now());

    out.__app = mergedApp;
    return out;
  };

  // ---------- Backups automáticos e log de auditoria ----------
  // 1) Backup no APARELHO (IndexedDB): cópia completa a cada ~3 min de uso, ao abrir
  //    o app e antes de qualquer ação perigosa (restaurar, limpar mês...).
  // 2) Backup na NUVEM (financas/{uid}/backups): 1 por hora (24 slots rotativos)
  //    + 1 por dia (histórico diário permanente).
  // 3) LOG (financas/{uid}/logs + IndexedDB): toda gravação na nuvem registra quem
  //    (nome do aparelho), quando, o que mudou e quantos lançamentos havia por mês.
  const DEVICE_KEY = 'financas_casa_device_name';
  const CLOUD_BACKUP_SLOT_KEY = 'financas_casa_last_cloud_backup';
  const LOCAL_BACKUP_INTERVAL_MS = 3 * 60 * 1000;
  const LOCAL_BACKUP_KEEP_RECENT = 40;
  const LOCAL_BACKUP_KEEP_DAYS = 45;
  const LOCAL_LOG_MAX = 10000;
  const LOG_DETAIL_MAX_CHARS = 300000;
  const MODULE_COLLECTIONS = ['metas', 'reservas', 'cartoes', 'comprasCartao', 'investimentos', 'patrimonio', 'assinaturas', 'passeios'];
  let cloudExtrasError = '';
  let lastLocalBackupAt = 0;
  let retryTimer = null;
  let retryCount = 0;
  const loggedHistIds = new Set();
  const auditWrites = new Map();

  const appVersion = () => document.querySelector?.('meta[name="app-version"]')?.content?.trim() || 'dev';

  const detectDevice = () => {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const so = /iPhone/i.test(ua) ? 'iPhone'
      : /iPad/i.test(ua) ? 'iPad'
        : /Android/i.test(ua) ? 'Android'
          : /Windows/i.test(ua) ? 'Windows'
            : /Mac/i.test(ua) ? 'Mac'
              : /Linux/i.test(ua) ? 'Linux' : 'Aparelho';
    const nav = /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
        : /SamsungBrowser/i.test(ua) ? 'Samsung'
          : /CriOS|Chrome\//.test(ua) ? 'Chrome'
            : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
              : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
    let pwa = '';
    try {
      if (window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone) pwa = ' (app)';
    } catch {}
    return `${so} · ${nav}${pwa}`;
  };

  const getDeviceName = () => {
    try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
  };

  const setDeviceName = (name) => {
    try { localStorage.setItem(DEVICE_KEY, String(name || '').trim().slice(0, 40)); } catch {}
  };

  const autorInfo = () => ({
    autor: getDeviceName() || 'Sem nome',
    aparelho: detectDevice(),
    clientId,
    email: auth?.currentUser?.email || '',
    versao: appVersion()
  });

  const contarDados = (data) => {
    const meses = {};
    let lancamentos = 0;
    Object.keys(data || {}).forEach((k) => {
      if (/^\d{4}-\d{2}$/.test(k) && Array.isArray(data[k])) {
        meses[k] = data[k].length;
        lancamentos += data[k].length;
      }
    });
    const app = (data && data.__app) || {};
    const modulos = {};
    MODULE_COLLECTIONS.forEach((c) => {
      if (Array.isArray(app[c]) && app[c].length) modulos[c] = app[c].length;
    });
    return { meses, lancamentos, modulos };
  };

  // --- IndexedDB (cópias no próprio aparelho, não depende de internet nem de regras do Firebase) ---
  const IDB_NAME = 'financas_casa_backup';
  let idbPromise = null;
  const openIdb = () => {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB indisponível'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        ['snapshots', 'snapmeta', 'logs'].forEach((store) => {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    idbPromise.catch(() => { idbPromise = null; });
    return idbPromise;
  };

  const idbRequest = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const idbTxDone = (tx) => new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  const idbPut = async (store, value) => {
    const database = await openIdb();
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return idbTxDone(tx);
  };

  const idbGet = async (store, id) => {
    const database = await openIdb();
    return idbRequest(database.transaction(store, 'readonly').objectStore(store).get(id));
  };

  const idbGetAll = async (store) => {
    const database = await openIdb();
    return idbRequest(database.transaction(store, 'readonly').objectStore(store).getAll());
  };

  const idbGetAllKeys = async (store) => {
    const database = await openIdb();
    return idbRequest(database.transaction(store, 'readonly').objectStore(store).getAllKeys());
  };

  const idbDelete = async (store, ids = []) => {
    if (!ids.length) return true;
    const database = await openIdb();
    const tx = database.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    ids.forEach((id) => st.delete(id));
    return idbTxDone(tx);
  };

  const novoIdOrdenado = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // Mantém as últimas 40 cópias + 1 por dia nos últimos 45 dias
  const podarBackupsLocais = async () => {
    const metas = (await idbGetAll('snapmeta')).sort((a, b) => b.quando - a.quando);
    const manter = new Set();
    const diasVistos = new Set();
    const limiteDias = Date.now() - LOCAL_BACKUP_KEEP_DAYS * 24 * 60 * 60 * 1000;
    metas.forEach((m, i) => {
      if (i < LOCAL_BACKUP_KEEP_RECENT) { manter.add(m.id); return; }
      if (m.quando < limiteDias) return;
      const dia = new Date(m.quando).toDateString();
      if (!diasVistos.has(dia)) { diasVistos.add(dia); manter.add(m.id); }
    });
    const remover = metas.filter((m) => !manter.has(m.id)).map((m) => m.id);
    if (remover.length) {
      await idbDelete('snapmeta', remover);
      await idbDelete('snapshots', remover);
    }
  };

  const salvarBackupLocal = async (data, motivo = 'automático', force = false) => {
    if (!data || !hasEntries(data)) return false;
    const now = Date.now();
    if (!force && now - lastLocalBackupAt < LOCAL_BACKUP_INTERVAL_MS) return false;
    lastLocalBackupAt = now;
    try {
      const id = novoIdOrdenado();
      const json = JSON.stringify(data);
      await idbPut('snapshots', { id, data: json });
      await idbPut('snapmeta', { id, quando: now, motivo, tamanho: json.length, ...contarDados(data), ...autorInfo() });
      await podarBackupsLocais();
      return true;
    } catch (err) {
      console.warn('[AppStorage] Não foi possível criar backup local:', err);
      return false;
    }
  };

  const registrarLogLocal = async (entry) => {
    try {
      await idbPut('logs', entry);
      const keys = await idbGetAllKeys('logs');
      if (keys.length > LOCAL_LOG_MAX) await idbDelete('logs', keys.slice(0, keys.length - LOCAL_LOG_MAX));
    } catch {}
  };

  // Cada alteração recebe seu próprio registro local e na nuvem. O histórico
  // embutido no documento principal continua servindo ao desfazer imediato;
  // esta cópia individual não depende do limite de tamanho desse documento.
  const enviarEventoAuditoria = (entry) => {
    if (auditWrites.has(entry.id)) return auditWrites.get(entry.id);
    const promise = (async () => {
      if (!podeUsarExtrasNuvem()) return false;
      try {
        const ref = userDoc().collection('logs').doc(entry.id);
        const existing = await ref.get();
        if (!existing.exists) {
          try {
            await ref.set({
              ...entry,
              cloudSaved: true,
              servidorEm: firebase.firestore.FieldValue.serverTimestamp()
            });
          } catch (err) {
            // Outro aparelho pode ter criado o mesmo id em paralelo. Os logs são
            // imutáveis; basta confirmar que o registro idempotente já existe.
            const afterRace = await ref.get();
            if (!afterRace.exists) throw err;
          }
        }
        await idbPut('logs', { ...entry, cloudSaved: true, origem: 'aparelho' });
        return true;
      } catch (err) {
        handleExtrasError(err);
        return false;
      }
    })();
    auditWrites.set(entry.id, promise);
    promise.finally(() => auditWrites.delete(entry.id));
    return promise;
  };

  const registrarEventoAuditoria = async (evento) => {
    if (!evento?.id) return false;
    let detalhesJson = '';
    try { detalhesJson = JSON.stringify({ evento }); } catch {}
    const entry = {
      id: `auditoria-${evento.id}`,
      tipo: 'alteracao',
      quando: Date.parse(evento.quando) || Date.now(),
      resumo: String(evento.acao || 'Alteração registrada').slice(0, 2000),
      detalhesJson,
      cloudSaved: false,
      ...autorInfo()
    };
    await registrarLogLocal(entry);
    return enviarEventoAuditoria(entry);
  };

  const sincronizarAuditoriasPendentes = async () => {
    if (!podeUsarExtrasNuvem()) return;
    try {
      const logs = await idbGetAll('logs');
      for (const entry of logs) {
        if (entry?.tipo === 'alteracao' && !entry.cloudSaved) {
          await enviarEventoAuditoria(entry);
        }
      }
    } catch {}
  };

  const userDoc = () => db.collection('financas').doc(uid);

  const handleExtrasError = (err) => {
    cloudExtrasError = err?.code || 'erro';
    console.warn('[AppStorage] Backup/log na nuvem indisponível:', err);
  };

  const podeUsarExtrasNuvem = () => Boolean(isCloud && uid && db && navigator.onLine && cloudExtrasError !== 'permission-denied');

  // Registra um evento no log (aparelho + nuvem). Nunca bloqueia o salvamento principal.
  const registrarLog = async (tipo, resumo = '', detalhes = null) => {
    let detalhesJson = '';
    if (detalhes) {
      try {
        detalhesJson = JSON.stringify(detalhes);
        if (detalhesJson.length > LOG_DETAIL_MAX_CHARS) {
          const leve = { ...detalhes };
          if (Array.isArray(leve.acoes)) {
            leve.acoes = leve.acoes.map((a) => ({ id: a.id, quando: a.quando, acao: a.acao, mes: a.mes, colecao: a.colecao, autor: a.autor }));
          }
          leve.truncado = true;
          detalhesJson = JSON.stringify(leve).slice(0, LOG_DETAIL_MAX_CHARS);
        }
      } catch {
        detalhesJson = '';
      }
    }
    const entry = {
      id: novoIdOrdenado(),
      tipo,
      quando: Date.now(),
      resumo: String(resumo || '').slice(0, 2000),
      detalhesJson,
      ...autorInfo()
    };
    registrarLogLocal(entry);
    if (!podeUsarExtrasNuvem()) return;
    try {
      await userDoc().collection('logs').doc(entry.id).set({
        ...entry,
        servidorEm: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      handleExtrasError(err);
    }
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const slotDia = (d) => `dia-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const slotHora = (d) => `hora-${pad2(d.getHours())}`;

  // Backup completo na nuvem: no máx. 1 por hora (slot rotativo hora-HH) + o do dia (dia-AAAA-MM-DD)
  const salvarBackupNuvem = async (serialized, data, motivo = 'automático', force = false) => {
    if (!podeUsarExtrasNuvem() || !serialized || !hasEntries(data)) return false;
    const d = new Date();
    const chaveHora = `${slotDia(d)}_${slotHora(d)}`;
    let ultima = '';
    try { ultima = localStorage.getItem(CLOUD_BACKUP_SLOT_KEY) || ''; } catch {}
    if (!force && ultima === chaveHora) return false;
    try { localStorage.setItem(CLOUD_BACKUP_SLOT_KEY, chaveHora); } catch {}

    const meta = {
      quando: Date.now(),
      motivo,
      tamanho: serialized.length,
      resumoJson: JSON.stringify(contarDados(data)),
      ...autorInfo()
    };
    const ids = force ? [`manual-${novoIdOrdenado()}`] : [slotHora(d), slotDia(d)];
    try {
      const batch = db.batch();
      ids.forEach((id) => {
        batch.set(userDoc().collection('backups').doc(id), { ...meta, slot: id, data: serialized });
        batch.set(userDoc().collection('backupsMeta').doc(id), { ...meta, slot: id });
      });
      await batch.commit();
      return true;
    } catch (err) {
      try { localStorage.setItem(CLOUD_BACKUP_SLOT_KEY, ultima); } catch {}
      handleExtrasError(err);
      return false;
    }
  };

  const marcarHistoricoVisto = (data) => {
    const h = data?.__app?.historico;
    if (Array.isArray(h)) h.forEach((r) => { if (r?.id) loggedHistIds.add(r.id); });
  };

  // Entradas do histórico criadas neste aparelho que ainda não foram para o log
  const extrairAcoesNovas = (data) => {
    const h = data?.__app?.historico;
    if (!Array.isArray(h)) return [];
    const novas = h.filter((r) => r?.id && !loggedHistIds.has(r.id));
    novas.forEach((r) => loggedHistIds.add(r.id));
    return novas;
  };

  // Compara a contagem de lançamentos por mês para alertar no log quando algo sumiu
  const compararContagens = (antes, depois) => {
    if (!antes || !depois) return [];
    const alertas = [];
    const meses = new Set([...Object.keys(antes.meses || {}), ...Object.keys(depois.meses || {})]);
    meses.forEach((m) => {
      const a = antes.meses?.[m] || 0;
      const d = depois.meses?.[m] || 0;
      if (a !== d) alertas.push(`${m}: ${a} → ${d}`);
    });
    return alertas;
  };

  const listarBackups = async () => {
    const out = { nuvem: [], aparelho: [], erroNuvem: '' };
    try {
      out.aparelho = (await idbGetAll('snapmeta')).sort((a, b) => b.quando - a.quando);
    } catch {}
    if (isCloud && uid && db && cloudExtrasError !== 'permission-denied') {
      try {
        const qs = await userDoc().collection('backupsMeta').orderBy('quando', 'desc').limit(80).get();
        out.nuvem = qs.docs.map((doc) => {
          const m = doc.data() || {};
          let resumo = {};
          try { resumo = JSON.parse(m.resumoJson || '{}'); } catch {}
          return { id: doc.id, ...m, ...resumo };
        });
      } catch (err) {
        handleExtrasError(err);
      }
    }
    out.erroNuvem = cloudExtrasError;
    return out;
  };

  const obterBackup = async (origem, id) => {
    if (origem === 'nuvem') {
      const snap = await userDoc().collection('backups').doc(id).get();
      const raw = snap.exists ? snap.data()?.data : '';
      return raw ? JSON.parse(raw) : null;
    }
    const rec = await idbGet('snapshots', id);
    return rec?.data ? JSON.parse(rec.data) : null;
  };

  const listarLogs = async (limite = 150) => {
    let nuvem = [];
    if (isCloud && uid && db && cloudExtrasError !== 'permission-denied') {
      try {
        const qs = await userDoc().collection('logs').orderBy('quando', 'desc').limit(limite).get();
        nuvem = qs.docs.map((doc) => ({ ...doc.data(), origem: 'nuvem' }));
      } catch (err) {
        handleExtrasError(err);
      }
    }
    let local = [];
    try { local = (await idbGetAll('logs')).map((l) => ({ ...l, origem: 'aparelho' })); } catch {}
    const map = new Map();
    [...local, ...nuvem].forEach((l) => {
      if (l?.id) map.set(l.id, { ...(map.get(l.id) || {}), ...l });
    });
    return {
      logs: [...map.values()].sort((a, b) => (b.quando || 0) - (a.quando || 0)).slice(0, limite),
      erroNuvem: cloudExtrasError
    };
  };

  const listarLogsPaginado = async (limite = 100, cursor = null) => {
    let nuvem = [];
    let proximoCursor = null;
    let temMais = false;
    if (isCloud && uid && db && cloudExtrasError !== 'permission-denied') {
      try {
        let consulta = userDoc().collection('logs').orderBy('quando', 'desc');
        if (cursor) consulta = consulta.startAfter(cursor);
        const qs = await consulta.limit(limite).get();
        nuvem = qs.docs.map((doc) => ({ ...doc.data(), origem: 'nuvem' }));
        proximoCursor = qs.docs.at(-1) || null;
        temMais = qs.docs.length === limite;
      } catch (err) {
        handleExtrasError(err);
      }
    }
    let local = [];
    try { local = (await idbGetAll('logs')).map((entry) => ({ ...entry, origem: 'aparelho' })); } catch {}
    return { nuvem, local, cursor: proximoCursor, temMais, erroNuvem: cloudExtrasError };
  };

  // Backup imediato (aparelho + nuvem) — usado antes de restaurar/limpar/importar
  const backupNow = async (data, motivo = 'manual', { nuvem = true } = {}) => {
    const snapshot = data && hasEntries(data) ? data : localLoad();
    const okLocal = await salvarBackupLocal(snapshot, motivo, true);
    let okNuvem = false;
    if (nuvem && podeUsarExtrasNuvem()) {
      okNuvem = await salvarBackupNuvem(JSON.stringify(snapshot), snapshot, motivo, true);
    }
    return { okLocal, okNuvem, erroNuvem: cloudExtrasError };
  };

  // ---------- Modo nuvem (Firebase Auth + Firestore) ----------
  const fetchServerDocWithTimeout = async (timeoutMs = 4500) => {
    const docRef = db.collection('financas').doc(uid);
    if (navigator.onLine) {
      try {
        return await Promise.race([
          docRef.get({ source: 'server' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
      } catch {
        /* cai para o get padrão (cache/servidor) */
      }
    }
    return await docRef.get();
  };

  const fetchCloudDoc = () => fetchServerDocWithTimeout(5000);

  const writeToFirestore = async (data) => {
    if (!uid || !db) return false;
    setSyncUI('saving');

    const docRef = db.collection('financas').doc(uid);
    let finalToWrite = data;
    let remoteBase = null;
    let contagemAntes = null;

    try {
      // A leitura e a gravação acontecem na mesma transação. Se outro aparelho
      // gravar primeiro, o Firestore repete esta função com a versão mais recente.
      const result = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(docRef);
        let remote = null;
        if (snap.exists) {
          const raw = snap.data()?.data;
          if (raw) {
            try { remote = JSON.parse(raw); } catch {}
          }
        }

        const merged = remote && hasEntries(remote)
          ? mergeAllData(data, remote, true)
          : data;
        const serialized = JSON.stringify(merged);
        const bytes = new TextEncoder().encode(serialized).byteLength;
        if (bytes > MAX_FIRESTORE_DATA_BYTES) {
          const sizeError = new Error('O conjunto de dados excedeu o limite seguro para o documento Firestore.');
          sizeError.code = 'app/document-too-large';
          throw sizeError;
        }
        transaction.set(docRef, {
          data: serialized,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          clientUpdatedAt: Date.now(),
          clientId
        });
        return { data: merged, remote };
      });

      finalToWrite = result.data;
      remoteBase = result.remote;
      const serialized = JSON.stringify(finalToWrite);
      lastWrittenJson = serialized;

      // Não substitui o espelho local se uma edição nova chegou enquanto a
      // transação estava em andamento; a fila enviará essa edição em seguida.
      if (JSON.stringify(data) !== serialized && !pendingData) {
        localSave(finalToWrite, true);
        if (typeof onRemoteUpdate === 'function') onRemoteUpdate(finalToWrite, true);
      }

      if (remoteBase) marcarHistoricoVisto(remoteBase);
      contagemAntes = remoteBase ? contarDados(remoteBase) : null;
      retryCount = 0;
      lastWriteErrorCode = '';
      clearTimeout(retryTimer);
      retryTimer = null;
      if (!pendingData) {
        markLocalClean();
        setSyncUI('saved');
      }

      // Log e backup não bloqueiam a confirmação do salvamento principal.
      try {
        const acoes = extrairAcoesNovas(finalToWrite);
        const contagemDepois = contarDados(finalToWrite);
        const mudancasContagem = compararContagens(contagemAntes, contagemDepois);
        const resumo = acoes.length
          ? acoes.map((a) => a.acao).filter(Boolean).join(' | ')
          : (mudancasContagem.length ? `sincronizou (${mudancasContagem.join(', ')})` : 'sincronizou');
        registrarLog('salvou', resumo, { acoes, contagemAntes, contagemDepois, mudancasContagem });
        sincronizarAuditoriasPendentes();
        salvarBackupNuvem(serialized, finalToWrite);
      } catch {}
      return true;
    } catch (err) {
      lastWriteErrorCode = err?.code || 'unknown';
      console.error('[AppStorage] Erro ao salvar no Firestore:', err);
      registrarLog('erro', `Falha ao salvar na nuvem (${err?.code || 'desconhecido'})`);
      if (err?.code === 'app/document-too-large') {
        const localStatus = lastLocalSaveFailed
          ? ' Também falhou a gravação local neste navegador; mantenha o app aberto e exporte os dados assim que possível.'
          : ' A cópia local permanece marcada como pendente.';
        setSyncUI('error', `Os dados passaram de 900 KiB para envio seguro ao Firestore. Exporte um JSON e reduza o histórico.${localStatus}`);
        notifySafe(`A nuvem não aceitou o volume atual.${localStatus} Exporte um JSON antes de remover histórico.`, 'error');
      } else if (!navigator.onLine || err?.code === 'unavailable') {
        setSyncUI(lastLocalSaveFailed ? 'error' : 'offline', lastLocalSaveFailed
          ? 'Sem conexão com a nuvem e falha ao salvar neste aparelho.'
          : 'Sem internet: alterações salvas neste aparelho e aguardando envio.');
      } else {
        const detail = lastLocalSaveFailed
          ? `Falha ao salvar na nuvem (${err?.code || 'desconhecido'}) e neste aparelho.`
          : `Erro ao salvar na nuvem (${err?.code || 'desconhecido'}).`;
        setSyncUI('error', detail);
        notifySafe(lastLocalSaveFailed
          ? 'Atenção: nuvem e armazenamento local falharam. Mantenha o app aberto e tente novamente.'
          : 'Atenção: falha ao sincronizar na nuvem. Dados guardados neste aparelho; tentando novamente...', 'error');
      }
      return false;
    }
  };

  // Se a gravação falhar, tenta de novo sozinho (3s, 6s, 12s... até 1 min)
  const agendarNovaTentativa = () => {
    clearTimeout(retryTimer);
    retryTimer = null;
    if (!navigator.onLine) return; // o evento 'online' reenvia
    const delay = Math.min(60000, 3000 * (2 ** retryCount));
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!pendingData) {
        const local = localLoad();
        if (getLocalMeta().dirty && hasEntries(local)) pendingData = local;
      }
      processWriteQueue();
    }, delay);
  };

  const erroPermanenteDeGravacao = (code) => [
    'app/document-too-large',
    'permission-denied',
    'unauthenticated',
    'invalid-argument',
    'resource-exhausted',
    'failed-precondition'
  ].includes(code);

  const processWriteQueue = async () => {
    if (isWriting) return inFlightPromise || true;
    if (!uid || !db) return false;
    isWriting = true;
    inFlightPromise = (async () => {
      let lastOk = true;
      try {
        while (pendingData && uid && db) {
          const dataToSave = pendingData;
          pendingData = null;
          lastOk = await writeToFirestore(dataToSave);
          if (!lastOk) break;
        }
      } finally {
        isWriting = false;
        inFlightPromise = null;
      }
      if (!lastOk && !erroPermanenteDeGravacao(lastWriteErrorCode)) agendarNovaTentativa();
      return lastOk;
    })();
    return await inFlightPromise;
  };

  const flushCloudSave = async () => {
    if (!isCloud || !uid) return true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingData) {
      return await processWriteQueue();
    }
    if (inFlightPromise) {
      return await inFlightPromise;
    }
    return true;
  };

  const pullFromCloudIfChanged = async () => {
    if (!isCloud || !uid || !db || !navigator.onLine) return;
    if (saveTimer || pendingData || isWriting) return;
    try {
      const snap = await fetchServerDocWithTimeout(4000);
      if (!snap || !snap.exists || snap.metadata?.hasPendingWrites) return;
      const raw = snap.data()?.data;
      if (!raw || raw === lastWrittenJson) return;
      let remoteObj = null;
      try { remoteObj = JSON.parse(raw); } catch { return; }
      if (!remoteObj || typeof remoteObj !== 'object') return;
      marcarHistoricoVisto(remoteObj);

      lastWrittenJson = raw;
      if (typeof onRemoteUpdate === 'function') {
        onRemoteUpdate(remoteObj);
      }
      setSyncUI('saved');
    } catch {}
  };

  const subscribeRealtime = () => {
    if (unsubscribeSnapshot) {
      try { unsubscribeSnapshot(); } catch {}
      unsubscribeSnapshot = null;
    }
    if (!db || !uid) return;

    unsubscribeSnapshot = db.collection('financas').doc(uid).onSnapshot(
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists) return;
        // Se há escrita local pendente no SDK, não sobrescreve
        if (snap.metadata.hasPendingWrites) {
          setSyncUI('saving');
          return;
        }
        // Ignora disparo de cache antigo se a carga inicial já terminou
        if (snap.metadata.fromCache && isInitialLoadComplete) {
          return;
        }
        const raw = snap.data()?.data;
        if (!raw) return;
        if (raw === lastWrittenJson) {
          if (!pendingData && !saveTimer && !isWriting) {
            markLocalClean();
            setSyncUI('saved');
          }
          return;
        }
        let remoteObj = null;
        try { remoteObj = JSON.parse(raw); } catch { return; }
        if (!remoteObj || typeof remoteObj !== 'object') return;
        marcarHistoricoVisto(remoteObj);

        // Se temos escrita local agendada ou em andamento, guarda o snapshot remoto
        // para ser mesclado dentro de writeToFirestore sem atropelar a tela no meio da edição
        if (saveTimer || pendingData || isWriting) {
          latestUnmergedRemote = remoteObj;
          return;
        }

        lastWrittenJson = raw;
        if (typeof onRemoteUpdate === 'function') {
          onRemoteUpdate(remoteObj);
        }
        setSyncUI('saved');
      },
      (err) => {
        console.warn('[AppStorage] Aviso no listener em tempo real:', err);
        if (!navigator.onLine) setSyncUI('offline');
      }
    );
  };

  const initCloud = async () => {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    // Aguarda a configuração de persistência antes de iniciar leituras/escritas
    try {
      await db.enablePersistence({ synchronizeTabs: true });
    } catch {
      /* Se o navegador bloquear IndexedDB multi-aba, o espelho em localStorage garante a persistência */
    }

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch {}

    // Mostra elementos de usuário/sair/status
    document.querySelectorAll('[data-auth-only]').forEach((n) => (n.hidden = false));
    setSyncUI('saving');

    wireAuthForm();
    wireLifecycleEvents();

    auth.onAuthStateChanged((user) => {
      if (user) {
        const previousUid = uid;
        uid = user.uid;
        const label = el('authUser');
        if (label) label.textContent = user.email;
        const logoutBtn = el('btnLogout');
        if (logoutBtn && user.email) logoutBtn.title = `Sair (${user.email})`;
        setAuthError('');
        showOverlay(false);
        if (!booted || previousUid !== uid) {
          booted = true;
          onReady();
          sincronizarAuditoriasPendentes();
        }
      } else {
        uid = null;
        isInitialLoadComplete = false;
        if (unsubscribeSnapshot) {
          try { unsubscribeSnapshot(); } catch {}
          unsubscribeSnapshot = null;
        }
        showOverlay(true);
      }
    });
  };

  const wireLifecycleEvents = () => {
    // Quando o usuário troca de aba, minimiza o app no celular ou fecha a janela,
    // dispara imediatamente qualquer salvamento pendente. Ao voltar para o app,
    // busca imediatamente qualquer atualização feita pelo parceiro.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushCloudSave();
      } else if (document.visibilityState === 'visible') {
        pullFromCloudIfChanged();
      }
    });

    window.addEventListener('focus', () => {
      pullFromCloudIfChanged();
    });

    window.addEventListener('pagehide', () => {
      flushCloudSave();
    });

    window.addEventListener('beforeunload', (e) => {
      if (saveTimer || pendingData) {
        flushCloudSave();
      }
      if (inFlightPromise || isWriting || saveTimer || pendingData) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('online', () => {
      sincronizarAuditoriasPendentes();
      const meta = getLocalMeta();
      if (meta.dirty && uid) {
        const local = localLoad();
        if (hasEntries(local)) {
          pendingData = local;
          retryCount = 0;
          processWriteQueue();
        }
      } else {
        pullFromCloudIfChanged();
        setSyncUI('saved');
      }
    });

    window.addEventListener('offline', () => {
      setSyncUI('offline');
    });

    el('btnSyncStatus')?.addEventListener('click', () => {
      syncNow();
    });

    // Botão "Tentar agora" do aviso flutuante de erro
    document.addEventListener('click', (e) => {
      if (e.target?.closest?.('[data-save-retry]')) {
        retryCount = 0;
        syncNow();
      }
    });
  };

  const wireAuthForm = () => {
    const form = el('authForm');
    if (!form) return;
    let mode = 'login';

    const toggle = el('authToggle');
    const title = el('authTitle');
    const submit = el('authSubmit');

    const setMode = (m) => {
      mode = m;
      if (mode === 'login') {
        title.textContent = 'Entrar';
        submit.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Entrar';
        toggle.textContent = 'Primeira vez? Criar conta';
      } else {
        title.textContent = 'Criar conta';
        submit.innerHTML = '<i class="bi bi-person-plus"></i> Criar conta';
        toggle.textContent = 'Já tenho conta — Entrar';
      }
      setAuthError('');
    };

    toggle?.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(mode === 'login' ? 'signup' : 'login');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = el('authEmail').value.trim();
      const password = el('authPassword').value;
      submit.disabled = true;
      setAuthError('');
      try {
        if (mode === 'login') {
          await auth.signInWithEmailAndPassword(email, password);
        } else {
          await auth.createUserWithEmailAndPassword(email, password);
        }
      } catch (err) {
        setAuthError(friendlyError(err.code));
      } finally {
        submit.disabled = false;
      }
    });

    el('btnLogout')?.addEventListener('click', async () => {
      await flushCloudSave();
      auth.signOut().then(() => window.location.reload());
    });
  };

  const cloudLoad = async () => {
    if (!uid) return localLoad();
    setSyncUI('loading');

    let cloud = {};
    let loadedFromCloud = false;

    try {
      const snap = await fetchCloudDoc();
      loadedFromCloud = true;
      if (snap.exists) {
        const raw = snap.data()?.data;
        lastWrittenJson = raw || '';
        try { cloud = raw ? JSON.parse(raw) : {}; } catch { cloud = {}; }
      }
    } catch (err) {
      console.warn('[AppStorage] Falha ao ler da nuvem, usando cópia local segura:', err);
      setSyncUI('offline');
      const localFallback = localLoad();
      const metaFallback = getLocalMeta();
      if ((!metaFallback.uid || metaFallback.uid === uid) && hasEntries(localFallback)) {
        isInitialLoadComplete = true;
        subscribeRealtime();
        return localFallback;
      }
      throw err;
    }

    // Lê local e meta APÓS a resposta da rede para capturar qualquer clique feito durante o carregamento
    const local = localLoad();
    const meta = getLocalMeta();
    const canMigrateInitial = (!meta.uid || meta.uid === uid) && hasEntries(local);
    const localSyncedWithThisUser = meta.uid === uid && hasEntries(local);

    // Histórico que já existe na nuvem (ou no aparelho já sincronizado) não é "ação nova" no log
    marcarHistoricoVisto(cloud);
    if (!meta.dirty) marcarHistoricoVisto(local);

    // Rede de segurança: guarda a cópia deste aparelho ANTES de mesclar com a nuvem,
    // assim qualquer coisa que exista só aqui pode ser recuperada depois.
    const contagemNuvem = contarDados(cloud);
    const contagemAparelho = contarDados(local);
    if (hasEntries(local) && JSON.stringify(local) !== JSON.stringify(cloud)) {
      salvarBackupLocal(local, 'cópia do aparelho antes de sincronizar', true);
    }
    const registrarAbertura = (finalData) => {
      const diferencas = compararContagens(contagemNuvem, contagemAparelho);
      const total = contarDados(finalData);
      registrarLog(
        'abriu',
        `abriu o app (${total.lancamentos} lançamentos em ${Object.keys(total.meses).length} meses)${diferencas.length ? ` · aparelho x nuvem: ${diferencas.join(', ')}` : ''}`,
        { contagemNuvem, contagemAparelho, contagemFinal: total, aparelhoPendente: Boolean(meta.dirty) }
      );
      salvarBackupLocal(finalData, 'ao abrir o app', true);
      salvarBackupNuvem(JSON.stringify(finalData), finalData, 'ao abrir o app');
    };

    // Se a nuvem está vazia mas existem dados locais, envia para a nuvem
    if (!hasEntries(cloud) && canMigrateInitial) {
      isInitialLoadComplete = true;
      await writeToFirestore(local);
      notifySafe('Seus dados locais foram sincronizados na nuvem!');
      subscribeRealtime();
      registrarAbertura(local);
      return local;
    }

    // Se havia alterações locais pendentes (meta.dirty) ou meses locais do mesmo usuário,
    // faz merge inteligente: quando meta.dirty=false, a nuvem vence em todos os itens existentes,
    // nunca sobrescrevendo edições recentes feitas em outro aparelho.
    let finalData = cloud;
    if (localSyncedWithThisUser) {
      const isLocalDirty = Boolean(meta.dirty);
      const merged = mergeAllData(local, cloud, isLocalDirty);
      const mergedJson = JSON.stringify(merged);
      const cloudJson = JSON.stringify(cloud);
      finalData = merged;

      if (isLocalDirty && mergedJson !== cloudJson) {
        localSave(finalData, true);
        isInitialLoadComplete = true;
        await writeToFirestore(finalData);
      } else {
        localSave(finalData, false);
        setSyncUI('saved');
      }
    } else if (loadedFromCloud) {
      localSave(finalData, false);
      setSyncUI('saved');
    }

    isInitialLoadComplete = true;
    subscribeRealtime();
    registrarAbertura(finalData);
    return finalData;
  };

  const cloudSave = (data) => {
    if (!data || typeof data !== 'object') return;

    // Proteção extra: se o usuário salvar algo antes de cloudLoad() terminar,
    // mescla com o espelho local existente para jamais perder meses ainda não carregados
    let safeData = data;
    if (!isInitialLoadComplete) {
      const existingLocal = localLoad();
      const meta = getLocalMeta();
      if ((!meta.uid || meta.uid === uid) && hasEntries(existingLocal)) {
        safeData = mergeAllData(data, existingLocal, true);
      }
    }

    if (!safeData.__app || typeof safeData.__app !== 'object') safeData.__app = {};
    safeData.__app._updatedAt = Date.now();
    safeData.__app._clientId = clientId;

    // 1. Salva IMEDIATAMENTE (0ms) no localStorage como backup síncrono
    localSave(safeData, true);
    // 1b. Cópia completa no IndexedDB do aparelho (no máx. a cada 3 min)
    salvarBackupLocal(safeData);

    if (!uid || !db) return;

    // 2. Agenda envio rápido para o Firestore (120ms debounce) em fila sequencial
    pendingData = JSON.parse(JSON.stringify(safeData));
    setSyncUI('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      processWriteQueue();
    }, 120);
  };

  const syncNow = async () => {
    if (!isCloud || !uid || !db) {
      setSyncUI('local');
      notifySafe('Dados salvos localmente neste navegador.', 'info');
      return;
    }
    setSyncUI('saving');
    await flushCloudSave();
    try {
      const meta = getLocalMeta();
      const local = localLoad();
      const snap = await fetchCloudDoc();
      const raw = snap.exists ? snap.data()?.data : '';
      const remote = raw ? JSON.parse(raw) : {};
      const isLocalDirty = Boolean(meta.dirty);
      const merged = (meta.uid === uid && hasEntries(local))
        ? mergeAllData(local, remote, isLocalDirty)
        : remote;

      const needsWrite = isLocalDirty || JSON.stringify(merged) !== JSON.stringify(remote);
      if (needsWrite) {
        localSave(merged, true);
        const saved = await writeToFirestore(merged);
        if (!saved) return;
        // Se houve nova edição enquanto a transação estava em andamento, espera
        // também a fila que cloudSave agendou para essa edição mais recente.
        if (pendingData || saveTimer) {
          const queuedSaved = await flushCloudSave();
          if (!queuedSaved) return;
        }
      } else {
        if (!localSave(merged, false)) {
          setSyncUI('error', 'Não foi possível atualizar a cópia local deste aparelho.');
          return;
        }
        if (typeof onRemoteUpdate === 'function') onRemoteUpdate(merged, true);
      }

      if (!pendingData && !saveTimer && !isWriting) setSyncUI('saved');
      notifySafe('Sincronizado com o banco Google!', 'success');
    } catch {
      setSyncUI(navigator.onLine ? 'error' : 'offline');
      notifySafe('Sem conexão com a nuvem no momento. Seus dados estão salvos no aparelho.', 'error');
    }
  };

  const loadCached = () => {
    const meta = getLocalMeta();
    if (isCloud && uid && meta.uid && meta.uid !== uid) return {};
    return localLoad();
  };

  // ---------- API pública ----------
  return {
    isCloud,
    init(readyCallback, remoteUpdateCallback) {
      onReady = readyCallback || (() => {});
      onRemoteUpdate = remoteUpdateCallback || null;
      if (isCloud) {
        initCloud();
      } else {
        document.querySelectorAll('[data-auth-only]').forEach((n) => (n.hidden = true));
        showOverlay(false);
        setSyncUI('local');
        onReady();
      }
    },
    load() {
      return isCloud ? cloudLoad() : Promise.resolve(localLoad());
    },
    loadCached,
    save(data) {
      if (isCloud) return cloudSave(data);
      const saved = localSave(data, false);
      if (!saved) setSyncUI('error', 'Não foi possível salvar os dados neste aparelho. Mantenha o app aberto e libere espaço no navegador.');
      salvarBackupLocal(data);
      return saved;
    },
    mirrorLocal(data) {
      localSave(data, Boolean(getLocalMeta().dirty));
    },
    markDirtyIds,
    isDirty() {
      return Boolean(getLocalMeta().dirty || dirtyIdsSet.size > 0 || saveTimer || pendingData || isWriting);
    },
    flush: flushCloudSave,
    syncNow,
    mergeAllData,
    // Backups, log de auditoria e identificação do aparelho
    backupNow,
    listarBackups,
    obterBackup,
    listarLogs,
    listarLogsPaginado,
    registrarEventoAuditoria,
    sincronizarAuditoriasPendentes,
    registrarLog,
    getDeviceName,
    setDeviceName,
    detectDevice,
    contarDados,
    getStatus() {
      const meta = getLocalMeta();
      return {
        isCloud,
        logado: Boolean(uid),
        online: navigator.onLine,
        pendente: Boolean(meta.dirty || saveTimer || pendingData || isWriting),
        ultimoSalvoNuvem: lastCloudSavedAt || meta.syncedAt || 0,
        erroExtrasNuvem: cloudExtrasError,
        aparelho: detectDevice(),
        nomeAparelho: getDeviceName(),
        email: auth?.currentUser?.email || ''
      };
    }
  };
})();
