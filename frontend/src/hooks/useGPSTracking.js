import { useEffect, useRef, useCallback } from 'react';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';

/**
 * Helper to calculate distance in meters using Haversine formula
 */
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radius of the Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * useGPSTracking
 *
 * Uses navigator.geolocation.watchPosition for continuous GPS tracking.
 * Integrates Screen Wake Lock API to prevent device sleep during transit.
 * Cleans up watcher + wake lock on unmount.
 *
 * UPGRADE: Uses adaptive polling. Switches to high-accuracy, 1-second GPS hardware
 * polling when the user is within 2km (~1 station away) of their destination.
 */
export function useGPSTracking() {
  const { state, dispatch, sendGpsUpdate } = useMetro();
  const watchIdRef  = useRef(null);
  const lastSentRef = useRef(0);
  const wakeLockRef = useRef(null);
  const isHighAccuracyActiveRef = useRef(false);
  
  // Use a mutable ref to store the latest tripId to prevent stale closure bugs
  const tripIdRef = useRef(state.tripId);
  useEffect(() => {
    tripIdRef.current = state.tripId;
  }, [state.tripId]);

  // Keep a mutable ref of state.route to prevent stale closures inside registerGpsWatcher callback
  const routeRef = useRef(state.route);
  useEffect(() => {
    routeRef.current = state.route;
  }, [state.route]);

  /**
   * Request a Screen Wake Lock to prevent the device from sleeping.
   * Silently fails on unsupported browsers.
   */
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.info('[WakeLock] Screen wake lock acquired.');

        // Re-acquire if released due to visibility change
        wakeLockRef.current.addEventListener('release', () => {
          console.info('[WakeLock] Wake lock released.');
        });
      } else {
        console.info('[WakeLock] Wake Lock API not supported on this browser.');
      }
    } catch (err) {
      console.warn('[WakeLock] Failed to acquire wake lock:', err.message);
    }
  }, []);

  /**
   * Release the Screen Wake Lock.
   */
  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.info('[WakeLock] Screen wake lock released.');
      }
    } catch (err) {
      console.warn('[WakeLock] Failed to release wake lock:', err.message);
    }
  }, []);

  /**
   * Re-acquire wake lock when the user returns to the app/tab.
   */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && watchIdRef.current != null) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestWakeLock]);

  /**
   * Internal helper to register/re-register the Geolocation Watcher
   * with adaptive precision rates.
   */
  const registerGpsWatcher = useCallback((highAccuracy) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return;
    }

    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    isHighAccuracyActiveRef.current = highAccuracy;
    const interval = highAccuracy ? 1000 : 5000; // 1s polling near destination, 5s normal

    console.info(`[GPSWatcher] Registering watcher: highAccuracy=${highAccuracy}, interval=${interval}ms`);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        dispatch({ type: 'SET_LOCATION', payload: { lat, lng, accuracy } });

        // 1. Proximity Check: Calculate distance to destination station
        const activeRoute = routeRef.current;
        const stationDetails = activeRoute?.stationDetails || [];
        const destination = stationDetails.length > 0 ? stationDetails[stationDetails.length - 1] : null;

        if (destination && destination.lat && destination.lng) {
          const dist = getDistanceMeters(lat, lng, destination.lat, destination.lng);
          console.info(`[GPSWatcher] Current distance to destination "${destination.name}": ${dist.toFixed(0)}m (accuracy: ${accuracy.toFixed(0)}m)`);

          // If within 2km (1 station) and high accuracy is not yet active
          if (dist <= 2000 && !isHighAccuracyActiveRef.current) {
            console.info('[GPSWatcher] Close to destination! Upgrading to 1s High-Accuracy GPS mode.');
            registerGpsWatcher(true);
            return;
          }
        }

        // 2. Throttled Server Sync
        const now = Date.now();
        if (now - lastSentRef.current >= interval) {
          lastSentRef.current = now;

          const activeTripId = tripIdRef.current;
          if (activeTripId) {
            // Send via REST and update prediction state
            metroAPI.updateLocation({ tripId: activeTripId, lat, lng, accuracy })
              .then((res) => {
                if (res && res.data) {
                  dispatch({ type: 'SET_PREDICTION', payload: res.data });
                }
              })
              .catch((err) => {
                console.warn('REST location update failed:', err.message);
              });
            // Also send via socket for lower latency (backup channel)
            sendGpsUpdate(activeTripId, lat, lng, accuracy);
          }
        }
      },
      (err) => console.error('GPS error:', err.message),
      {
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: highAccuracy ? 0 : 5000, // Bypass hardware cache in high accuracy mode
      }
    );
  }, [dispatch, sendGpsUpdate]);

  const startTracking = useCallback(() => {
    dispatch({ type: 'SET_TRACKING', payload: true });

    // Acquire wake lock to keep screen alive
    requestWakeLock();

    // Start with low-power standard polling (5 seconds, highAccuracy = false)
    registerGpsWatcher(false);
  }, [dispatch, requestWakeLock, registerGpsWatcher]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    dispatch({ type: 'SET_TRACKING', payload: false });
    isHighAccuracyActiveRef.current = false;

    // Release wake lock when tracking stops
    releaseWakeLock();
  }, [dispatch, releaseWakeLock]);

  // Auto cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  return { startTracking, stopTracking };
}

