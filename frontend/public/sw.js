// Incrementar versão em cada build para garantir que usuários sempre tenham a versão mais recente
const CACHE_NAME = 'series-vault-v3';
const FIREBASE_SDK_VERSION = '12.17.1';

function getFirebaseConfigFromUrl() {
  try {
    const configPayload = new URL(self.location.href).searchParams.get('firebaseConfig');
    return configPayload ? JSON.parse(atob(configPayload)) : null;
  } catch (error) {
    console.warn('Configuração Firebase do Service Worker inválida.', error);
    return null;
  }
}

function initializeFirebaseMessaging() {
  const firebaseConfig = getFirebaseConfigFromUrl();
  if (!firebaseConfig) return;

  try {
    importScripts(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`,
    );
    importScripts(
      `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`,
    );

    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || 'Series Vault';
      const body =
        payload.notification?.body ||
        payload.data?.body ||
        'Há episódios disponíveis hoje.';

      self.registration.showNotification(title, {
        body,
        data: payload.data || {},
        icon: '/icon-teal-v2-192x192.png',
        badge: '/icon-teal-v2-128x128.png',
        tag: payload.data?.tag || 'series-vault-today',
      });
    });
  } catch (error) {
    console.warn('Firebase Messaging não foi inicializado no Service Worker.', error);
  }
}

initializeFirebaseMessaging();

// Install: cache apenas o app shell HTML
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/index.html']).catch(() => {
        console.log('App shell não disponível para cache');
      });
    })
  );
  // Forçar novo SW a ficar ativo imediatamente
  self.skipWaiting();
});

// Activate: limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (matchingClient) {
        matchingClient.focus();
        return matchingClient.navigate(targetUrl);
      }

      return self.clients.openWindow(targetUrl);
    }),
  );
});

// Fetch: estratégia depende do tipo de requisição
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass para endpoints de API (/api/)
  if (url.pathname.startsWith('/api/')) return;

  // Manifest e icones precisam sempre vir da rede para evitar arte antiga no PWA.
  if (
    url.pathname === '/manifest.json' ||
    url.pathname === '/sw.js' ||
    url.pathname.startsWith('/icon') ||
    url.pathname === '/logo.svg'
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first para assets estáticos com hash (/assets/)
  // Esses arquivos têm nomes com content-hash, seguro cachear indefinidamente
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first para navegação (HTML)
  // Sempre busca HTML fresco para que novos builds sejam imediatamente visíveis
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          // Retorna página em cache se falhar
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Network-first para outros requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
