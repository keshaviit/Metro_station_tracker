import { useNavigate } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';
import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Train, ArrowLeftRight, Navigation2, ChevronRight } from 'lucide-react';

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316',
};

const LINE_BG = {
  Blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Red: 'bg-red-500/20 text-red-400 border-red-500/30',
  Green: 'bg-green-500/20 text-green-400 border-green-500/30',
  Violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  Pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

export default function RouteResultPage() {
  const { state, dispatch, joinTrip } = useMetro();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [activeTab, setActiveTab] = useState('shortest'); // 'shortest' | 'minInterchanges' | 'shortestDistance' | 'lessCongested'

  const routes = state.route;

  useEffect(() => {
    if (!routes) {
      navigate('/');
    }
  }, [routes, navigate]);

  // Handle all possible nesting structures (raw Axios body vs unpacked vs flat fallback)
  let shortest = null;
  let minInterchanges = null;
  let shortestDistance = null;
  let lessCongested = null;

  if (routes) {
    if (routes.shortest) {
      shortest = routes.shortest;
      minInterchanges = routes.minInterchanges;
      shortestDistance = routes.shortestDistance;
      lessCongested = routes.lessCongested;
    } else if (routes.data && routes.data.shortest) {
      shortest = routes.data.shortest;
      minInterchanges = routes.data.minInterchanges;
      shortestDistance = routes.data.shortestDistance;
      lessCongested = routes.data.lessCongested;
    }
  }

  const activeRoute = shortest 
    ? (activeTab === 'shortest' ? shortest 
       : activeTab === 'minInterchanges' ? minInterchanges 
       : activeTab === 'shortestDistance' ? shortestDistance 
       : lessCongested) 
    : routes;

  const { path = [], totalStations = 0, interchanges = [], estimatedTime = 0, distanceKm = 0, stationDetails = [] } = activeRoute || {};

  if (!routes || !path || path.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-metro flex flex-col items-center justify-center p-4">
        <div className="glass-card p-6 max-w-sm w-full text-center space-y-4 animate-scale-up">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-400 text-2xl animate-pulse">
            ⚠️
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white">No Route Available</h2>
            <p className="text-xs text-slate-300">
              We couldn't construct a route path for the selected stations, or your session has timed out.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full btn-gradient text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back to Home
          </button>
        </div>
      </div>
    );
  }

  const displayStations = (stationDetails && stationDetails.length > 0)
    ? stationDetails
    : path.map((name) => ({ name }));

  const handleStartTrip = async () => {
    setStarting(true);
    try {
      const res = await metroAPI.startTrip({ source: path[0], destination: path[path.length - 1] });
      const tripId = res.data.tripId;
      dispatch({ type: 'SET_TRIP_ID', payload: tripId });
      // Join the socket room so we receive real-time prediction events from the server
      joinTrip(tripId);
      // Set the activeRoute as the primary active route path for tracking
      dispatch({ type: 'SET_ROUTE', payload: { ...activeRoute, strategy: activeTab } });
      navigate('/track');
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-metro pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-metro-dark/95 backdrop-blur-sm border-b border-metro-border px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-metro-card hover:bg-metro-border transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-bold text-white text-base">Route Details</h1>
            <p className="text-xs text-slate-400">{path[0]} → {path[path.length - 1]}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4 animate-fade-in">
        {/* Tab Selector */}
        {shortest && minInterchanges && (
          <div className="grid grid-cols-2 gap-2 bg-metro-card/50 border border-metro-border p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab('shortest')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortest'
                  ? 'bg-metro-accent text-white shadow-lg shadow-metro-accent/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-metro-card/40'
              }`}
            >
              🚀 Fewest Stations
            </button>
            <button
              onClick={() => setActiveTab('minInterchanges')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'minInterchanges'
                  ? 'bg-metro-accent text-white shadow-lg shadow-metro-accent/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-metro-card/40'
              }`}
            >
              🔄 Fewest Transfers
            </button>
            <button
              onClick={() => setActiveTab('shortestDistance')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortestDistance'
                  ? 'bg-metro-accent text-white shadow-lg shadow-metro-accent/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-metro-card/40'
              }`}
            >
              📍 Shortest Distance
            </button>
            <button
              onClick={() => setActiveTab('lessCongested')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'lessCongested'
                  ? 'bg-metro-accent text-white shadow-lg shadow-metro-accent/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-metro-card/40'
              }`}
            >
              🟢 Less Congested
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          <div className="glass-card p-2.5 text-center">
            <Train className="w-4 h-4 text-metro-accent mx-auto mb-1 animate-pulse" />
            <div className="font-bold text-white text-base">{totalStations}</div>
            <div className="text-[10px] text-slate-400">Stations</div>
          </div>
          <div className="glass-card p-2.5 text-center">
            <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
            <div className="font-bold text-white text-base">{estimatedTime}</div>
            <div className="text-[10px] text-slate-400">Minutes</div>
          </div>
          <div className="glass-card p-2.5 text-center">
            <ArrowLeftRight className="w-4 h-4 text-pink-400 mx-auto mb-1" />
            <div className="font-bold text-white text-base">{interchanges.length}</div>
            <div className="text-[10px] text-slate-400">Changes</div>
          </div>
          <div className="glass-card p-2.5 text-center">
            <span className="block text-sm mb-1">📍</span>
            <div className="font-bold text-white text-base">{distanceKm}</div>
            <div className="text-[10px] text-slate-400">Distance (km)</div>
          </div>
        </div>

        {/* Interchange alert */}
        {interchanges.length > 0 && (
          <div className="glass-card p-4 border-l-4 border-yellow-400">
            <p className="text-xs font-semibold text-yellow-400 mb-1">⚡ Interchange Required</p>
            <p className="text-sm text-slate-300">Change at: <span className="font-semibold text-white">{interchanges.join(', ')}</span></p>
          </div>
        )}

        {/* Interchange details checklist */}
        {interchanges.length > 0 && (
          <div className="glass-card p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🗺️ Interchange Transit Hubs</h3>
            <div className="grid grid-cols-2 gap-2">
              {interchanges.map((name) => (
                <div key={name} className="bg-metro-card border border-metro-border p-2.5 rounded-xl flex items-center gap-2.5 hover:border-metro-accent/30 transition-all">
                  <span className="text-base animate-pulse">🔄</span>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">{name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Transfer Hub</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Route Timeline */}
        <div className="glass-card p-4">
          <h2 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Route Timeline</h2>
          <div className="relative">
            {displayStations.map((station, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === path.length - 1;
              const isInterchange = interchanges.includes(station.name);
              const lineColor = LINE_COLORS[station.line] || '#6366F1';

              return (
                <div key={station.name + idx} className="flex gap-4 mb-0 animate-fade-in">
                  {/* Timeline dot & line */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 z-10 border-2 border-white/20"
                      style={{ backgroundColor: lineColor, marginTop: 14 }}
                    />
                    {!isLast && (
                      <div className="w-0.5 flex-1 mt-0.5" style={{ backgroundColor: lineColor, opacity: 0.4, minHeight: 32 }} />
                    )}
                  </div>

                  {/* Station info */}
                  <div className="pb-6 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-${isFirst || isLast ? 'bold text-white' : 'medium text-slate-200'} text-sm`}>
                        {station.name}
                      </span>
                      {station.line && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${LINE_BG[station.line] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {station.line}
                        </span>
                      )}
                      {station.congestion && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${station.congestion.colorClass}`}>
                          👥 {station.congestion.label}
                        </span>
                      )}
                      {isInterchange && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                          ↔ Change here
                        </span>
                      )}
                      {isFirst && <span className="text-xs text-metro-accent">Start</span>}
                      {isLast && <span className="text-xs text-green-400">Destination</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Start Trip CTA */}
        <button
          id="start-trip-btn"
          onClick={handleStartTrip}
          disabled={starting}
          className="w-full btn-gradient text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          <Navigation2 className="w-4 h-4" />
          {starting ? 'Starting...' : 'Start Live Tracking'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
