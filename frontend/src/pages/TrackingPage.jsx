import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMetro } from '../context/MetroContext';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useNotification } from '../hooks/useNotification';
import { metroAPI } from '../services/api';
import { Navigation2, MapPin, AlertTriangle, CheckCircle2, ArrowLeft, Radio, VolumeX, Terminal, ChevronDown, ChevronUp, Play, Zap, Crosshair } from 'lucide-react';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316', Magenta: '#D946EF', Grey: '#6B7280'
};

function createStationIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

// ── Audio Alarm Engine ──────────────────────────────────────────────────────────

/**
 * Plays a single high-fidelity triple-chime ding-dong-ding.
 * Returns the AudioContext so it can be closed when the alarm is dismissed.
 */
function playMetroChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;

    const playTone = (freq, startTime, duration, type = 'triangle') => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      // Aggressive loud attack and sustain
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(1.5, startTime + 0.02);
      gainNode.gain.setValueAtTime(1.5, startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Urgent rapid sequence (High-pitch, fast beeps)
    // Beep 1
    playTone(880, now, 0.15, 'square'); // A5
    playTone(1318.51, now + 0.15, 0.15, 'triangle'); // E6
    // Beep 2
    playTone(880, now + 0.4, 0.15, 'square');
    playTone(1318.51, now + 0.55, 0.15, 'triangle');
    // Beep 3
    playTone(880, now + 0.8, 0.15, 'square');
    playTone(1318.51, now + 0.95, 0.3, 'triangle');

    // Auto-close after the sequence finishes
    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 1500);

    return audioCtx;
  } catch (err) {
    console.error('Audio chime failed:', err);
    return null;
  }
}

/**
 * Trigger device vibration (if supported).
 * Falls back silently on iOS / unsupported browsers.
 */
function triggerVibration(pattern = [300, 100, 300, 100, 500]) {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration API not supported
  }
}

/**
 * Cancel any ongoing vibration.
 */
function cancelVibration() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // Vibration API not supported
  }
}

// ── Map Components ──────────────────────────────────────────────────────────────

const gpsIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
      <div style="position:absolute; width:24px; height:24px; background:rgba(99, 102, 241, 0.2); border: 2px solid #818CF8; border-radius:50%; box-shadow:0 0 12px #6366F1; animation:gpsPulse 2s infinite;"></div>
      <div style="position:absolute; width:12px; height:12px; background:#ffffff; border-radius:50%; border:2.5px solid #4F46E5; top: 6px; left: 6px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function MapAutoCenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center]);
  return null;
}

// ── GPS Simulator Console ───────────────────────────────────────────────────────

function GPSSimulatorConsole({ route, tripId, dispatch }) {
  const [isOpen, setIsOpen] = useState(false);
  const [simIndex, setSimIndex] = useState(0);
  const [simAccuracy, setSimAccuracy] = useState(50);
  const [simLog, setSimLog] = useState([]);

  const stationDetails = route?.stationDetails || [];
  const path = route?.path || [];

  const addLog = (msg) => {
    setSimLog((prev) => [...prev.slice(-8), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  // Simulate GPS at a specific station
  const simulateStation = async (index) => {
    const station = stationDetails[index];
    if (!station || !station.lat || !station.lng || !tripId) {
      addLog('❌ Invalid station or no active trip');
      return;
    }

    addLog(`📍 Simulating GPS at: ${station.name} (${station.lat.toFixed(4)}, ${station.lng.toFixed(4)})`);

    // Update local GPS display
    dispatch({ type: 'SET_LOCATION', payload: { lat: station.lat, lng: station.lng, accuracy: simAccuracy } });

    // Send to backend via REST
    try {
      const res = await metroAPI.updateLocation({
        tripId,
        lat: station.lat,
        lng: station.lng,
        accuracy: simAccuracy,
      });
      if (res && res.data) {
        dispatch({ type: 'SET_PREDICTION', payload: res.data });
        addLog(`✅ Prediction: ${res.data.currentStation} | Stops left: ${res.data.stopsRemaining} | Method: ${res.data.method}`);
      }
    } catch (err) {
      addLog(`❌ REST error: ${err.message}`);
    }

    setSimIndex(index);
  };

  // Step to the next station
  const stepNext = () => {
    const nextIdx = Math.min(simIndex + 1, stationDetails.length - 1);
    simulateStation(nextIdx);
  };

  // Simulate off-route GPS
  const simulateOffRoute = async () => {
    if (!tripId) { addLog('❌ No active trip'); return; }

    // Pick a GPS coordinate that's far from the route
    const offLat = 28.45;
    const offLng = 77.00;
    addLog(`🚨 Simulating OFF-ROUTE GPS at: (${offLat}, ${offLng})`);

    dispatch({ type: 'SET_LOCATION', payload: { lat: offLat, lng: offLng, accuracy: simAccuracy } });

    try {
      const res = await metroAPI.updateLocation({ tripId, lat: offLat, lng: offLng, accuracy: simAccuracy });
      if (res && res.data) {
        dispatch({ type: 'SET_PREDICTION', payload: res.data });
        addLog(`⚠️ Prediction: ${res.data.currentStation} | Off-route: ${res.data.isOffRoute} | Method: ${res.data.method}`);
      }
    } catch (err) {
      addLog(`❌ REST error: ${err.message}`);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-slate-400 bg-metro-card border border-metro-border rounded-xl hover:bg-metro-border/60 transition-colors"
      >
        <Terminal className="w-3.5 h-3.5" />
        GPS Simulator Console
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3 border border-violet-500/20 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">GPS Simulator</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors">
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Current sim position */}
      <div className="text-xs text-slate-400">
        Station <strong className="text-white">{simIndex + 1}</strong> of {stationDetails.length}
        {stationDetails[simIndex] && (
          <span className="text-violet-400 ml-1">— {stationDetails[simIndex].name}</span>
        )}
      </div>

      {/* Accuracy Slider */}
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-slate-500 uppercase font-bold whitespace-nowrap">Accuracy</label>
        <input
          type="range"
          min="10"
          max="500"
          value={simAccuracy}
          onChange={(e) => setSimAccuracy(Number(e.target.value))}
          className="flex-1 h-1 bg-metro-border rounded-full appearance-none cursor-pointer accent-violet-500"
        />
        <span className="text-xs text-violet-400 font-mono w-12 text-right">±{simAccuracy}m</span>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={stepNext}
          className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/25 transition-colors"
        >
          <Play className="w-3 h-3" /> Step Next
        </button>
        <button
          onClick={simulateOffRoute}
          className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/25 transition-colors"
        >
          <Zap className="w-3 h-3" /> Off-Route
        </button>
        <button
          onClick={() => simulateStation(0)}
          className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-lg hover:bg-blue-500/25 transition-colors"
        >
          <Crosshair className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* Quick Station Jump */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
        {stationDetails.map((s, idx) => (
          <button
            key={s.name + idx}
            onClick={() => simulateStation(idx)}
            className={`flex-shrink-0 text-[9px] px-2 py-1 rounded-full border transition-colors font-medium ${
              idx === simIndex
                ? 'bg-violet-500/30 border-violet-500/50 text-violet-300'
                : 'bg-metro-card border-metro-border text-slate-400 hover:text-white hover:border-slate-500'
            }`}
          >
            {idx + 1}. {s.name}
          </button>
        ))}
      </div>

      {/* Logs */}
      {simLog.length > 0 && (
        <div className="bg-metro-dark/80 border border-metro-border rounded-lg p-2 max-h-28 overflow-y-auto scrollbar-thin">
          {simLog.map((log, i) => (
            <p key={i} className="text-[10px] text-slate-400 font-mono leading-relaxed">{log}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main TrackingPage ───────────────────────────────────────────────────────────

export default function TrackingPage() {
  const { state, dispatch } = useMetro();
  const lastAlertedStopsRef = useRef(null);
  const navigate = useNavigate();
  const { startTracking, stopTracking } = useGPSTracking();
  const { permission, requestPermission, notify, lastInAppAlert, dismissInAppAlert } = useNotification();
  const [allStations, setAllStations] = useState([]);
  const [recalculating, setRecalculating] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [hudSpeed, setHudSpeed] = useState(74);
  const [hudGForce, setHudGForce] = useState(0.08);

  useEffect(() => {
    const interval = setInterval(() => {
      setHudSpeed(prev => {
        const delta = (Math.random() - 0.5) * 6;
        const next = prev + delta;
        return Math.max(55, Math.min(88, Math.round(next)));
      });
      setHudGForce(prev => {
        const delta = (Math.random() - 0.5) * 0.05;
        const next = prev + delta;
        return Math.max(0.03, Math.min(0.22, parseFloat(next.toFixed(2))));
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // ── Looping Alarm State ─────────────────────────────────────────────────────
  const [activeAlarm, setActiveAlarm] = useState(null); // 'approaching' | 'next-to-next' | 'next' | 'arrived' | null
  const alarmIntervalRef = useRef(null);
  const vibrationIntervalRef = useRef(null);
  const alarmStartTimeRef = useRef(null);
  const [alarmElapsed, setAlarmElapsed] = useState(0);

  const rawRoute = state.route;

  // Fully robust extraction supporting all wrappers and dual-route structures
  let activeRoute = null;
  if (rawRoute) {
    if (rawRoute.shortest) {
      activeRoute = rawRoute.shortest;
    } else if (rawRoute.data && rawRoute.data.shortest) {
      activeRoute = rawRoute.data.shortest;
    } else {
      activeRoute = rawRoute;
    }
  }

  const route = activeRoute;
  const prediction = state.prediction;
  const userLoc = state.userLocation;

  // Safe early extraction of destination properties
  const destinationStation = route?.stationDetails?.[route?.stationDetails?.length - 1];
  const destinationName = destinationStation?.name || (route?.path?.[route?.path?.length - 1]);

  // ── Start/Stop Looping Alarm ────────────────────────────────────────────────

  const startLoopingAlarm = useCallback((level) => {
    // Don't restart the same alarm
    if (alarmIntervalRef.current && activeAlarm === level) return;

    // Clear any existing alarm first
    clearLoopingAlarm();

    setActiveAlarm(level);
    alarmStartTimeRef.current = Date.now();
    setAlarmElapsed(0);

    // Play immediately
    playMetroChime();
    triggerVibration([300, 100, 300, 100, 500]);

    // Loop chime every 1.5s
    alarmIntervalRef.current = setInterval(() => {
      playMetroChime();
      setAlarmElapsed(Date.now() - (alarmStartTimeRef.current || Date.now()));
    }, 1500);

    vibrationIntervalRef.current = setInterval(() => {
      triggerVibration([300, 100, 300, 100, 500]);
    }, 1000);
  }, [activeAlarm]);

  const clearLoopingAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    cancelVibration();
    setActiveAlarm(null);
    setAlarmElapsed(0);
    alarmStartTimeRef.current = null;
  }, []);

  // Cleanup alarm intervals on unmount
  useEffect(() => {
    return () => {
      clearLoopingAlarm();
    };
  }, [clearLoopingAlarm]);

  // ── Initialization ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!route) { navigate('/'); return; }
    metroAPI.getAllStations().then((res) => setAllStations(res.data || []));
    startTracking();
    return () => stopTracking();
  }, []);

  // ── Alarm Trigger Logic ─────────────────────────────────────────────────────
  // Fire looping alarms & push notifications for next-to-next, next, and arrival

  useEffect(() => {
    const remaining = prediction?.stopsRemaining;
    if (remaining == null) return;

    if (remaining === 3) {
      if (lastAlertedStopsRef.current !== 3) {
        lastAlertedStopsRef.current = 3;
        startLoopingAlarm('approaching');
        notify('🚇 3 Stations to Go!', `Heads up! ${destinationName} is 3 stops away. Get ready!`);
      }
    } else if (remaining === 2) {
      if (lastAlertedStopsRef.current !== 2) {
        lastAlertedStopsRef.current = 2;
        startLoopingAlarm('next-to-next');
        notify('🔔 Next-to-Next Station Alert!', `Approaching ${prediction.nextStation || 'your destination'}. Get ready to deboard!`);
      }
    } else if (remaining === 1) {
      if (lastAlertedStopsRef.current !== 1) {
        lastAlertedStopsRef.current = 1;
        startLoopingAlarm('next');
        notify('🚨 Next Station Alert!', `The very next station is ${destinationName}. Please prepare to deboard!`);
      }
    } else if (remaining === 0) {
      if (lastAlertedStopsRef.current !== 0) {
        lastAlertedStopsRef.current = 0;
        startLoopingAlarm('arrived');
        notify('🎉 Deboard Now!', `You have arrived at ${destinationName}!`);

        // Auto-stop GPS tracking to save battery
        stopTracking();
        if (state.tripId) {
          metroAPI.endTrip(state.tripId).catch(() => {});
          if (state.tripId.startsWith('local-')) {
            try {
              const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
              const idx = queue.findIndex(t => t.tripId === state.tripId);
              if (idx !== -1) {
                queue[idx].completed = true;
                queue[idx].completedAt = new Date().toISOString();
                localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
              }
            } catch (e) {
              console.error('Failed to update offline queue:', e);
            }
          }
        }
      }
    } else {
      // More than 3 stops remaining — clear any active alarm
      if (activeAlarm && remaining > 3) {
        clearLoopingAlarm();
        lastAlertedStopsRef.current = null;
      }
    }
  }, [prediction?.stopsRemaining, prediction?.nextStation, destinationName, state.tripId, stopTracking, notify, startLoopingAlarm, clearLoopingAlarm, activeAlarm]);

  const handleEndTrip = async () => {
    clearLoopingAlarm();
    stopTracking();
    if (state.tripId) {
      await metroAPI.endTrip(state.tripId).catch(() => {});
      if (state.tripId.startsWith('local-')) {
        try {
          const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
          const idx = queue.findIndex(t => t.tripId === state.tripId);
          if (idx !== -1) {
            queue[idx].completed = true;
            queue[idx].completedAt = new Date().toISOString();
            localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
          }
        } catch (e) {
          console.error('Failed to update offline queue:', e);
        }
      }
    }
    dispatch({ type: 'END_TRIP' });
    navigate('/');
  };

  const handleRecalculate = async () => {
    if (!prediction?.currentStation || !destinationName || !state.tripId) return;
    setRecalculating(true);
    try {
      const res = await metroAPI.getRoute(prediction.currentStation, destinationName);

      const strategy = route.strategy || 'shortest';
      let newRoute = null;

      const routesObj = res.data || res;
      if (routesObj[strategy]) {
        newRoute = routesObj[strategy];
      } else if (routesObj.shortest) {
        newRoute = routesObj.shortest;
      } else {
        newRoute = routesObj;
      }

      await metroAPI.recalculateTrip(state.tripId, { newRoutePath: newRoute.path });

      // Update local context with recalculated route and preserve strategy
      dispatch({ type: 'SET_ROUTE', payload: { ...newRoute, strategy } });
      notify('🔄 Route Recalculated', `Recalculated route using ${strategy} strategy from ${prediction.currentStation} to ${destinationName}`);
    } catch (err) {
      console.error('Recalculation failed:', err);
    } finally {
      setRecalculating(false);
    }
  };

  if (!route) return null;

  const routeCoords = (route.stationDetails || [])
    .filter((s) => s?.lat && s?.lng)
    .map((s) => [s.lat, s.lng]);

  const visitedCoords = (route.stationDetails || [])
    .filter((s) => s?.lat && s?.lng && prediction?.visitedStations?.includes(s.name))
    .map((s) => [s.lat, s.lng]);

  const mapCenter = userLoc
    ? [userLoc.lat, userLoc.lng]
    : routeCoords[0] || [28.6328, 77.2197];

  // ── Alarm Overlay Config ──────────────────────────────────────────────────────

  const alarmConfig = {
    'approaching': {
      emoji: '🚇',
      title: '3 Stations to Go!',
      subtitle: `${destinationName} is 3 stops away. Time to get ready!`,
      borderColor: 'border-blue-500/50',
      bgGradient: 'from-blue-500/20 via-blue-900/10 to-transparent',
      textColor: 'text-blue-400',
      pulseColor: 'bg-blue-500/20',
      dismissBg: 'bg-blue-500/20 hover:bg-blue-500/40 border-blue-500/40',
      barColor: 'bg-blue-500',
    },
    'next-to-next': {
      emoji: '🔔',
      title: 'Next-to-Next Station!',
      subtitle: `Approaching ${prediction?.nextStation || 'your destination'}. Get ready to deboard!`,
      borderColor: 'border-orange-500/50',
      bgGradient: 'from-orange-500/20 via-orange-900/10 to-transparent',
      textColor: 'text-orange-400',
      pulseColor: 'bg-orange-500/30',
      dismissBg: 'bg-orange-500/20 hover:bg-orange-500/40 border-orange-500/40',
      barColor: 'bg-orange-500',
    },
    'next': {
      emoji: '🚨',
      title: 'NEXT Station Is Yours!',
      subtitle: `${destinationName} is the very next station. Prepare to deboard!`,
      borderColor: 'border-red-500/50',
      bgGradient: 'from-red-500/25 via-red-900/10 to-transparent',
      textColor: 'text-red-400',
      pulseColor: 'bg-red-500/30',
      dismissBg: 'bg-red-500/20 hover:bg-red-500/40 border-red-500/40',
      barColor: 'bg-red-500',
    },
    'arrived': {
      emoji: '🎉',
      title: 'DEBOARD NOW!',
      subtitle: `You have arrived at ${destinationName}!`,
      borderColor: 'border-green-500/50',
      bgGradient: 'from-green-500/25 via-green-900/10 to-transparent',
      textColor: 'text-green-400',
      pulseColor: 'bg-green-500/30',
      dismissBg: 'bg-green-500/20 hover:bg-green-500/40 border-green-500/40',
      barColor: 'bg-green-500',
    },
  };

  const currentAlarmConfig = activeAlarm ? alarmConfig[activeAlarm] : null;
  // Seconds the alarm has been ringing (shown as a countdown bar)
  const alarmRingSecs = Math.round(alarmElapsed / 1000);

  return (
    <div className="h-screen bg-metro-dark flex flex-col">
      {/* ── Looping Alarm Overlay ─────────────────────────────────────────────── */}
      {currentAlarmConfig && (
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in`}>
          <div className={`relative w-[92%] max-w-sm mx-auto rounded-2xl border-2 ${currentAlarmConfig.borderColor} bg-gradient-to-b ${currentAlarmConfig.bgGradient} bg-metro-dark/98 shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden`}>
            {/* Animated pulsing ring */}
            <div className={`absolute -inset-2 ${currentAlarmConfig.pulseColor} rounded-2xl animate-pulse opacity-40 pointer-events-none`} />

            {/* Ringing time bar */}
            <div className="w-full h-1.5 bg-white/10">
              <div
                className={`h-full ${currentAlarmConfig.barColor} transition-all duration-1000`}
                style={{ width: `${Math.min(100, (alarmRingSecs % 10) * 10)}%` }}
              />
            </div>

            <div className="relative p-6 space-y-4 text-center">
              {/* Large animated emoji */}
              <div className={`text-6xl mx-auto ${activeAlarm === 'arrived' ? 'animate-bounce' : 'animate-ping-slow'}`}>
                {currentAlarmConfig.emoji}
              </div>

              {/* Title */}
              <h2 className={`text-xl font-black ${currentAlarmConfig.textColor} tracking-wide uppercase`}>
                {currentAlarmConfig.title}
              </h2>

              {/* Subtitle */}
              <p className="text-sm text-slate-300 leading-relaxed">
                {currentAlarmConfig.subtitle}
              </p>

              {/* Stops remaining pill */}
              {prediction?.stopsRemaining != null && (
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border ${currentAlarmConfig.borderColor} bg-white/5`}>
                  <span className="text-xs text-slate-400 uppercase font-bold">Stops left:</span>
                  <span className={`text-2xl font-black ${currentAlarmConfig.textColor} tabular-nums`}>
                    {prediction.stopsRemaining}
                  </span>
                </div>
              )}

              {/* Destination name */}
              <p className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                🏁 {destinationName}
              </p>

              {/* Dismiss Button */}
              <button
                onClick={clearLoopingAlarm}
                className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 ${currentAlarmConfig.dismissBg} font-bold text-sm text-white transition-all active:scale-95 hover:scale-[1.02]`}
              >
                <VolumeX className="w-5 h-5" />
                Dismiss Alarm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── In-App Notification Toast (fallback when browser notifications fail) ── */}
      {lastInAppAlert && !activeAlarm && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[8000] w-[90%] max-w-sm animate-fade-in">
          <div className="glass-card border border-violet-500/30 p-3 flex items-start gap-3 shadow-lg shadow-violet-500/10">
            <div className="text-xl flex-shrink-0">🚇</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{lastInAppAlert.title}</p>
              <p className="text-[11px] text-slate-300 line-clamp-2">{lastInAppAlert.body}</p>
            </div>
            <button
              onClick={dismissInAppAlert}
              className="text-slate-400 hover:text-white transition-colors text-xs flex-shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Map (60% height) */}
      <div className="flex-1 relative" style={{ minHeight: '55vh' }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; CartoDB'
          />

          {/* Route Polyline */}
          {routeCoords.length > 1 && (
            <Polyline positions={routeCoords} color="#6366F1" weight={4} opacity={0.85} />
          )}

          {/* Visited Route Polyline */}
          {visitedCoords.length > 1 && (
            <Polyline positions={visitedCoords} color="#22C55E" weight={6} opacity={0.9} />
          )}

          {/* Station Markers */}
          {allStations.map((s) => (
            s.lat && s.lng ? (
              <Marker
                key={s.name}
                position={[s.lat, s.lng]}
                icon={createStationIcon(LINE_COLORS[s.line] || '#6366F1')}
              >
                <Popup>
                  <div className="text-xs p-1 space-y-1 text-slate-100">
                    <strong className="text-sm font-semibold text-white block">{s.name}</strong>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300`}>
                        {s.line} Line
                      </span>
                      {s.interchange && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                          🔄 Interchange
                        </span>
                      )}
                      {s.congestion && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${s.congestion.colorClass}`}>
                          👥 {s.congestion.label}
                        </span>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : null
          ))}

          {/* User GPS dot */}
          {userLoc && (
            <>
              <Marker position={[userLoc.lat, userLoc.lng]} icon={gpsIcon}>
                <Popup>📍 You are here</Popup>
              </Marker>
              <MapAutoCenter center={[userLoc.lat, userLoc.lng]} />
            </>
          )}
        </MapContainer>

        {/* GPS Accuracy badge */}
        {userLoc && (
          <div className="absolute right-3 z-[500] glass-card px-2 py-1" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}>
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <Radio className="w-3 h-3 text-green-400" />
              ±{Math.round(userLoc.accuracy || 0)}m
            </div>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => navigate('/route')}
          className="absolute left-3 z-[500] w-9 h-9 flex items-center justify-center glass-card hover:bg-metro-border transition-colors"
          style={{ borderRadius: 12, top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Bottom Tracking Panel */}
      <div className="bg-[#0A0B10]/80 backdrop-blur-3xl border-t border-white/5 p-4 pb-28 space-y-4 overflow-y-auto relative z-10" style={{ maxHeight: '45vh' }}>
        {/* Subtle high-tech grid overlay */}
        <div className="tech-grid opacity-30" />
        <div className="light-leak-violet -top-10 -left-10 w-[200px] h-[200px]" />
        <div className="light-leak-cyan -bottom-10 -right-10 w-[200px] h-[200px]" />

        {/* Explicit Notification Permission banner if not granted & audio not unlocked */}
        {(permission !== 'granted' && !audioUnlocked) && (
          <div className="glass-card bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-fade-in relative z-10">
            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
              🔔
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-indigo-300">Enable Live Alerts & Audio</p>
              <p className="text-[10px] text-slate-400">Receive smart chimes when approaching your stop.</p>
            </div>
            <button
              onClick={async () => {
                // ALWAYS play the chime immediately to unlock the Safari AudioContext
                // (requires synchronous user interaction)
                playMetroChime();
                setAudioUnlocked(true);

                const res = await requestPermission();
                if (res === 'granted') {
                  notify('🚇 Alerts Activated!', 'You will now receive notifications for this trip.');
                } else if (res === 'unsupported') {
                  notify('🔊 Audio Enabled', 'Push notifications unsupported on this browser, but audio alarms are now enabled!');
                }
              }}
              className="px-3 py-1.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex-shrink-0"
            >
              Enable
            </button>
          </div>
        )}

        {prediction?.stopsRemaining === 0 && !activeAlarm ? (
          /* Journey Completed Dashboard View */
          <div className="glass-card p-5 text-center space-y-4 border border-green-500/30 bg-green-500/5 animate-scale-up relative z-10">
            <div className="w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto text-2xl animate-bounce">
              🎉
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Journey Completed!</h3>
              <p className="text-xs text-green-400 font-semibold uppercase tracking-wider">Arrived at {destinationName}</p>
              <p className="text-xs text-slate-400 mt-2">
                You have reached your destination. GPS tracking was automatically turned off to conserve your device's battery.
              </p>
            </div>
            <div className="bg-metro-dark/50 border border-white/5 rounded-xl p-3 grid grid-cols-2 gap-2 text-left">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Stations Traveled</p>
                <p className="text-sm font-bold text-white">{(prediction?.visitedStations?.length || 0)} stops</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-bold">Tracking Status</p>
                <p className="text-sm font-bold text-green-400 flex items-center gap-1">
                  <span className="animate-pulse">●</span> Battery Safe
                </p>
              </div>
            </div>
            <button
              id="end-trip-btn"
              onClick={handleEndTrip}
              className="w-full btn-gradient text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all text-xs uppercase tracking-wider"
            >
              Back to Home
            </button>
          </div>
        ) : (
          /* Normal Active Tracking UI */
          <>
            {/* Off-Route / Wrong-Direction Warning Banner */}
            {prediction?.warningMessage && (
              <div className={`border rounded-xl px-4 py-3 flex flex-col gap-3 animate-pulse relative z-10 ${
                prediction.isOffRoute 
                  ? 'bg-red-500/15 border-red-500/30 text-red-400' 
                  : 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
              }`}>
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-bounce" />
                  <div>
                    <p className="text-sm font-bold">
                      {prediction.isOffRoute ? '🚨 Off-Route Detected!' : '⚠️ Wrong Direction!'}
                    </p>
                    <p className="text-xs text-slate-300">{prediction.warningMessage}</p>
                  </div>
                </div>
                {prediction.isOffRoute && (
                  <button
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    className="w-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/40 text-red-300 font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    {recalculating ? (
                      <>Recalculating...</>
                    ) : (
                      <>🔄 Recalculate Route from Here</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Dynamic Station Alert Banners (static version shown after alarm is dismissed) */}
            {prediction && !prediction.warningMessage && !activeAlarm && (
              prediction.stopsRemaining === 3 ? (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3 flex items-center gap-3 relative z-10 animate-fade-in">
                  <div className="p-2 bg-blue-500/15 rounded-lg text-blue-400 text-lg">🚇</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-400">3 Stations Away</p>
                    <p className="text-xs text-slate-300">Heading to <strong className="text-white">{destinationName}</strong>. Start gathering your belongings.</p>
                  </div>
                  <button onClick={() => startLoopingAlarm('approaching')}
                    className="px-3 py-1.5 text-[10px] bg-blue-500/20 border border-blue-500/30 hover:bg-blue-500/40 text-blue-300 font-bold rounded-lg transition-colors flex-shrink-0">
                    🔊
                  </button>
                </div>
              ) : prediction.stopsRemaining === 2 ? (
                <div className="bg-orange-500/15 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center gap-3 relative z-10 animate-fade-in">
                  <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400 text-lg">🔔</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-orange-400">Next-to-Next Station</p>
                    <p className="text-xs text-slate-300">Approaching <strong className="text-white">{prediction.nextStation || 'your destination'}</strong>. Get ready!</p>
                  </div>
                  <button onClick={() => startLoopingAlarm('next-to-next')}
                    className="px-3 py-1.5 text-[10px] bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/40 text-orange-300 font-bold rounded-lg transition-colors flex-shrink-0">
                    🔊
                  </button>
                </div>
              ) : prediction.stopsRemaining === 1 ? (
                <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3 relative z-10 animate-fade-in">
                  <div className="p-2 bg-red-500/20 rounded-lg text-red-400 text-lg">🚨</div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-400">NEXT Station Is Yours!</p>
                    <p className="text-xs text-slate-300">The very next station is <strong className="text-white">{destinationName}</strong>. Prepare to deboard!</p>
                  </div>
                  <button onClick={() => startLoopingAlarm('next')}
                    className="px-3 py-1.5 text-[10px] bg-red-500/20 border border-red-500/30 hover:bg-red-500/40 text-red-300 font-bold rounded-lg transition-colors flex-shrink-0">
                    🔊
                  </button>
                </div>
              ) : null
            )}

            {/* Giant Holographic ETA Badge */}
            {prediction?.stopsRemaining != null && (
              <div className="glass-card p-5 border border-indigo-500/20 bg-indigo-500/5 relative z-10 text-center shadow-[0_0_20px_rgba(99,102,241,0.15)] animate-slide-up">
                <div className="absolute top-2 right-3 flex items-center gap-1 text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                  Live Hologram HUD
                </div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Time to Destination</div>
                <div className="text-3xl font-black text-white leading-tight drop-shadow-[0_2px_8px_rgba(99,102,241,0.4)]">
                  Arriving In <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">{prediction.stopsRemaining === 0 ? 'NOW' : `${prediction.stopsRemaining * 3} MINS`}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Current speed <strong className="text-indigo-300 font-bold">{hudSpeed} km/h</strong> · Cruising optimally
                </p>
              </div>
            )}

            {/* Telemetry Widgets Grid */}
            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="glass-card p-3 border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Train Dynamics</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-white">{hudSpeed}</span>
                  <span className="text-[10px] text-slate-400">km/h</span>
                </div>
                <div className="text-[9px] text-indigo-400 font-medium mt-1">G-Force: {hudGForce} G</div>
              </div>

              <div className="glass-card p-3 border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Signal & GPS</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Locked
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 font-medium mt-1">Accuracy: ±{userLoc ? Math.round(userLoc.accuracy) : 15}m</div>
              </div>
            </div>

            {/* Ethereal Glowing Route Timeline */}
            <div className="glass-card p-4 relative z-10 border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
              <div className="flex items-center justify-between mb-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_#6366F1] animate-pulse" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Line Progress Timeline</span>
                </div>
                {prediction?.confidence && (
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    prediction.confidence === 'high' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                    prediction.confidence === 'medium' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                    'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {prediction.confidence} Confidence
                  </span>
                )}
              </div>

              {/* Glowing vertical tracking path */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-xs text-indigo-400 font-bold">
                    A
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Current Station</p>
                    <p className="text-sm font-bold text-white">{prediction?.currentStation || route.path[0]}</p>
                  </div>
                </div>

                {prediction?.nextStation && (
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xs text-purple-400 font-bold animate-pulse">
                      B
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Upcoming Stop</p>
                      <p className="text-sm font-bold text-purple-300">{prediction.nextStation}</p>
                    </div>
                  </div>
                )}

                {destinationName && (
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs text-emerald-400 font-bold">
                      🏁
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Destination</p>
                      <p className="text-sm font-bold text-white">{destinationName}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Visited Stations History */}
              {prediction?.visitedStations && prediction.visitedStations.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-white/5">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Acquired Milestones</p>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    {prediction.visitedStations.map((name, index) => {
                      const stationDetail = allStations.find(s => s.name === name) || route?.stationDetails?.find(s => s.name === name);
                      const isInterchange = stationDetail?.interchange;
                      const lineColor = stationDetail ? LINE_COLORS[stationDetail.line] : null;
                      const congestion = stationDetail?.congestion;
                      
                      return (
                        <div key={name + index} className="flex items-center gap-1.5 flex-shrink-0 animate-fade-in">
                          <span className="text-[10px] bg-white/5 border border-white/5 text-slate-300 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            <span className="text-emerald-400 font-bold">✓</span>
                            {lineColor && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lineColor, boxShadow: `0 0 6px ${lineColor}` }} />
                            )}
                            <span>{name}</span>
                            {isInterchange && (
                              <span className="text-[8px] px-1 py-0.2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded">
                                🔄
                              </span>
                            )}
                            {congestion && (
                              <span className={`text-[8px] px-1.5 py-0.2 border rounded flex items-center gap-1 font-medium ${congestion.colorClass}`}>
                                👥 {congestion.label}
                              </span>
                            )}
                          </span>
                          {index < prediction.visitedStations.length - 1 && (
                            <span className="text-slate-600 text-xs font-bold">➔</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* End Trip */}
            <button
              id="end-trip-btn"
              onClick={handleEndTrip}
              className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 font-bold py-3.5 rounded-xl transition-all text-xs uppercase tracking-wider relative z-10"
            >
              End Trip
            </button>
          </>
        )}
      </div>
    </div>
  );
}
