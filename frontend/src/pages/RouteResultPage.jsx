import { useNavigate } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { metroAPI } from '../services/api';
import { useState } from 'react';
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
  const { state, dispatch } = useMetro();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const route = state.route;
  if (!route) {
    navigate('/');
    return null;
  }

  const { path, totalStations, interchanges, estimatedTime, stationDetails } = route;

  const handleStartTrip = async () => {
    setStarting(true);
    try {
      const res = await metroAPI.startTrip({ source: path[0], destination: path[path.length - 1] });
      dispatch({ type: 'SET_TRIP_ID', payload: res.data.tripId });
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
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-3 text-center">
            <Train className="w-5 h-5 text-metro-accent mx-auto mb-1" />
            <div className="font-bold text-white text-lg">{totalStations}</div>
            <div className="text-xs text-slate-400">Stations</div>
          </div>
          <div className="glass-card p-3 text-center">
            <Clock className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <div className="font-bold text-white text-lg">{estimatedTime}</div>
            <div className="text-xs text-slate-400">Minutes</div>
          </div>
          <div className="glass-card p-3 text-center">
            <ArrowLeftRight className="w-5 h-5 text-pink-400 mx-auto mb-1" />
            <div className="font-bold text-white text-lg">{interchanges.length}</div>
            <div className="text-xs text-slate-400">Changes</div>
          </div>
        </div>

        {/* Interchange alert */}
        {interchanges.length > 0 && (
          <div className="glass-card p-4 border-l-4 border-yellow-400">
            <p className="text-xs font-semibold text-yellow-400 mb-1">⚡ Interchange Required</p>
            <p className="text-sm text-slate-300">Change at: <span className="font-semibold text-white">{interchanges.join(', ')}</span></p>
          </div>
        )}

        {/* Route Timeline */}
        <div className="glass-card p-4">
          <h2 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Route Timeline</h2>
          <div className="relative">
            {(stationDetails || path.map((n) => ({ name: n }))).map((station, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === path.length - 1;
              const isInterchange = interchanges.includes(station.name);
              const lineColor = LINE_COLORS[station.line] || '#6366F1';

              return (
                <div key={station.name + idx} className="flex gap-4 mb-0">
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
