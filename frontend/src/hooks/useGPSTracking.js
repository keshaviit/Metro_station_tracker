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
  
  // Use a mutable ref to store the latest tripId to prevent stale closure bugs
  const tripIdRef = useRef(state.tripId);
  useEffect(() => {
    tripIdRef.current = state.tripId;
  }, [state.tripId]);

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

          const activeTripId = tripIdRef.current;
          // Send via REST
          if (activeTripId) {
            metroAPI.updateLocation({ tripId: activeTripId, lat, lng, accuracy }).catch(() => {});
            // Also send via socket for lower latency
            sendGpsUpdate(activeTripId, lat, lng, accuracy);
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
  }, [dispatch, sendGpsUpdate]);

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
