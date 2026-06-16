import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { metroAPI } from '../services/api';
import { useMetro } from '../context/MetroContext';
import { useAuth } from '../context/AuthContext';
import MetroGraph from '../services/routeEngine';
import { searchStations } from '../services/searchService';
import homeBannerImg from '../assets/home_banner.png';

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, dispatch } = useMetro();
  const { user, isAuthenticated } = useAuth();

  // Populate source/destination from search-station page navigation state
  useEffect(() => {
    if (location.state) {
      if (location.state.source !== undefined) setSource(location.state.source);
      if (location.state.destination !== undefined) setDestination(location.state.destination);
      
      // Clear location state to prevent repeating values
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [stationNames, setStationNames] = useState([]);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [activeField, setActiveField] = useState('source'); // 'source' or 'destination'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nearestLoading, setNearestLoading] = useState(false);
  const [recentTrips, setRecentTrips] = useState([]);
  const [uniqueRecentStations, setUniqueRecentStations] = useState([]);

  useEffect(() => {
    // Prevent rubber-banding on the body
    document.body.style.overscrollBehaviorY = 'none';
    document.documentElement.style.overscrollBehaviorY = 'none';
    
    return () => {
      document.body.style.overscrollBehaviorY = 'auto';
      document.documentElement.style.overscrollBehaviorY = 'auto';
    };
  }, []);

  useEffect(() => {
    metroAPI.getAllStations()
      .then((res) => {
        const stations = res.data || [];
        setStationNames(stations.map(s => s.name));
        localStorage.setItem('metro_stations_cache', JSON.stringify(stations));
      })
      .catch((err) => {
        try {
          const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
          if (cached.length > 0) setStationNames(cached.map(s => s.name));
        } catch (e) {}
      });

    if (isAuthenticated) {
      metroAPI.getTripHistory()
        .then(res => setRecentTrips(res.data || []))
        .catch(() => {});
    } else {
      try {
        const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
        setRecentTrips(queue);
      } catch (_) {}
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const recent = new Set();
    recentTrips.forEach(trip => {
      if (trip.source) recent.add(trip.source);
      if (trip.destination) recent.add(trip.destination);
    });
    setUniqueRecentStations(Array.from(recent).slice(0, 5));
  }, [recentTrips]);

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
      try {
        const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
        if (cached.length === 0) throw new Error('Offline cache empty.');

        const graph = new MetroGraph(cached);
        const shortest = graph.findShortestPath(source, destination);
        const minInterchanges = graph.findMinInterchangesPath(source, destination);
        const shortestDistance = graph.findShortestDistancePath(source, destination);
        const lessCongested = graph.findLessCongestedPath(source, destination);

        if (shortest.error) throw new Error(shortest.error);

        dispatch({ type: 'SET_ROUTE', payload: { success: true, data: { shortest, minInterchanges, shortestDistance, lessCongested, isOfflineCalculated: true } } });
        navigate('/route');
      } catch (offlineErr) {
        setError(offlineErr.message || 'Routing server is offline.');
      }
    } finally {
      setLoading(false);
    }
  };

  const detectNearest = (e) => {
    e.stopPropagation();
    setNearestLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await metroAPI.getNearestStation(coords.latitude, coords.longitude);
          setSource(res.data.station.name);
          setActiveField('destination');
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

  const swap = (e) => {
    e.stopPropagation();
    const temp = source;
    setSource(destination);
    setDestination(temp);
    setActiveField(activeField === 'source' ? 'destination' : 'source');
  };

  const handleStationClick = (stationName) => {
    if (activeField === 'source') {
      setSource(stationName);
      setActiveField('destination');
    } else {
      setDestination(stationName);
    }
  };

  const openWhatsappTickets = () => {
    window.open('https://wa.me/919650855800?text=Hi', '_blank');
  };

  // Station Search logic
  const currentQuery = activeField === 'source' ? source : destination;
  const filteredStations = currentQuery.length > 0 
    ? searchStations(stationNames, currentQuery) 
    : stationNames;
  const recentToDisplay = uniqueRecentStations.filter(s => s.toLowerCase().includes(currentQuery.toLowerCase()));
  const othersToDisplay = filteredStations.filter(s => !uniqueRecentStations.includes(s));

  // Automatically trigger search when both are filled and exist in the list
  useEffect(() => {
    if (source && destination && source !== destination && stationNames.includes(source) && stationNames.includes(destination)) {
      handleSearch();
    }
  }, [source, destination, stationNames]);

  return (
    <div className="h-screen bg-white text-gray-900 pt-6 flex flex-col overscroll-none overflow-hidden">
      
      {/* Frozen Header Area */}
      <div className="flex-shrink-0 px-5">
        {/* MetroPulse Hero Banner */}
        <div className="relative w-full rounded-[24px] overflow-hidden aspect-[2/1.05] shadow-md mb-4 border border-gray-100">
          <img 
            src={homeBannerImg} 
            alt="MetroPulse - Your Metro, Made Easy" 
            className="w-full h-full object-cover scale-[1.15] origin-center translate-x-3" 
          />
        
        {/* Book Tickets Float Button inside Banner */}
        <div className="absolute bottom-4 right-4 z-10">
          <button
            onClick={openWhatsappTickets}
            className="px-5 py-2.5 bg-white text-[#00a884] font-extrabold text-[13px] rounded-full flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all uppercase tracking-wide"
          >
            <span className="material-symbols-outlined text-[18px] font-bold">qr_code_2</span>
            Book Tickets
          </button>
        </div>
      </div>

      {/* Greeting Section */}
      <h2 className="text-[20px] text-[#00a884] font-semibold mb-3 ml-1">
        Hi, where are you going today?
      </h2>

      {/* Search Input Card */}
      <div className="bg-white border border-gray-200 rounded-[20px] flex flex-col relative mb-3 shadow-sm">
        
        {/* From Input Area */}
        <div 
          className="flex flex-col justify-center px-4 py-2.5 min-h-[64px] border-b border-gray-100 transition-colors rounded-t-[20px] active:bg-gray-50/50 cursor-pointer"
          onClick={() => navigate('/search-station', { state: { type: 'source', source, destination } })}
        >
          <div className="flex items-center w-full gap-3">
            {/* Green dot icon */}
            <div className="w-[18px] h-[18px] rounded-full border-[3px] border-[#00a884] flex-shrink-0 relative mt-3">
              <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-[#00a884] rounded-full"></div>
            </div>
            
            <div className="flex flex-col flex-1">
              <span className="text-[11px] font-bold text-[#00a884] uppercase tracking-wider mb-0.5">From</span>
              <div className="flex justify-between items-center w-full">
                <input
                  type="text"
                  placeholder="Select starting station..."
                  value={source}
                  readOnly={true}
                  className="w-full bg-transparent outline-none text-gray-800 text-[16px] placeholder:text-gray-400 cursor-pointer"
                />
                <button onClick={detectNearest} className="text-[#00a884] flex-shrink-0 ml-2 active:scale-90 transition-transform p-1">
                  <span className="material-symbols-outlined text-[20px]">my_location</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* To Input Area */}
        <div 
          className="flex flex-col justify-center px-4 py-2.5 min-h-[64px] transition-colors rounded-b-[20px] active:bg-gray-50/50 cursor-pointer"
          onClick={() => navigate('/search-station', { state: { type: 'destination', source, destination } })}
        >
          <div className="flex items-center w-full gap-3">
            {/* Red dot icon */}
            <div className="w-[18px] h-[18px] rounded-full border-[3px] border-[#ea4335] flex-shrink-0 relative mt-3">
              <div className="absolute inset-0 m-auto w-1.5 h-1.5 bg-[#ea4335] rounded-full"></div>
            </div>
            
            <div className="flex flex-col flex-1">
              <span className="text-[11px] font-bold text-[#ea4335] uppercase tracking-wider mb-0.5">To</span>
              <input
                type="text"
                placeholder="Select destination station..."
                value={destination}
                readOnly={true}
                className="w-full bg-transparent outline-none text-gray-800 text-[16px] placeholder:text-gray-400 pr-8 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Swap Button on divider */}
        <div 
          onClick={swap}
          className="absolute right-6 top-1/2 -translate-y-1/2 w-[34px] h-[34px] flex items-center justify-center cursor-pointer text-[#00a884] bg-white z-10 shadow-[0_2px_8px_rgba(0,0,0,0.12)] border border-gray-100 rounded-full active:scale-90 transition-transform"
        >
          <span className="material-symbols-outlined text-[18px] transform rotate-90 font-bold">swap_horiz</span>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 mb-2 px-2 text-center">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-2">
          <div className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      </div>

      {/* Decorative center logo to keep home page elegant */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 opacity-[0.25] select-none pointer-events-none mt-4 pb-28">
        <span className="material-symbols-outlined text-[80px] text-[#00a884]">subway</span>
        <span className="text-sm font-bold text-gray-400 mt-2 tracking-wider uppercase">Delhi Transit System</span>
      </div>

    </div>
  );
}
