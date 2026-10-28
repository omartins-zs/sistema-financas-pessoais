/**
 * ============================================================
 *  Service worker — Finanças da Casa
 * ============================================================
 *  Estratégia: NETWORK-FIRST para tudo que é do próprio site.
 *
 *  Ou seja: com internet, um refresh SEMPRE traz a versão nova.
 *  O cache só entra em cena quando a rede falha (modo offline).
 *  É o contrário do PWA "clássico" (cache-first), que é justamente
 *  o que costuma deixar celular e tablet presos numa versão antiga.
 *
 *  A versão vem da própria URL de registro (sw.js?v=...), então
 *  existe um único lugar para trocar: o index.html.
 * ============================================================
 */

const SW_BUILD_VERSION = '20261028-1404';
const VERSION = new URLSearchParams(self.location.search).get('v') || SW_BUILD_VERSION;
const CACHE = `financas-${VERSION}`;

// Só o essencial para abrir offline; o resto entra no cache conforme é usado.
const SHELL = [
  './',
  './index.html',
  './style.css',
  './modules.css',
  './firebase-config.js',
  './cloud-sync.js',
  './js/00-core.js',
  './js/10-theme-persistence.js',
  './js/11-history-audit.js',
  './js/20-navigation-dashboard.js',
  './js/30-entries.js',
  './js/40-exports.js',
  './js/41-backups-recovery.js',
  './js/50-import-parsers.js',
  './js/51-import-workflows.js',
  './js/60-render.js',
  './js/61-card-reordering.js',
  './js/70-events.js',
  './js/80-bootstrap-pwa.js',
  './app-modules.js',
  './manifest.webmanifest',
  './logo.png',
  './favicon.ico',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Um a um: com addAll, um único arquivo falhando derrubaria a instalação inteira.
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    // Se já há uma versão ativa, aguarda o app salvar e encerrar formulários antes de ativar.
    // A página envia SKIP_WAITING somente quando a atualização for segura.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes
      .filter((nome) => nome.startsWith('financas-') && nome !== CACHE)
      .map((nome) => caches.delete(nome)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // CDNs e Firebase seguem o caminho normal do navegador
  if (new URL(req.url).origin !== self.location.origin) return;

  const ehNavegacao = req.mode === 'navigate';

  event.respondWith((async () => {
    try {
      // Ignora o cache HTTP do navegador/PWA para trazer sempre os arquivos mais recentes da rede
      const resposta = ehNavegacao
        ? await fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        : await fetch(req, { cache: 'no-cache' });

      if (resposta && resposta.ok) {
        const copia = resposta.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(req, copia)));
      }

      // Navegação não aceita resposta que passou por redirect (o navegador recusa):
      // devolve uma cópia sem essa marca.
      if (ehNavegacao && resposta.redirected) {
        return new Response(resposta.body, {
          status: resposta.status,
          statusText: resposta.statusText,
          headers: resposta.headers
        });
      }

      return resposta;
    } catch (erro) {
      // Sem rede: devolve o que estiver guardado (ignoreSearch cobre o ?v=)
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;

      if (ehNavegacao) {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw erro;
    }
  })());
});
