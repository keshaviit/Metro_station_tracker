import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { metroAPI } from '../services/api';
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316',
};

const LINE_DESTINATIONS = {
  Blue: { p1: 'Dwarka Sector 21', p2: 'Noida Electronic City' },
  Yellow: { p1: 'Samaypur Badli', p2: 'Millennium City Centre Gurugram' },
  Red: { p1: 'Rithala', p2: 'Shaheed Sthal' },
  Green: { p1: 'Inderlok', p2: 'Brigadier Hoshiar Singh' },
  Violet: { p1: 'Kashmere Gate', p2: 'Raja Nahar Singh' },
  Pink: { p1: 'Majlis Park', p2: 'Shiv Vihar' },
  Orange: { p1: 'New Delhi', p2: 'Yashobhoomi Dwarka Sector 25' }
};

// Map View controller to handle dynamic fitting and panning without continuous lag
function MapView({ stations, selectedLine, focusedStation }) {
  const map = useMap();
  
  useEffect(() => {
    if (stations.length > 0 && !focusedStation) {
      const bounds = stations.map(s => [s.lat, s.lng]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [selectedLine, map]);

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

// Floating controls inside Leaflet Map context
function MapControls({ onLocate }) {
  const map = useMap();
  return (
    <div className="absolute right-md top-24 flex flex-col gap-sm z-[1000] pointer-events-auto">
      <button 
        onClick={() => map.zoomIn()}
        className="w-12 h-12 rounded-xl bg-surface/90 backdrop-blur-md shadow-lg border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-90"
        title="Zoom In"
      >
        <span className="material-symbols-outlined">add</span>
      </button>
      <button 
        onClick={() => map.zoomOut()}
        className="w-12 h-12 rounded-xl bg-surface/90 backdrop-blur-md shadow-lg border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-90"
        title="Zoom Out"
      >
        <span className="material-symbols-outlined">remove</span>
      </button>
      <div className="h-px w-8 bg-outline-variant/50 mx-auto my-1"></div>
      <button 
        onClick={onLocate}
        className="w-12 h-12 rounded-xl bg-primary text-on-primary shadow-lg flex items-center justify-center hover:shadow-primary/20 transition-all active:scale-90 text-white"
        title="My Location"
      >
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>my_location</span>
      </button>
    </div>
  );
}

export default function MapPage() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedStation, setFocusedStation] = useState(null);
  const [zoom, setZoom] = useState(11);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [starredStations, setStarredStations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metro_favorites') || '[]');
    } catch (_) {
      return [];
    }
  });

  const [mapMode, setMapMode] = useState('schematic'); // 'schematic' | 'geographical'
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - panOffset.x, y: touch.clientY - panOffset.y });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPanOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => setZoomScale(s => Math.min(s + 0.3, 4.0));
  const handleZoomOut = () => setZoomScale(s => Math.max(s - 0.3, 0.5));
  const handleZoomReset = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const lines = ['All', 'Blue', 'Yellow', 'Red', 'Green', 'Violet', 'Pink', 'Orange'];

  useEffect(() => {
    metroAPI.getAllStations().then((res) => {
      const allStations = res.data || [];
      setStations(allStations);

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

  const filteredStations = stations.filter((s) => {
    return selectedLine === 'All' || s.line === selectedLine;
  });

  const filteredConnections = connections.filter((c) => {
    return selectedLine === 'All' || c.line === selectedLine;
  });

  const suggestions = searchQuery.trim()
    ? stations
        .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 8)
    : [];

  const handleLocateUser = () => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (stations.length > 0) {
          // Temporarily mock focused coordinates
          setFocusedStation({
            name: "Current Location",
            lat: coords.latitude,
            lng: coords.longitude,
            line: "User",
            platforms: []
          });
        }
      },
      () => alert("Location permission denied.")
    );
  };

  const toggleStarStation = (name) => {
    let nextStarred;
    if (starredStations.includes(name)) {
      nextStarred = starredStations.filter(n => n !== name);
    } else {
      nextStarred = [...starredStations, name];
    }
    setStarredStations(nextStarred);
    localStorage.setItem('metro_favorites', JSON.stringify(nextStarred));
  };

  const getPlatformsInfo = (station) => {
    if (!station || station.line === 'User') return null;
    const dests = LINE_DESTINATIONS[station.line] || { p1: 'Terminal Platform A', p2: 'Terminal Platform B' };
    return {
      p1Dest: dests.p1,
      p2Dest: dests.p2
    };
  };

  const platformInfo = getPlatformsInfo(focusedStation);

  return (
    <div className="h-screen bg-background text-on-background flex flex-col relative pb-20 overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[250px] h-[250px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Top Header App Bar */}
      <header className="fixed top-0 w-full z-[1000] bg-surface/80 backdrop-blur-md shadow-sm border-b border-outline-variant/30 flex items-center justify-between px-margin-mobile h-16 w-full mt-safe">
        <div className="flex items-center gap-md">
          <button onClick={() => navigate('/')} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-highest/50 transition-colors active:scale-95 duration-200" title="Back to Home">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight font-extrabold">MetroPulse</h1>
        </div>
        
        {/* Search Input overlay inside header */}
        <div className="relative w-48 md:w-64">
          <div className="bg-surface-container border border-outline-variant/50 rounded-xl px-3 py-2 flex items-center gap-sm">
            <span className="material-symbols-outlined text-[18px] text-outline">search</span>
            <input
              type="text"
              placeholder="Search stations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-on-surface placeholder:text-outline/70 focus:outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-xs text-outline hover:text-on-surface">✕</button>
            )}
          </div>

          {/* Autocomplete dropdown overlay */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-surface border border-outline-variant/30 rounded-xl shadow-2xl z-[2000] p-1.5 scrollbar-thin">
              {suggestions.map((s) => (
                <button
                  key={s.name + s.line}
                  onClick={() => {
                    setFocusedStation(s);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-primary/10 rounded-lg text-xs font-semibold text-on-surface transition-colors flex items-center justify-between"
                >
                  <span>{s.name}</span>
                  <span
                    className="text-[9px] px-2 py-0.5 rounded-full border text-white font-black uppercase tracking-wider"
                    style={{ backgroundColor: LINE_COLORS[s.line], borderColor: LINE_COLORS[s.line] }}
                  >
                    {s.line}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Map Canvas Area */}
      <main className="relative w-full h-full pt-16 z-0" id="map-container">
        {/* Map Mode Selector */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] flex bg-surface-container/90 backdrop-blur-md border border-outline-variant/30 p-1 rounded-full shadow-lg pointer-events-auto">
          <button
            onClick={() => {
              setMapMode('schematic');
              handleZoomReset();
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              mapMode === 'schematic'
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">map</span>
            Schematic Map
          </button>
          <button
            onClick={() => setMapMode('geographical')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              mapMode === 'geographical'
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">location_on</span>
            Geographic Map
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-full">
            <span className="flex gap-2"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></span>
          </div>
        ) : mapMode === 'schematic' ? (
          /* Interactive Zoomable Schematic Map (Offline Ready) */
          <div 
            className="map-viewport w-full h-full relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="map-zoom-content"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <img 
                src="/delhi_metro_map.svg" 
                alt="Official Delhi Metro Route Map" 
                className="max-w-none max-h-none h-[88%] pointer-events-none select-none"
                style={{
                  objectFit: 'contain'
                }}
              />
            </div>
            
            {/* Floating Zoom controls specifically for Schematic Map */}
            <div className="absolute right-md bottom-24 flex flex-col gap-sm z-[1000] pointer-events-auto">
              <button 
                onClick={handleZoomIn}
                className="w-12 h-12 rounded-xl bg-surface/90 backdrop-blur-md shadow-lg border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-90"
                title="Zoom In"
              >
                <span className="material-symbols-outlined">add</span>
              </button>
              <button 
                onClick={handleZoomOut}
                className="w-12 h-12 rounded-xl bg-surface/90 backdrop-blur-md shadow-lg border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-all active:scale-90"
                title="Zoom Out"
              >
                <span className="material-symbols-outlined">remove</span>
              </button>
              <div className="h-px w-8 bg-outline-variant/50 mx-auto my-1"></div>
              <button 
                onClick={handleZoomReset}
                className="w-12 h-12 rounded-xl bg-primary text-white shadow-lg flex items-center justify-center hover:shadow-primary/20 transition-all active:scale-90 font-bold text-[10px] uppercase tracking-wider"
                title="Reset Zoom"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          /* Geographical Leaflet Map */
          <MapContainer 
            center={[28.6139, 77.2090]} 
            zoom={11} 
            style={{ width: '100%', height: '100%' }}
            zoomControl={false}
          >
            {/* Dark/Light tile layers resolved via CSS variables filters */}
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
            />
            
            {/* Dynamic Map controllers */}
            <MapView 
              stations={filteredStations} 
              selectedLine={selectedLine} 
              focusedStation={focusedStation} 
            />
            <MapZoomListener setZoom={setZoom} />
            <MapControls onLocate={handleLocateUser} />

            {/* Render connecting metro tracks */}
            {filteredConnections.map((c) => (
              <Polyline
                key={c.key}
                positions={[c.from, c.to]}
                pathOptions={{
                  color: LINE_COLORS[c.line] || '#6366F1',
                  weight: 4,
                  opacity: 0.9
                }}
              />
            ))}

            {/* Render station CircleMarkers */}
            {filteredStations.map((s) => {
              const isFocused = focusedStation?.name === s.name;
              const shouldShowTooltip = showAllLabels || zoom >= 13 || s.interchange || isFocused;

              return (
                <CircleMarker
                  key={s.id || s.name}
                  center={[s.lat, s.lng]}
                  radius={s.interchange ? 7 : 5}
                  pathOptions={{
                    color: isFocused ? '#4648d4' : '#1b1b23',
                    weight: isFocused ? 3 : 1.5,
                    fillColor: LINE_COLORS[s.line] || '#6366F1',
                    fillOpacity: 1
                  }}
                  eventHandlers={{
                    click: () => {
                      setFocusedStation(s);
                    }
                  }}
                >
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
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}

        {/* Floating Category Filters on Map Canvas - Only display when geographic map is active to avoid overlap */}
        {mapMode === 'geographical' && (
          <div className="absolute left-md top-32 flex gap-xs items-center overflow-x-auto pb-2 scrollbar-hide pointer-events-auto z-[1000] w-[calc(100%-120px)] mt-safe">
            <button
              onClick={() => setShowAllLabels(prev => !prev)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                showAllLabels
                  ? 'bg-primary border-primary text-white'
                  : 'bg-surface/90 border-outline-variant/30 text-on-surface'
              }`}
            >
              🏷️ Labels: {showAllLabels ? 'ON' : 'OFF'}
            </button>

            <div className="w-[1px] h-4 bg-outline-variant/30 flex-shrink-0" />

            {lines.map((line) => (
              <button
                key={line}
                onClick={() => {
                  setSelectedLine(line);
                  setFocusedStation(null);
                }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                  selectedLine === line
                    ? 'bg-primary border-primary text-white font-black'
                    : 'bg-surface/90 border-outline-variant/30 text-on-surface'
                }`}
                style={selectedLine === line && line !== 'All' ? { backgroundColor: LINE_COLORS[line], borderColor: LINE_COLORS[line], color: '#fff' } : {}}
              >
                {line}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Material 3 Bottom Sheet Station Details */}
      {focusedStation && focusedStation.line !== 'User' && (
        <div className="bottom-sheet fixed bottom-20 left-0 w-full bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.08)] rounded-t-[32px] z-[1000] border-t border-outline-variant/20">
          {/* Handlebar */}
          <div className="w-full flex justify-center py-4 cursor-pointer" onClick={() => setFocusedStation(null)}>
            <div className="w-12 h-1.5 bg-outline-variant rounded-full"></div>
          </div>
          <div className="px-margin-mobile pb-10">
            {/* Header Info */}
            <div className="flex justify-between items-start mb-lg">
              <div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-extrabold">{focusedStation.name}</h2>
                <div className="flex gap-xs mt-xs">
                  <span 
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                    style={{ backgroundColor: LINE_COLORS[focusedStation.line] }}
                  >
                    {focusedStation.line} Line
                  </span>
                  {focusedStation.interchange && (
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-primary text-[10px] font-bold uppercase tracking-wider border border-outline-variant/30">
                      🔄 Interchange
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="font-label-md text-label-md text-on-surface-variant block uppercase font-bold">Status</span>
                <span className="text-emerald-600 font-bold flex items-center justify-end gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Normal
                </span>
              </div>
            </div>

            {/* Platform & Trains Predicted Timings */}
            {platformInfo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-xl">
                {/* Platform 1 */}
                <div className="p-md rounded-2xl bg-surface-container-low border border-outline-variant/20">
                  <div className="flex justify-between items-center mb-sm">
                    <span className="font-title-md text-title-md text-on-surface font-extrabold">Platform 1</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Towards {platformInfo.p1Dest}</span>
                  </div>
                  <div className="space-y-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-body-lg text-body-lg font-medium text-on-surface">In 2 mins</span>
                      <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">Arriving</span>
                    </div>
                    <div className="flex justify-between items-center opacity-60">
                      <span className="font-body-lg text-body-lg text-on-surface">In 8 mins</span>
                      <span className="text-xs text-on-surface-variant font-bold">Scheduled</span>
                    </div>
                  </div>
                </div>
                {/* Platform 2 */}
                <div className="p-md rounded-2xl bg-surface-container-low border border-outline-variant/20">
                  <div className="flex justify-between items-center mb-sm">
                    <span className="font-title-md text-title-md text-on-surface font-extrabold">Platform 2</span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Towards {platformInfo.p2Dest}</span>
                  </div>
                  <div className="space-y-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-body-lg text-body-lg font-medium text-on-surface">In 5 mins</span>
                      <span className="px-2 py-1 rounded-lg bg-outline-variant/30 text-on-surface-variant text-xs font-bold">Delayed 1m</span>
                    </div>
                    <div className="flex justify-between items-center opacity-60">
                      <span className="font-body-lg text-body-lg text-on-surface">In 12 mins</span>
                      <span className="text-xs text-on-surface-variant font-bold">Scheduled</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Sheet Action Controls */}
            <div className="flex gap-md">
              <button 
                onClick={() => {
                  navigate('/', { state: { prefilledSource: focusedStation.name } });
                }}
                className="flex-1 h-14 bg-primary text-on-primary rounded-xl font-title-md text-title-md shadow-lg shadow-primary/20 flex items-center justify-center gap-sm active:scale-[0.98] transition-all font-bold"
              >
                <span className="material-symbols-outlined">directions</span>
                Get Directions
              </button>
              
              <button 
                onClick={() => toggleStarStation(focusedStation.name)}
                className={`w-14 h-14 rounded-xl flex items-center justify-center active:scale-[0.98] transition-all border ${
                  starredStations.includes(focusedStation.name)
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-secondary-container text-on-secondary-container border-outline-variant/20'
                }`}
                title="Favorite Station"
              >
                <span 
                  className="material-symbols-outlined text-[24px]"
                  style={{ fontVariationSettings: starredStations.includes(focusedStation.name) ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
