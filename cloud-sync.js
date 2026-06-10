/**
 * ============================================================
 *  AppStorage — camada de armazenamento
 * ============================================================
 *  Se o Firebase estiver configurado (firebase-config.js):
 *     → usa Firestore + Authentication (sincroniza em qualquer dispositivo)
 *  Caso contrário:
 *     → usa localStorage (funciona offline, só neste navegador)
 * ============================================================
 */

const AppStorage = (() => {
  const LS_KEY = 'financas_casa_dados';
  const isCloud = typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED;

  let onReady = () => {};
  let auth = null;
  let db = null;
  let uid = null;
  let saveTimer = null;
  let booted = false;

  // ---------- DOM do login ----------
  const el = (id) => document.getElementById(id);

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

  // ---------- Modo nuvem ----------
  const initCloud = () => {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    // Mostra elementos de usuário/sair
    document.querySelectorAll('[data-auth-only]').forEach((n) => (n.hidden = false));

    wireAuthForm();

    auth.onAuthStateChanged((user) => {
      if (user) {
        uid = user.uid;
        const label = el('authUser');
        if (label) label.textContent = user.email;
        setAuthError('');
        showOverlay(false);
        if (!booted) {
          booted = true;
          onReady();
        } else {
          onReady();
        }
      } else {
        uid = null;
        showOverlay(true);
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

    el('btnLogout')?.addEventListener('click', () => {
      auth.signOut().then(() => window.location.reload());
    });
  };

  const hasEntries = (obj) =>
    obj && typeof obj === 'object' && Object.keys(obj).length > 0;

  const cloudWriteNow = (data) =>
    db.collection('financas').doc(uid).set({
      data: JSON.stringify(data),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

  const cloudLoad = async () => {
    if (!uid) return {};

    const snap = await db.collection('financas').doc(uid).get();
    let cloud = {};
    if (snap.exists) {
      const raw = snap.data()?.data;
      try { cloud = raw ? JSON.parse(raw) : {}; } catch { cloud = {}; }
    }

    // Migração: se a nuvem está vazia mas existem dados locais
    // (lançamentos feitos antes do Firebase), envia-os para a nuvem.
    if (!hasEntries(cloud)) {
      const local = localLoad();
      if (hasEntries(local)) {
        try {
          await cloudWriteNow(local);
          notifySafe('Seus dados locais foram enviados para a nuvem!');
          return local;
        } catch { /* mantém vazio se falhar */ }
      }
    }

    return cloud;
  };

  // Notifica usando o toast do app, se disponível.
  const notifySafe = (msg) => {
    try { window.appNotify?.success(msg); } catch {}
  };

  const cloudSave = (data) => {
    if (!uid) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      db.collection('financas').doc(uid).set({
        data: JSON.stringify(data),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});
    }, 600);
  };

  // ---------- Modo local ----------
  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const localSave = (data) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
  };

  // ---------- API pública ----------
  return {
    isCloud,
    init(readyCallback) {
      onReady = readyCallback || (() => {});
      if (isCloud) {
        initCloud();
      } else {
        document.querySelectorAll('[data-auth-only]').forEach((n) => (n.hidden = true));
        showOverlay(false);
        onReady();
      }
    },
    load() {
      return isCloud ? cloudLoad() : Promise.resolve(localLoad());
    },
    save(data) {
      return isCloud ? cloudSave(data) : localSave(data);
    }
  };
})();
