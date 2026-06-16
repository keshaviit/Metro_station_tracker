import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { searchStations } from '../services/searchService';

export default function SearchStationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);

  // Read current fields passed in the router state
  const { type = 'source', source = '', destination = '' } = location.state || {};

  const [query, setQuery] = useState('');
  const [stationNames, setStationNames] = useState([]);
  const [recentStations, setRecentStations] = useState([]);

  // Load stations and recent selections from local cache
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
      setStationNames(cached.map(s => s.name));
    } catch (e) {
      console.error('Failed to parse station cache:', e);
    }

    try {
      const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
      const recent = new Set();
      queue.forEach(trip => {
        if (trip.source) recent.add(trip.source);
        if (trip.destination) recent.add(trip.destination);
      });
      setRecentStations(Array.from(recent).slice(0, 5));
    } catch (e) {
      console.error('Failed to parse recent history:', e);
    }

    // Auto-focus the input box on mount
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Filter lists based on user search query
  const filteredStations = query.length > 0 
    ? searchStations(stationNames, query) 
    : stationNames;

  const recentToDisplay = recentStations.filter(s => 
    s.toLowerCase().includes(query.toLowerCase())
  );
  
  const othersToDisplay = filteredStations.filter(s => 
    !recentStations.includes(s)
  );

  // Handle back trigger, preserving existing fields
  const handleBack = () => {
    navigate('/', { state: { source, destination } });
  };

  // Handle station selection, setting it in active field and navigating back
  const handleSelect = (stationName) => {
    const updatedSource = type === 'source' ? stationName : source;
    const updatedDestination = type === 'destination' ? stationName : destination;

    navigate('/', { 
      state: { 
        source: updatedSource, 
        destination: updatedDestination 
      } 
    });
  };

  return (
    <div className="bg-gradient-to-b from-[#eefaf7] via-[#fcf8ff] to-[#f4f7fc] min-h-screen relative flex flex-col pt-safe">
      
      {/* Header Search Bar Area */}
      <header className="px-5 py-4 flex-shrink-0">
        <div className="bg-white border border-gray-100 rounded-2xl h-14 px-3 flex items-center shadow-[0_4px_20px_rgba(0,0,0,0.02)] relative">
          
          {/* Back Action */}
          <button 
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-50 active:scale-90 transition-transform"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={type === 'source' ? 'Select starting station...' : 'Select destination station...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none pl-2 pr-8 text-gray-800 text-[16px] placeholder:text-gray-400 h-full"
          />

          {/* Quick Clear */}
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="absolute right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50 active:scale-90 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}

        </div>
      </header>

      {/* Suggestion list */}
      <main className="flex-1 overflow-y-auto px-6 pb-6">
        
        {/* Recent Searches Header */}
        {recentToDisplay.length > 0 && (
          <div className="mb-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider ml-1">Recent Stations</span>
          </div>
        )}

        {/* Recent list */}
        {recentToDisplay.map((stationName) => (
          <div 
            key={`recent-${stationName}`}
            onClick={() => handleSelect(stationName)}
            className="flex items-center py-4 border-b border-gray-50 cursor-pointer active:bg-white/40 transition-colors rounded-xl px-2"
          >
            <span className="material-symbols-outlined text-gray-400 mr-4 text-[22px]">history</span>
            <span className="text-gray-800 text-[15px] font-medium">{stationName}</span>
          </div>
        ))}

        {/* Other Stations Header */}
        {othersToDisplay.length > 0 && (
          <div className="mt-4 mb-2">
            <span className="text-[11px] font-bold text-[#00a884] uppercase tracking-wider ml-1">All Stations</span>
          </div>
        )}

        {/* Suggestions list */}
        {othersToDisplay.map((stationName) => (
          <div 
            key={`station-${stationName}`}
            onClick={() => handleSelect(stationName)}
            className="flex items-center py-4 border-b border-gray-50 cursor-pointer active:bg-white/40 transition-colors rounded-xl px-2"
          >
            <span className="material-symbols-outlined text-[#00a884] mr-4 text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
            <span className="text-gray-800 text-[15px] font-medium">{stationName}</span>
          </div>
        ))}

        {/* Empty Search Result state */}
        {filteredStations.length === 0 && (
          <div className="py-12 text-center flex flex-col items-center justify-center opacity-60">
            <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">search_off</span>
            <p className="text-gray-400 text-sm font-medium">No stations match "{query}"</p>
          </div>
        )}

      </main>

    </div>
  );
}
