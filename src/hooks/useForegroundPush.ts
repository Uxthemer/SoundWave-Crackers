import { useEffect } from 'react';
import { onMessage } from 'firebase/messaging';
import { messaging } from '../lib/firebase';

/**
 * Shows a push that arrives while the site is open and visible.
 *
 * The FCM service worker only draws a notification when no tab of the site is
 * visible. If one is, it hands the message to the page instead and shows
 * nothing -- and nothing in the page was listening. So a Windows or Android
 * admin with the dashboard on screen got no alert at all, and pressing "Test
 * This Device" (which is always done with the page in front of you) could
 * never work there. The iPhone only looked reliable because its alerts land
 * while the app is in the background.
 *
 * Drawn through the service worker registration, with the same options the
 * worker uses, so a foreground alert looks and clicks like a background one.
 */
export function useForegroundPush() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!('serviceWorker' in navigator)) return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const instance = await messaging;
      if (!instance || cancelled) return;

      unsubscribe = onMessage(instance, async (payload) => {
        if (Notification.permission !== 'granted') return;
        const data = payload.data || {};
        const title = data.title || payload.notification?.title || 'SoundWave Crackers';
        const options: NotificationOptions = {
          body: data.body || payload.notification?.body || 'You have a new update.',
          icon: '/assets/img/logo/logo_2.png',
          badge: '/assets/img/logo/logo_2.png',
          tag: data.orderId ? `order-${data.orderId}` : 'soundwave',
          data: { url: data.url || '/orders' },
        };

        try {
          const registration = await navigator.serviceWorker.getRegistration('/');
          if (registration) {
            await registration.showNotification(title, options);
            return;
          }
        } catch (e) {
          console.error('Could not show foreground push via service worker', e);
        }
        // No worker to draw it (should not happen once registered); a plain
        // Notification still gets the alert in front of the admin.
        new Notification(title, options);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
}
