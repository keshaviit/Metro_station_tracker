import { useEffect, useRef, useCallback } from 'react';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

// ── Constants ──────────────────────────────────────────────────────────────────
// Polling intervals (ms): base / near(≤3 stops) / critical(≤1 stop)
const POLL_BASE     = 2000;
const POLL_NEAR     = 1000;
const POLL_CRITICAL = 500;

// Distance in metres at which we consider the user "at" a station (for local alert)
const LOCAL_ALERT_RADIUS = 350;

// ── Native notification helper ─────────────────────────────────────────────────
async function triggerBackgroundNotification(title, body) {
  try {
    if (Capacitor.isNativePlatform()) {
      // Check permission live (don't rely on stale state)
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') {
        console.warn('[BG Notify] Permission not granted, skipping. Status:', display);
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
            // Note: vibration & sound are configured on the channel, not here
          }
        ]
      });
      console.log('[BG Notify] Fired:', title);
    } else {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    }
  } catch (err) {
    console.error('[BG Notify] Failed:', err);
  }
}

// ── Haversine distance ─────────────────────────────────────────────────────────
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Main hook ──────────────────────────────────────────────────────────────────
export function useGPSTracking() {
  const { state, dispatch, sendGpsUpdate } = useMetro();
  const watchIdRef             = useRef(null);
  const lastSentRef            = useRef(0);
  const wakeLockRef            = useRef(null);
  const lastLocalAlertRef      = useRef(-1);  // stops value at which we last fired a LOCAL alert
  const lastBackendAlertRef    = useRef(-1);  // stops value from last backend response alert
  const stopsRemainingCacheRef = useRef(null); // last known stopsRemaining from backend

  const tripIdRef = useRef(state.tripId);
  useEffect(() => { tripIdRef.current = state.tripId; }, [state.tripId]);

  const routeRef = useRef(state.route);
  useEffect(() => { routeRef.current = state.route; }, [state.route]);

  // ── Wake Lock ────────────────────────────────────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (_) {}
  }, []);

  // ── Core: fire alert for a given stopsRemaining value ───────────────────────
  const fireAlert = useCallback((remaining, nextStation, destinationName, source) => {
    // Deduplicate: only fire if we haven't already alerted for this remaining count
    const ref = source === 'local' ? lastLocalAlertRef : lastBackendAlertRef;
    if (ref.current === remaining) return;
    ref.current = remaining;

    // Also guard using localStorage so background and foreground stay in sync
    const lsKey = 'bg_last_alerted_stop';
    const lsVal = parseInt(localStorage.getItem(lsKey) ?? '-1');
    if (lsVal === remaining) return;
    localStorage.setItem(lsKey, remaining.toString());

    if (remaining === 3) {
      triggerBackgroundNotification(
        '🚇 3 Stations to Go',
        `Heads up! ${destinationName} is 3 stops away. Get ready!`
      );
    } else if (remaining === 2) {
      triggerBackgroundNotification(
        '🔔 Next-to-Next Station Alert!',
        `Approaching ${nextStation || destinationName}. Prepare to deboard soon!`
      );
    } else if (remaining === 1) {
      triggerBackgroundNotification(
        '🚨 Next Station Is Yours!',
        `The very next station is ${destinationName}. Stand by to deboard!`
      );
    } else if (remaining === 0) {
      triggerBackgroundNotification(
        '🎉 Deboard NOW!',
        `You have arrived at ${destinationName}!`
      );
    }
  }, []);

  // ── Local proximity check (instant, no network needed) ──────────────────────
  const checkLocalProximity = useCallback((lat, lng) => {
    const route = routeRef.current;
    const stationDetails = route?.stationDetails || [];
    if (stationDetails.length === 0) return;

    const destination = stationDetails[stationDetails.length - 1];
    if (!destination?.lat || !destination?.lng) return;

    const destinationName = destination.name || 'your destination';

    // Walk from destination backwards and find the first station the user is near
    for (let i = stationDetails.length - 1; i >= 0; i--) {
      const s = stationDetails[i];
      if (!s.lat || !s.lng) continue;
      const dist = getDistanceMeters(lat, lng, s.lat, s.lng);
      if (dist <= LOCAL_ALERT_RADIUS) {
        const remaining = stationDetails.length - 1 - i; // stops from station i to end
        const nextStation = stationDetails[i + 1]?.name || destinationName;
        if (remaining <= 3) {
          fireAlert(remaining, nextStation, destinationName, 'local');
        }
        break;
      }
    }
  }, [fireAlert]);

  // ── Main location handler ────────────────────────────────────────────────────
  const processLocation = useCallback((lat, lng, accuracy) => {
    dispatch({ type: 'SET_LOCATION', payload: { lat, lng, accuracy } });

    // 1. Immediate local proximity check — zero network latency
    checkLocalProximity(lat, lng);

    // 2. Pick polling interval based on last known stops remaining
    const cached = stopsRemainingCacheRef.current;
    const interval =
      cached != null && cached <= 1 ? POLL_CRITICAL :
      cached != null && cached <= 3 ? POLL_NEAR     :
      POLL_BASE;

    const now = Date.now();
    if (now - lastSentRef.current < interval) return;
    lastSentRef.current = now;

    const activeTripId = tripIdRef.current;
    if (!activeTripId) return;

    // 3. Fire backend call in parallel (non-blocking)
    const route = routeRef.current;
    const stationDetails = route?.stationDetails || [];
    const destination = stationDetails.length > 0 ? stationDetails[stationDetails.length - 1] : null;

    metroAPI.updateLocation({ tripId: activeTripId, lat, lng, accuracy })
      .then((res) => {
        if (!res?.data) return;
        dispatch({ type: 'SET_PREDICTION', payload: res.data });

        const remaining = res.data.stopsRemaining;
        stopsRemainingCacheRef.current = remaining;

        if (remaining != null && remaining <= 3) {
          const destinationName = destination?.name || 'your destination';
          const nextStation = res.data.nextStation || destinationName;
          fireAlert(remaining, nextStation, destinationName, 'backend');
        }
      })
      .catch(() => {});

    // 4. Also send via WebSocket (even faster for foreground)
    sendGpsUpdate(activeTripId, lat, lng, accuracy);
  }, [dispatch, sendGpsUpdate, checkLocalProximity, fireAlert]);

  // ── Start / Stop Tracking ────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    dispatch({ type: 'SET_TRACKING', payload: true });
    requestWakeLock();

    // Reset alert state when a new trip starts
    lastLocalAlertRef.current  = -1;
    lastBackendAlertRef.current = -1;
    stopsRemainingCacheRef.current = null;
    localStorage.removeItem('bg_last_alerted_stop');

    if (Capacitor.isNativePlatform()) {
      try {
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Tracking your metro journey to alert you before your station.',
            backgroundTitle: 'Metro Tracker Active',
            requestPermissions: true,
            stale: false,
            distanceFilter: 5,  // 5m sensitivity (was 10m)
          },
          function callback(location, error) {
            if (error) { console.error('Background Geo Error:', error); return; }
            if (location) {
              processLocation(location.latitude, location.longitude, location.accuracy);
            }
          }
        );
        watchIdRef.current = watcherId;
      } catch (err) {
        console.error('Failed to start BackgroundGeolocation:', err);
      }
    } else {
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => processLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
          (err) => console.error('GPS error:', err.message),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }
  }, [dispatch, requestWakeLock, processLocation]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      if (Capacitor.isNativePlatform()) {
        BackgroundGeolocation.removeWatcher({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
    dispatch({ type: 'SET_TRACKING', payload: false });
    releaseWakeLock();
  }, [dispatch, releaseWakeLock]);

  useEffect(() => {
    return () => { stopTracking(); };
  }, [stopTracking]);

  return { startTracking, stopTracking };
}
