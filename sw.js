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

const VERSION = new URLSearchParams(self.location.search).get('v') || 'dev';
const CACHE = `financas-${VERSION}`;

// Só o essencial para abrir offline; o resto entra no cache conforme é usado.
const SHELL = [
  './',
  './index.html',
  './style.css',
  './modules.css',
  './firebase-config.js',
  './cloud-sync.js',
  './script.js',
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
    await self.skipWaiting(); // assume o lugar da versão anterior sem esperar
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // CDNs e Firebase seguem o caminho normal do navegador
  if (new URL(req.url).origin !== self.location.origin) return;

  const ehNavegacao = req.mode === 'navigate';

  event.respondWith((async () => {
    try {
      // No HTML o cache HTTP é ignorado de propósito: é ele que carrega o ?v=
      // dos demais arquivos, então precisa ser sempre o mais recente.
      const resposta = ehNavegacao
        ? await fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
        : await fetch(req);

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
