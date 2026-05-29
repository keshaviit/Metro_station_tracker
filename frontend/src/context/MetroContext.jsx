import { createContext, useContext, useReducer, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const MetroContext = createContext(null);

const initialState = {
  // Trip
  tripId: null,
  route: null,        // { path, totalStations, interchanges, estimatedTime, stationDetails }
  prediction: null,  // { currentStation, nextStation, stopsRemaining, shouldAlert }

  // GPS
  userLocation: null, // { lat, lng, accuracy }
  nearestStation: null,

  // UI
  isTracking: false,
  lastAlertedStops: -1,

  // Stations data
  allStations: [],
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROUTE':       return { ...state, route: action.payload };
    case 'SET_TRIP_ID':     return { ...state, tripId: action.payload };
    case 'SET_PREDICTION':  return { ...state, prediction: action.payload };
    case 'SET_LOCATION':    return { ...state, userLocation: action.payload };
    case 'SET_NEAREST':     return { ...state, nearestStation: action.payload };
    case 'SET_TRACKING':    return { ...state, isTracking: action.payload };
    case 'SET_LAST_ALERTED_STOPS': return { ...state, lastAlertedStops: action.payload };
    case 'SET_ALL_STATIONS':return { ...state, allStations: action.payload };
    case 'END_TRIP':
      return { ...state, tripId: null, isTracking: false, prediction: null, lastAlertedStops: -1 };
    default:
      return state;
  }
}

export function MetroProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(null);
  const lastAlertedStopsRef = useRef(-1);

  // Sync ref with reset state on trip end
  useEffect(() => {
    if (state.tripId === null) {
      lastAlertedStopsRef.current = -1;
    }
  }, [state.tripId]);

  // Initialise Socket.IO once
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || window.location.origin, {
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('prediction', (data) => dispatch({ type: 'SET_PREDICTION', payload: data }));
    socket.on('location-update', (data) => dispatch({ type: 'SET_PREDICTION', payload: data }));
    socket.on('destination-alert', (data) => {
      const stops = data.stopsRemaining != null ? data.stopsRemaining : -1;
      if (lastAlertedStopsRef.current !== stops) {
        lastAlertedStopsRef.current = stops;
        dispatch({ type: 'SET_LAST_ALERTED_STOPS', payload: stops });
        fireNotification(data.message);
      }
    });

    return () => socket.disconnect();
  }, []);

  function joinTrip(tripId) {
    socketRef.current?.emit('join-trip', tripId);
  }

  function sendGpsUpdate(tripId, lat, lng, accuracy) {
    socketRef.current?.emit('gps-update', { tripId, lat, lng, accuracy });
  }

  function fireNotification(message) {
    // 1. Play Synthesized Chime sound using Web Audio API (completely offline-friendly)
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const playBeep = (delay, freq) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
          gain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.3);
          osc.start(audioCtx.currentTime + delay);
          osc.stop(audioCtx.currentTime + delay + 0.35);
        };
        // Play premium double-chime beep
        playBeep(0, 880);
        playBeep(0.15, 1200);
      }
    } catch (e) {
      console.warn('[MetroNotification] Web Audio context blocked or failed:', e.message);
    }

    // 2. Physical Phone Vibration
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }

    // 3. Native push / visual overlay
    if ('Notification' in window && Notification.permission === 'granted') {
      const icon = '/metro-icon.png';
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            registration.showNotification('🚇 Metro Tracker', {
              body: message,
              icon,
              badge: icon,
              vibrate: [200, 100, 200, 100, 200],
              tag: 'metro-alert',
              renotify: true,
              requireInteraction: true,
            });
          })
          .catch(() => {
            new Notification('🚇 Metro Tracker', { body: message, icon });
          });
      } else {
        new Notification('🚇 Metro Tracker', { body: message, icon });
      }
    }
  }

  return (
    <MetroContext.Provider value={{ state, dispatch, joinTrip, sendGpsUpdate, socket: socketRef }}>
      {children}
    </MetroContext.Provider>
  );
}

export const useMetro = () => {
  const ctx = useContext(MetroContext);
  if (!ctx) throw new Error('useMetro must be used inside MetroProvider');
  return ctx;
};
