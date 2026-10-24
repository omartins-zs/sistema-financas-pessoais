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
  let pendingData = null;
  let lastWrittenJson = '';
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
  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const localSave = (data, dirty = false) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      localStorage.setItem(LS_META_KEY, JSON.stringify({
        updatedAt: Date.now(),
        dirty: Boolean(dirty),
        uid: uid || null
      }));
    } catch {}
  };

  const getLocalMeta = () => {
    try {
      const raw = localStorage.getItem(LS_META_KEY);
      return raw ? JSON.parse(raw) : { updatedAt: 0, dirty: false, uid: null };
    } catch {
      return { updatedAt: 0, dirty: false, uid: null };
    }
  };

  const markLocalClean = () => {
    try {
      const meta = getLocalMeta();
      localStorage.setItem(LS_META_KEY, JSON.stringify({ ...meta, dirty: false, syncedAt: Date.now() }));
    } catch {}
  };

  const hasEntries = (obj) =>
    obj && typeof obj === 'object' && Object.keys(obj).some((k) => k !== '__app' ? (Array.isArray(obj[k]) && obj[k].length > 0) : Object.keys(obj.__app || {}).length > 0);

  // ---------- Merge inteligente (sem perda entre dispositivos/abas) ----------
  const mergeSubListById = (listA = [], listB = []) => {
    const map = new Map();
    [...listA, ...listB].forEach((item) => {
      if (!item || !item.id) return;
      const prev = map.get(item.id);
      if (!prev || (Number(item._updatedAt) || 0) >= (Number(prev._updatedAt) || 0)) {
        map.set(item.id, item);
      }
    });
    return [...map.values()];
  };

  const pickNewerItem = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    const ta = Number(a._updatedAt) || 0;
    const tb = Number(b._updatedAt) || 0;
    const winner = ta >= tb ? { ...a } : { ...b };
    // Preserva sub-listas de aportes (metas) e movimentações (reservas)
    if (Array.isArray(a.aportes) || Array.isArray(b.aportes)) {
      winner.aportes = mergeSubListById(a.aportes, b.aportes);
    }
    if (Array.isArray(a.movimentacoes) || Array.isArray(b.movimentacoes)) {
      winner.movimentacoes = mergeSubListById(a.movimentacoes, b.movimentacoes);
    }
    return winner;
  };

  const mergeListById = (localList = [], remoteList = [], deletedMap = {}) => {
    const map = new Map();
    const order = [];
    const add = (item, isLocal) => {
      if (!item || !item.id) return;
      const delAt = Number(deletedMap[item.id]) || 0;
      const itemAt = Number(item._updatedAt) || 0;
      if (delAt > 0 && delAt >= itemAt) return;
      if (!map.has(item.id)) {
        order.push(item.id);
        map.set(item.id, item);
      } else {
        const existing = map.get(item.id);
        map.set(item.id, isLocal ? pickNewerItem(item, existing) : pickNewerItem(existing, item));
      }
    };
    remoteList.forEach((x) => add(x, false));
    localList.forEach((x) => add(x, true));
    return order.map((id) => map.get(id)).filter(Boolean);
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
      const primary = preferLocalOnTie ? listL : listR;
      const secondary = preferLocalOnTie ? listR : listL;
      out[mes] = mergeListById(primary, secondary, deletedMap);
    });

    // Módulos em __app
    const collections = ['metas', 'reservas', 'cartoes', 'comprasCartao', 'investimentos', 'patrimonio', 'assinaturas', 'passeios'];
    const mergedApp = { ...appR, ...appL, _deleted: deletedMap };

    collections.forEach((col) => {
      const listL = Array.isArray(appL[col]) ? appL[col] : [];
      const listR = Array.isArray(appR[col]) ? appR[col] : [];
      const primary = preferLocalOnTie ? listL : listR;
      const secondary = preferLocalOnTie ? listR : listL;
      mergedApp[col] = mergeListById(primary, secondary, deletedMap);
    });

    // Categorias: vence a atualizada mais recentemente
    const catAtL = Number(appL._categoriasUpdatedAt) || 0;
    const catAtR = Number(appR._categoriasUpdatedAt) || 0;
    if (catAtR > catAtL) {
      if (appR.categorias) mergedApp.categorias = appR.categorias;
      if (appR.categoriasPapel) mergedApp.categoriasPapel = appR.categoriasPapel;
      mergedApp._categoriasUpdatedAt = catAtR;
    } else if (catAtL > 0) {
      mergedApp._categoriasUpdatedAt = catAtL;
    }

    // Histórico: união completa sem perda
    mergedApp.historico = mergeHistorico(appL.historico, appR.historico);
    mergedApp._updatedAt = Math.max(Number(appL._updatedAt) || 0, Number(appR._updatedAt) || 0, Date.now());

    out.__app = mergedApp;
    return out;
  };

  // ---------- Modo nuvem (Firebase Auth + Firestore) ----------
  const writeToFirestore = async (data) => {
    if (!uid || !db) return false;
    setSyncUI('saving');
    const serialized = JSON.stringify(data);
    lastWrittenJson = serialized;

    try {
      await db.collection('financas').doc(uid).set({
        data: serialized,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        clientUpdatedAt: Date.now(),
        clientId
      });
      markLocalClean();
      setSyncUI('saved');
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

  const flushCloudSave = async () => {
    if (!isCloud || !uid) return true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (pendingData) {
      const dataToSave = pendingData;
      pendingData = null;
      inFlightPromise = writeToFirestore(dataToSave);
      const ok = await inFlightPromise;
      inFlightPromise = null;
      return ok;
    }
    if (inFlightPromise) {
      return await inFlightPromise;
    }
    return true;
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
        // Se há escrita local pendente no SDK ou nosso próprio timer ativo, não sobrescreve
        if (snap.metadata.hasPendingWrites) {
          setSyncUI('saving');
          return;
        }
        const raw = snap.data()?.data;
        if (!raw) return;
        if (raw === lastWrittenJson) {
          markLocalClean();
          setSyncUI('saved');
          return;
        }
        // Se temos dados locais ainda não enviados, faz merge antes de aplicar
        let remoteObj = null;
        try { remoteObj = JSON.parse(raw); } catch { return; }
        if (!remoteObj || typeof remoteObj !== 'object') return;

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
    // dispara imediatamente qualquer salvamento pendente.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushCloudSave();
      }
    });

    window.addEventListener('pagehide', () => {
      flushCloudSave();
    });

    window.addEventListener('beforeunload', (e) => {
      if (saveTimer || pendingData) {
        flushCloudSave();
      }
      if (inFlightPromise) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('online', () => {
      const meta = getLocalMeta();
      if (meta.dirty && uid) {
        const local = localLoad();
        if (hasEntries(local)) {
          writeToFirestore(local);
        }
      } else {
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

  const fetchCloudDoc = async () => {
    const docRef = db.collection('financas').doc(uid);
    // Com internet, busca direto no servidor primeiro para garantir dado 100% atualizado
    if (navigator.onLine) {
      try {
        return await docRef.get({ source: 'server' });
      } catch {
        /* cai para o get padrão (cache/servidor) */
      }
    }
    return await docRef.get();
  };

  const cloudLoad = async () => {
    if (!uid) return localLoad();
    setSyncUI('saving');

    const local = localLoad();
    const meta = getLocalMeta();
    const localBelongsToUser = !meta.uid || meta.uid === uid;

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
      if (localBelongsToUser && hasEntries(local)) {
        subscribeRealtime();
        return local;
      }
      throw err;
    }

    // Se a nuvem está vazia mas existem dados locais, envia para a nuvem
    if (!hasEntries(cloud) && localBelongsToUser && hasEntries(local)) {
      await writeToFirestore(local);
      notifySafe('Seus dados locais foram sincronizados na nuvem!');
      subscribeRealtime();
      return local;
    }

    // Se havia alterações locais pendentes (ex: fechou a aba antes de terminar o envio)
    // ou dados locais do mesmo usuário, faz merge inteligente sem perder nada!
    let finalData = cloud;
    if (localBelongsToUser && hasEntries(local)) {
      const merged = mergeAllData(local, cloud, Boolean(meta.dirty));
      const mergedJson = JSON.stringify(merged);
      const cloudJson = JSON.stringify(cloud);
      finalData = merged;

      if (mergedJson !== cloudJson) {
        localSave(finalData, true);
        await writeToFirestore(finalData);
      } else {
        localSave(finalData, false);
        setSyncUI('saved');
      }
    } else if (loadedFromCloud) {
      localSave(finalData, false);
      setSyncUI('saved');
    }

    subscribeRealtime();
    return finalData;
  };

  const cloudSave = (data) => {
    if (!data || typeof data !== 'object') return;
    if (!data.__app || typeof data.__app !== 'object') data.__app = {};
    data.__app._updatedAt = Date.now();
    data.__app._clientId = clientId;

    // 1. Salva IMEDIATAMENTE (0ms) no localStorage como backup síncrono
    localSave(data, true);

    if (!uid || !db) return;

    // 2. Agenda envio rápido para o Firestore (120ms debounce)
    pendingData = JSON.parse(JSON.stringify(data));
    setSyncUI('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!pendingData) return;
      const toWrite = pendingData;
      pendingData = null;
      inFlightPromise = writeToFirestore(toWrite);
      await inFlightPromise;
      inFlightPromise = null;
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
      const merged = mergeAllData(local, remote, Boolean(meta.dirty));

      if (meta.dirty || JSON.stringify(merged) !== JSON.stringify(remote)) {
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
    save(data) {
      return isCloud ? cloudSave(data) : localSave(data, false);
    },
    flush: flushCloudSave,
    syncNow,
    mergeAllData
  };
})();
