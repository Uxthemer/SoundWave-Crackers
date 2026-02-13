import { useState, useEffect } from 'react';
import { messaging } from '../lib/firebase';
import { getToken } from 'firebase/messaging';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Bell, Loader2 } from 'lucide-react';

export function PushNotificationManager() {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    if (!user || Notification.permission !== 'granted') return;

    // We can't easily check if *this* browser instance is the one in DB without checking token match.
    // But for UI, if permission is granted, we assume they might be.
    // Ideally we re-fetch token and compare.
    try {
        // Without VAPID key we can't do much
        if (!vapidKey) return;
    } catch (e) {
        console.error(e);
    }
  };

  const subscribeToPush = async () => {
    if (!vapidKey) {
      toast.error("VITE_FIREBASE_VAPID_KEY is missing in .env");
      return;
    }
    
    // Resolve messaging instance
    const messagingInstance = await messaging;
    
    if (!messagingInstance) {
      toast.error("Firebase Messaging not initialized");
      return;
    }

    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult === 'granted') {
        // Register Service Worker explicitly
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log("Service Worker registered:", registration);

        // Wait for it to be active
        await navigator.serviceWorker.ready;

        const token = await getToken(messagingInstance, { 
            vapidKey, 
            serviceWorkerRegistration: registration 
        });
        console.log("FCM Token:", token);

        if (token && user) {
          const { error } = await supabase
            .from('admin_push_subscriptions')
            .upsert({
              user_id: user.id,
              fcm_token: token,
              device_info: navigator.userAgent
            }, { onConflict: 'fcm_token' });

          if (error) throw error;
          
          setIsSubscribed(true);
          toast.success("Push notifications enabled on this device!");
        }
      } else {
        toast.error("Permission denied");
      }
    } catch (error: any) {
      console.error("Error subscribing:", error);
      toast.error("Failed to subscribe: " + error.message);
    } finally {
      setLoading(false);
    }
  };

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
      
      <div className="flex items-center justify-between">
        <div>
           <p className="text-sm text-text/80 mb-2">
             Receive instant alerts on this device when a new order is placed.
           </p>
           <div className="text-xs text-text/60">
             Current Status: 
             <span className={`ml-1 font-semibold ${permission === 'granted' ? 'text-green-600' : 'text-yellow-600'}`}>
                {permission === 'granted' ? 'Permitted' : permission === 'denied' ? 'Denied' : 'Not setup'}
             </span>
           </div>
        </div>

        <button
          onClick={subscribeToPush}
          disabled={loading || permission === 'denied'}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
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
      
      {permission === 'granted' && isSubscribed && (
          <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex gap-4">
                  <button
                      onClick={async () => {
                          const messagingInstance = await messaging;
                          if (!messagingInstance) return;
                          
                          const token = await getToken(messagingInstance, { vapidKey });
                          if (!token) return toast.error("No token found");
                          
                          const toastId = toast.loading("Sending test to THIS device...");
                          try {
                              const { error } = await supabase.functions.invoke('notify-admins-new-order', {
                                  body: { test: true, target_token: token, broadcast: false }
                              });
                              if(error) throw error;
                              toast.success("Sent!", { id: toastId });
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
                              toast.success(`Sent to ${data?.successCount ?? 'all'} devices`, { id: toastId });
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
              Permission was denied. Please reset permissions in your browser settings (lock icon in address bar).
          </p>
      )}
    </div>
  );
}
