import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
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

test('a tela de backups e logs fica acessível pela barra principal', async () => {
  const html = await read('index.html');
  const recovery = await read('js/41-backups-recovery.js');
  const events = await read('js/70-events.js');

  assert.match(html, /id="btnBackups"[^>]*aria-label="Backups e logs de salvamento"/);
  assert.match(recovery, /window\.abrirBackupsLogs\s*=\s*abrirBackupsLogs/);
  assert.match(events, /getElementById\('btnBackups'\).*window\.abrirBackupsLogs/);
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
