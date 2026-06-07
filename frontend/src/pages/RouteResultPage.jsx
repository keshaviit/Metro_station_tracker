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

  const isOffline = routes?.isOfflineCalculated || routes?.data?.isOfflineCalculated;

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
      joinTrip(tripId);
      dispatch({ type: 'SET_ROUTE', payload: { ...activeRoute, strategy: activeTab } });
      navigate('/track');
    } catch (err) {
      console.warn('[RouteResult] Start trip API failed, running in Offline Local HUD mode:', err.message);
      
      // Offline fallback: generate local trip session
      const tripId = 'local-' + Date.now();
      dispatch({ type: 'SET_TRIP_ID', payload: tripId });
      dispatch({ type: 'SET_ROUTE', payload: { ...activeRoute, strategy: activeTab, isOfflineCalculated: true } });

      // Save to background sync queue
      try {
        const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
        queue.push({
          tripId,
          source: path[0],
          destination: path[path.length - 1],
          routePath: path,
          completed: false,
          startedAt: new Date().toISOString()
        });
        localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
      } catch (e) {
        console.error('Failed to append to offline queue:', e);
      }

      navigate('/track');
    } finally {
      setStarting(false);
    }
  };

  // Compute average congestion index for telemetry display
  const congestionValues = { Low: 25, Medium: 55, High: 85 };
  let totalCongestion = 0;
  let count = 0;
  displayStations.forEach(s => {
    if (s.congestion?.label) {
      totalCongestion += congestionValues[s.congestion.label] || 35;
      count++;
    }
  });
  const avgCongestion = count > 0 ? Math.round(totalCongestion / count) : 30;

  const upcomingArrivals = [
    { id: 1, line: displayStations[0]?.line || 'Blue', dest: displayStations[displayStations.length - 1]?.name || 'Dwarka', eta: '2 MINS', platform: 'Platform 1' },
    { id: 2, line: displayStations[0]?.line || 'Blue', dest: displayStations[displayStations.length - 1]?.name || 'Dwarka', eta: '6 MINS', platform: 'Platform 1' },
    { id: 3, line: 'Yellow', dest: 'Samaypur Badli', eta: '4 MINS', platform: 'Platform 2' }
  ];

  return (
    <div className="min-h-screen bg-[#0A0B10] pb-28 relative overflow-hidden">
      {/* Background light leaks for Antigravity atmosphere */}
      <div className="absolute top-10 left-10 w-[250px] h-[250px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-[200px] h-[200px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0A0B10]/85 backdrop-blur-md border-b border-white/5 px-4 py-4 mt-safe">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div>
              <h1 className="font-bold text-white text-base">Route Details</h1>
              <p className="text-xs text-slate-400">{path[0]} ➔ {path[path.length - 1]}</p>
            </div>
          </div>

          {/* Glowing Offline Mode Pill Indicator */}
          {isOffline && (
            <div className="glass-card px-2.5 py-1 border border-amber-500/30 bg-amber-500/10 flex items-center gap-1 shadow-lg shadow-amber-500/5 animate-pulse">
              <span className="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_4px_#F59E0B]" />
              <span className="text-[8px] font-bold text-amber-300 uppercase tracking-widest leading-none">OFFLINE MODE</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4 animate-fade-in relative z-10">
        {/* Tab Selector */}
        {shortest && minInterchanges && (
          <div className="grid grid-cols-2 gap-2 bg-white/5 border border-white/5 p-1.5 rounded-xl backdrop-blur-md">
            <button
              onClick={() => setActiveTab('shortest')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortest'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              🚀 Fewest Stations
            </button>
            <button
              onClick={() => setActiveTab('minInterchanges')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'minInterchanges'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              🔄 Fewest Transfers
            </button>
            <button
              onClick={() => setActiveTab('shortestDistance')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortestDistance'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              📍 Shortest Distance
            </button>
            <button
              onClick={() => setActiveTab('lessCongested')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'lessCongested'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              🟢 Less Congested
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          <div className="glass-card p-2.5 text-center border border-white/5">
            <Train className="w-4 h-4 text-indigo-400 mx-auto mb-1 animate-pulse" />
            <div className="font-bold text-white text-base leading-none mb-1">{totalStations}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider scale-90">Stops</div>
          </div>
          <div className="glass-card p-2.5 text-center border border-white/5">
            <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
            <div className="font-bold text-white text-base leading-none mb-1">{estimatedTime}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider scale-90">Minutes</div>
          </div>
          <div className="glass-card p-2.5 text-center border border-white/5">
            <ArrowLeftRight className="w-4 h-4 text-pink-400 mx-auto mb-1" />
            <div className="font-bold text-white text-base leading-none mb-1">{interchanges.length}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider scale-90">Transfers</div>
          </div>
          <div className="glass-card p-2.5 text-center border border-white/5">
            <span className="block text-sm mb-1 leading-none">📍</span>
            <div className="font-bold text-white text-base leading-none mb-1">{distanceKm}</div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider scale-90">Distance</div>
          </div>
        </div>

        {/* Congestion Density Bar HUD */}
        <div className="glass-card p-4 space-y-3 border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">👥 Route Congestion Index</h3>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              avgCongestion < 40 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
              avgCongestion < 70 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
              'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {avgCongestion < 40 ? 'Optimal Flow' : avgCongestion < 70 ? 'Moderate Load' : 'Heavy Congestion'}
            </span>
          </div>
          
          <div className="relative">
            <div className="flex mb-1.5 items-center justify-between">
              <span className="text-[9px] font-bold uppercase text-indigo-300">Congestion Level</span>
              <span className="text-xs font-black font-mono text-white">{avgCongestion}%</span>
            </div>
            <div className="overflow-hidden h-2.5 rounded-full bg-white/5 p-[2px]">
              <div 
                style={{ 
                  width: `${avgCongestion}%`, 
                  background: avgCongestion < 40 ? 'linear-gradient(90deg, #10B981, #059669)' : avgCongestion < 70 ? 'linear-gradient(90deg, #FBBF24, #D97706)' : 'linear-gradient(90deg, #F43F5E, #E11D48)',
                  boxShadow: `0 0 8px ${avgCongestion < 40 ? '#10B981' : avgCongestion < 70 ? '#FBBF24' : '#F43F5E'}`
                }} 
                className="h-full rounded-full transition-all duration-500"
              />
            </div>
          </div>
        </div>

        {/* Upcoming Arrivals HUD */}
        <div className="glass-card p-4 space-y-3 border border-white/5 bg-[#12141c]/40 backdrop-blur-md">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🚊 Upcoming Station Arrivals</h3>
          <div className="space-y-2">
            {upcomingArrivals.map((train) => (
              <div key={train.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: LINE_COLORS[train.line] || '#6366F1', boxShadow: `0 0 6px ${LINE_COLORS[train.line] || '#6366F1'}` }} />
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">To {train.dest}</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{train.platform}</p>
                  </div>
                </div>
                <span className="text-xs font-black text-indigo-300 font-mono animate-pulse">{train.eta}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interchange alert */}
        {interchanges.length > 0 && (
          <div className="glass-card p-4 border-l-4 border-yellow-400 border-t border-r border-b border-white/5 bg-yellow-500/5">
            <p className="text-xs font-bold text-yellow-400 mb-1 uppercase tracking-wider">⚡ Transfer Point</p>
            <p className="text-xs text-slate-300 leading-relaxed">Transfer platform at: <span className="font-bold text-white">{interchanges.join(', ')}</span></p>
          </div>
        )}

        {/* Route Timeline */}
        <div className="glass-card p-5 border border-white/5 bg-[#12141c]/30">
          <h2 className="font-bold text-white mb-5 text-xs uppercase tracking-wider pl-1">Route Timeline</h2>
          <div className="relative pl-1">
            {displayStations.map((station, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === path.length - 1;
              const isInterchange = interchanges.includes(station.name);
              const lineColor = LINE_COLORS[station.line] || '#6366F1';

              return (
                <div key={station.name + idx} className="flex gap-4 mb-0 animate-fade-in relative z-10">
                  {/* Timeline dot & line */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 z-10 border-2 border-white/20 transition-all duration-300"
                      style={{ backgroundColor: lineColor, marginTop: 12, boxShadow: `0 0 8px ${lineColor}` }}
                    />
                    {!isLast && (
                      <div className="w-0.5 flex-1 mt-0.5" style={{ backgroundColor: lineColor, opacity: 0.25, minHeight: 32 }} />
                    )}
                  </div>

                  {/* Station info */}
                  <div className="pb-6 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-${isFirst || isLast ? 'black text-white' : 'medium text-slate-200'} text-xs`}>
                        {station.name}
                      </span>
                      {station.line && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${LINE_BG[station.line] || 'bg-slate-700 text-slate-300 border-slate-600'}`}>
                          {station.line}
                        </span>
                      )}
                      {station.congestion && (
                        <span className={`text-[8px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 ${station.congestion.colorClass}`}>
                          👥 {station.congestion.label}
                        </span>
                      )}
                      {isInterchange && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_8px_rgba(234,179,8,0.1)]">
                          ↔ Platform Transfer
                        </span>
                      )}
                      {isFirst && <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">Start</span>}
                      {isLast && <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Arrival</span>}
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
          className="w-full btn-gradient text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider disabled:opacity-60 shadow-[0_4px_20px_rgba(99,102,241,0.3)] transition-all hover:scale-[1.02]"
        >
          <Navigation2 className="w-4 h-4" />
          {starting ? 'Starting...' : 'Start Tracking'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
