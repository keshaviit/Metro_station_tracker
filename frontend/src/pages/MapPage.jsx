import { useState, useEffect } from 'react';
import { metroAPI } from '../services/api';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316',
};

// Map View controller to handle dynamic fitting and panning without continuous lag
function MapView({ stations, selectedLine, focusedStation }) {
  const map = useMap();
  
  // Fit bounds ONLY when the selected line filter changes
  useEffect(() => {
    if (stations.length > 0 && !focusedStation) {
      const bounds = stations.map(s => [s.lat, s.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [selectedLine, map]); // Do NOT re-run fitBounds on general station list filter (e.g. typing)

  // Smoothly center/zoom to focused station when selected from search
  useEffect(() => {
    if (focusedStation) {
      map.setView([focusedStation.lat, focusedStation.lng], 15, { animate: true, duration: 1 });
    }
  }, [focusedStation, map]);

  return null;
}

// Separate listener to capture map zoom changes dynamically
function MapZoomListener({ setZoom }) {
  const map = useMap();
  useEffect(() => {
    const handleZoom = () => {
      setZoom(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, setZoom]);
  return null;
}

export default function MapPage() {
  const [stations, setStations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedStation, setFocusedStation] = useState(null);
  const [zoom, setZoom] = useState(11);
  const [showAllLabels, setShowAllLabels] = useState(false);

  const lines = ['All', 'Blue', 'Yellow', 'Red', 'Green', 'Violet', 'Pink', 'Orange'];

  useEffect(() => {
    metroAPI.getAllStations().then((res) => {
      const allStations = res.data || [];
      setStations(allStations);

      // Construct lookups for connectivity track calculations
      const lookup = {};
      allStations.forEach((s) => {
        lookup[s.name] = s;
      });

      const drawnTracks = new Set();
      const tracks = [];

      allStations.forEach((s) => {
        if (s.connectedStations) {
          s.connectedStations.forEach((neighborName) => {
            const neighbor = lookup[neighborName];
            if (neighbor) {
              const trackKey = [s.name, neighbor.name].sort().join('--');
              if (!drawnTracks.has(trackKey)) {
                drawnTracks.add(trackKey);
                tracks.push({
                  from: [s.lat, s.lng],
                  to: [neighbor.lat, neighbor.lng],
                  line: s.line,
                  key: trackKey
                });
              }
            }
          });
        }
      });

      setConnections(tracks);
      setLoading(false);
    });
  }, []);

  // Filter stations based on selected line (typing will not trigger heavy re-renders on map bounds)
  const filteredStations = stations.filter((s) => {
    return selectedLine === 'All' || s.line === selectedLine;
  });

  const filteredConnections = connections.filter((c) => {
    return selectedLine === 'All' || c.line === selectedLine;
  });

  // Calculate top 8 case-insensitive search suggestions for high UI performance
  const suggestions = searchQuery.trim()
    ? stations
        .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div className="h-screen bg-[#0A0B10] flex flex-col relative pb-20 overflow-hidden">
      {/* Background light leak */}
      <div className="absolute top-1/4 left-1/4 w-[250px] h-[250px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Header Overlays */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-3 pointer-events-none mt-safe">
        {/* Floating HUD status indicator */}
        <div className="flex justify-between items-center pointer-events-auto">
          <div className="glass-card px-3 py-1.5 border border-white/5 bg-[#12141c]/50 backdrop-blur-md flex items-center gap-2 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10B981]" />
            <span className="text-[9px] font-bold text-white uppercase tracking-widest">GNSS SATELLITE CORE LOCKED</span>
          </div>
          <div className="glass-card px-3 py-1.5 border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-md flex items-center gap-1.5 shadow-lg">
            <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest">Ethereal Map</span>
          </div>
        </div>

        {/* Search Bar and Suggestions Dropdown */}
        <div className="relative pointer-events-auto w-full">
          <div className="glass-card px-4 py-3 border border-white/5 bg-[#12141c]/40 backdrop-blur-2xl flex items-center gap-3 shadow-2xl">
            <span className="text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search stations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-white text-xs placeholder-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="text-xs text-slate-500 hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete suggestion dropdown overlay */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto glass-card border border-white/10 bg-[#12141c]/95 backdrop-blur-3xl rounded-xl shadow-2xl z-[2000] p-1.5 scrollbar-thin">
              {suggestions.map((s) => (
                <button
                  key={s.name + s.line}
                  onClick={() => {
                    setFocusedStation(s);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-between border border-transparent hover:border-white/5"
                >
                  <span>{s.name}</span>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full border text-white font-black uppercase tracking-wider"
                    style={{ backgroundColor: LINE_COLORS[s.line], borderColor: LINE_COLORS[s.line], boxShadow: `0 0 5px ${LINE_COLORS[s.line]}` }}
                  >
                    {s.line}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line Filters and Label Toggle Row */}
        <div className="flex gap-2 items-center overflow-x-auto pb-2 scrollbar-hide pointer-events-auto">
          {/* Label Visibility Toggle */}
          <button
            onClick={() => setShowAllLabels(prev => !prev)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all shadow-md backdrop-blur-md ${
              showAllLabels
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-[#1A1D27]/50 border-white/5 text-slate-300 hover:border-white/10'
            }`}
          >
            🏷️ {showAllLabels ? 'Hide Labels' : 'Show Labels'}
          </button>

          {/* Separator Line */}
          <div className="w-[1px] h-4 bg-white/10 flex-shrink-0" />

          {/* Line Pill Buttons */}
          {lines.map((line) => (
            <button
              key={line}
              onClick={() => {
                setSelectedLine(line);
                setFocusedStation(null); // Clear focused station to fit bounds to the whole line
              }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all shadow-md backdrop-blur-md ${
                selectedLine === line
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-[#1A1D27]/50 border-white/5 text-slate-300 hover:border-white/10'
              }`}
              style={selectedLine === line && line !== 'All' ? { backgroundColor: LINE_COLORS[line], borderColor: LINE_COLORS[line], boxShadow: `0 0 10px ${LINE_COLORS[line]}` } : {}}
            >
              {line}
            </button>
          ))}
        </div>
      </div>

      {/* Map Legend Floating HUD (bottom left) */}
      <div className="absolute bottom-24 left-4 z-[1000] pointer-events-none">
        <div className="glass-card px-3 py-2 border border-white/5 bg-[#12141c]/70 backdrop-blur-md space-y-1.5 shadow-lg max-w-[120px] pointer-events-auto">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block border-b border-white/5 pb-1">Line Legend</span>
          <div className="space-y-1">
            {Object.entries(LINE_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1.5 text-[8px] text-slate-300 font-bold uppercase">
                <span className="w-1.5 h-1.5 rounded-full block" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center flex-1">
          <span className="flex gap-2"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></span>
        </div>
      ) : (
        <div className="flex-1 w-full h-full relative z-0">
          <MapContainer 
            center={[28.6139, 77.2090]} 
            zoom={11} 
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            />
            
            {/* Custom controllers */}
            <MapView 
              stations={filteredStations} 
              selectedLine={selectedLine} 
              focusedStation={focusedStation} 
            />
            <MapZoomListener setZoom={setZoom} />

            {/* Render connecting colored metro track polylines */}
            {filteredConnections.map((c) => (
              <Polyline
                key={c.key}
                positions={[c.from, c.to]}
                pathOptions={{
                  color: LINE_COLORS[c.line] || '#6366F1',
                  weight: 3.5,
                  opacity: 0.85
                }}
              />
            ))}

            {/* Render station CircleMarkers with permanent labels and popups */}
            {filteredStations.map((s) => {
              const isFocused = focusedStation?.name === s.name;
              // Tooltip logic: show labels if user toggled "Show All", or zoomed in >= 13, or if the station is interchange, or is focused
              const shouldShowTooltip = showAllLabels || zoom >= 13 || s.interchange || isFocused;

              return (
                <CircleMarker
                  key={s.id || s.name}
                  center={[s.lat, s.lng]}
                  radius={s.interchange ? 7 : 4.5}
                  pathOptions={{
                    color: isFocused ? '#F59E0B' : '#ffffff',
                    weight: isFocused ? 3.5 : 1.5,
                    fillColor: LINE_COLORS[s.line] || '#6366F1',
                    fillOpacity: 1
                  }}
                  eventHandlers={{
                    click: () => {
                      setFocusedStation(s);
                    }
                  }}
                >
                  {/* Dynamic text station labels based on zoom levels and options */}
                  {shouldShowTooltip && (
                    <Tooltip 
                      permanent 
                      direction="bottom" 
                      offset={[0, 8]} 
                      className="station-map-tooltip"
                    >
                      {s.name}
                    </Tooltip>
                  )}

                  {/* Touch popup details */}
                  <Popup className="metro-popup">
                    <div className="p-1 min-w-[120px]">
                      <p className="font-bold text-slate-200 m-0 text-sm">{s.name}</p>
                      <p className="text-xs text-slate-400 m-0 mt-1">{s.line} Line</p>
                      {s.interchange && (
                        <span className="inline-block mt-2 text-[9px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full font-bold border border-yellow-500/30">
                          Interchange Platform
                        </span>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {/* Focused Autocomplete Popup Overlay (renders directly at coordinate for direct search focus) */}
            {focusedStation && (
              <Popup 
                position={[focusedStation.lat, focusedStation.lng]}
                onClose={() => setFocusedStation(null)}
                className="metro-popup"
              >
                <div className="p-1 min-w-[120px]">
                  <p className="font-bold text-slate-200 m-0 text-sm">{focusedStation.name}</p>
                  <p className="text-xs text-slate-400 m-0 mt-1">{focusedStation.line} Line</p>
                  {focusedStation.interchange && (
                    <span className="inline-block mt-2 text-[9px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full font-bold border border-yellow-500/30">
                      Interchange Platform
                    </span>
                  )}
                </div>
              </Popup>
            )}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
