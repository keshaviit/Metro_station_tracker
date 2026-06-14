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

// ── Helper for time-based dead-reckoning prediction ───────────────────────────
function getPredictiveState(elapsedSeconds, lastConfirmedIndex, pathLength) {
  const T_transit = 150; // 2.5 minutes (150 seconds)
  const T_dwell = 30;    // 30 seconds station dwell
  const N = pathLength - 1;

  const destArrivalTime = N > lastConfirmedIndex
    ? (N - lastConfirmedIndex) * T_transit + (N - lastConfirmedIndex - 1) * T_dwell
    : 0;

  if (elapsedSeconds >= destArrivalTime) {
    return { index: N, status: 'stopped', stopsRemaining: 0 };
  }

  for (let j = lastConfirmedIndex + 1; j <= N; j++) {
    const steps = j - lastConfirmedIndex;
    const arrivalTime = steps * T_transit + (steps - 1) * T_dwell;
    const departureTime = arrivalTime + T_dwell;

    if (elapsedSeconds < arrivalTime) {
      return { index: j - 1, status: 'in-transit', stopsRemaining: pathLength - j };
    } else if (elapsedSeconds >= arrivalTime && elapsedSeconds < departureTime) {
      return { index: j, status: 'stopped', stopsRemaining: pathLength - 1 - j };
    }
  }

  return { index: lastConfirmedIndex, status: 'stopped', stopsRemaining: pathLength - 1 - lastConfirmedIndex };
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

// ── Interchange alert detector ──────────────────────────────────────────────────
function getInterchangeAlert(predictedIndex, route, stationDetails) {
  if (!route || !route.interchanges || !stationDetails || stationDetails.length === 0) return null;

  const currentStationName = route.path[predictedIndex];
  const isCurrentInterchange = route.interchanges.includes(currentStationName);
  
  if (isCurrentInterchange && predictedIndex > 0 && predictedIndex < stationDetails.length - 1) {
    const nextStationDetail = stationDetails[predictedIndex + 1];
    const targetLine = nextStationDetail?.line;
    const prevStationDetail = stationDetails[predictedIndex - 1];
    if (targetLine && prevStationDetail && prevStationDetail.line !== targetLine) {
      return {
        type: 'at',
        stationName: currentStationName,
        targetLine: targetLine
      };
    }
  }

  const nextIdx = predictedIndex + 1;
  if (nextIdx > 0 && nextIdx < stationDetails.length - 1) {
    const nextStationName = route.path[nextIdx];
    const isNextInterchange = route.interchanges.includes(nextStationName);
    if (isNextInterchange) {
      const targetStationDetail = stationDetails[nextIdx + 1];
      const targetLine = targetStationDetail?.line;
      if (targetLine) {
        return {
          type: 'before',
          stationName: nextStationName,
          targetLine: targetLine
        };
      }
    }
  }

  return null;
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
  const lastAlertedInterchangeBeforeIndexRef = useRef(-1);
  const lastAlertedInterchangeAtIndexRef = useRef(-1);
  const lastWarnedMessageRef = useRef('');

  // Dead-reckoning anchors & background timer
  const lastConfirmedIndexRef  = useRef(0);
  const lastConfirmedTimeRef   = useRef(Date.now());
  const timerRef               = useRef(null);

  // Throttling references to prevent excessive React re-renders on GPS jitter
  const lastGpsDispatchTimeRef = useRef(0);
  const lastGpsCoordsRef       = useRef({ lat: 0, lng: 0, accuracy: 0 });

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

    let title = '';
    let body = '';

    if (remaining === 3) {
      title = '🚇 3 Stations to Go';
      body = `Heads up! ${destinationName} is 3 stops away. Get ready!`;
    } else if (remaining === 2) {
      title = '🔔 Next-to-Next Station Alert!';
      body = `Approaching ${nextStation || destinationName}. Prepare to deboard soon!`;
    } else if (remaining === 1) {
      title = '🚨 Next Station Is Yours!';
      body = `The very next station is ${destinationName}. Stand by to deboard!`;
    } else if (remaining === 0) {
      title = '🎉 Deboard NOW!';
      body = `You have arrived at ${destinationName}!`;
    }

    if (title && body) {
      triggerBackgroundNotification(title, body);
      speakVoice(body);
    }
  }, []);

  // ── Interchange alert engine ─────────────────────────────────────────────────
  const checkInterchangeAlert = useCallback((currentIndex, stationDetails) => {
    const route = routeRef.current;
    if (!route || !route.interchanges || !stationDetails || stationDetails.length === 0) return;

    // 1. Alert one station before the interchange
    const nextIdx = currentIndex + 1;
    if (nextIdx > 0 && nextIdx < stationDetails.length - 1) {
      const nextStationName = route.path[nextIdx];
      const isNextInterchange = route.interchanges.includes(nextStationName);
      if (isNextInterchange) {
        const targetStationDetail = stationDetails[nextIdx + 1];
        const targetLine = targetStationDetail?.line;
        if (targetLine) {
          const lsKey = `metro_interchange_before_${nextStationName}`;
          if (localStorage.getItem(lsKey) !== 'true') {
            localStorage.setItem(lsKey, 'true');
            const msg = `Next station is ${nextStationName}. Please prepare to interchange to the ${targetLine} Line.`;
            triggerBackgroundNotification('🔄 Interchange Ahead', msg);
            speakVoice(msg);
          }
        }
      }
    }

    // 2. Alert when arriving at the interchange station itself
    if (currentIndex > 0 && currentIndex < stationDetails.length - 1) {
      const currentStationName = route.path[currentIndex];
      const isCurrentInterchange = route.interchanges.includes(currentStationName);
      if (isCurrentInterchange) {
        const nextStationDetail = stationDetails[currentIndex + 1];
        const targetLine = nextStationDetail?.line;
        const prevStationDetail = stationDetails[currentIndex - 1];
        if (targetLine && prevStationDetail && prevStationDetail.line !== targetLine) {
          const lsKey = `metro_interchange_at_${currentStationName}`;
          if (localStorage.getItem(lsKey) !== 'true') {
            localStorage.setItem(lsKey, 'true');
            const msg = `Arrived at ${currentStationName}. Please switch to the ${targetLine} Line.`;
            triggerBackgroundNotification('🔄 Interchange Station', msg);
            speakVoice(msg);
          }
        }
      }
    }
  }, []);

  // ── Client-side local prediction solver (with smart dead-reckoning fallback) ──
  const updateLocalPrediction = useCallback((lat, lng, accuracy) => {
    const route = routeRef.current;
    const stationDetails = route?.stationDetails || [];
    if (stationDetails.length === 0) return;

    const destination = stationDetails[stationDetails.length - 1];
    const destinationName = destination?.name || 'your destination';

    const STATION_MATCH_RADIUS = Math.min(500, Math.max(300, 300 + accuracy));

    let allStations = state.allStations;
    if (!allStations || allStations.length === 0) {
      try {
        allStations = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
      } catch (_) {
        allStations = [];
      }
    }

    let closestSystemStation = null;
    let minSystemDistance = Infinity;

    if (allStations.length > 0 && accuracy < 200) {
      allStations.forEach(station => {
        if (station.lat && station.lng) {
          const dist = getDistanceMeters(lat, lng, station.lat, station.lng);
          if (dist < minSystemDistance) {
            minSystemDistance = dist;
            closestSystemStation = station;
          }
        }
      });
    }

    let predictedIndex = lastConfirmedIndexRef.current;
    let method = 'dead-reckoning';
    let predictedStation = null;
    let isOffRoute = false;
    let isWrongDirection = false;
    let warningMessage = '';

    if (closestSystemStation && minSystemDistance <= STATION_MATCH_RADIUS && accuracy < 200) {
      const routeIdx = stationDetails.findIndex(
        s => s.name.toLowerCase() === closestSystemStation.name.toLowerCase()
      );

      if (routeIdx === -1) {
        predictedStation = closestSystemStation.name;
        method = 'gps-offroute';
        isOffRoute = true;
        warningMessage = `You have gone off-route! You are near ${closestSystemStation.name}, which is not on your route.`;
      } else if (routeIdx < predictedIndex) {
        predictedStation = closestSystemStation.name;
        method = 'gps-wrongdir';
        isWrongDirection = true;
        warningMessage = `Warning: You are traveling in the wrong direction! You are moving back towards ${closestSystemStation.name}.`;
      } else {
        predictedIndex = routeIdx;
        predictedStation = closestSystemStation.name;
        method = 'gps+route';
        
        // Calibrate dead-reckoning anchor
        lastConfirmedIndexRef.current = routeIdx;
        lastConfirmedTimeRef.current = Date.now();
      }
    }

    // B. If no GPS match, use time-based dead-reckoning calculation
    if (!predictedStation) {
      const elapsedSeconds = (Date.now() - lastConfirmedTimeRef.current) / 1000;
      const pred = getPredictiveState(elapsedSeconds, lastConfirmedIndexRef.current, stationDetails.length);
      predictedIndex = pred.index;
      predictedStation = stationDetails[predictedIndex]?.name || route.path[0];
      method = `${pred.status}-predictive`;
    }

    // Deduplicated voice/notification alerts for off-route/wrong-direction
    if (warningMessage) {
      if (lastWarnedMessageRef.current !== warningMessage) {
        lastWarnedMessageRef.current = warningMessage;
        triggerBackgroundNotification(
          isOffRoute ? '🚨 Off-Route Warning' : '⚠️ Wrong Direction Warning',
          warningMessage
        );
        speakVoice(warningMessage);
      }
    } else {
      lastWarnedMessageRef.current = '';
    }

    const stopsRemaining = stationDetails.length - 1 - predictedIndex;
    stopsRemainingCacheRef.current = stopsRemaining;

    const nextStation = stationDetails[predictedIndex + 1]?.name || destinationName;

    // Visited stations tracking
    const visited = [];
    for (let i = 0; i <= predictedIndex; i++) {
      visited.push(stationDetails[i].name);
    }

    const interchangeAlert = getInterchangeAlert(predictedIndex, route, stationDetails);

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
      isWrongDirection,
      warningMessage,
      interchangeAlert,
    };

    dispatch({ type: 'SET_PREDICTION', payload: localPred });

    // Handle alarms and notifications triggering
    if (stopsRemaining <= 3) {
      fireAlert(stopsRemaining, nextStation, destinationName, 'local');
    }
    
    // Run interchange checks
    checkInterchangeAlert(predictedIndex, stationDetails);
  }, [dispatch, fireAlert, checkInterchangeAlert, state.allStations]);

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

    // 1. Immediate local prediction check — completely decoupled from network speed
    updateLocalPrediction(lat, lng, accuracy);

    // 2. Pick polling interval based on last known stops remaining for network updates
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
      // Local predictions are handled offline
      return;
    }

    // 3. Fire backend call in parallel (non-blocking)
    const route = routeRef.current;
    const stationDetails = route?.stationDetails || [];
    const destination = stationDetails.length > 0 ? stationDetails[stationDetails.length - 1] : null;

    metroAPI.updateLocation({ tripId: activeTripId, lat, lng, accuracy })
      .then((res) => {
        if (!res?.data) return;

        const backendIndex = res.data.currentIndex;
        const interchangeAlert = getInterchangeAlert(backendIndex, route, stationDetails);

        dispatch({ 
          type: 'SET_PREDICTION', 
          payload: { 
            ...res.data, 
            method: `${res.data.method}-backend`, 
            interchangeAlert 
          } 
        });

        const remaining = res.data.stopsRemaining;
        stopsRemainingCacheRef.current = remaining;

        if (remaining != null && remaining <= 3) {
          const destinationName = destination?.name || 'your destination';
          const nextStation = res.data.nextStation || destinationName;
          fireAlert(remaining, nextStation, destinationName, 'backend');
        }

        // Run background interchange checks online
        checkInterchangeAlert(backendIndex, stationDetails);
      })
      .catch((err) => {
        console.warn('[GPS] Network location update failed, already handled by local prediction solver');
      });

    // 4. Also send via WebSocket (even faster for foreground)
    sendGpsUpdate(activeTripId, lat, lng, accuracy);
  }, [dispatch, sendGpsUpdate, fireAlert, updateLocalPrediction, checkInterchangeAlert]);

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

    // Reset dead-reckoning anchor
    lastConfirmedIndexRef.current = 0;
    lastConfirmedTimeRef.current = Date.now();

    // Clean up past alerts from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('metro_interchange_') || key.startsWith('bg_last_alerted_stop') || key.startsWith('metro_last_alarmed_stops'))) {
        localStorage.removeItem(key);
        i--;
      }
    }

    // Start periodic background timer to run dead-reckoning updates every 5 seconds
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const lastCoords = lastGpsCoordsRef.current;
      updateLocalPrediction(lastCoords.lat || 0, lastCoords.lng || 0, lastCoords.accuracy || 999);
    }, 5000);

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
  }, [dispatch, requestWakeLock, processLocation, updateLocalPrediction]);

  const stopTracking = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
