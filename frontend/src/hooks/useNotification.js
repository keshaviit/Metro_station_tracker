import { useEffect, useState } from 'react';

/**
 * useNotification
 * Requests browser Notification permission and provides
 * a function to fire notifications.
 */
export function useNotification() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'denied'
  );

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(setPermission);
    }
  }, []);

  const notify = (title, body, icon = '/metro-icon.png') => {
    if (permission === 'granted') {
      new Notification(title, { body, icon });
    }
  };

  return { permission, notify };
}
