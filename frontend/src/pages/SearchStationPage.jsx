import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { searchStations } from '../services/searchService';

export default function SearchStationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const sourceInputRef = useRef(null);
  const destInputRef = useRef(null);

  // Read current fields passed in the router state
  const { type = 'source', source = '', destination = '' } = location.state || {};

  const [sourceQuery, setSourceQuery] = useState(source);
  const [destQuery, setDestQuery] = useState(destination);
  const [focusedField, setFocusedField] = useState(type); // 'source' or 'destination'
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
  }, []);

  // Focus the active input box
  useEffect(() => {
    if (focusedField === 'source' && sourceInputRef.current) {
      sourceInputRef.current.focus();
    } else if (focusedField === 'destination' && destInputRef.current) {
      destInputRef.current.focus();
    }
  }, [focusedField]);

  // Determine current active query for suggestions list filtering
  const activeQuery = focusedField === 'source' ? sourceQuery : destQuery;

  // Filter lists based on the active query
  const filteredStations = activeQuery.length > 0 
    ? searchStations(stationNames, activeQuery) 
    : stationNames;

  const recentToDisplay = recentStations.filter(s => 
    s.toLowerCase().includes(activeQuery.toLowerCase())
  );
  
  const othersToDisplay = filteredStations.filter(s => 
    !recentStations.includes(s)
  );

  // Handle back trigger, preserving existing fields
  const handleBack = () => {
    navigate('/', { state: { source: sourceQuery, destination: destQuery } });
  };

  // Handle station selection, setting it in active field and navigating back
  const handleSelect = (stationName) => {
    if (focusedField === 'source') {
      setSourceQuery(stationName);
      if (!destQuery) {
        setFocusedField('destination');
      } else if (destQuery !== stationName) {
        navigate('/', { state: { source: stationName, destination: destQuery } });
      }
    } else {
      setDestQuery(stationName);
      if (sourceQuery && sourceQuery !== stationName) {
        navigate('/', { state: { source: sourceQuery, destination: stationName } });
      } else if (!sourceQuery) {
        setFocusedField('source');
      }
    }
  };

  return (
    <div className="bg-white min-h-screen relative flex flex-col pt-safe">
      
      {/* Blue Banner Header */}
      <div className="bg-[#2f65c1] text-white pt-6 pb-4 px-5 relative overflow-hidden flex flex-col justify-between h-44 flex-shrink-0 shadow-md">
        {/* Top Header Row */}
        <div className="flex items-center justify-between z-10">
          <button 
            onClick={handleBack}
            className="w-10 h-10 -ml-2 flex items-center justify-center text-white hover:bg-white/10 rounded-full active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[24px]">arrow_back</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button className="bg-white text-[#2f65c1] font-bold text-xs px-4 py-1.5 rounded-full shadow-sm hover:bg-gray-50 active:scale-95 transition-all">
              My tickets
            </button>
            <button className="bg-white/20 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/30 active:scale-95 transition-all">
              <span className="material-symbols-outlined text-[18px]">help_outline</span>
            </button>
          </div>
        </div>

        {/* Bottom Header Row */}
        <div className="flex justify-between items-end z-10 mt-auto">
          {/* Train SVG Illustration */}
          <div className="w-40 h-16 relative flex items-end">
            <svg viewBox="0 0 160 64" className="w-full h-full">
              <line x1="0" y1="60" x2="160" y2="60" stroke="#ffffff" strokeWidth="2" opacity="0.3" />
              <path d="M10 50 L10 16 Q10 10 20 10 L140 10 Q150 10 150 16 L150 50 Z" fill="#ffffff" />
              <path d="M110 14 L144 14 Q148 14 148 18 L148 30 L110 30 Z" fill="#1f2937" />
              <rect x="18" y="14" width="22" height="16" fill="#1f2937" rx="2" />
              <rect x="48" y="14" width="22" height="16" fill="#1f2937" rx="2" />
              <rect x="78" y="14" width="22" height="16" fill="#1f2937" rx="2" />
              <rect x="14" y="32" width="12" height="18" fill="#3b82f6" />
              <rect x="68" y="32" width="12" height="18" fill="#3b82f6" />
              <rect x="122" y="32" width="12" height="18" fill="#3b82f6" />
              <rect x="25" y="50" width="16" height="6" fill="#4b5563" rx="1" />
              <rect x="115" y="50" width="16" height="6" fill="#4b5563" rx="1" />
              <circle cx="142" cy="38" r="2" fill="#fbbf24" />
              <circle cx="142" cy="44" r="2" fill="#fbbf24" />
              <rect x="10" y="47" width="140" height="2" fill="#f97316" />
            </svg>
          </div>

          {/* Promo Section */}
          <div className="flex flex-col items-end pb-1">
            <span className="text-[10px] text-white/90 font-medium">Get discount with</span>
            <div className="bg-white border border-dashed border-gray-300 text-gray-800 font-extrabold text-[13px] px-3 py-1 rounded-[4px] mt-0.5 shadow-sm tracking-wider">
              METRO20
            </div>
          </div>
        </div>
      </div>
      
      {/* T&C text */}
      <div className="flex justify-end px-5 pt-1">
        <span className="text-[9px] text-gray-400 font-medium">*T&C Apply</span>
      </div>

      {/* Select Metro Stations Title */}
      <div className="px-5 mt-4 flex-shrink-0">
        <h2 className="text-[18px] font-extrabold text-gray-800">Select metro stations</h2>
      </div>

      {/* Inputs Card Container */}
      <div className="px-5 mt-3 flex-shrink-0">
        <div className="bg-white border border-gray-200 rounded-[20px] shadow-sm p-4 flex gap-4 items-center relative">
          {/* Left Indicator Column */}
          <div className="flex flex-col items-center py-1 flex-shrink-0">
            <div className="w-[16px] h-[16px] rounded-full border-[3px] border-[#4CAF50] flex items-center justify-center relative">
              <div className="w-1.5 h-1.5 bg-[#4CAF50] rounded-full" />
            </div>
            <div className="w-0.5 h-7 border-l border-dashed border-gray-300 my-1.5" />
            <div className="w-[16px] h-[16px] rounded-full border-[3px] border-[#ea4335] flex items-center justify-center relative">
              <div className="w-1.5 h-1.5 bg-[#ea4335] rounded-full" />
            </div>
          </div>

          {/* Inputs Column */}
          <div className="flex-1 flex flex-col gap-3">
            <div className="flex items-center relative border-b border-gray-100 pb-2">
              <input
                ref={sourceInputRef}
                type="text"
                placeholder="From"
                value={sourceQuery}
                onChange={(e) => {
                  setSourceQuery(e.target.value);
                  setFocusedField('source');
                }}
                onFocus={() => setFocusedField('source')}
                className="w-full bg-transparent outline-none text-[15px] font-bold text-gray-800 placeholder:text-gray-400"
              />
              {focusedField === 'source' && sourceQuery && (
                <button 
                  onClick={() => setSourceQuery('')}
                  className="absolute right-0 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            <div className="flex items-center relative pt-1">
              <input
                ref={destInputRef}
                type="text"
                placeholder="To"
                value={destQuery}
                onChange={(e) => {
                  setDestQuery(e.target.value);
                  setFocusedField('destination');
                }}
                onFocus={() => setFocusedField('destination')}
                className="w-full bg-transparent outline-none text-[15px] font-bold text-gray-800 placeholder:text-gray-400"
              />
              {focusedField === 'destination' && destQuery && (
                <button 
                  onClick={() => setDestQuery('')}
                  className="absolute right-0 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suggestion list */}
      <main className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
        
        {/* Recent list */}
        {recentToDisplay.map((stationName) => (
          <div 
            key={`recent-${stationName}`}
            onClick={() => handleSelect(stationName)}
            className="flex items-center py-3.5 border-b border-gray-50 cursor-pointer active:bg-gray-50 transition-colors px-1"
          >
            <span className="material-symbols-outlined text-slate-400 mr-4 text-[22px]">history</span>
            <span className="text-gray-800 text-[15px] font-semibold">{stationName}</span>
          </div>
        ))}

        {/* Suggestions list */}
        {othersToDisplay.map((stationName) => (
          <div 
            key={`station-${stationName}`}
            onClick={() => handleSelect(stationName)}
            className="flex items-center py-3.5 border-b border-gray-50 cursor-pointer active:bg-gray-50 transition-colors px-1"
          >
            <span className="material-symbols-outlined text-slate-400 mr-4 text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
            <span className="text-gray-800 text-[15px] font-semibold">{stationName}</span>
          </div>
        ))}

        {/* Empty Search Result state */}
        {filteredStations.length === 0 && (
          <div className="py-12 text-center flex flex-col items-center justify-center opacity-60">
            <span className="material-symbols-outlined text-[48px] text-gray-300 mb-2">search_off</span>
            <p className="text-gray-400 text-sm font-medium">No stations match "{activeQuery}"</p>
          </div>
        )}

      </main>

    </div>
  );
}
