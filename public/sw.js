self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'BATTLE ZONE', body: 'お知らせがあります' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/logo.jpg',
    badge: '/logo.jpg',
  }));
});
