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
  alertFired: false,

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
    case 'SET_ALERT_FIRED': return { ...state, alertFired: action.payload };
    case 'SET_ALL_STATIONS':return { ...state, allStations: action.payload };
    case 'END_TRIP':
      return { ...state, tripId: null, isTracking: false, prediction: null, alertFired: false };
    default:
      return state;
  }
}

export function MetroProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef(null);

  // Initialise Socket.IO once
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      transports: ['websocket'],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('prediction', (data) => dispatch({ type: 'SET_PREDICTION', payload: data }));
    socket.on('location-update', (data) => dispatch({ type: 'SET_PREDICTION', payload: data }));
    socket.on('destination-alert', (data) => {
      if (!state.alertFired) {
        dispatch({ type: 'SET_ALERT_FIRED', payload: true });
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
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🚇 Metro Tracker', { body: message, icon: '/metro-icon.png' });
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
