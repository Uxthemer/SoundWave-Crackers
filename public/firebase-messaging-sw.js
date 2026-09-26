// Helper to get params
// This file is in the public folder, so we can't use process.env or import.meta.env directly in the browser service worker scope usually (unless built).
// We'll hardcode the config from the .env for reliability in this generated file.

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Take over as soon as a new version of this file is deployed.
//
// Without these, a browser downloads the new worker and then parks it until
// every tab and window of the site has been closed -- which on a phone that
// keeps the app open in the background can be never. The old worker carries
// on handling pushes in the meantime, so a fix to the code below appears to
// have no effect on exactly the device you are trying to fix.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const firebaseConfig = {
  apiKey: "AIzaSyB5eeS5Y8xRA4Agmkum85JK7hBTf66pN34",
  authDomain: "soundwave-crackers.firebaseapp.com",
  projectId: "soundwave-crackers",
  storageBucket: "soundwave-crackers.firebasestorage.app",
  messagingSenderId: "481458959237",
  appId: "1:481458959237:web:cafb9d05093f1897ae0aec",
  measurementId: "G-YP7WPZ98WP"
};

try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background message handler
    messaging.onBackgroundMessage((payload) => {
      console.log('Received background message ', payload);

      // A message carrying a `notification` block has already been shown by
      // the FCM SDK before this handler runs -- the SDK displays it AND calls
      // us. Drawing another here is what put two notifications on the phone
      // for a single order. The server now sends data-only messages; this
      // guard means an old-format one cannot bring the duplicate back.
      if (payload.notification) return;

      const data = payload.data || {};

      // Never leave a push without a notification: iOS and Chrome both treat
      // a push that shows nothing as a fault, and will either post their own
      // "site updated in the background" notice or drop the subscription.
      self.registration.showNotification(data.title || 'SoundWave Crackers', {
        body: data.body || 'You have a new update.',
        icon: '/assets/img/logo/logo_2.png',
        badge: '/assets/img/logo/logo_2.png',
        // Two pushes for the same order replace each other instead of
        // stacking up on the lock screen.
        tag: data.orderId ? `order-${data.orderId}` : 'soundwave',
        data: { url: data.url || '/orders' },
      });
    });

    // Tapping the notification should land on the orders screen, reusing a
    // tab that is already open rather than stacking up new ones.
    self.addEventListener('notificationclick', (event) => {
      event.notification.close();
      const target = (event.notification.data && event.notification.data.url) || '/orders';

      event.waitUntil(
        self.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((clientList) => {
            for (const client of clientList) {
              if ('focus' in client) {
                if ('navigate' in client) client.navigate(target);
                return client.focus();
              }
            }
            if (self.clients.openWindow) return self.clients.openWindow(target);
          })
      );
    });
} catch (e) {
    console.error("Firebase SW Init Error", e);
}
