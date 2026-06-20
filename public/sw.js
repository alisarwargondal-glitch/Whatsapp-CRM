// Transparent pass-through service worker for live Next.js Web Apps
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Always fetch live from the network to keep Supabase & WhatsApp connections fully real-time
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});