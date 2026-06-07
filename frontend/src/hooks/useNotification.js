import { useEffect, useState, useCallback, useRef } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export function useNotification() {
  const [permission, setPermission] = useState('unsupported');
  const [lastInAppAlert, setLastInAppAlert] = useState(null);
  const inAppTimeoutRef = useRef(null);

  useEffect(() => {
    const checkPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        const { display } = await LocalNotifications.checkPermissions();
        setPermission(display);
      } else if ('Notification' in window) {
        setPermission(Notification.permission);
      }
    };
    checkPerms();
  }, []);

  const requestPermission = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const { display } = await LocalNotifications.requestPermissions();
      setPermission(display);
      return display;
    } else {
      if (!('Notification' in window)) return 'unsupported';
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    }
  }, []);

  const notify = useCallback(async (title, body, icon = '/metro-icon.png') => {
    // Always show in-app toast regardless of permission
    setLastInAppAlert({ title, body, timestamp: Date.now() });
    if (inAppTimeoutRef.current) clearTimeout(inAppTimeoutRef.current);
    inAppTimeoutRef.current = setTimeout(() => setLastInAppAlert(null), 10000);

    if (Capacitor.isNativePlatform()) {
      try {
        // CRITICAL FIX: Re-check permission live at call time.
        // Do NOT rely on stale React state — permission may have been granted
        // after App.jsx's requestPermissions() resolved.
        const { display } = await LocalNotifications.checkPermissions();
        if (display !== 'granted') {
          console.warn('[notify] Permission not granted, skipping native notification. Current:', display);
          return;
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              title,
              body,
              id: Math.floor(Math.random() * 10_000_000),
              schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true },
              channelId: 'metro_alerts',
            }
          ]
        });
        console.log('[notify] Scheduled native notification:', title);
      } catch (err) {
        console.error('[notify] Failed to schedule notification:', err);
      }
    } else {
      // Web fallback
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body, icon,
            badge: icon,
            vibrate: [200, 100, 200, 100, 200],
            tag: 'metro-alert',
            renotify: true,
            requireInteraction: true,
          });
        }).catch(() => {
          try { new Notification(title, { body, icon }); } catch (_) {}
        });
      } else {
        try { new Notification(title, { body, icon }); } catch (_) {}
      }
    }
  }, []); // No dependency on stale 'permission' state

  const dismissInAppAlert = useCallback(() => {
    setLastInAppAlert(null);
    if (inAppTimeoutRef.current) clearTimeout(inAppTimeoutRef.current);
  }, []);

  return { permission, requestPermission, notify, lastInAppAlert, dismissInAppAlert };
}
