import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../cloud-sync.js', import.meta.url), 'utf8');

const createAppStorage = (meta = {}) => {
  const localValues = new Map([
    ['financas_casa_sync_meta', JSON.stringify(meta)]
  ]);
  const context = vm.createContext({
    FIREBASE_ENABLED: false,
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { classList: { toggle: () => {} } }
    },
    localStorage: {
      getItem: (key) => localValues.get(key) ?? null,
      setItem: (key, value) => localValues.set(key, String(value))
    },
    window: { addEventListener: () => {} },
    navigator: { onLine: true, userAgent: '' },
    console,
    setTimeout,
    clearTimeout
  });

  vm.runInContext(source, context, { filename: 'cloud-sync.js' });
  return vm.runInContext('AppStorage', context);
};

const createTransactionalStorage = async (initialRemote) => {
  const localValues = new Map();
  let currentRemote = initialRemote;
  let transactionAttempts = 0;
  const docRef = {
    id: 'household',
    collection: () => ({ doc: () => ({ set: async () => {} }) })
  };
  const db = {
    enablePersistence: async () => {},
    collection: () => ({ doc: () => docRef }),
    runTransaction: async (callback) => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let pendingWrite;
        const snapshotValue = currentRemote;
        const transaction = {
          get: async () => ({
            exists: Boolean(snapshotValue),
            data: () => ({ data: JSON.stringify(snapshotValue) })
          }),
          set: (_ref, value) => { pendingWrite = value; }
        };
        const result = await callback(transaction);
        transactionAttempts += 1;

        if (attempt === 0) {
          currentRemote = {
            ...currentRemote,
            '2026-12': [{ id: 'remote-new', description: 'Incluída durante conflito', _updatedAt: Date.now() }]
          };
          continue;
        }

        currentRemote = JSON.parse(pendingWrite.data);
        return result;
      }
    }
  };
  const auth = {
    currentUser: { uid: 'household', email: 'familia@example.test' },
    setPersistence: async () => {},
    onAuthStateChanged: (callback) => callback({ uid: 'household', email: 'familia@example.test' })
  };
  const firebase = {
    initializeApp: () => {},
    auth: () => auth,
    firestore: () => db
  };
  firebase.auth.Auth = { Persistence: { LOCAL: 'local' } };
  firebase.firestore.FieldValue = { serverTimestamp: () => 'server-time' };

  const toast = {
    classList: { add: () => {}, remove: () => {} },
    setAttribute: () => {},
    hidden: true
  };
  const context = vm.createContext({
    FIREBASE_ENABLED: true,
    firebaseConfig: {},
    firebase,
    document: {
      getElementById: () => null,
      createElement: () => toast,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: { classList: { toggle: () => {} }, appendChild: () => {} }
    },
    localStorage: {
      getItem: (key) => localValues.get(key) ?? null,
      setItem: (key, value) => localValues.set(key, String(value))
    },
    window: { addEventListener: () => {} },
    navigator: { onLine: true, userAgent: '' },
    console: { warn: () => {}, error: () => {}, log: () => {} },
    setTimeout,
    clearTimeout
  });

  vm.runInContext(source, context, { filename: 'cloud-sync.js' });
  const storage = vm.runInContext('AppStorage', context);
  storage.init(() => {}, () => {});
  await new Promise((resolve) => setImmediate(resolve));

  return {
    storage,
    getRemote: () => currentRemote,
    getTransactionAttempts: () => transactionAttempts
  };
};

const plain = (value) => JSON.parse(JSON.stringify(value));

test('merge mantém lançamentos de meses diferentes nos dois aparelhos', () => {
  const storage = createAppStorage();
  const local = { '2026-11': [{ id: 'nov-1', description: 'Conta de novembro', _updatedAt: 200 }] };
  const remote = { '2026-10': [{ id: 'out-1', description: 'Conta de outubro', _updatedAt: 100 }] };

  const merged = plain(storage.mergeAllData(local, remote));

  assert.equal(merged['2026-10'][0].id, 'out-1');
  assert.equal(merged['2026-11'][0].id, 'nov-1');
});

test('merge escolhe a versão mais recente do mesmo lançamento', () => {
  const storage = createAppStorage();
  const local = { '2026-11': [{ id: 'conta', description: 'Valor novo', _updatedAt: 200 }] };
  const remote = { '2026-11': [{ id: 'conta', description: 'Valor antigo', _updatedAt: 100 }] };

  const merged = plain(storage.mergeAllData(local, remote));

  assert.equal(merged['2026-11'][0].description, 'Valor novo');
  assert.equal(merged['2026-11'][0]._updatedAt, 200);
});

test('merge respeita tombstone e não ressuscita lançamento excluído', () => {
  const storage = createAppStorage();
  const deletedAt = Date.now() - 1_000;
  const local = { __app: { _deleted: { conta: deletedAt } }, '2026-11': [] };
  const remote = { '2026-11': [{ id: 'conta', description: 'Excluída', _updatedAt: deletedAt - 1 }] };

  const merged = plain(storage.mergeAllData(local, remote));

  assert.deepEqual(merged['2026-11'], []);
  assert.equal(merged.__app._deleted.conta, deletedAt);
});

test('merge une aportes distintos e preserva a edição mais recente do mesmo aporte', () => {
  const storage = createAppStorage();
  const local = {
    __app: {
      metas: [{
        id: 'meta-1',
        nome: 'Reserva',
        _updatedAt: 200,
        aportes: [
          { id: 'aporte-1', valor: 50, _updatedAt: 100 },
          { id: 'aporte-2', valor: 75, _updatedAt: 200 }
        ]
      }]
    }
  };
  const remote = {
    __app: {
      metas: [{
        id: 'meta-1',
        nome: 'Reserva antiga',
        _updatedAt: 100,
        aportes: [
          { id: 'aporte-1', valor: 40, _updatedAt: 90 },
          { id: 'aporte-3', valor: 25, _updatedAt: 150 }
        ]
      }]
    }
  };

  const merged = plain(storage.mergeAllData(local, remote));
  const meta = merged.__app.metas.find((item) => item.id === 'meta-1');
  const aportes = Object.fromEntries(meta.aportes.map((aporte) => [aporte.id, aporte.valor]));

  assert.equal(meta.nome, 'Reserva');
  assert.deepEqual(aportes, { 'aporte-1': 50, 'aporte-2': 75, 'aporte-3': 25 });
});

test('transação relê o Firestore em conflito e preserva o mês remoto novo e a edição local', async () => {
  const harness = await createTransactionalStorage({
    '2026-10': [{ id: 'remote-old', description: 'Outubro', _updatedAt: Date.now() - 10_000 }]
  });

  harness.storage.save({
    '2026-11': [{ id: 'local-new', description: 'Novembro', _updatedAt: Date.now() }]
  });
  const saved = await harness.storage.flush();
  const result = plain(harness.getRemote());

  assert.equal(saved, true);
  assert.equal(harness.getTransactionAttempts(), 2);
  assert.equal(result['2026-10'][0].id, 'remote-old');
  assert.equal(result['2026-11'][0].id, 'local-new');
  assert.equal(result['2026-12'][0].id, 'remote-new');
});
