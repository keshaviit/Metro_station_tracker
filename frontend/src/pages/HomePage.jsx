import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { metroAPI } from '../services/api';
import { useMetro } from '../context/MetroContext';
import { useAuth } from '../context/AuthContext';
import MetroGraph from '../services/routeEngine';

function StationInput({ label, value, onChange, onSelect, stations, icon }) {
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
  
  const getLevenshteinDistance = (a, b) => {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };

  const fuzzyFilter = (stationsList, query) => {
    if (!query) return [];
    const cleanQuery = query.toLowerCase().trim().replace(/\s+/g, '');
    
    const directMatches = stationsList.filter(s => s.toLowerCase().includes(query.toLowerCase()));
    const remaining = stationsList.filter(s => !directMatches.includes(s));
    const fuzzyMatches = remaining.filter(s => {
      const cleanStation = s.toLowerCase().replace(/\s+/g, '');
      return getLevenshteinDistance(cleanQuery, cleanStation) <= 3 || cleanStation.includes(cleanQuery);
    });
    
    return [...directMatches, ...fuzzyMatches];
  };

  const suggestions = value.length > 0 
    ? fuzzyFilter(stations, value) 
    : POPULAR_STATIONS;

  return (
    <div className="relative flex-1 w-full" ref={containerRef}>
      <label className="font-label-md text-label-md text-on-surface-variant ml-xs mb-1.5 block uppercase tracking-wider">{label}</label>
      <div className="relative group">
        <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors text-[20px]">
          {icon}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${label.toLowerCase()}...`}
          className="w-full h-12 pl-12 pr-md bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-body-sm text-body-sm text-on-surface placeholder:text-outline/65"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-surface-container-lowest border border-outline-variant/40 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-2xl">
          <div className="px-4 py-2 text-[10px] font-bold text-on-surface-variant bg-surface-container/50 border-b border-outline-variant/30 uppercase tracking-wider">
            {value.length > 0 ? "Suggestions" : "Popular Stations"}
          </div>
          {suggestions.slice(0, 8).map((name) => (
            <button
              key={name}
              className="w-full text-left px-4 py-3 text-sm hover:bg-primary/10 text-on-surface transition-colors flex items-center gap-sm font-medium border-b border-outline-variant/10 last:border-b-0"
              onClick={() => { onSelect(name); setOpen(false); }}
            >
              <span className="material-symbols-outlined text-primary text-[18px]">train</span>
              <span>{name}</span>
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
  const { user, isAuthenticated } = useAuth();

  const [stationNames, setStationNames] = useState([]);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nearestLoading, setNearestLoading] = useState(false);
  const [homeStation, setHomeStation] = useState(() => localStorage.getItem('smart_metro_home') || null);
  const [officeStation, setOfficeStation] = useState(() => localStorage.getItem('smart_metro_office') || null);
  const [showConfig, setShowConfig] = useState(false);
  const [tempHome, setTempHome] = useState(homeStation);
  const [tempOffice, setTempOffice] = useState(officeStation);
  const [recentTrips, setRecentTrips] = useState([]);

  const [theme, setTheme] = useState(() => localStorage.getItem('metro_theme') || 'light');
  
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('metro_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  };

  useEffect(() => {
    setTempHome(homeStation);
    setTempOffice(officeStation);
  }, [homeStation, officeStation]);

  useEffect(() => {
    // Get list of stations
    metroAPI.getAllStations()
      .then((res) => {
        const stations = res.data || [];
        setStationNames(stations.map(s => s.name));
        localStorage.setItem('metro_stations_cache', JSON.stringify(stations));
      })
      .catch((err) => {
        console.warn('[HomePage] Offline stations load fallback activated.');
        try {
          const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
          if (cached.length > 0) {
            setStationNames(cached.map(s => s.name));
          }
        } catch (e) {
          console.error(e);
        }
      });

    // Populate recent trips if user is logged in
    if (isAuthenticated) {
      metroAPI.getTripHistory()
        .then(res => {
          setRecentTrips(res.data?.slice(0, 2) || []);
        })
        .catch(err => console.warn('Could not load history:', err.message));
    } else {
      // Offline logs fallback
      try {
        const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
        setRecentTrips(queue.slice(0, 2));
      } catch (_) {}
    }
  }, [isAuthenticated]);

  const syncOfflineTrips = async () => {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
      if (queue.length === 0) return;

      const remaining = [];
      for (const trip of queue) {
        if (trip.completed && !trip.synced) {
          try {
            const res = await metroAPI.startTrip({ source: trip.source, destination: trip.destination });
            const serverTripId = res.data?.tripId || res.tripId;
            if (serverTripId) {
              await metroAPI.endTrip(serverTripId);
            }
          } catch (syncErr) {
            remaining.push(trip);
          }
        } else {
          remaining.push(trip);
        }
      }
      localStorage.setItem('offline_trips_queue', JSON.stringify(remaining));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    syncOfflineTrips();
    const handleOnline = () => syncOfflineTrips();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
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
      console.warn('[HomePage] Route request fallback to local BFS solver');
      try {
        const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
        if (cached.length === 0) {
          throw new Error('Offline station cache is empty. Connect to internet to download map.');
        }

        const graph = new MetroGraph(cached);
        const shortest = graph.findShortestPath(source, destination);
        const minInterchanges = graph.findMinInterchangesPath(source, destination);
        const shortestDistance = graph.findShortestDistancePath(source, destination);
        const lessCongested = graph.findLessCongestedPath(source, destination);

        if (shortest.error) throw new Error(shortest.error);

        const localRouteResult = {
          success: true,
          data: { shortest, minInterchanges, shortestDistance, lessCongested, isOfflineCalculated: true }
        };

        dispatch({ type: 'SET_ROUTE', payload: localRouteResult });
        navigate('/route');
      } catch (offlineErr) {
        setError(offlineErr.message || 'Routing server is offline and no local map is cached.');
      }
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
    if (!src || !dest) {
      setShowConfig(true);
      return;
    }
    setSource(src);
    setDestination(dest);
  };

  const swap = () => {
    const temp = source;
    setSource(destination);
    setDestination(temp);
  };

  const username = isAuthenticated && user ? (user.name || user.email.split('@')[0]) : 'Traveler';

  return (
    <div className="min-h-screen bg-background text-on-background pb-28">
      {/* Dynamic Navigation Shell */}
      <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-md text-primary font-title-md text-title-md border-b border-outline-variant/30 shadow-sm flex items-center justify-between px-margin-mobile h-16 w-full">
        <div className="flex items-center gap-sm">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight font-extrabold">MetroPulse</h1>
        </div>
        
        <div className="flex items-center gap-md">
          {/* Theme Switcher Button */}
          <button 
            onClick={toggleTheme} 
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary hover:bg-surface-container-high transition-colors active:scale-95 duration-200"
            title="Toggle Theme"
          >
            <span className="material-symbols-outlined text-[24px]">
              {theme === 'light' ? 'dark_mode' : 'light_mode'}
            </span>
          </button>
          
          {/* User Profile Avatar */}
          <div 
            onClick={() => navigate(isAuthenticated || localStorage.getItem('metro_guest') === 'true' ? '/profile' : '/auth')}
            className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 border border-primary/20 text-primary flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-all active:scale-95 duration-200"
          >
            {isAuthenticated && user?.picture ? (
              <img src={user.picture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-[20px]">person</span>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Body */}
      <main className="pt-24 px-margin-mobile max-w-2xl mx-auto space-y-xl">
        {/* Decorative Background */}
        <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

        {/* Greeting Section */}
        <header className="space-y-sm relative z-10 mt-6">
          <p className="text-primary font-bold text-[26px] uppercase tracking-wider">Hello, {username}</p>
          <h2 className="text-[38px] text-on-surface tracking-tight font-black leading-tight mt-1">Where are you going today?</h2>
        </header>

        {/* Route Selector Card */}
        <section className="glass-panel border border-outline-variant/30 rounded-xl p-md soft-shadow relative z-10 space-y-md">
          <div className="flex flex-col md:flex-row items-center gap-md relative w-full">
            <StationInput
              label="Source Station"
              value={source}
              onChange={setSource}
              onSelect={setSource}
              stations={stationNames}
              icon="pin_drop"
            />

            {/* Swap Button */}
            <div className="flex items-center justify-center pt-4 md:pt-0">
              <button
                onClick={swap}
                className="w-10 h-10 bg-surface-container border border-outline-variant/50 hover:bg-surface-container-high rounded-full flex items-center justify-center text-primary font-bold transition-transform active:scale-90 duration-200"
                title="Swap Stations"
              >
                <span className="material-symbols-outlined">swap_vert</span>
              </button>
            </div>

            <StationInput
              label="Destination Station"
              value={destination}
              onChange={setDestination}
              onSelect={setDestination}
              stations={stationNames}
              icon="navigation"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-100 border border-red-200 rounded-lg px-3 py-2 text-center animate-pulse">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-sm">
            <button
              onClick={detectNearest}
              disabled={nearestLoading}
              className="w-full py-3 bg-surface-container border border-outline-variant/50 text-primary rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-sm active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">my_location</span>
              {nearestLoading ? 'Detecting...' : 'Use Current Location'}
            </button>

            <button
              id="search-route-btn"
              onClick={handleSearch}
              disabled={loading}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-title-md text-title-md shadow-lg flex items-center justify-center gap-sm active:scale-[0.98] transition-all disabled:opacity-75 font-bold"
            >
              {loading ? (
                <span className="flex gap-1.5">
                  <span className="loading-dot bg-white" />
                  <span className="loading-dot bg-white" />
                  <span className="loading-dot bg-white" />
                </span>
              ) : (
                <>
                  <span className="material-symbols-outlined">search</span>
                  Find Optimized Route
                </>
              )}
            </button>
          </div>
        </section>

        {/* Bento Commute & Map Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-md relative z-10">
          {/* Bento Left: Map Navigation Link */}
          <div 
            onClick={() => navigate('/map')} 
            className="relative h-48 rounded-xl overflow-hidden shadow-sm border border-outline-variant/30 group cursor-pointer"
          >
            <img 
              alt="Interactive map preview" 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              src="/delhi_metro_map.svg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10"></div>
            <div className="absolute bottom-md left-md text-white-force">
              <p className="font-label-md text-[10px] uppercase tracking-wider opacity-90 text-white-force">Live Transit Map</p>
              <p className="font-title-md text-title-md text-white-force font-bold">Explore Stations</p>
            </div>
          </div>

          {/* Bento Right: Commutes Widget */}
          <div className="bg-surface-container border border-outline-variant/30 rounded-xl p-md flex flex-col justify-between">
            <div>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white mb-sm shadow-sm">
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              </span>
              <h3 className="font-title-md text-title-md text-primary font-bold">Smart Commute</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-xs leading-normal">
                {homeStation && officeStation 
                  ? `Commute setup active: ${homeStation} ➔ ${officeStation}`
                  : "Setup presets for Work/Home commutes to instantly track routes offline."}
              </p>
            </div>
            
            <div className="flex gap-sm mt-md">
              <button 
                onClick={() => handleQuickAction(homeStation, officeStation)}
                className="flex-1 py-2 bg-primary text-on-primary rounded-lg font-label-md text-xs font-bold shadow-sm hover:bg-primary-container active:scale-[0.97]"
              >
                Start Commute
              </button>
              <button 
                onClick={() => setShowConfig(!showConfig)}
                className="px-3 py-2 bg-secondary-container text-on-secondary-container rounded-lg font-label-md text-xs font-bold hover:bg-outline-variant active:scale-[0.97]"
              >
                Configure
              </button>
            </div>
          </div>
        </section>

        {/* Dynamic Preset Config dropdown */}
        {showConfig && (
          <section className="glass-panel border border-outline-variant/30 rounded-xl p-md space-y-md animate-slide-up relative z-10">
            <h4 className="font-title-md text-[14px] text-primary uppercase font-bold">Set Commute Nodes</h4>
            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1 pl-1">🏠 Home Station</label>
                <select
                  value={tempHome || ''}
                  onChange={(e) => setTempHome(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Select Home Node...</option>
                  {stationNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1 pl-1">💼 Office Station</label>
                <select
                  value={tempOffice || ''}
                  onChange={(e) => setTempOffice(e.target.value)}
                  className="w-full bg-surface-container border border-outline-variant rounded-lg p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-primary outline-none"
                >
                  <option value="">Select Office Node...</option>
                  {stationNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-sm justify-end">
              <button onClick={() => setShowConfig(false)} className="px-3 py-1.5 text-xs font-bold text-on-surface-variant uppercase">Cancel</button>
              <button
                onClick={() => {
                  setHomeStation(tempHome);
                  setOfficeStation(tempOffice);
                  localStorage.setItem('smart_metro_home', tempHome || '');
                  localStorage.setItem('smart_metro_office', tempOffice || '');
                  setShowConfig(false);
                }}
                className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold uppercase"
              >
                Save Presets
              </button>
            </div>
          </section>
        )}

        {/* Nearest Station Found banner */}
        {state.nearestStation && (
          <section className="bg-surface-container border border-outline-variant/30 rounded-xl p-md relative z-10 flex justify-between items-center animate-slide-up">
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
              <div>
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">Nearest Node Detected</span>
                <h3 className="font-title-md text-[14px] text-on-surface font-bold mt-0.5">{state.nearestStation.station?.name}</h3>
              </div>
            </div>
            <span className="font-label-md text-xs text-primary font-mono font-bold">{(state.nearestStation.distanceMeters / 1000).toFixed(2)} km away</span>
          </section>
        )}

        {/* Recent Trips Section */}
        {recentTrips.length > 0 && (
          <section className="space-y-md relative z-10">
            <div className="flex items-center justify-between">
              <h3 className="font-title-md text-title-md text-on-surface font-bold">Recent Trips</h3>
              <button 
                onClick={() => navigate(isAuthenticated ? '/profile' : '/auth')} 
                className="text-primary font-label-md text-label-md hover:underline font-bold"
              >
                View History
              </button>
            </div>
            
            <div className="space-y-sm">
              {recentTrips.map((trip) => (
                <div 
                  key={trip._id || trip.timestamp || Math.random()}
                  onClick={() => handleQuickAction(trip.source, trip.destination)}
                  className="glass-panel border border-outline-variant/30 rounded-xl p-md flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors"
                >
                  <div className="flex items-center gap-md">
                    <div className="flex flex-col items-center gap-xs">
                      <div className="w-3 h-3 rounded-full border-2 border-primary"></div>
                      <div className="w-[2px] h-4 bg-outline-variant/50"></div>
                      <div className="w-3 h-3 rounded-full bg-primary"></div>
                    </div>
                    <div>
                      <p className="font-body-lg text-body-lg text-on-surface font-bold leading-tight">{trip.source} ➔ {trip.destination}</p>
                      <div className="flex items-center gap-sm mt-1 text-on-surface-variant text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider">Verified Path</span>
                        <span>
                          {trip.completedAt 
                            ? new Date(trip.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Offline Trip'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-outline">chevron_right</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dynamic System Stats Grid */}
        <section className="grid grid-cols-3 gap-md relative z-10">
          {[
            { label: 'Supported Nodes', value: stationNames.length || '262', icon: 'train' },
            { label: 'Offline Solver', value: 'Ready', icon: 'bolt' },
            { label: 'GNSS Alarms', value: 'Active', icon: 'notifications_active' },
          ].map((item) => (
            <div key={item.label} className="bg-surface-container border border-outline-variant/20 rounded-xl p-md text-center flex flex-col justify-between items-center gap-xs">
              <span className="material-symbols-outlined text-primary text-[24px]">{item.icon}</span>
              <div className="font-bold text-on-surface text-xs mt-1">{item.value}</div>
              <div className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider">{item.label}</div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
