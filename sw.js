/*
 * Service Worker - Smart Warehouse (Offline-First)
 * ==================================================
 * يخلي التطبيق يعمل بدون إنترنت: يحفظ الصفحة الرئيسية والموارد الخارجية
 * (Firebase SDK, SheetJS) في Cache Storage، ويقدّمها من الكاش لما ما يكون
 * فيه اتصال. استراتيجية:
 *   - طلبات التصفح (HTML): Network-first مع fallback للكاش (offline-ready)
 *   - باقي الموارد (JS/CSS/صور): Stale-while-revalidate (كاش فوري + تحديث بالخلفية)
 */

const CACHE_NAME = 'warehouse-cache-v1';
const APP_SHELL = [
    './',
    './index.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(
                APP_SHELL.map((url) => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // طلبات التنقل/الصفحة الرئيسية: نحاول الشبكة أولاً، ولو فشلت (بدون إنترنت) نرجع للكاش
    if (req.mode === 'navigate' || (req.destination === 'document')) {
        event.respondWith(
            fetch(req).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                return res;
            }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
        );
        return;
    }

    // باقي الموارد (سكريبتات، صور): كاش فوري + تحديث بالخلفية (stale-while-revalidate)
    event.respondWith(
        caches.match(req).then((cached) => {
            const networkFetch = fetch(req).then((res) => {
                if (res && res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                }
                return res;
            }).catch(() => cached);
            return cached || networkFetch;
        })
    );
});
