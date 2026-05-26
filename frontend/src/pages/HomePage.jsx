import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { metroAPI } from '../services/api';
import { useMetro } from '../context/MetroContext';
import { MapPin, Navigation2, Search, ArrowRight, Train, Zap } from 'lucide-react';

const LINE_COLORS = {
  Blue: 'bg-blue-500', Yellow: 'bg-yellow-400', Red: 'bg-red-500',
  Green: 'bg-green-500', Violet: 'bg-violet-500', Pink: 'bg-pink-500', Orange: 'bg-orange-500',
};

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyFilter(stations, query) {
  if (!query) return [];
  const cleanQuery = query.toLowerCase().trim().replace(/\s+/g, '');
  
  const directMatches = stations.filter(s => s.toLowerCase().includes(query.toLowerCase()));
  const remaining = stations.filter(s => !directMatches.includes(s));
  const fuzzyMatches = remaining.filter(s => {
    const cleanStation = s.toLowerCase().replace(/\s+/g, '');
    return getLevenshteinDistance(cleanQuery, cleanStation) <= 3 || cleanStation.includes(cleanQuery);
  });
  
  return [...directMatches, ...fuzzyMatches];
}

function StationInput({ label, value, onChange, onSelect, stations, icon: Icon }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const POPULAR_STATIONS = ["Rajiv Chowk", "Kashmere Gate", "Noida Sector 52", "Hauz Khas", "New Delhi", "Yamuna Bank"];
  
  const suggestions = value.length > 0 
    ? fuzzyFilter(stations, value) 
    : POPULAR_STATIONS;

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-metro-accent w-4 h-4" />
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="w-full bg-metro-card border border-metro-border rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-metro-accent transition-colors"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 glass-card overflow-hidden max-h-56 overflow-y-auto shadow-2xl">
          <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-metro-border bg-metro-dark/40">
            {value.length > 0 ? "Suggestions" : "Popular Stations"}
          </div>
          {suggestions.slice(0, 8).map((name) => (
            <button
              key={name}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-metro-accent/20 transition-colors flex items-center gap-2"
              onClick={() => { onSelect(name); setOpen(false); }}
            >
              <Train className="w-3.5 h-3.5 text-metro-accent flex-shrink-0 animate-pulse" />
              <span className="text-slate-100 font-medium">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { state, dispatch } = useMetro();
  const [stationNames, setStationNames] = useState([]);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nearestLoading, setNearestLoading] = useState(false);

  useEffect(() => {
    metroAPI.getStationNames().then((res) => setStationNames(res.data || []));
  }, []);

  const handleSearch = async () => {
    if (!source || !destination) {
      setError('Please select both source and destination.');
      return;
    }
    if (source === destination) {
      setError('Source and destination cannot be the same.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await metroAPI.getRoute(source, destination);
      dispatch({ type: 'SET_ROUTE', payload: res.data });
      navigate('/route');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const detectNearest = () => {
    setNearestLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await metroAPI.getNearestStation(coords.latitude, coords.longitude);
          setSource(res.data.station.name);
          dispatch({ type: 'SET_NEAREST', payload: res.data });
        } catch (e) {
          setError('Could not detect nearest station.');
        } finally {
          setNearestLoading(false);
        }
      },
      () => { setError('Location access denied.'); setNearestLoading(false); }
    );
  };

  const handleQuickAction = (src, dest) => {
    setSource(src);
    setDestination(dest);
  };

  const swap = () => {
    const temp = source;
    setSource(destination);
    setDestination(temp);
  };

  const lineStatuses = [
    { name: 'Blue Line', status: 'Operational', load: 'Normal', color: '#2563EB', pct: 98 },
    { name: 'Yellow Line', status: 'Operational', load: 'High Density', color: '#EAB308', pct: 85 },
    { name: 'Red Line', status: 'Delays', load: 'Restricted Speed', color: '#EF4444', pct: 60 },
    { name: 'Violet Line', status: 'Operational', load: 'Low Density', color: '#8B5CF6', pct: 99 }
  ];

  return (
    <div className="min-h-screen bg-[#0A0B10] px-4 pt-safe pb-28 relative overflow-hidden">
      {/* Cosmic background light leaks */}
      <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-[250px] h-[250px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />
      
      {/* Hero Header */}
      <div className="pt-10 pb-6 text-center animate-fade-in relative z-10">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-300 mb-4 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
          <Zap className="w-3 h-3 text-indigo-400 animate-pulse" />
          Live GPS Core Active
        </div>
        <h1 className="text-3xl font-black text-white mb-2 leading-tight tracking-tight">
          Smart Metro<br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(139,92,246,0.2)]">Tracker</span>
        </h1>
        <p className="text-slate-400 text-xs tracking-wider uppercase font-semibold">Real-time routing · High-Fidelity Predictions · Live GPS</p>
      </div>

      {/* Quick Stats Banner / HUD Telemetry */}
      <div className="grid grid-cols-3 gap-2.5 mb-5 relative z-10">
        {[
          { label: 'GPS Satellites', value: '12 Active', detail: 'Lock Secured' },
          { label: 'Network Latency', value: '8ms', detail: 'Hyper-Fast' },
          { label: 'Routing Core', value: 'Active', detail: 'Optimized' },
        ].map((item) => (
          <div key={item.label} className="glass-card p-2.5 text-center border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{item.label}</div>
            <div className="font-bold text-white text-xs">{item.value}</div>
            <div className="text-[9px] text-indigo-400 font-medium mt-0.5">{item.detail}</div>
          </div>
        ))}
      </div>

      {/* Floating Quick Action Tiles */}
      <div className="mb-5 relative z-10">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 pl-1">⚡ Instant Despatch Actions</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleQuickAction('Kashmere Gate', 'Hauz Khas')}
            className="glass-card p-3.5 text-left border border-white/5 hover:border-indigo-500/30 bg-[#12141c]/30 hover:bg-[#12141c]/60 backdrop-blur-md transition-all group active:scale-95 duration-200"
          >
            <div className="text-lg mb-1 group-hover:scale-110 transition-transform duration-200">💼</div>
            <div className="font-bold text-white text-xs">Work Commute</div>
            <div className="text-[10px] text-slate-400 mt-1">Kashmere Gate ➔ Hauz Khas</div>
          </button>

          <button
            onClick={() => handleQuickAction('Rajiv Chowk', 'Noida Sector 52')}
            className="glass-card p-3.5 text-left border border-white/5 hover:border-purple-500/30 bg-[#12141c]/30 hover:bg-[#12141c]/60 backdrop-blur-md transition-all group active:scale-95 duration-200"
          >
            <div className="text-lg mb-1 group-hover:scale-110 transition-transform duration-200">🏠</div>
            <div className="font-bold text-white text-xs">Home Route</div>
            <div className="text-[10px] text-slate-400 mt-1">Rajiv Chowk ➔ Noida 52</div>
          </button>
        </div>
      </div>

      {/* Search Card */}
      <div className="glass-card p-5 mb-5 relative z-10 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl">
        <div className="space-y-4">
          <StationInput
            label="Source Station"
            value={source}
            onChange={setSource}
            onSelect={setSource}
            stations={stationNames}
            icon={MapPin}
          />

          {/* Swap Button */}
          <div className="flex items-center justify-center">
            <button
              onClick={swap}
              className="w-9 h-9 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-400/40 rounded-full flex items-center justify-center transition-all hover:rotate-180 duration-300 shadow-[0_0_10px_rgba(99,102,241,0.15)] text-indigo-300 text-sm font-bold"
            >
              ⇅
            </button>
          </div>

          <StationInput
            label="Destination Station"
            value={destination}
            onChange={setDestination}
            onSelect={setDestination}
            stations={stationNames}
            icon={Navigation2}
          />
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 animate-pulse">{error}</div>
        )}

        {/* Detect Nearest */}
        <button
          onClick={detectNearest}
          disabled={nearestLoading}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-xs text-indigo-300 font-bold border border-indigo-500/20 hover:border-indigo-400/40 rounded-xl bg-indigo-500/5 hover:bg-indigo-500/10 transition-all disabled:opacity-50"
        >
          <MapPin className="w-3.5 h-3.5 text-indigo-400" />
          {nearestLoading ? 'Detecting your coordinates...' : 'Acquire Current Location'}
        </button>

        {/* Search Button */}
        <button
          id="search-route-btn"
          onClick={handleSearch}
          disabled={loading}
          className="mt-3 w-full btn-gradient text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-60 shadow-[0_4px_20px_rgba(99,102,241,0.3)]"
        >
          {loading ? (
            <span className="flex gap-1"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></span>
          ) : (
            <><Search className="w-4 h-4" /> Compute Optimal Path <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </div>

      {/* Nearest Station Card */}
      {state.nearestStation && (
        <div className="glass-card p-4 mb-5 relative z-10 border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-md animate-slide-up">
          <p className="text-[10px] text-indigo-400 font-bold mb-1.5 uppercase tracking-wider">📡 Nearest Station Found</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${LINE_COLORS[state.nearestStation.station?.line] || 'bg-slate-500'} shadow-[0_0_8px_currentColor]`} />
              <span className="font-bold text-white text-sm">{state.nearestStation.station?.name}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{(state.nearestStation.distanceMeters / 1000).toFixed(2)} km distance</span>
          </div>
        </div>
      )}



      {/* Quick Stats Footer */}
      <div className="grid grid-cols-3 gap-3 relative z-10">
        {[
          { label: 'Tracked Stations', value: stationNames.length || '30+', icon: '🚇' },
          { label: 'Search Model', value: 'Heuristic BFS', icon: '🧠' },
          { label: 'Telemetry Provider', value: 'Live GPS Core', icon: '📡' },
        ].map((item) => (
          <div key={item.label} className="glass-card p-3 text-center border border-white/5 bg-[#12141c]/20 backdrop-blur-md">
            <div className="text-base mb-1">{item.icon}</div>
            <div className="font-bold text-white text-xs">{item.value}</div>
            <div className="text-[9px] text-slate-500 mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
