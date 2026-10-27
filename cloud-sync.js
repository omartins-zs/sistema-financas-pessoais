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
  const dirtyIdsSet = new Set();
  const clientId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  // ---------- DOM do login e indicador de sincronização ----------
  const el = (id) => document.getElementById(id);

  const setSyncUI = (state, detail = '') => {
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
    } catch {}
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

    let finalToWrite = data;

    // Antes de gravar no Firestore, busca/mescla com o estado atual da nuvem para que
    // uma aba antiga ou dispositivo que acabou de acordar NUNCA apague meses (ex: novembro)
    // ou edições feitas pelo parceiro em outro aparelho.
    let remoteBase = latestUnmergedRemote;
    latestUnmergedRemote = null;

    if (navigator.onLine) {
      try {
        const snap = await fetchServerDocWithTimeout(3500);
        if (snap && snap.exists) {
          const raw = snap.data()?.data;
          if (raw) {
            try { remoteBase = JSON.parse(raw); } catch {}
          }
        }
      } catch {}
    }

    if (remoteBase && hasEntries(remoteBase)) {
      const merged = mergeAllData(finalToWrite, remoteBase, true);
      const beforeJson = JSON.stringify(finalToWrite);
      const afterJson = JSON.stringify(merged);
      finalToWrite = merged;
      if (afterJson !== beforeJson) {
        localSave(finalToWrite, true);
        if (typeof onRemoteUpdate === 'function') {
          onRemoteUpdate(finalToWrite, true);
        }
      }
    }

    const serialized = JSON.stringify(finalToWrite);
    lastWrittenJson = serialized;

    try {
      await db.collection('financas').doc(uid).set({
        data: serialized,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        clientUpdatedAt: Date.now(),
        clientId
      });
      // Só limpa o status dirty se não entrou nenhuma nova edição local durante o envio
      if (!pendingData) {
        markLocalClean();
        setSyncUI('saved');
      }
      return true;
    } catch (err) {
      console.error('[AppStorage] Erro ao salvar no Firestore:', err);
      if (!navigator.onLine || err?.code === 'unavailable') {
        setSyncUI('offline');
      } else {
        setSyncUI('error', `Erro ao salvar na nuvem (${err?.code || 'desconhecido'}). Seus dados estão salvos neste aparelho — clique para tentar novamente.`);
        notifySafe('Atenção: falha ao sincronizar na nuvem. Dados guardados neste aparelho; tentando novamente...', 'error');
      }
      return false;
    }
  };

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
      if (inFlightPromise || isWriting) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('online', () => {
      const meta = getLocalMeta();
      if (meta.dirty && uid) {
        const local = localLoad();
        if (hasEntries(local)) {
          pendingData = local;
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
    setSyncUI('saving');

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

    // Se a nuvem está vazia mas existem dados locais, envia para a nuvem
    if (!hasEntries(cloud) && canMigrateInitial) {
      isInitialLoadComplete = true;
      await writeToFirestore(local);
      notifySafe('Seus dados locais foram sincronizados na nuvem!');
      subscribeRealtime();
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

      if (isLocalDirty || JSON.stringify(merged) !== JSON.stringify(remote)) {
        localSave(merged, true);
        await writeToFirestore(merged);
      } else {
        localSave(merged, false);
      }

      if (typeof onRemoteUpdate === 'function') {
        onRemoteUpdate(merged, true);
      }
      setSyncUI('saved');
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
      return isCloud ? cloudSave(data) : localSave(data, false);
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
    mergeAllData
  };
})();
