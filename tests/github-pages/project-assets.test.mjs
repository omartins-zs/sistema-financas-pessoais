import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const sourceFiles = [
  'js/00-core.js',
  'js/10-theme-persistence.js',
  'js/11-history-audit.js',
  'js/20-navigation-dashboard.js',
  'js/30-entries.js',
  'js/40-exports.js',
  'js/41-backups-recovery.js',
  'js/50-import-parsers.js',
  'js/51-import-workflows.js',
  'js/60-render.js',
  'js/61-card-reordering.js',
  'js/70-events.js',
  'js/80-bootstrap-pwa.js'
];

test('index carrega os scripts da PWA na ordem declarada pelo projeto', async () => {
  const html = await read('index.html');
  const loaded = [...html.matchAll(/<script src="(js\/[^"?]+\.js)\?v=/g)].map((match) => match[1]);
  const modulesIndex = html.indexOf('src="app-modules.js?');

  assert.deepEqual(loaded, sourceFiles);
  assert.ok(modulesIndex > html.indexOf('src="js/80-bootstrap-pwa.js?'));
});

test('todos os scripts locais referenciados existem', async () => {
  const html = await read('index.html');
  const localScripts = [...html.matchAll(/<script src="((?!https?:\/\/)[^"?]+)(?:\?[^\"]*)?"/g)]
    .map((match) => match[1]);

  for (const path of localScripts) {
    await access(new URL(`../../${path}`, import.meta.url));
  }
});

test('shell do service worker inclui cada parte da aplicação', async () => {
  const serviceWorker = await read('sw.js');

  for (const path of sourceFiles) {
    assert.ok(serviceWorker.includes(`'./${path}'`), `${path} deve ser precacheado`);
  }
  assert.ok(serviceWorker.includes("'./app-modules.js'"));
  assert.ok(!serviceWorker.includes("'./script.js'"));
});

test('inicialização da PWA não inventa nem reescreve lançamentos financeiros', async () => {
  const bootstrap = await read('js/80-bootstrap-pwa.js');

  assert.doesNotMatch(bootstrap, /reconciliarDadosRecentes|Caixinha Turbo/);
});

test('atualização da PWA espera formulários e salvamentos antes de recarregar', async () => {
  const bootstrap = await read('js/80-bootstrap-pwa.js');
  const serviceWorker = await read('sw.js');
  const installHandler = serviceWorker.split("self.addEventListener('install'")[1]
    ?.split("self.addEventListener('activate'")[0] ?? '';

  assert.match(bootstrap, /const hasUnsavedFormDraft =/);
  assert.match(bootstrap, /\.modal\.show, \.card-item--editing/);
  assert.match(bootstrap, /AppStorage\.flush\?\./);
  assert.match(bootstrap, /AppStorage\.isDirty\?\./);
  assert.match(bootstrap, /controllerchange/);
  assert.match(bootstrap, /SKIP_WAITING/);
  assert.doesNotMatch(installHandler, /skipWaiting\(/);
  assert.match(serviceWorker, /event\.data\?\.type === 'SKIP_WAITING'/);
});

test('a atualização aguarda um rascunho, salva e só então recarrega', async () => {
  const bootstrap = await read('js/80-bootstrap-pwa.js');
  const description = { value: 'Conta de luz' };
  let reloads = 0;
  let flushes = 0;
  let skipWaitingMessages = 0;
  const context = {
    AppStorage: {
      async flush() { flushes += 1; return true; },
      isDirty() { return false; }
    },
    document: {
      querySelector(selector) {
        return selector === 'meta[name="app-version"]' ? { content: 'v1' } : null;
      },
      querySelectorAll() { return []; },
      addEventListener() {}
    },
    dom: {
      inputDescription: description,
      inputValue: { value: '' },
      inputDueDay: { value: '' },
      inputObservation: { value: '' }
    },
    location: { protocol: 'https:' },
    navigator: { onLine: true },
    notify: { info() {} },
    sessionStorage: { setItem() {} },
    window: {
      Swal: { isVisible: () => false },
      location: { reload() { reloads += 1; } }
    },
    setTimeout() { return 1; },
    setInterval() { return 1; },
    clearInterval() {}
  };

  runInNewContext(`${bootstrap}\nglobalThis.__pwaTest = { markUpdatePending, attemptPendingUpdate, updateState };`, context);
  const worker = {
    state: 'installed',
    postMessage(message) {
      if (message.type === 'SKIP_WAITING') skipWaitingMessages += 1;
    }
  };

  context.__pwaTest.markUpdatePending({ worker });
  await context.__pwaTest.attemptPendingUpdate();
  assert.equal(flushes, 0, 'não tenta salvar/substituir enquanto há rascunho aberto');
  assert.equal(skipWaitingMessages, 0);
  assert.equal(reloads, 0);

  description.value = '';
  await context.__pwaTest.attemptPendingUpdate();
  assert.equal(skipWaitingMessages, 1, 'pede ativação depois de liberar o formulário');
  assert.equal(reloads, 0, 'espera a nova versão assumir o controle');

  worker.state = 'activated';
  context.__pwaTest.updateState.controllerChanged = true;
  await context.__pwaTest.attemptPendingUpdate();
  assert.equal(flushes, 3);
  assert.equal(reloads, 1, 'recarrega após confirmação de gravação e controle novo');
});

test('histórico e backups usam uma única entrada de navegação', async () => {
  const html = await read('index.html');
  const modules = await read('app-modules.js');
  const recovery = await read('js/41-backups-recovery.js');
  const events = await read('js/70-events.js');
  const moduleStyles = await read('modules.css');

  assert.match(html, /id="appTabsScroll"/);
  assert.match(html, /id="btnHistory"[^>]*aria-label="Histórico completo, logs e backups"/);
  assert.doesNotMatch(html, /id="btnBackups"/);
  assert.match(modules, /\['historico', 'clock-history', 'Histórico'\]/);
  assert.match(modules, /data-tabs-more/);
  assert.match(recovery, /window\.abrirBackupsLogs\s*=\s*abrirBackupsLogs/);
  assert.match(recovery, /data-history-tab="backups"/);
  assert.match(events, /getElementById\('btnHistory'\).*HistoricoPage\?\.openTab\('alteracoes'\)/);
  assert.match(moduleStyles, /\.app-tabs__more-menu:not\(\[hidden\]\)/);
  assert.match(moduleStyles, /\.app-main \{ padding-bottom:/);
});

test('cabeçalho mobile separa o título da fileira de ferramentas', async () => {
  const styles = await read('style.css');
  const mobileLayout = styles.split('/* Mobile */')[1]?.split('/* Desktop: linha única */')[0] ?? '';

  assert.match(mobileLayout, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(mobileLayout, /"brand"\s+"tools"\s+"period"\s+"actions"/);
  assert.match(styles, /\.topbar__tools\s*\{\s*width:\s*100%;\s*justify-content:\s*space-between/);
});

test('histórico completo reúne alterações, logs paginados e tem uma tela dedicada', async () => {
  const html = await read('index.html');
  const modules = await read('app-modules.js');
  const recovery = await read('js/41-backups-recovery.js');
  const cloud = await read('cloud-sync.js');
  const audit = await read('js/11-history-audit.js');

  assert.match(html, /id="view-historico"/);
  assert.match(modules, /\['historico', 'clock-history', 'Histórico'\]/);
  assert.match(recovery, /data-history-tab="alteracoes"/);
  assert.match(recovery, /data-history-tab="logs"/);
  assert.match(recovery, /data-history-tab="backups"/);
  assert.match(cloud, /const registrarEventoAuditoria = async/);
  assert.match(cloud, /const listarLogsPaginado = async/);
  assert.match(cloud, /userDoc\(\)\.collection\('logs'\)\.doc\(entry\.id\)/);
  assert.match(audit, /AppStorage\.registrarEventoAuditoria/);
  assert.match(audit, /const mesmoConteudoHistorico =/);
});

test('todos os scripts da aplicação passam pela verificação de sintaxe do Node', async () => {
  const files = [...sourceFiles, 'app-modules.js', 'cloud-sync.js', 'firebase-config.js', 'sw.js'];

  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../../${file}`, import.meta.url))], {
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

test('scripts clássicos combinados continuam válidos e sem declarações duplicadas', async () => {
  const combined = (await Promise.all(sourceFiles.map(read))).join('\n');
  const result = spawnSync(process.execPath, ['--check', '-'], {
    input: combined,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('meta, query strings e versão do service worker continuam alinhadas', async () => {
  const html = await read('index.html');
  const serviceWorker = await read('sw.js');
  const version = html.match(/<meta name="app-version" content="([^"]+)"/)?.[1];
  const queryVersions = [...html.matchAll(/\?v=([0-9-]+)/g)].map((match) => match[1]);
  const workerVersion = serviceWorker.match(/const SW_BUILD_VERSION = '([^']+)'/)?.[1];

  assert.ok(version, 'meta app-version deve existir');
  assert.ok(queryVersions.length > 0);
  assert.ok(queryVersions.every((value) => value === version));
  assert.equal(workerVersion, version);
});

test('não há marcadores de conflito nos scripts da PWA', async () => {
  const files = [...sourceFiles, 'app-modules.js', 'cloud-sync.js'];

  for (const file of files) {
    const contents = await read(file);
    assert.doesNotMatch(contents, /^(<<<<<<<|=======|>>>>>>>)(?: |$)/m, file);
  }
});

test('regras Firestore limitam leitura e escrita ao dono da conta e cobrem as subcoleções usadas', async () => {
  const rules = await read('firestore.rules');

  assert.match(rules, /request\.auth != null && request\.auth\.uid == uid/);
  assert.match(rules, /match \/financas\/\{uid\}/);
  for (const collection of ['logs', 'backups', 'backupsMeta']) {
    assert.match(rules, new RegExp(`match \/${collection}\\/\\{`));
  }
  assert.match(rules, /match \/logs\/\{logId\}[\s\S]*allow create: if dono\(uid\);[\s\S]*allow update, delete: if false;/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write)\s*:\s*if\s+true/);
});

test('Firebase CLI aponta para as regras e o projeto configurado no app', async () => {
  const firebase = JSON.parse(await read('firebase.json'));
  const aliases = JSON.parse(await read('.firebaserc'));
  const client = await read('firebase-config.js');
  const configuredProject = client.match(/projectId:\s*["']([^"']+)["']/)?.[1];

  assert.equal(firebase.firestore.rules, 'firestore.rules');
  assert.equal(aliases.projects.default, configuredProject);
});
