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

  const swap = () => { const t = source; setSource(destination); setDestination(t); };

  return (
    <div className="min-h-screen bg-gradient-metro px-4 pt-safe pb-24">
      {/* Hero Header */}
      <div className="pt-12 pb-8 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2 bg-metro-accent/10 border border-metro-accent/20 rounded-full px-4 py-1.5 text-xs font-medium text-metro-accent mb-4">
          <Zap className="w-3 h-3" />
          Delhi Metro Tracker
        </div>
        <h1 className="text-3xl font-black text-white mb-2 leading-tight">
          Navigate with<br />
          <span className="bg-gradient-hero bg-clip-text text-transparent">Intelligence</span>
        </h1>
        <p className="text-slate-400 text-sm">Real-time routing · Smart predictions · Live GPS</p>
      </div>

      {/* Search Card */}
      <div className="glass-card p-5 mb-4 animate-slide-up">
        <div className="space-y-4">
          <StationInput
            label="From"
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
              className="w-8 h-8 bg-metro-accent/20 hover:bg-metro-accent/40 border border-metro-accent/30 rounded-full flex items-center justify-center transition-all hover:rotate-180 duration-300"
            >
              ⇅
            </button>
          </div>

          <StationInput
            label="To"
            value={destination}
            onChange={setDestination}
            onSelect={setDestination}
            stations={stationNames}
            icon={Navigation2}
          />
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
        )}

        {/* Detect Nearest */}
        <button
          onClick={detectNearest}
          disabled={nearestLoading}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-sm text-metro-accent border border-metro-accent/30 rounded-xl hover:bg-metro-accent/10 transition-all disabled:opacity-50"
        >
          <MapPin className="w-4 h-4" />
          {nearestLoading ? 'Detecting...' : 'Use my current location'}
        </button>

        {/* Search Button */}
        <button
          id="search-route-btn"
          onClick={handleSearch}
          disabled={loading}
          className="mt-3 w-full btn-gradient text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          {loading ? (
            <span className="flex gap-1"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></span>
          ) : (
            <><Search className="w-4 h-4" /> Find Route <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </div>

      {/* Nearest Station Card */}
      {state.nearestStation && (
        <div className="glass-card p-4 mb-4 animate-slide-up">
          <p className="text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wider">Nearest Station</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${LINE_COLORS[state.nearestStation.station?.line] || 'bg-slate-500'}`} />
              <span className="font-semibold text-white">{state.nearestStation.station?.name}</span>
            </div>
            <span className="text-xs text-slate-400">{(state.nearestStation.distanceMeters / 1000).toFixed(2)} km away</span>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Stations', value: stationNames.length || '30+', icon: '🚇' },
          { label: 'Algorithm', value: 'BFS', icon: '🧠' },
          { label: 'Real-time', value: 'GPS', icon: '📡' },
        ].map((item) => (
          <div key={item.label} className="glass-card p-3 text-center">
            <div className="text-xl mb-1">{item.icon}</div>
            <div className="font-bold text-white text-sm">{item.value}</div>
            <div className="text-xs text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
