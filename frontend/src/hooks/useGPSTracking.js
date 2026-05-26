import { useEffect, useRef, useCallback } from 'react';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';

/**
 * useGPSTracking
 *
 * Uses navigator.geolocation.watchPosition for continuous GPS tracking.
 * Sends location updates to backend every SEND_INTERVAL_MS milliseconds.
 * Cleans up watcher on unmount.
 */
const SEND_INTERVAL_MS = 5000;

export function useGPSTracking() {
  const { state, dispatch, sendGpsUpdate } = useMetro();
  const watchIdRef  = useRef(null);
  const lastSentRef = useRef(0);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return;
    }

    dispatch({ type: 'SET_TRACKING', payload: true });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        dispatch({ type: 'SET_LOCATION', payload: { lat, lng, accuracy } });

        const now = Date.now();
        if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
          lastSentRef.current = now;

          // Send via REST
          if (state.tripId) {
            metroAPI.updateLocation({ tripId: state.tripId, lat, lng, accuracy }).catch(() => {});
            // Also send via socket for lower latency
            sendGpsUpdate(state.tripId, lat, lng, accuracy);
          }
        }
      },
      (err) => console.error('GPS error:', err.message),
      {
        enableHighAccuracy: false, // Set to false for seamless desktop testing and mobile GPS support
        timeout: 15000,
        maximumAge: 5000,
      }
    );
  }, [state.tripId, dispatch, sendGpsUpdate]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    dispatch({ type: 'SET_TRACKING', payload: false });
  }, [dispatch]);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { startTracking, stopTracking };
}
