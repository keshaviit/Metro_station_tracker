import { useState, useEffect } from 'react';
import { metroAPI } from '../services/api';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316',
};

function MapView({ stations }) {
  const map = useMap();
  useEffect(() => {
    if (stations.length > 0) {
      const bounds = stations.map(s => [s.lat, s.lng]);
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
    }
  }, [stations, map]);
  return null;
}

export default function MapPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLine, setSelectedLine] = useState('All');

  const lines = ['All', 'Blue', 'Yellow', 'Red', 'Green', 'Violet', 'Pink', 'Orange'];

  useEffect(() => {
    metroAPI.getAllStations().then((res) => {
      setStations(res.data || []);
      setLoading(false);
    });
  }, []);

  const filtered = selectedLine === 'All' ? stations : stations.filter((s) => s.line === selectedLine);

  return (
    <div className="h-screen bg-gradient-metro flex flex-col relative pb-20">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-4 bg-gradient-to-b from-[#0F1117] to-transparent pointer-events-none">
        <div className="mb-4 animate-fade-in pointer-events-auto mt-safe">
          <h1 className="text-2xl font-black text-white mb-1 drop-shadow-md">Station Map</h1>
          <p className="text-slate-300 text-sm drop-shadow-md">All Delhi Metro stations</p>
        </div>

        {/* Line Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide pointer-events-auto">
          {lines.map((line) => (
            <button
              key={line}
              onClick={() => setSelectedLine(line)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shadow-md ${
                selectedLine === line
                  ? 'bg-metro-accent border-metro-accent text-white'
                  : 'bg-[#1A1D27]/80 border-metro-border text-slate-300 hover:border-metro-accent/50 backdrop-blur-md'
              }`}
              style={selectedLine === line && line !== 'All' ? { backgroundColor: LINE_COLORS[line], borderColor: LINE_COLORS[line] } : {}}
            >
              {line}
            </button>
          ))}
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
            <MapView stations={filtered} />
            {filtered.map((s) => (
              <CircleMarker
                key={s.id || s.name}
                center={[s.lat, s.lng]}
                radius={s.interchange ? 7 : 5}
                pathOptions={{
                  color: '#ffffff',
                  weight: 1.5,
                  fillColor: LINE_COLORS[s.line] || '#6366F1',
                  fillOpacity: 1
                }}
              >
                <Popup className="metro-popup">
                  <div className="p-1 min-w-[120px]">
                    <p className="font-bold text-gray-900 m-0 text-sm">{s.name}</p>
                    <p className="text-xs text-gray-600 m-0 mt-1">{s.line} Line</p>
                    {s.interchange && <span className="inline-block mt-2 text-[10px] px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-semibold border border-yellow-200">Interchange</span>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
