import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { metroAPI } from '../services/api';
import { searchStations } from '../services/searchService';


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

export default function MapPage() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedStation, setFocusedStation] = useState(null);
  
  // Transform values stored in REFS to bypass React render cycle during drags (yielding 60 FPS)
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const zoomScaleRef = useRef(1);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [svgContent, setSvgContent] = useState('');

  // Pinch-to-zoom state variables
  const [isPinching, setIsPinching] = useState(false);
  const [startPinchDist, setStartPinchDist] = useState(0);
  const [startScale, setStartScale] = useState(1);

  // DOM Refs
  const viewportRef = useRef(null);
  const svgContainerRef = useRef(null);
  const mapContentRef = useRef(null);

  const [starredStations, setStarredStations] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('metro_favorites') || '[]');
    } catch (_) {
      return [];
    }
  });

  // Direct DOM style applier
  const applyTransform = useCallback(() => {
    if (mapContentRef.current) {
      mapContentRef.current.style.transform = `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px) scale(${zoomScaleRef.current})`;
    }
  }, []);

  // Mouse drag gestures
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    panOffsetRef.current = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };
    applyTransform();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag & pinch-to-zoom gestures
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setIsPinching(false);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - panOffsetRef.current.x, y: touch.clientY - panOffsetRef.current.y });
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      setIsPinching(true);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      setStartPinchDist(dist);
      setStartScale(zoomScaleRef.current);
    }
  };

  const handleTouchMove = (e) => {
    if (isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      panOffsetRef.current = {
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      };
      applyTransform();
    } else if (isPinching && e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      if (startPinchDist > 0) {
        const factor = dist / startPinchDist;
        zoomScaleRef.current = Math.max(0.5, Math.min(4.0, startScale * factor));
        applyTransform();
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
  };

  // Zoom controls
  const handleZoomIn = () => {
    zoomScaleRef.current = Math.min(zoomScaleRef.current + 0.3, 4.0);
    applyTransform();
  };

  const handleZoomOut = () => {
    zoomScaleRef.current = Math.max(zoomScaleRef.current - 0.3, 0.5);
    applyTransform();
  };

  const handleZoomReset = () => {
    zoomScaleRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
    applyTransform();
  };

  // Fetch stations and load schematic map SVG
  useEffect(() => {
    setLoading(true);
    
    metroAPI.getAllStations()
      .then((res) => {
        setStations(res.data || []);
      })
      .catch((err) => {
        console.warn("Offline fallback for stations cache:", err);
        const cached = JSON.parse(localStorage.getItem('metro_stations_cache') || '[]');
        setStations(cached);
      });

    fetch('/delhi_metro_map.svg')
      .then(res => {
        if (!res.ok) throw new Error("SVG map could not be fetched.");
        return res.text();
      })
      .then(text => {
        setSvgContent(text);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load SVG map:", err);
        setLoading(false);
      });
  }, []);

  // Station search centering & highlight engine
  const centerOnStation = useCallback((stationName) => {
    if (!svgContainerRef.current || !viewportRef.current) return;
    const svgEl = svgContainerRef.current.querySelector('svg');
    if (!svgEl) return;

    // Search for tspan or text elements containing station name
    const elements = svgEl.querySelectorAll('tspan, text');
    const cleanStr = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = cleanStr(stationName);

    let matchedEl = null;
    // 1. Exact match
    for (const el of elements) {
      if (cleanStr(el.textContent) === target) {
        matchedEl = el;
        break;
      }
    }
    // 2. Substring match fallback
    if (!matchedEl) {
      for (const el of elements) {
        const text = cleanStr(el.textContent);
        if (text.includes(target) || target.includes(text)) {
          matchedEl = el;
          break;
        }
      }
    }

    if (matchedEl) {
      // Clear previous highlights
      const highlighted = svgEl.querySelectorAll('.station-highlight');
      highlighted.forEach(el => {
        el.style.fill = '';
        el.style.fontWeight = '';
        el.style.fontSize = '';
        el.classList.remove('station-highlight');
      });

      // Highlight target station in premium bright pink
      matchedEl.style.fill = '#EC4899';
      matchedEl.style.fontWeight = 'bold';
      matchedEl.classList.add('station-highlight');
      
      const parentText = matchedEl.closest('text');
      if (parentText) {
        parentText.style.fill = '#EC4899';
        parentText.style.fontWeight = 'bold';
        parentText.style.fontSize = '24px';
        parentText.classList.add('station-highlight');
      }

      // Extract coordinates relative to the unscaled SVG canvas
      const svgWidth = parseFloat(svgEl.getAttribute('width')) || 3863.9;
      const svgHeight = parseFloat(svgEl.getAttribute('height')) || 2932.7;

      let elementX = 0;
      let elementY = 0;

      try {
        const bbox = matchedEl.getBBox();
        elementX = bbox.x + bbox.width / 2;
        elementY = bbox.y + bbox.height / 2;
      } catch (e) {
        const xAttr = matchedEl.getAttribute('x') || parentText?.getAttribute('x');
        const yAttr = matchedEl.getAttribute('y') || parentText?.getAttribute('y');
        elementX = xAttr ? parseFloat(xAttr) : svgWidth / 2;
        elementY = yAttr ? parseFloat(yAttr) : svgHeight / 2;
      }

      // Add parent text transformations (translate / matrix support)
      if (parentText) {
        const transform = parentText.getAttribute('transform');
        if (transform) {
          const translateMatch = transform.match(/translate\(([-\d.]+)\s*[, ]\s*([-\d.]+)\)/) || transform.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
          if (translateMatch) {
            elementX += parseFloat(translateMatch[1]);
            elementY += parseFloat(translateMatch[2]);
          } else {
            const matrixMatch = transform.match(/matrix\(([-\d.]+)\s*[, ]\s*([-\d.]+)\s*[, ]\s*([-\d.]+)\s*[, ]\s*([-\d.]+)\s*[, ]\s*([-\d.]+)\s*[, ]\s*([-\d.]+)\)/)
                             || transform.match(/matrix\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/);
            if (matrixMatch) {
              elementX += parseFloat(matrixMatch[5]);
              elementY += parseFloat(matrixMatch[6]);
            }
          }
        }
      }

      const targetScale = 1.8; // Zoom scale for high readability

      // Relative coordinates of station on the unscaled SVG:
      const relX = elementX - svgWidth / 2;
      const relY = elementY - svgHeight / 2;

      // Adjust panOffset to center coordinates in the viewport
      const newPanX = - relX * targetScale;
      const newPanY = - relY * targetScale;

      zoomScaleRef.current = targetScale;
      panOffsetRef.current = { x: newPanX, y: newPanY };
      applyTransform();
    }
  }, [applyTransform]);

  // Listen for focusedStation state changes to automatically center
  useEffect(() => {
    if (focusedStation) {
      const timer = setTimeout(() => {
        centerOnStation(focusedStation.name);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [focusedStation, centerOnStation]);

  // Unified fuzzy station autocomplete search suggestions
  const suggestions = searchQuery.trim()
    ? searchStations(stations, searchQuery).slice(0, 8)
    : [];

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
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <span className="flex gap-2"><span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/></span>
          </div>
        ) : (
          /* Interactive Zoomable Schematic Map (Offline Ready, No Heavy Leaflet) */
          <div 
            ref={viewportRef}
            className="map-viewport w-full h-full relative overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              ref={mapContentRef}
              className="map-zoom-content"
              style={{
                transform: `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px) scale(${zoomScaleRef.current})`,
                transformOrigin: 'center center',
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {svgContent ? (
                <div 
                  ref={svgContainerRef}
                  dangerouslySetInnerHTML={{ __html: svgContent }} 
                  className="h-[88%] w-auto flex items-center justify-center svg-map-container"
                  style={{
                    pointerEvents: 'none',
                    userSelect: 'none'
                  }}
                />
              ) : (
                <div className="text-xs text-on-surface-variant">Failed to load Map canvas.</div>
              )}
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
            <div className="space-y-3">
              <div className="flex gap-md">
                <button 
                  onClick={() => {
                    navigate('/', { state: { prefilledSource: focusedStation.name } });
                  }}
                  className="flex-1 h-14 bg-[#00b050] hover:bg-[#009940] text-white rounded-full font-title-md text-title-md shadow-lg shadow-primary/20 flex items-center justify-between px-4 active:scale-[0.98] transition-all font-bold text-white-force uppercase tracking-wider"
                >
                  <div className="w-8 flex items-center justify-start flex-shrink-0">
                    <span className="material-symbols-outlined text-white-force">directions</span>
                  </div>
                  <span className="flex-1 text-center truncate px-1">GET DIRECTIONS</span>
                  <div className="w-8 flex items-center justify-end flex-shrink-0">
                    <span className="font-bold text-[16px] text-white-force">&gt;</span>
                  </div>
                </button>
                
                <button 
                  onClick={() => toggleStarStation(focusedStation.name)}
                  className={`w-14 h-14 rounded-full flex items-center justify-center active:scale-[0.98] transition-all border ${
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
        </div>
      )}
    </div>
  );
}
