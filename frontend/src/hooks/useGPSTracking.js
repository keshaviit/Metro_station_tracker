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
            schedule: { allowWhileIdle: true }, // Immediate delivery, no "at" date
            channelId: 'metro_alerts',
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

// ── Voice Alert Synthesis helper ───────────────────────────────────────────────
function speakVoice(text) {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.error('Speech synthesis failed:', err);
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

  // Throttling references to prevent excessive React re-renders on GPS jitter
  const lastGpsDispatchTimeRef = useRef(0);
  const lastGpsCoordsRef       = useRef({ lat: 0, lng: 0, accuracy: 0 });

  // Interchange alert references to prevent duplicated triggers
  const lastAlertedInterchangeBeforeIndexRef = useRef(-1);
  const lastAlertedInterchangeAtIndexRef       = useRef(-1);

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

  // ── Interchange alert engine ─────────────────────────────────────────────────
  const checkInterchangeAlert = useCallback((currentIndex, stationDetails) => {
    if (!stationDetails || stationDetails.length === 0) return;

    // 1. Alert one station before the interchange
    const nextIdx = currentIndex + 1;
    if (nextIdx > 0 && nextIdx < stationDetails.length - 1) {
      const prev = stationDetails[nextIdx - 1];
      const next = stationDetails[nextIdx + 1];
      if (prev && next && prev.line !== next.line) {
        if (lastAlertedInterchangeBeforeIndexRef.current !== nextIdx) {
          lastAlertedInterchangeBeforeIndexRef.current = nextIdx;
          const msg = `Next station is ${stationDetails[nextIdx].name}. Please prepare to interchange to the ${next.line} Line.`;
          triggerBackgroundNotification('🔄 Interchange Ahead', msg);
          speakVoice(msg);
        }
      }
    }

    // 2. Alert when arriving at the interchange station itself
    if (currentIndex > 0 && currentIndex < stationDetails.length - 1) {
      const prev = stationDetails[currentIndex - 1];
      const next = stationDetails[currentIndex + 1];
      if (prev && next && prev.line !== next.line) {
        if (lastAlertedInterchangeAtIndexRef.current !== currentIndex) {
          lastAlertedInterchangeAtIndexRef.current = currentIndex;
          const msg = `Arrived at ${stationDetails[currentIndex].name}. Please switch to the ${next.line} Line.`;
          triggerBackgroundNotification('🔄 Interchange Station', msg);
          speakVoice(msg);
        }
      }
    }
  }, []);

  // ── Client-side local prediction solver (for offline or disconnected modes) ──
  const updateLocalPrediction = useCallback((lat, lng, accuracy) => {
    const route = routeRef.current;
    const stationDetails = route?.stationDetails || [];
    if (stationDetails.length === 0) return;

    const destination = stationDetails[stationDetails.length - 1];
    const destinationName = destination?.name || 'your destination';

    // 1. Calculate distance to each station on our route
    const candidates = stationDetails
      .map((station, index) => {
        if (!station.lat || !station.lng) return null;
        const dist = getDistanceMeters(lat, lng, station.lat, station.lng);
        return { station, distanceMeters: dist, index };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    if (candidates.length === 0) return;

    // Get current index from stopsRemainingCacheRef or default to 0
    const currentIdx = stopsRemainingCacheRef.current !== null
      ? Math.max(0, stationDetails.length - 1 - stopsRemainingCacheRef.current)
      : 0;

    let predictedStation = null;
    let predictedIndex = currentIdx;
    let method = 'in-transit';

    // Threshold radius (meters) matching backend logic
    const STATION_MATCH_RADIUS = Math.min(500, Math.max(300, 300 + accuracy));

    // A. Check if the user is close to any future station on the route path
    const futureStations = candidates.filter(c => c.index > currentIdx);
    const closestFuture = futureStations.find(c => c.distanceMeters <= STATION_MATCH_RADIUS);
    if (closestFuture) {
      predictedStation = closestFuture.station.name;
      predictedIndex = closestFuture.index;
      method = 'gps+route';
    }

    // B. Check if the user is still at the current expected station
    if (!predictedStation) {
      const currentCandidate = candidates.find(c => c.index === currentIdx);
      if (currentCandidate && currentCandidate.distanceMeters <= STATION_MATCH_RADIUS) {
        predictedStation = currentCandidate.station.name;
        predictedIndex = currentIdx;
        method = 'gps+route';
      }
    }

    // C. Check off-route: closest station globally is NOT on/near current segment
    if (!predictedStation) {
      const closestGlobal = candidates[0];
      if (Math.abs(closestGlobal.index - currentIdx) > 1 && closestGlobal.distanceMeters <= 300) {
        predictedStation = closestGlobal.station.name;
        predictedIndex = closestGlobal.index;
        method = 'off-route';
      }
    }

    // D. In-transit fallback
    if (!predictedStation) {
      predictedStation = stationDetails[currentIdx]?.name || route.path[0];
      predictedIndex = currentIdx;
      method = 'in-transit';
    }

    const stopsRemaining = stationDetails.length - 1 - predictedIndex;
    stopsRemainingCacheRef.current = stopsRemaining;

    const nextStation = stationDetails[predictedIndex + 1]?.name || destinationName;

    // Visited stations tracking
    const visited = [];
    for (let i = 0; i <= predictedIndex; i++) {
      visited.push(stationDetails[i].name);
    }

    const isOffRoute = method === 'off-route';
    const warningMessage = isOffRoute
      ? 'You have gone off-route! Tap Recalculate to get a new route from your current location.'
      : '';

    const localPred = {
      currentStation: predictedStation,
      nextStation,
      stopsRemaining,
      currentIndex: predictedIndex,
      shouldAlert: stopsRemaining <= 2,
      confidence: accuracy <= 100 ? 'high' : 'medium',
      method: `${method}-local`,
      visitedStations: visited,
      isOffRoute,
      isWrongDirection: false,
      warningMessage,
    };

    dispatch({ type: 'SET_PREDICTION', payload: localPred });

    // Handle offline alarms triggering
    if (stopsRemaining <= 3) {
      fireAlert(stopsRemaining, nextStation, destinationName, 'local');
    }
    checkInterchangeAlert(predictedIndex, stationDetails);
  }, [dispatch, fireAlert, checkInterchangeAlert]);

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
        // Proactively check for interchange alarms offline
        checkInterchangeAlert(i, stationDetails);

        const remaining = stationDetails.length - 1 - i; // stops from station i to end
        const nextStation = stationDetails[i + 1]?.name || destinationName;
        if (remaining <= 3) {
          fireAlert(remaining, nextStation, destinationName, 'local');
        }
        break;
      }
    }
  }, [fireAlert, checkInterchangeAlert]);

  // ── Main location handler ────────────────────────────────────────────────────
  const processLocation = useCallback((lat, lng, accuracy) => {
    // Throttled UI state dispatching to resolve lag on physical devices
    const now = Date.now();
    const shouldDispatch =
      now - lastGpsDispatchTimeRef.current > 3000 || // at least 3 seconds
      !lastGpsCoordsRef.current.lat ||
      getDistanceMeters(lat, lng, lastGpsCoordsRef.current.lat, lastGpsCoordsRef.current.lng) > 15 || // > 15m shift
      Math.abs(accuracy - lastGpsCoordsRef.current.accuracy) > 15; // > 15m accuracy shift

    if (shouldDispatch) {
      dispatch({ type: 'SET_LOCATION', payload: { lat, lng, accuracy } });
      lastGpsDispatchTimeRef.current = now;
      lastGpsCoordsRef.current = { lat, lng, accuracy };
    }

    // 1. Immediate local proximity check — zero network latency
    checkLocalProximity(lat, lng);

    // 2. Pick polling interval based on last known stops remaining
    const cached = stopsRemainingCacheRef.current;
    const interval =
      cached != null && cached <= 1 ? POLL_CRITICAL :
      cached != null && cached <= 3 ? POLL_NEAR     :
      POLL_BASE;

    if (now - lastSentRef.current < interval) return;
    lastSentRef.current = now;

    const activeTripId = tripIdRef.current;
    if (!activeTripId) return;

    if (activeTripId.startsWith('local-')) {
      updateLocalPrediction(lat, lng, accuracy);
      return;
    }

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

        // Perform online interchange check
        const currentIndex = res.data.currentIndex;
        if (currentIndex != null) {
          checkInterchangeAlert(currentIndex, stationDetails);
        }

        if (remaining != null && remaining <= 3) {
          const destinationName = destination?.name || 'your destination';
          const nextStation = res.data.nextStation || destinationName;
          fireAlert(remaining, nextStation, destinationName, 'backend');
        }
      })
      .catch((err) => {
        console.warn('[GPS] Network location update failed, falling back to local prediction solver');
        updateLocalPrediction(lat, lng, accuracy);
      });

    // 4. Also send via WebSocket (even faster for foreground)
    sendGpsUpdate(activeTripId, lat, lng, accuracy);
  }, [dispatch, sendGpsUpdate, checkLocalProximity, fireAlert, checkInterchangeAlert, updateLocalPrediction]);

  // ── Start / Stop Tracking ────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    dispatch({ type: 'SET_TRACKING', payload: true });
    requestWakeLock();

    // Reset alert state when a new trip starts
    lastLocalAlertRef.current  = -1;
    lastBackendAlertRef.current = -1;
    stopsRemainingCacheRef.current = null;
    lastAlertedInterchangeBeforeIndexRef.current = -1;
    lastAlertedInterchangeAtIndexRef.current = -1;
    localStorage.removeItem('bg_last_alerted_stop');

    if (Capacitor.isNativePlatform()) {
      try {
        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: 'Tracking your metro journey to alert you before your station.',
            backgroundTitle: 'Metro Tracker Active',
            requestPermissions: true,
            stale: false,
            distanceFilter: 5,  // 5m sensitivity
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
