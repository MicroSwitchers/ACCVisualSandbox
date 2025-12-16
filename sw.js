const CACHE_PREFIX = 'aac-sandbox-';
const CACHE_NAME = `${CACHE_PREFIX}v2`;

// Precache same-origin assets only. Cross-origin assets (like the Tailwind CDN)
// can cause `cache.addAll` to fail during install.
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            await cache.addAll(ASSETS);
        } catch (_e) {
            // Don't block installation if a single asset fails to precache.
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
                .map((name) => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

function isHttpRequest(request) {
    return request.url.startsWith('http://') || request.url.startsWith('https://');
}

function isCacheableResponse(response) {
    // Opaque responses are common for cross-origin requests without CORS.
    if (!response) return false;
    if (response.type === 'opaque') return true;
    if (response.status !== 200) return false;
    return response.type === 'basic' || response.type === 'cors';
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET' || !isHttpRequest(request)) return;

    // Navigation requests: network-first with cached fallback for offline use.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                // Keep the app shell fresh.
                cache.put('./index.html', networkResponse.clone());
                return networkResponse;
            } catch (_e) {
                const cached = await caches.match('./index.html');
                return cached || Response.error();
            }
        })());
        return;
    }

    // Static assets: cache-first with network update.
    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) {
            event.waitUntil((async () => {
                try {
                    const fresh = await fetch(request);
                    if (isCacheableResponse(fresh)) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, fresh.clone());
                    }
                } catch (_e) {
                    // Ignore update failures.
                }
            })());
            return cached;
        }

        try {
            const response = await fetch(request);
            if (isCacheableResponse(response)) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        } catch (_e) {
            return Response.error();
        }
    })());
});
