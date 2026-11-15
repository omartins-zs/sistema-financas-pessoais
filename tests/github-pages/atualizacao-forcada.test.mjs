import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// ---------- Nuvem: app desatualizado não grava ----------
const createStorage = async ({ localVersion, remoteVersion, remoteData }) => {
  const localValues = new Map();
  let remoteDoc = remoteData ? { data: JSON.stringify(remoteData), appVersion: remoteVersion } : null;
  let writes = 0;
  const events = [];
  const docRef = { id: 'casa', collection: () => ({ doc: () => ({ set: async () => {} }) }) };
  const db = {
    enablePersistence: async () => {},
    collection: () => ({ doc: () => docRef }),
    runTransaction: async (callback) => {
      let pending = null;
      const result = await callback({
        get: async () => ({ exists: Boolean(remoteDoc), data: () => remoteDoc }),
        set: (_ref, value) => { pending = value; }
      });
      if (pending) { writes += 1; remoteDoc = pending; }
      return result;
    }
  };
  const user = { uid: 'casa', email: 'casa@example.test' };
  const auth = { currentUser: user, setPersistence: async () => {}, onAuthStateChanged: (cb) => cb(user) };
  const firebase = { initializeApp: () => {}, auth: () => auth, firestore: () => db };
  firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  firebase.firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const toast = { classList: { add() {}, remove() {} }, setAttribute() {}, hidden: true };

  const context = vm.createContext({
    FIREBASE_ENABLED: true,
    firebaseConfig: {},
    firebase,
    document: {
      getElementById: () => null,
      createElement: () => toast,
      querySelector: (sel) => (sel === 'meta[name="app-version"]' ? { content: localVersion } : null),
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { classList: { toggle() {} }, appendChild() {} }
    },
    localStorage: {
      getItem: (key) => localValues.get(key) ?? null,
      setItem: (key, value) => localValues.set(key, String(value))
    },
    window: {
      addEventListener: () => {},
      dispatchEvent: (event) => { events.push(event); return true; }
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    navigator: { onLine: true, userAgent: '' },
    TextEncoder,
    console: { warn() {}, error() {}, log() {} },
    setTimeout,
    clearTimeout
  });
  vm.runInContext(await read('cloud-sync.js'), context, { filename: 'cloud-sync.js' });
  const storage = vm.runInContext('AppStorage', context);
  storage.init(() => {}, () => {});
  await new Promise((resolve) => setImmediate(resolve));
  return { storage, events, getRemoteDoc: () => remoteDoc, getWrites: () => writes, localValues };
};

test('versão antiga não grava na nuvem: guarda no aparelho e avisa para atualizar', async () => {
  const h = await createStorage({
    localVersion: '20261101-1000',
    remoteVersion: '20261115-1859',
    remoteData: { '2026-10': [{ id: 'nuvem', description: 'Da nuvem', _updatedAt: 1 }] }
  });
  const writesAntes = h.getWrites();

  h.storage.save({ '2026-11': [{ id: 'babi', description: 'Mercado', _updatedAt: Date.now() }] });
  const saved = await h.storage.flush();

  assert.equal(saved, false, 'gravação recusada');
  assert.equal(h.getWrites(), writesAntes, 'documento da nuvem intacto');
  assert.equal(h.getRemoteDoc().appVersion, '20261115-1859');
  assert.equal(h.storage.isOutdated(), true);
  assert.equal(h.storage.isDirty(), true, 'alteração continua pendente no aparelho');
  assert.match(h.localValues.get('financas_casa_data') || JSON.stringify([...h.localValues.values()]), /Mercado/, 'espelho local tem a alteração');
  const aviso = h.events.find((e) => e.type === 'app:versao-desatualizada');
  assert.equal(aviso?.detail?.versao, '20261115-1859', 'dispara a atualização');
});

test('versão igual ou mais nova grava e marca o documento com a própria versão', async () => {
  const h = await createStorage({
    localVersion: '20261115-1859',
    remoteVersion: '20261101-1000',
    remoteData: { '2026-10': [{ id: 'nuvem', description: 'Da nuvem', _updatedAt: 1 }] }
  });

  h.storage.save({ '2026-11': [{ id: 'babi', description: 'Mercado', _updatedAt: Date.now() }] });
  const saved = await h.storage.flush();

  assert.equal(saved, true);
  assert.equal(h.getRemoteDoc().appVersion, '20261115-1859');
  assert.equal(h.storage.isOutdated(), false);
  assert.equal(h.events.length, 0);
  const dados = JSON.parse(h.getRemoteDoc().data);
  assert.equal(dados['2026-10'][0].id, 'nuvem');
  assert.equal(dados['2026-11'][0].id, 'babi');
});

test('documento antigo sem versão e versão "dev" não travam a gravação', async () => {
  const semVersao = await createStorage({ localVersion: '20261115-1859', remoteVersion: undefined, remoteData: { '2026-10': [] } });
  semVersao.storage.save({ '2026-11': [{ id: 'a', _updatedAt: Date.now() }] });
  assert.equal(await semVersao.storage.flush(), true);

  const dev = await createStorage({ localVersion: 'dev', remoteVersion: '20261115-1859', remoteData: { '2026-10': [] } });
  dev.storage.save({ '2026-11': [{ id: 'b', _updatedAt: Date.now() }] });
  assert.equal(await dev.storage.flush(), true);
});

// ---------- PWA: atualização forçada ----------
const loadBootstrap = async ({ appVersion = '20261101-1000', session = new Map(), dirty = false, outdated = false, flushResult = true } = {}) => {
  const calls = { replace: [], reload: 0, unregister: [], deletedCaches: [], errors: [], infos: [] };
  const regs = [
    { scope: 'https://exemplo.github.io/financas/', unregister: async () => { calls.unregister.push('financas'); return true; } },
    { scope: 'https://exemplo.github.io/outro-app/', unregister: async () => { calls.unregister.push('outro'); return true; } }
  ];
  const context = {
    URL,
    JSON,
    AppStorage: {
      async flush() { return flushResult; },
      isDirty: () => dirty,
      isOutdated: () => outdated,
      localSaveOk: () => true
    },
    document: {
      querySelector: (sel) => (sel === 'meta[name="app-version"]' ? { content: appVersion } : null),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    dom: { inputDescription: { value: '' }, inputValue: { value: '' }, inputDueDay: { value: '' }, inputObservation: { value: '' } },
    location: { protocol: 'https:' },
    navigator: { onLine: true, serviceWorker: { getRegistrations: async () => regs } },
    caches: {
      keys: async () => ['financas-20261101-1000', 'outro-cache'],
      delete: async (name) => { calls.deletedCaches.push(name); return true; }
    },
    notify: { info: (m) => calls.infos.push(m), error: (m) => calls.errors.push(m) },
    sessionStorage: {
      getItem: (k) => session.get(k) ?? null,
      setItem: (k, v) => session.set(k, String(v)),
      removeItem: (k) => session.delete(k)
    },
    history: { state: null, replaceState: (_s, _t, url) => { calls.replaced = url; } },
    window: {
      Swal: { isVisible: () => false },
      location: {
        href: 'https://exemplo.github.io/financas/index.html',
        reload: () => { calls.reload += 1; },
        replace: (url) => { calls.replace.push(url); }
      },
      addEventListener() {}
    },
    setTimeout() { return 1; },
    setInterval() { return 1; },
    clearInterval() {}
  };
  runIn(context, await read('js/80-bootstrap-pwa.js'));
  return { t: context.__t, calls, session, context };
};
const runIn = (context, code) => vm.runInNewContext(`${code}
globalThis.__t = { isNewerVersion, markUpdatePending, attemptPendingUpdate, reloadForUpdate, updateState, finishForcedUpdate, handleOutdatedClient, readUpdateAttempts, RELOAD_GUARD_KEY };`, context);

test('só atualiza para versão mais nova (resposta antiga da CDN não puxa para trás)', async () => {
  const { t } = await loadBootstrap();
  assert.equal(t.isNewerVersion('20261115-1859', '20261101-1000'), true);
  assert.equal(t.isNewerVersion('20261101-1000', '20261115-1859'), false);
  assert.equal(t.isNewerVersion('20261115-1859', '20261115-1859'), false);
  assert.equal(t.isNewerVersion('20261115-1859', 'dev'), true, 'fora do padrão: qualquer diferença atualiza');
  assert.equal(t.isNewerVersion('', '20261115-1859'), false);
});

test('versão nova publicada: recarrega sem cache (como Ctrl+Shift+F5) só deste app', async () => {
  const { t, calls, session } = await loadBootstrap();
  t.updateState.targetVersion = '20261115-1859';
  await t.reloadForUpdate();

  assert.deepEqual(calls.unregister, ['financas'], 'não mexe no service worker de outro app do domínio');
  assert.deepEqual(calls.deletedCaches, ['financas-20261101-1000'], 'só apaga os caches financas-*');
  assert.equal(calls.reload, 0);
  assert.equal(calls.replace.length, 1);
  assert.match(calls.replace[0], /index\.html\?atualizar=20261115-1859$/, 'URL nova fura o cache do navegador/CDN');
  assert.equal(t.readUpdateAttempts('20261115-1859'), 1);
  assert.ok(session.has(t.RELOAD_GUARD_KEY));
});

test('sem loop: depois de 3 tentativas na mesma aba pede para fechar/abrir o app', async () => {
  const session = new Map([['financas_casa_reloaded_version', JSON.stringify({ version: '20261115-1859', attempts: 3 })]]);
  const { t, calls } = await loadBootstrap({ session });
  t.updateState.targetVersion = '20261115-1859';
  await t.reloadForUpdate();

  assert.equal(calls.replace.length, 0);
  assert.equal(calls.reload, 0);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /Ctrl\+Shift\+R/);
});

test('com a nuvem travada para a versão antiga, a pendência local não impede a atualização', async () => {
  const travado = await loadBootstrap({ dirty: true, outdated: true, flushResult: false });
  travado.t.updateState.targetVersion = '20261115-1859';
  await travado.t.reloadForUpdate();
  assert.equal(travado.calls.replace.length, 1, 'atualiza: a alteração já está no espelho local');

  const normal = await loadBootstrap({ dirty: true, outdated: false, flushResult: false });
  normal.t.updateState.targetVersion = '20261115-1859';
  await normal.t.reloadForUpdate();
  assert.equal(normal.calls.replace.length, 0, 'fora da trava, espera a nuvem confirmar a gravação');
});

test('aviso da nuvem dispara a atualização e a volta limpa o contador e a URL', async () => {
  const { t, calls } = await loadBootstrap();
  t.handleOutdatedClient({ detail: { versao: '20261115-1859' } });
  assert.equal(t.updateState.targetVersion, '20261115-1859');
  assert.equal(calls.infos.length, 1);

  t.handleOutdatedClient({ detail: { versao: '20261001-1000' } });
  assert.equal(t.updateState.targetVersion, '20261115-1859', 'versão mais antiga é ignorada');

  const session = new Map([['financas_casa_reloaded_version', JSON.stringify({ version: '20261115-1859', attempts: 1 })]]);
  const depois = await loadBootstrap({ appVersion: '20261115-1859', session });
  depois.context.window.location.href = 'https://exemplo.github.io/financas/index.html?atualizar=20261115-1859';
  depois.t.finishForcedUpdate();
  assert.equal(session.size, 0, 'atualizou: zera o contador');
  assert.equal(depois.calls.replaced, 'https://exemplo.github.io/financas/index.html');
});
