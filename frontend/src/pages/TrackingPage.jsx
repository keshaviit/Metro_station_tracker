import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMetro } from '../context/MetroContext';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useNotification } from '../hooks/useNotification';
import { metroAPI } from '../services/api';
import { Navigation2, MapPin, AlertTriangle, CheckCircle2, ArrowLeft, Radio } from 'lucide-react';

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

const LINE_BG = {
  Blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Red: 'bg-red-500/20 text-red-400 border-red-500/30',
  Green: 'bg-green-500/20 text-green-400 border-green-500/30',
  Violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  Pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  Orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Magenta: 'bg-magenta-500/20 text-magenta-400 border-magenta-500/30',
  Grey: 'bg-grey-500/20 text-grey-400 border-grey-500/30',
};

function createStationIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function playMetroAlarm() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Standard high-quality double-chime ding-dong/ding-ding
    playTone(523.25, now, 0.4);        // C5
    playTone(659.25, now + 0.15, 0.4);   // E5
    playTone(783.99, now + 0.3, 0.6);    // G5
  } catch (err) {
    console.error('Audio chime failed:', err);
  }
}

const gpsIcon = L.divIcon({
  className: '',
  html: `<div class="gps-dot"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapAutoCenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center]);
  return null;
}

export default function TrackingPage() {
  const { state, dispatch } = useMetro();
  const lastAlertedStopsRef = useRef(null);
  const navigate = useNavigate();
  const { startTracking, stopTracking } = useGPSTracking();
  const { notify } = useNotification();
  const [allStations, setAllStations] = useState([]);
  const [recalculating, setRecalculating] = useState(false);

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

  useEffect(() => {
    if (!route) { navigate('/'); return; }
    metroAPI.getAllStations().then((res) => setAllStations(res.data || []));
    startTracking();
    return () => stopTracking();
  }, []);

  // Fire alarm chimes & push notifications dynamically for next-to-next, next, and arrival stations
  useEffect(() => {
    const remaining = prediction?.stopsRemaining;
    if (remaining != null) {
      if (remaining <= 2 && remaining > 0) {
        if (lastAlertedStopsRef.current !== remaining) {
          lastAlertedStopsRef.current = remaining;
          playMetroAlarm();
          const stopLabel = remaining === 2 ? 'Next-to-Next Station Alert' : 'Next Station Alert';
          const targetName = remaining === 2 ? (prediction.nextStation || 'your destination') : destinationName;
          notify(`🚇 ${stopLabel}!`, `Approaching ${targetName}. Get ready to deboard!`);
        }
      } else if (remaining === 0) {
        if (lastAlertedStopsRef.current !== 0) {
          lastAlertedStopsRef.current = 0;
          playMetroAlarm();
          notify('🎉 Deboard Now!', `You have arrived at ${destinationName}!`);
        }
      }
    }
  }, [prediction?.stopsRemaining, destinationName]);

  const handleEndTrip = async () => {
    stopTracking();
    if (state.tripId) await metroAPI.endTrip(state.tripId).catch(() => {});
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

  return (
    <div className="h-screen bg-metro-dark flex flex-col">
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
          <div className="absolute top-3 right-3 z-[500] glass-card px-2 py-1">
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <Radio className="w-3 h-3 text-green-400" />
              ±{Math.round(userLoc.accuracy || 0)}m
            </div>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => navigate('/route')}
          className="absolute top-3 left-3 z-[500] w-9 h-9 flex items-center justify-center glass-card hover:bg-metro-border transition-colors"
          style={{ borderRadius: 12 }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Bottom Tracking Panel */}
      <div className="bg-metro-dark border-t border-metro-border p-4 pb-28 space-y-3">
        {/* Off-Route / Wrong-Direction Warning Banner */}
        {prediction?.warningMessage && (
          <div className={`border rounded-xl px-4 py-3 flex flex-col gap-3 animate-pulse ${
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

        {/* Dynamic Station Alarm & Alert Banner */}
        {prediction && !prediction.warningMessage && (
          prediction.stopsRemaining === 2 ? (
            <div className="bg-orange-500/15 border border-orange-500/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
              <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400 animate-bounce">
                🔔
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-400 flex items-center gap-1.5">
                  Next-to-Next Station Alarm!
                </p>
                <p className="text-xs text-slate-300">
                  You are approaching <strong className="text-white">{prediction.nextStation || 'your destination'}</strong>. Get ready!
                </p>
              </div>
              <button 
                onClick={playMetroAlarm}
                className="px-3 py-1.5 text-[10px] bg-orange-500/20 border border-orange-500/30 hover:bg-orange-500/40 text-orange-300 font-bold rounded-lg transition-colors flex-shrink-0"
              >
                🔊 Chime
              </button>
            </div>
          ) : prediction.stopsRemaining === 1 ? (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse">
              <div className="p-2 bg-red-500/20 rounded-lg text-red-400 animate-bounce">
                🚨
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-red-400 flex items-center gap-1.5">
                  Next Station Alarm!
                </p>
                <p className="text-xs text-slate-300">
                  The very next station is <strong className="text-white">{destinationName}</strong>. Please prepare to deboard!
                </p>
              </div>
              <button 
                onClick={playMetroAlarm}
                className="px-3 py-1.5 text-[10px] bg-red-500/20 border border-red-500/30 hover:bg-red-500/40 text-red-300 font-bold rounded-lg transition-colors flex-shrink-0"
              >
                🔊 Chime
              </button>
            </div>
          ) : prediction.stopsRemaining === 0 ? (
            <div className="bg-green-500/15 border border-green-500/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-bounce">
              <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                🎉
              </div>
              <div>
                <p className="text-sm font-bold text-green-400">Destination Arrived!</p>
                <p className="text-xs text-slate-300">
                  You have successfully reached <strong className="text-white">{destinationName}</strong>. Thank you for traveling!
                </p>
              </div>
            </div>
          ) : null
        )}

        {/* Current Station */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {state.isTracking ? 'Live Tracking' : 'Not Tracking'}
              </span>
            </div>
            {prediction?.confidence && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                prediction.confidence === 'high' ? 'bg-green-500/20 text-green-400' :
                prediction.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {prediction.confidence} confidence
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-metro-accent animate-bounce" />
            <div>
              <p className="text-xs text-slate-400">Current Station</p>
              <p className="font-bold text-white">{prediction?.currentStation || route.path[0]}</p>
            </div>
          </div>

          {prediction?.nextStation && (
            <div className="mt-3 flex items-center gap-3">
              <Navigation2 className="w-5 h-5 text-violet-400 rotate-90" />
              <div>
                <p className="text-xs text-slate-400">Next Station</p>
                <p className="font-semibold text-white">{prediction.nextStation}</p>
              </div>
            </div>
          )}

          {prediction?.stopsRemaining != null && (
            <div className="mt-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-xs text-slate-400">Stops Remaining</p>
                <p className="font-bold text-white">{prediction.stopsRemaining}</p>
              </div>
            </div>
          )}

          {/* Visited Stations History */}
          {prediction?.visitedStations && prediction.visitedStations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-metro-border">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Travel History</p>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {prediction.visitedStations.map((name, index) => {
                  const stationDetail = allStations.find(s => s.name === name) || route?.stationDetails?.find(s => s.name === name);
                  const isInterchange = stationDetail?.interchange;
                  const lineColor = stationDetail ? LINE_COLORS[stationDetail.line] : null;
                  const congestion = stationDetail?.congestion;
                  
                  return (
                    <div key={name + index} className="flex items-center gap-1.5 flex-shrink-0 animate-fade-in">
                      <span className="text-xs bg-metro-card border border-metro-border text-slate-300 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                        <span className="text-green-400">✓</span>
                        {lineColor && (
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColor }} />
                        )}
                        <span>{name}</span>
                        {isInterchange && (
                          <span className="text-[9px] px-1 py-0.2 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded">
                            🔄
                          </span>
                        )}
                        {congestion && (
                          <span className={`text-[9px] px-1.5 py-0.2 border rounded flex items-center gap-1 font-medium ${congestion.colorClass}`}>
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
          className="w-full bg-red-500/20 border border-red-500/40 text-red-400 font-semibold py-3 rounded-xl hover:bg-red-500/30 transition-colors text-sm"
        >
          End Trip
        </button>
      </div>
    </div>
  );
}
