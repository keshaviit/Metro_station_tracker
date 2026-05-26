import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * useNotification
 *
 * Robust notification hook with multi-layer fallback:
 * 1. Service Worker push notification (works in background)
 * 2. Standard browser Notification API (foreground only)
 * 3. In-app visual fallback flag (always works)
 *
 * Also exposes `lastInAppAlert` for visual fallback rendering.
 */
export function useNotification() {
  const [permission, setPermission] = useState(() => {
    try {
      return 'Notification' in window ? Notification.permission : 'unsupported';
    } catch {
      return 'unsupported';
    }
  });

  // In-app fallback: stores the latest alert so the UI can render it
  const [lastInAppAlert, setLastInAppAlert] = useState(null);
  const inAppTimeoutRef = useRef(null);

  // Sync permission state
  useEffect(() => {
    try {
      if ('Notification' in window) {
        setPermission(Notification.permission);
      }
    } catch {
      // Notification API not available (insecure context, etc.)
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      console.warn('[useNotification] Notification API not available (likely iOS Safari or insecure context).');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch (err) {
      console.error('[useNotification] Permission request failed:', err);
      return 'denied';
    }
  }, []);

  /**
   * Fire a notification.
   * Tries Service Worker → Standard Notification → In-app fallback
   */
  const notify = useCallback((title, body, icon = '/metro-icon.png') => {
    // Always set the in-app alert so the UI can show it regardless
    setLastInAppAlert({ title, body, timestamp: Date.now() });

    // Auto-clear in-app alert after 8 seconds
    if (inAppTimeoutRef.current) clearTimeout(inAppTimeoutRef.current);
    inAppTimeoutRef.current = setTimeout(() => setLastInAppAlert(null), 8000);

    // Attempt browser notifications
    if (permission !== 'granted') {
      console.info('[useNotification] Permission not granted, using in-app fallback.');
      return;
    }

    // Try Service Worker first (works in background & lock screen)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.showNotification(title, {
            body,
            icon,
            badge: icon,
            vibrate: [200, 100, 200, 100, 200],
            tag: 'metro-alert-' + Date.now(),
            renotify: true,
            requireInteraction: true,  // Stay visible until user interacts
          });
        })
        .catch((err) => {
          console.warn('[useNotification] SW notification failed, trying standard:', err);
          try {
            new Notification(title, { body, icon });
          } catch (e) {
            console.warn('[useNotification] Standard notification also failed:', e);
          }
        });
    } else {
      // Fallback to standard Notification
      try {
        new Notification(title, { body, icon });
      } catch (e) {
        console.warn('[useNotification] Standard notification failed:', e);
      }
    }
  }, [permission]);

  const dismissInAppAlert = useCallback(() => {
    setLastInAppAlert(null);
    if (inAppTimeoutRef.current) clearTimeout(inAppTimeoutRef.current);
  }, []);

  return { permission, requestPermission, notify, lastInAppAlert, dismissInAppAlert };
}
