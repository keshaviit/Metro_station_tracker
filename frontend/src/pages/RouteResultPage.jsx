import { useNavigate } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';
import { useState, useEffect } from 'react';
import { buyOfficialMetroTicket } from '../services/ticketService';

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-surface-container border border-outline-variant/30 p-6 max-w-sm w-full text-center space-y-4 rounded-2xl shadow-xl animate-scale-up">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto text-red-500 text-2xl animate-pulse">
            ⚠️
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-on-surface">No Route Available</h2>
            <p className="text-xs text-on-surface-variant">
              We couldn't construct a route path for the selected stations, or your session has timed out.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full h-12 bg-primary text-on-primary font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Go Back to Home
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
    <div className="min-h-screen bg-background text-on-background pb-28 relative overflow-hidden">
      {/* Background light leaks for Antigravity atmosphere */}
      <div className="absolute top-10 left-10 w-[250px] h-[250px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-[200px] h-[200px] bg-tertiary/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 px-4 py-4 mt-safe">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant/50 hover:bg-surface-container-high transition-colors active:scale-95 duration-200"
            >
              <span className="material-symbols-outlined text-primary text-[18px]">arrow_back</span>
            </button>
            <div>
              <h1 className="font-bold text-on-surface text-base leading-tight">Route Details</h1>
              <p className="text-xs text-on-surface-variant">{path[0]} ➔ {path[path.length - 1]}</p>
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
          <div className="grid grid-cols-2 gap-2 bg-surface-container border border-outline-variant/30 p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab('shortest')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortest'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">bolt</span> Fewest Stations
            </button>
            <button
              onClick={() => setActiveTab('minInterchanges')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'minInterchanges'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">sync_alt</span> Fewest Transfers
            </button>
            <button
              onClick={() => setActiveTab('shortestDistance')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'shortestDistance'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">pin_drop</span> Shortest Distance
            </button>
            <button
              onClick={() => setActiveTab('lessCongested')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'lessCongested'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">group</span> Less Congested
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-surface-container border border-outline-variant/30 p-2.5 text-center rounded-xl">
            <span className="material-symbols-outlined text-primary text-[20px] mb-0.5 block">train</span>
            <div className="font-bold text-on-surface text-base leading-none mb-1">{totalStations}</div>
            <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider scale-90">Stops</div>
          </div>
          <div className="bg-surface-container border border-outline-variant/30 p-2.5 text-center rounded-xl">
            <span className="material-symbols-outlined text-primary text-[20px] mb-0.5 block">schedule</span>
            <div className="font-bold text-on-surface text-base leading-none mb-1">{estimatedTime}</div>
            <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider scale-90">Minutes</div>
          </div>
          <div className="bg-surface-container border border-outline-variant/30 p-2.5 text-center rounded-xl">
            <span className="material-symbols-outlined text-primary text-[20px] mb-0.5 block">swap_horiz</span>
            <div className="font-bold text-on-surface text-base leading-none mb-1">{interchanges.length}</div>
            <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider scale-90">Transfers</div>
          </div>
          <div className="bg-surface-container border border-outline-variant/30 p-2.5 text-center rounded-xl">
            <span className="material-symbols-outlined text-primary text-[20px] mb-0.5 block">place</span>
            <div className="font-bold text-on-surface text-base leading-none mb-1">{distanceKm}</div>
            <div className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider scale-90">Distance</div>
          </div>
        </div>

        {/* Upcoming Arrivals HUD */}
        <div className="bg-surface-container border border-outline-variant/30 p-4 space-y-3 rounded-xl shadow-sm">
          <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">🚊 Upcoming Station Arrivals</h3>
          <div className="space-y-2">
            {upcomingArrivals.map((train) => (
              <div key={train.id} className="flex items-center justify-between bg-surface-container-low border border-outline-variant/20 rounded-xl p-3 hover:bg-surface-container-high transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: LINE_COLORS[train.line] || '#6366F1', boxShadow: `0 0 6px ${LINE_COLORS[train.line] || '#6366F1'}` }} />
                  <div>
                    <p className="text-xs font-bold text-on-surface leading-tight">To {train.dest}</p>
                    <p className="text-[9px] text-on-surface-variant font-bold uppercase mt-0.5">{train.platform}</p>
                  </div>
                </div>
                <span className="text-xs font-black text-primary font-mono animate-pulse">{train.eta}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Interchange alert */}
        {interchanges.length > 0 && (
          <div className="bg-surface-container border-l-4 border-yellow-500 border-t border-r border-b border-outline-variant/30 p-4 rounded-xl">
            <p className="text-xs font-bold text-yellow-600 mb-1 uppercase tracking-wider">⚡ Transfer Point</p>
            <p className="text-xs text-on-surface-variant leading-relaxed">Transfer platform at: <span className="font-bold text-on-surface">{interchanges.join(', ')}</span></p>
          </div>
        )}

        {/* Route Timeline */}
        <div className="bg-surface-container border border-outline-variant/30 p-5 rounded-xl shadow-sm">
          <h2 className="font-bold text-on-surface mb-5 text-xs uppercase tracking-wider pl-1">Route Timeline</h2>
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
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0 z-10 border-2 border-outline-variant/50 transition-all duration-300"
                      style={{ backgroundColor: lineColor, marginTop: 12, boxShadow: `0 0 8px ${lineColor}` }}
                    />
                    {!isLast && (
                      <div className="w-0.5 flex-1 mt-0.5" style={{ backgroundColor: lineColor, opacity: 0.35, minHeight: 32 }} />
                    )}
                  </div>

                  {/* Station info */}
                  <div className="pb-6 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-${isFirst || isLast ? 'black text-on-surface font-extrabold' : 'medium text-on-surface-variant'} text-xs`}>
                        {station.name}
                      </span>
                      {station.line && (
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${LINE_BG[station.line] || 'bg-surface-variant text-on-surface-variant border-outline-variant/30'}`}>
                          {station.line}
                        </span>
                      )}
                      {station.congestion && (
                        <span className={`text-[8px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 ${station.congestion.colorClass}`}>
                          👥 {station.congestion.label}
                        </span>
                      )}
                      {isInterchange && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 shadow-[0_0_8px_rgba(234,179,8,0.1)]">
                          ↔ Platform Transfer
                        </span>
                      )}
                      {isFirst && <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Start</span>}
                      {isLast && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Arrival</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex gap-3">
          {/* WhatsApp QR Ticket CTA */}
          <button
            id="buy-qr-ticket-btn"
            onClick={buyOfficialMetroTicket}
            className="flex-1 h-14 bg-[#009688] hover:bg-[#00796B] text-white rounded-full font-bold text-[12px] sm:text-[14px] shadow-md flex items-center justify-between px-4 active:scale-[0.98] transition-all uppercase tracking-wider text-white-force"
          >
            <div className="w-8 flex items-center justify-start flex-shrink-0">
              <svg className="w-5 h-5 fill-current text-white-force" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.374-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.454 5.709 1.455h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </div>
            <span className="flex-1 text-center truncate px-1">BUY QR TICKET</span>
            <div className="w-8 flex-shrink-0" />
          </button>

          {/* Start Trip CTA */}
          <button
            id="start-trip-btn"
            onClick={handleStartTrip}
            disabled={starting}
            className="flex-1 h-14 bg-[#00b050] hover:bg-[#009940] text-white rounded-full font-bold text-[12px] sm:text-[14px] shadow-md flex items-center justify-between px-4 active:scale-[0.98] transition-all disabled:opacity-70 uppercase tracking-wider text-white-force"
          >
            <div className="w-8 flex items-center justify-start flex-shrink-0">
              <span className="material-symbols-outlined text-[20px] text-white-force">directions</span>
            </div>
            <span className="flex-1 text-center truncate px-1">{starting ? 'STARTING...' : 'GET DIRECTIONS'}</span>
            <div className="w-8 flex items-center justify-end flex-shrink-0">
              <span className="font-bold text-[16px] text-white-force">&gt;</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
