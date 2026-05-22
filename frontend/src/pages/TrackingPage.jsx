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
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899',
};

function createStationIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.5)"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
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
  const navigate = useNavigate();
  const { startTracking, stopTracking } = useGPSTracking();
  const { notify } = useNotification();
  const [allStations, setAllStations] = useState([]);

  const route = state.route;
  const prediction = state.prediction;
  const userLoc = state.userLocation;

  useEffect(() => {
    if (!route) { navigate('/'); return; }
    metroAPI.getAllStations().then((res) => setAllStations(res.data || []));
    startTracking();
    return () => stopTracking();
  }, []);

  // Fire alert notification
  useEffect(() => {
    if (prediction?.shouldAlert && !state.alertFired) {
      dispatch({ type: 'SET_ALERT_FIRED', payload: true });
      notify('🚇 Almost There!', `Only ${prediction.stopsRemaining} stop(s) to your destination!`);
    }
  }, [prediction?.shouldAlert]);

  const handleEndTrip = async () => {
    stopTracking();
    if (state.tripId) await metroAPI.endTrip(state.tripId).catch(() => {});
    dispatch({ type: 'END_TRIP' });
    navigate('/');
  };

  if (!route) return null;

  const routeCoords = (route.stationDetails || [])
    .filter((s) => s?.lat && s?.lng)
    .map((s) => [s.lat, s.lng]);

  const mapCenter = userLoc
    ? [userLoc.lat, userLoc.lng]
    : routeCoords[0] || [28.6328, 77.2197];

  const destinationStation = route.stationDetails?.[route.stationDetails.length - 1];

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

          {/* Station Markers */}
          {allStations.map((s) => (
            s.lat && s.lng ? (
              <Marker
                key={s.name}
                position={[s.lat, s.lng]}
                icon={createStationIcon(LINE_COLORS[s.line] || '#6366F1')}
              >
                <Popup>
                  <div className="text-xs">
                    <strong>{s.name}</strong><br />
                    {s.line} Line
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
        {/* Alert Banner */}
        {prediction?.shouldAlert && (
          <div className="bg-yellow-500/15 border border-yellow-500/30 rounded-xl px-4 py-3 flex items-center gap-3 animate-pulse-slow">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-yellow-400">Get Ready!</p>
              <p className="text-xs text-slate-300">Only {prediction.stopsRemaining} stop(s) to destination</p>
            </div>
          </div>
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
            <MapPin className="w-5 h-5 text-metro-accent" />
            <div>
              <p className="text-xs text-slate-400">Current Station</p>
              <p className="font-bold text-white">{prediction?.currentStation || route.path[0]}</p>
            </div>
          </div>

          {prediction?.nextStation && (
            <div className="mt-3 flex items-center gap-3">
              <Navigation2 className="w-5 h-5 text-violet-400" />
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
