import { useCallback, useEffect, useState } from 'react';
import { messaging } from '../lib/firebase';
import { getToken } from 'firebase/messaging';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Bell, Loader2, Smartphone } from 'lucide-react';

/**
 * Turning order alerts on for the device you are holding.
 *
 * One account, many devices: admin_push_subscriptions is keyed on the token,
 * not the user, so every phone an admin signs in on gets its own row and its
 * own alert. What went wrong before was not the schema -- it was that a row,
 * once written, was never written again. FCM rotates tokens, iOS drops a
 * subscription that has been idle, and the send path deletes tokens it could
 * not reach; nothing put the row back. One phone kept working, another went
 * quiet weeks later, and the screen showed no difference between them.
 *
 * So this re-asserts the device on every visit, and shows what is actually in
 * the table rather than what happened in this browser session.
 */

interface RegisteredDevice {
  id: string;
  device_info: string | null;
  created_at: string;
}

/**
 * Says what FCM actually did with the test.
 *
 * "Sent!" was printed whenever the function returned at all, so a token FCM
 * rejected outright looked identical to one that worked -- which is no help
 * when the whole question is why a device is silent. The error codes are the
 * useful part: `registration-token-not-registered` means that device needs
 * re-registering, anything else is worth reading.
 */
function reportSendResult(
  data: { successCount?: number; failureCount?: number; errors?: string[] } | null,
  toastId: string,
  target: string
) {
  const success = data?.successCount ?? 0;
  const failure = data?.failureCount ?? 0;

  if (failure > 0 && success === 0) {
    toast.error(
      `FCM rejected the send${data?.errors?.length ? `: ${data.errors.join(', ')}` : ''}`,
      { id: toastId, duration: 8000 }
    );
    return;
  }
  if (failure > 0) {
    toast.success(
      `Sent to ${success} of ${success + failure} devices — ${failure} failed`,
      { id: toastId, duration: 8000 }
    );
    return;
  }
  toast.success(`Sent to ${target} (${success})`, { id: toastId });
}

/** A full userAgent is unreadable in a list; this is enough to tell phones apart. */
function describeDevice(userAgent: string | null): string {
  const ua = userAgent || '';
  if (!ua) return 'Unknown device';

  const platform = /iPhone/i.test(ua)
    ? 'iPhone'
    : /iPad/i.test(ua)
    ? 'iPad'
    : /Android/i.test(ua)
    ? 'Android'
    : /Macintosh/i.test(ua)
    ? 'Mac'
    : /Windows/i.test(ua)
    ? 'Windows'
    : 'Device';

  // Order matters: Chrome and Edge both claim Safari in their userAgent.
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /CriOS|Chrome/i.test(ua)
    ? 'Chrome'
    : /FxiOS|Firefox/i.test(ua)
    ? 'Firefox'
    : /Safari/i.test(ua)
    ? 'Safari'
    : '';

  return browser ? `${platform} · ${browser}` : platform;
}

export function PushNotificationManager() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  /**
   * The token this device is registered under. Held so the test button sends
   * to the row that is in the table, rather than asking for a token again and
   * possibly getting a different one.
   */
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  /**
   * iOS only exposes the Notification API to a web app that has been added to
   * the Home Screen. In a plain Safari tab it is simply not there, which is
   * the usual reason a second iPhone "has notifications enabled" and still
   * receives nothing.
   */
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator;

  const loadDevices = useCallback(async () => {
    if (!user) {
      setDevices([]);
      return;
    }
    const { data, error } = await supabase
      .from('admin_push_subscriptions')
      .select('id, device_info, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Could not read registered devices', error);
      return;
    }
    setDevices((data ?? []) as RegisteredDevice[]);
  }, [user]);

  /**
   * Writes this device's current token against the signed-in user.
   *
   * `interactive` is the difference between the admin pressing the button --
   * where silence would be baffling and every outcome gets a toast -- and the
   * quiet re-registration on load, which must not shout at anyone.
   */
  const registerDevice = useCallback(
    async (interactive: boolean) => {
      if (!vapidKey || !supported) return;

      if (!user) {
        // The old code checked `token && user` and did nothing when the
        // session had not loaded yet: no row, no error, no toast.
        if (interactive) toast.error('Please sign in again before enabling alerts.');
        return;
      }

      const messagingInstance = await messaging;
      if (!messagingInstance) {
        if (interactive) toast.error('Firebase Messaging not initialized');
        return;
      }

      if (interactive) setLoading(true);
      try {
        // Asking when it is already granted is a no-op, so the interactive
        // path can always ask; the quiet path must not, as a prompt nobody
        // triggered is a permission people deny out of reflex.
        const result = interactive
          ? await Notification.requestPermission()
          : Notification.permission;
        setPermission(result);

        if (result !== 'granted') {
          if (interactive) toast.error('Permission denied');
          return;
        }

        const registration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );
        // Ask for a newer worker rather than waiting for the browser's own
        // 24-hour check. A device left on a stale worker keeps handling
        // pushes with old code and looks broken in a way nothing on this
        // screen explains.
        try {
          await registration.update();
        } catch {
          // An update check is best-effort; the existing worker still works.
        }
        await navigator.serviceWorker.ready;

        const token = await getToken(messagingInstance, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
        if (!token) {
          if (interactive) toast.error('This device did not return a push token.');
          return;
        }

        // On the token, so the same phone re-registering updates its row
        // instead of adding another, and a phone a different admin signs in
        // on moves to them rather than alerting the previous owner.
        const { error } = await supabase.from('admin_push_subscriptions').upsert(
          {
            user_id: user.id,
            fcm_token: token,
            device_info: navigator.userAgent,
          },
          { onConflict: 'fcm_token' }
        );
        if (error) throw error;

        setDeviceToken(token);
        setIsSubscribed(true);
        if (interactive) toast.success('Push notifications enabled on this device!');
        await loadDevices();
      } catch (error: any) {
        console.error('Error subscribing:', error);
        if (interactive) toast.error('Failed to subscribe: ' + error.message);
      } finally {
        if (interactive) setLoading(false);
      }
    },
    [user, vapidKey, supported, loadDevices]
  );

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
    void loadDevices();

    // Already permitted: put the row back without asking. This is what makes
    // a second phone stay registered rather than going quiet on its own.
    if (Notification.permission === 'granted') void registerDevice(false);
  }, [supported, loadDevices, registerDevice]);

  if (!vapidKey) {
     return (
         <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
             <p className="font-bold">Missing Configuration</p>
             <p className="text-sm">VITE_FIREBASE_VAPID_KEY is missing in your environment variables. Push notifications cannot be enabled.</p>
         </div>
     )
  }

  return (
    <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary-orange" />
        Admin Push Notifications
      </h2>

      {!supported ? (
        <div className="text-sm text-text/80 space-y-2">
          <p>
            This browser cannot receive push notifications.
          </p>
          <p className="text-text/60">
            On an iPhone or iPad, open the site in Safari, tap Share → Add to
            Home Screen, then open it from that icon and turn alerts on there.
            Apple only allows web notifications for a site installed to the
            Home Screen — a normal Safari tab can never receive them.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4">
            <div>
               <p className="text-sm text-text/80 mb-2">
                 Receive instant alerts on this device when a new order is placed.
               </p>
               <div className="text-xs text-text/60">
                 Current Status:
                 <span className={`ml-1 font-semibold ${permission === 'granted' ? 'text-green-600' : 'text-yellow-600'}`}>
                    {permission === 'granted' ? 'Permitted' : permission === 'denied' ? 'Denied' : 'Not setup'}
                 </span>
                 {permission === 'granted' && (
                   <span className={`ml-2 font-semibold ${isSubscribed ? 'text-green-600' : 'text-yellow-600'}`}>
                     {isSubscribed
                       ? '· This device is registered'
                       : '· This device is not registered yet'}
                   </span>
                 )}
               </div>
            </div>

            <button
              onClick={() => registerDevice(true)}
              disabled={loading || permission === 'denied'}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors shrink-0
                ${permission === 'granted'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200 border border-green-200'
                    : 'bg-primary-orange text-white hover:bg-primary-orange/90'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {loading ? (
                 <Loader2 className="w-4 h-4 animate-spin" />
              ) : permission === 'granted' ? (
                 <>
                   <Bell className="w-4 h-4" />
                   Re-sync Device
                 </>
              ) : (
                 <>
                   <Bell className="w-4 h-4" />
                   Enable Notifications
                 </>
              )}
            </button>
          </div>

          {/* What the table actually holds for this login. Without it there is
              no way to tell, from the phone in your hand, whether the other
              phone is still registered. */}
          {devices.length > 0 && (
            <div className="mt-4 pt-4 border-t border-card-border/10">
              <p className="text-xs font-semibold text-text/70 mb-2">
                Devices receiving alerts on this login ({devices.length})
              </p>
              <ul className="space-y-1">
                {devices.map((device) => (
                  <li
                    key={device.id}
                    className="flex items-center gap-2 text-xs text-text/60"
                  >
                    <Smartphone className="w-3 h-3 shrink-0" />
                    <span className="font-medium">
                      {describeDevice(device.device_info)}
                    </span>
                    <span className="text-text/40">
                      added {new Date(device.created_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {permission === 'granted' && (
              <div className="mt-4 pt-4 border-t border-card-border/10">
                  <div className="flex gap-4">
                      <button
                          onClick={async () => {
                              // The registered token, not a freshly requested
                              // one. Asking again without naming the service
                              // worker registration returns a token bound to
                              // a different scope, so the test went to a
                              // subscription that was not the one in the
                              // table -- and nothing arrived.
                              if (!deviceToken) {
                                  return toast.error(
                                      "This device is not registered yet. Press Re-sync Device first."
                                  );
                              }

                              const toastId = toast.loading("Sending test to THIS device...");
                              try {
                                  const { error, data } = await supabase.functions.invoke('notify-admins-new-order', {
                                      body: { test: true, target_token: deviceToken, broadcast: false }
                                  });
                                  if(error) throw error;
                                  reportSendResult(data, toastId, "this device");
                              } catch (e: any) {
                                  toast.error("Failed: " + e.message, { id: toastId });
                              }
                          }}
                          className="text-xs flex items-center gap-1 text-primary-orange hover:underline"
                      >
                          <Bell className="w-3 h-3" />
                          Test This Device
                      </button>

                      <button
                          onClick={async () => {
                              const toastId = toast.loading("Sending test to ALL devices...");
                              try {
                                  const { error, data } = await supabase.functions.invoke('notify-admins-new-order', {
                                      body: { test: true, broadcast: true }
                                  });
                                  if(error) throw error;
                                  reportSendResult(data, toastId, "all devices");
                              } catch (e: any) {
                                  toast.error("Failed: " + e.message, { id: toastId });
                              }
                          }}
                          className="text-xs flex items-center gap-1 text-blue-600 hover:underline"
                      >
                          <Bell className="w-3 h-3" />
                          Test ALL Devices
                      </button>
                  </div>
              </div>
          )}

          {permission === 'denied' && (
              <p className="text-xs text-red-500 mt-2">
                  Permission was denied. On iPhone, Settings → Notifications →
                  SoundWave Crackers. In a desktop browser, the lock icon in the
                  address bar.
              </p>
          )}
        </>
      )}
    </div>
  );
}
