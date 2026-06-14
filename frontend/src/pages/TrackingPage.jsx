import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useNotification } from '../hooks/useNotification';
import { metroAPI } from '../services/api';
import MetroGraph from '../services/routeEngine';
import { Capacitor } from '@capacitor/core';
import { buyOfficialMetroTicket } from '../services/ticketService';

const LINE_COLORS = {
  Blue: '#2563EB', Yellow: '#EAB308', Red: '#EF4444',
  Green: '#22C55E', Violet: '#8B5CF6', Pink: '#EC4899', Orange: '#F97316', Magenta: '#D946EF', Grey: '#6B7280'
};

function playMetroChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;

    const playTone = (freq, startTime, duration, type = 'triangle') => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(1.5, startTime + 0.02);
      gainNode.gain.setValueAtTime(1.5, startTime + duration - 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playTone(880, now, 0.15, 'square');
    playTone(1318.51, now + 0.15, 0.15, 'triangle');
    playTone(880, now + 0.4, 0.15, 'square');
    playTone(1318.51, now + 0.55, 0.15, 'triangle');
    playTone(880, now + 0.8, 0.15, 'square');
    playTone(1318.51, now + 0.95, 0.3, 'triangle');

    setTimeout(() => {
      audioCtx.close().catch(() => {});
    }, 1500);

    return audioCtx;
  } catch (err) {
    console.error('Audio chime failed:', err);
    return null;
  }
}

function triggerVibration(pattern = [300, 100, 300, 100, 500]) {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration API not supported
  }
}

function cancelVibration() {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
  } catch {
    // Vibration API not supported
  }
}

// ── Voice Alert Synthesis helper ───────────────────────────────────────────────
function speakVoice(text) {
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.error('Speech synthesis failed:', err);
  }
}

// ── Main TrackingPage ───────────────────────────────────────────────────────────
export default function TrackingPage() {
  const { state, dispatch } = useMetro();
  const lastAlertedStopsRef = useRef(null);
  const lastAlertedInterchangeBeforeRef = useRef(-1);
  const lastAlertedInterchangeAtRef = useRef(-1);
  const navigate = useNavigate();
  const { startTracking, stopTracking } = useGPSTracking();
  const { permission, requestPermission, notify } = useNotification();
  const [recalculating, setRecalculating] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [presetSaved, setPresetSaved] = useState(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [activeInterchangeAlert, setActiveInterchangeAlert] = useState(null);
  const dismissedInterchangesRef = useRef(new Set());
  const dismissedWarningAlarmRef = useRef('');

  const handleAcceptDisclosure = () => {
    localStorage.setItem('has_accepted_disclosure', 'true');
    setShowDisclosure(false);
    startTracking();
  };

  const handleDenyDisclosure = () => {
    setShowDisclosure(false);
    navigate('/');
  };

  const [activeAlarm, setActiveAlarm] = useState(null);
  const alarmIntervalRef = useRef(null);
  const vibrationIntervalRef = useRef(null);
  const alarmStartTimeRef = useRef(null);
  const [alarmElapsed, setAlarmElapsed] = useState(0);

  const rawRoute = state.route;
  let activeRoute = null;
  if (rawRoute) {
    if (rawRoute.shortest) {
      activeRoute = rawRoute.shortest;
    } else if (rawRoute.data && rawRoute.data.shortest) {
      activeRoute = rawRoute.data.shortest;
    } else {
      activeRoute = rawRoute;
    }
  }

  const route = activeRoute;
  const prediction = state.prediction;
  const userLoc = state.userLocation;

  const destinationStation = route?.stationDetails?.[route?.stationDetails?.length - 1];
  const destinationName = destinationStation?.name || (route?.path?.[route?.path?.length - 1]);

  const startLoopingAlarm = useCallback((level) => {
    if (alarmIntervalRef.current && activeAlarm === level) return;
    clearLoopingAlarm();

    setActiveAlarm(level);
    alarmStartTimeRef.current = Date.now();
    setAlarmElapsed(0);

    playMetroChime();
    triggerVibration([300, 100, 300, 100, 500]);

    alarmIntervalRef.current = setInterval(() => {
      playMetroChime();
      setAlarmElapsed(Date.now() - (alarmStartTimeRef.current || Date.now()));
    }, 1500);

    vibrationIntervalRef.current = setInterval(() => {
      triggerVibration([300, 100, 300, 100, 500]);
    }, 1000);
  }, [activeAlarm]);

  const clearLoopingAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    cancelVibration();
    setActiveAlarm(null);
    setAlarmElapsed(0);
    alarmStartTimeRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearLoopingAlarm();
  }, [clearLoopingAlarm]);

  useEffect(() => {
    if (!route) return;
    
    const needsDisclosure = Capacitor.isNativePlatform() && localStorage.getItem('has_accepted_disclosure') !== 'true';
    if (needsDisclosure) {
      setShowDisclosure(true);
    } else {
      startTracking();
    }
    return () => stopTracking();
  }, [route]);

  useEffect(() => {
    const remaining = prediction?.stopsRemaining;
    if (remaining == null) return;

    // Synchronize using localStorage key to prevent duplicate foreground alarms
    const lsKey = 'metro_last_alarmed_stops';
    const lastAlarmed = parseInt(localStorage.getItem(lsKey) ?? '-1');
    if (lastAlarmed === remaining) return;

    if (remaining === 3) {
      if (lastAlertedStopsRef.current !== 3) {
        lastAlertedStopsRef.current = 3;
        localStorage.setItem(lsKey, '3');
        startLoopingAlarm('approaching');
      }
    } else if (remaining === 2) {
      if (lastAlertedStopsRef.current !== 2) {
        lastAlertedStopsRef.current = 2;
        localStorage.setItem(lsKey, '2');
        startLoopingAlarm('next-to-next');
      }
    } else if (remaining === 1) {
      if (lastAlertedStopsRef.current !== 1) {
        lastAlertedStopsRef.current = 1;
        localStorage.setItem(lsKey, '1');
        startLoopingAlarm('next');
      }
    } else if (remaining === 0) {
      if (lastAlertedStopsRef.current !== 0) {
        lastAlertedStopsRef.current = 0;
        localStorage.setItem(lsKey, '0');
        startLoopingAlarm('arrived');
        stopTracking();
        if (state.tripId) {
          metroAPI.endTrip(state.tripId).catch(() => {});
          if (state.tripId.startsWith('local-')) {
            try {
              const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
              const idx = queue.findIndex(t => t.tripId === state.tripId);
              if (idx !== -1) {
                queue[idx].completed = true;
                queue[idx].completedAt = new Date().toISOString();
                localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    } else {
      if (activeAlarm && remaining > 3) {
        clearLoopingAlarm();
        lastAlertedStopsRef.current = null;
      }
    }
  }, [prediction?.stopsRemaining, prediction?.nextStation, destinationName, state.tripId, stopTracking, startLoopingAlarm, clearLoopingAlarm, activeAlarm]);

  useEffect(() => {
    const alert = prediction?.interchangeAlert;
    if (!alert) {
      setActiveInterchangeAlert(null);
      return;
    }

    const alertKey = `${alert.type}_${alert.stationName}`;
    if (!dismissedInterchangesRef.current.has(alertKey)) {
      setActiveInterchangeAlert(alert);
      
      try {
        const msg = alert.type === 'at' 
          ? `Arrived at interchange station ${alert.stationName}. Please switch to the ${alert.targetLine} Line.`
          : `Next station is interchange station ${alert.stationName}. Prepare to switch to the ${alert.targetLine} Line soon.`;
        
        playMetroChime();
        triggerVibration([300, 100, 300]);
        speakVoice(msg);
      } catch (err) {
        console.warn('Interchange alert audio feedback failed:', err);
      }
    }
  }, [prediction?.interchangeAlert]);

  useEffect(() => {
    const warning = prediction?.warningMessage;
    if (!warning) {
      if (activeAlarm === 'wrong-route') {
        clearLoopingAlarm();
      }
      dismissedWarningAlarmRef.current = '';
      return;
    }

    if (dismissedWarningAlarmRef.current !== warning) {
      startLoopingAlarm('wrong-route');
    }
  }, [prediction?.warningMessage, startLoopingAlarm, clearLoopingAlarm, activeAlarm]);

  const handleEndTrip = async () => {
    clearLoopingAlarm();
    stopTracking();
    if (state.tripId) {
      await metroAPI.endTrip(state.tripId).catch(() => {});
      if (state.tripId.startsWith('local-')) {
        try {
          const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
          const idx = queue.findIndex(t => t.tripId === state.tripId);
          if (idx !== -1) {
            queue[idx].completed = true;
            queue[idx].completedAt = new Date().toISOString();
            localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    dispatch({ type: 'END_TRIP' });
    navigate('/');
  };

  const handleRecalculate = async () => {
    const currentIdx = prediction?.currentIndex ?? 0;
    const currentStation = prediction?.currentStation || route.path[currentIdx] || route.path[0];
    if (!currentStation || !destinationName || !state.tripId) return;
    setRecalculating(true);

    const isLocalTrip = state.tripId.startsWith('local-');

    if (isLocalTrip) {
      // Local recalculation fallback
      try {
        const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
        if (cached.length === 0) {
          throw new Error('Offline station cache is empty. Connect to internet.');
        }

        const graph = new MetroGraph(cached);
        const strategy = route.strategy || 'shortest';
        let newRoute = null;

        if (strategy === 'shortest') {
          newRoute = graph.findShortestPath(currentStation, destinationName);
        } else if (strategy === 'minInterchanges') {
          newRoute = graph.findMinInterchangesPath(currentStation, destinationName);
        } else if (strategy === 'shortestDistance') {
          newRoute = graph.findShortestDistancePath(currentStation, destinationName);
        } else if (strategy === 'lessCongested') {
          newRoute = graph.findLessCongestedPath(currentStation, destinationName);
        } else {
          newRoute = graph.findShortestPath(currentStation, destinationName);
        }

        if (newRoute.error) throw new Error(newRoute.error);

        // Update local trip history
        try {
          const queue = JSON.parse(localStorage.getItem('offline_trips_queue') || '[]');
          const idx = queue.findIndex(t => t.tripId === state.tripId);
          if (idx !== -1) {
            queue[idx].routePath = newRoute.path;
            localStorage.setItem('offline_trips_queue', JSON.stringify(queue));
          }
        } catch (e) {
          console.error(e);
        }

        // 1. Dispatch SET_ROUTE
        dispatch({ type: 'SET_ROUTE', payload: { ...newRoute, strategy, isOfflineCalculated: true } });

        // 2. Dispatch SET_PREDICTION immediately to avoid index mismatch
        const initialPrediction = {
          currentStation: newRoute.path[0],
          nextStation: newRoute.path[1] || null,
          stopsRemaining: newRoute.path.length - 1,
          currentIndex: 0,
          visitedStations: [newRoute.path[0]],
          shouldAlert: (newRoute.path.length - 1) <= 2,
          confidence: 'high',
          method: 'local-recalculated',
          isOffRoute: false,
          isWrongDirection: false,
          warningMessage: '',
        };
        dispatch({ type: 'SET_PREDICTION', payload: initialPrediction });

        notify('🔄 Route Recalculated (Offline)', `Recalculated route locally using ${strategy} strategy.`);
      } catch (err) {
        console.error('Offline recalculate failed:', err);
        notify('❌ Recalculation Failed', err.message || 'Could not recalculate path locally.');
      } finally {
        setRecalculating(false);
      }
      return;
    }

    // Online recalculation
    try {
      const res = await metroAPI.getRoute(currentStation, destinationName);
      const strategy = route.strategy || 'shortest';
      let newRoute = null;

      const routesObj = res.data || res;
      if (routesObj[strategy]) {
        newRoute = routesObj[strategy];
      } else if (routesObj.shortest) {
        newRoute = routesObj.shortest;
      } else {
        newRoute = routesObj;
      }

      await metroAPI.recalculateTrip(state.tripId, { newRoutePath: newRoute.path });

      // 1. Dispatch SET_ROUTE
      dispatch({ type: 'SET_ROUTE', payload: { ...newRoute, strategy } });

      // 2. Dispatch SET_PREDICTION immediately to avoid index mismatch
      const initialPrediction = {
        currentStation: newRoute.path[0],
        nextStation: newRoute.path[1] || null,
        stopsRemaining: newRoute.path.length - 1,
        currentIndex: 0,
        visitedStations: [newRoute.path[0]],
        shouldAlert: (newRoute.path.length - 1) <= 2,
        confidence: 'high',
        method: 'recalculated',
        isOffRoute: false,
        isWrongDirection: false,
        warningMessage: '',
      };
      dispatch({ type: 'SET_PREDICTION', payload: initialPrediction });

      notify('🔄 Route Recalculated', `Recalculated route using ${strategy} strategy.`);
    } catch (err) {
      console.error('Online recalculate failed, attempting local fallback:', err);
      // Fallback to local recalculation if online API fails
      try {
        const cached = JSON.parse(localStorage.getItem('metro_stations_cache')) || [];
        if (cached.length > 0) {
          const graph = new MetroGraph(cached);
          const strategy = route.strategy || 'shortest';
          const newRoute = graph.findShortestPath(currentStation, destinationName);

          if (!newRoute.error) {
            dispatch({ type: 'SET_ROUTE', payload: { ...newRoute, strategy, isOfflineCalculated: true } });
            const initialPrediction = {
              currentStation: newRoute.path[0],
              nextStation: newRoute.path[1] || null,
              stopsRemaining: newRoute.path.length - 1,
              currentIndex: 0,
              visitedStations: [newRoute.path[0]],
              shouldAlert: (newRoute.path.length - 1) <= 2,
              confidence: 'high',
              method: 'local-fallback-recalculated',
              isOffRoute: false,
              isWrongDirection: false,
              warningMessage: '',
            };
            dispatch({ type: 'SET_PREDICTION', payload: initialPrediction });
            notify('🔄 Route Recalculated (Offline Fallback)', `Server offline; path recalculated locally.`);
            setRecalculating(false);
            return;
          }
        }
      } catch (_) {}
      notify('❌ Recalculation Failed', 'Could not reach server to recalculate path.');
    } finally {
      setRecalculating(false);
    }
  };

  if (!route) {
    return (
      <div className="bg-background text-on-background font-body-lg antialiased min-h-screen relative flex flex-col pt-safe">
        {/* Navigation Header */}
        <nav className="fixed top-0 w-full z-[8000] bg-surface/80 backdrop-blur-md text-primary font-title-md text-title-md border-b border-outline-variant/30 shadow-sm flex items-center justify-between px-margin-mobile h-16 w-full mt-safe">
          <div className="flex items-center gap-sm">
            <button onClick={() => navigate('/')} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-highest/50 transition-colors active:scale-95 duration-200">
              <span className="material-symbols-outlined text-primary">arrow_back</span>
            </button>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight font-extrabold">MetroPulse</h1>
          </div>
        </nav>

        {/* Center Card */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-6 pt-16">
          <div className="w-20 h-20 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center text-primary relative animate-pulse">
            <span className="material-symbols-outlined text-[44px]">subway</span>
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
            </span>
          </div>

          <div className="space-y-2 max-w-sm">
            <h2 className="text-2xl font-black text-on-surface tracking-wide uppercase">No Tracking Ongoing</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              You don't have an active trip currently being tracked. Start a journey from the Home Page to monitor your route, receive live station alerts, and get seamless transfer updates.
            </p>
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full max-w-sm h-12 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold active:scale-[0.98] transition-all shadow-md text-white flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">map</span>
            Plan a Journey
          </button>
        </main>
      </div>
    );
  }

  const alarmConfig = {
    'approaching': {
      emoji: '🚇',
      title: '3 Stations to Go!',
      subtitle: `${destinationName} is 3 stops away. Get ready!`,
      borderColor: 'border-primary/50',
      textColor: 'text-primary',
      barColor: 'bg-primary',
    },
    'next-to-next': {
      emoji: '🔔',
      title: 'Next-to-Next Station!',
      subtitle: `Approaching ${prediction?.nextStation || 'your destination'}. Get ready!`,
      borderColor: 'border-tertiary/50',
      textColor: 'text-tertiary',
      barColor: 'bg-tertiary',
    },
    'next': {
      emoji: '🚨',
      title: 'NEXT Station Is Yours!',
      subtitle: `${destinationName} is the very next stop. Deboard soon!`,
      borderColor: 'border-error/50',
      textColor: 'text-error',
      barColor: 'bg-error',
    },
    'arrived': {
      emoji: '🎉',
      title: 'DEBOARD NOW!',
      subtitle: `You have arrived at ${destinationName}!`,
      borderColor: 'border-emerald-500/50',
      textColor: 'text-emerald-600',
      barColor: 'bg-emerald-500',
    },
    'wrong-route': {
      emoji: '🚨',
      title: prediction?.isOffRoute ? 'Off-Route Warning!' : 'Wrong Direction!',
      subtitle: prediction?.warningMessage || 'Please check your train or path.',
      borderColor: 'border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.3)] animate-pulse',
      textColor: 'text-red-600 font-extrabold',
      barColor: 'bg-red-500',
    },
  };

  const currentAlarmConfig = activeAlarm ? alarmConfig[activeAlarm] : null;
  const alarmRingSecs = Math.round(alarmElapsed / 1000);

  // Journey progress calculation
  const totalStations = route.path?.length || 1;
  const currentIndex = prediction?.currentIndex ?? 0;
  const progressPercent = Math.round((currentIndex / Math.max(totalStations - 1, 1)) * 100);

  // Station data for timeline
  const currentStopName = prediction?.currentStation || route.path[0];

  // Find the next upcoming interchange station
  let upcomingInterchange = null;
  if (route?.interchanges && route?.stationDetails) {
    for (let i = currentIndex; i < route.path.length - 1; i++) {
      const name = route.path[i];
      if (route.interchanges.includes(name)) {
        const nextLine = route.stationDetails[i + 1]?.line;
        const currLine = route.stationDetails[i]?.line;
        if (nextLine && currLine && currLine !== nextLine) {
          upcomingInterchange = {
            stationName: name,
            currentLine: currLine,
            nextLine: nextLine,
            stopsAway: i - currentIndex
          };
          break;
        }
      }
    }
  }

  return (
    <div className="bg-background text-on-background font-body-lg antialiased min-h-screen relative flex flex-col pt-safe">
      {/* Location Consent Disclosure Modal */}
      {showDisclosure && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-lg animate-fade-in px-4">
          <div className="glass-panel max-w-sm w-full border border-outline-variant/30 bg-surface/95 p-6 rounded-2xl shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mx-auto text-primary animate-pulse">
              <span className="material-symbols-outlined text-[32px]">location_on</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-black text-on-surface tracking-wide uppercase">Background Location Required</h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                MetroPulse collects location data to calculate station arrival times and trigger alarms even when the app is closed, in the background, or the screen is locked.
              </p>
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-3 text-left space-y-1.5 text-[11px] text-on-surface-variant">
                <p className="font-bold text-primary">⚙️ Critical Device Configuration:</p>
                <p><strong>1. Location:</strong> Select <strong>"Allow all the time"</strong> when prompted (or in System Settings).</p>
                <p><strong>2. Battery:</strong> Disable battery optimization (set battery usage to <strong>"Unrestricted"</strong>).</p>
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <button
                onClick={handleAcceptDisclosure}
                className="w-full h-12 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold active:scale-[0.98] transition-all shadow-md text-white"
              >
                I Agree & Continue
              </button>
              <button
                onClick={handleDenyDisclosure}
                className="w-full h-12 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl font-label-md text-label-md font-semibold active:scale-[0.98] transition-all"
              >
                No Thanks, Go Back
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Navigation Header */}
      <nav className="fixed top-0 w-full z-[8000] bg-surface/80 backdrop-blur-md text-primary font-title-md text-title-md border-b border-outline-variant/30 shadow-sm flex items-center justify-between px-margin-mobile h-16 w-full mt-safe">
        <div className="flex items-center gap-sm">
          <button onClick={handleEndTrip} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-surface-container-highest/50 transition-colors active:scale-95 duration-200">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </button>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tight font-extrabold">MetroPulse</h1>
        </div>
        
        <div className="flex items-center gap-sm">
          <div className="glass-panel px-3 py-1 flex items-center gap-1.5 text-[10px] text-primary border border-primary/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold tracking-wider">LIVE TRACKING</span>
          </div>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="w-9 h-9 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center text-primary hover:bg-surface-container-high transition-all active:scale-90"
            title="Telemetry Debug console"
          >
            <span className="material-symbols-outlined text-[18px]">analytics</span>
          </button>
        </div>
      </nav>

      {/* Developer Telemetry Console */}
      {showDebugPanel && (
        <div className="fixed right-3 bottom-28 z-[8000] w-[90%] max-w-sm glass-panel border border-outline-variant/30 bg-surface/95 backdrop-blur-3xl p-5 shadow-2xl animate-slide-up space-y-4 rounded-2xl">
          <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">construction</span>
              <span className="text-xs font-black text-on-surface uppercase tracking-wider font-mono">Developer Telemetry HUD</span>
            </div>
            <button onClick={() => setShowDebugPanel(false)} className="text-on-surface hover:text-primary transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="space-y-2 text-[10px] font-mono leading-relaxed text-on-surface-variant">
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>🛰️ GNSS POSITION:</span>
              <span className="text-primary font-bold">
                {userLoc ? `${userLoc.lat.toFixed(5)}, ${userLoc.lng.toFixed(5)}` : 'WAITING FOR FIX'}
              </span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>🛡️ ACCURACY BOUND:</span>
              <span className={userLoc?.accuracy <= 15 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                {userLoc ? `±${Math.round(userLoc.accuracy)} meters` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>🚇 NEAREST STATION:</span>
              <span className="text-primary font-bold">
                {prediction?.currentStation || 'SCANNING...'}
              </span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>🛣️ NEXT TARGET NODE:</span>
              <span className="text-primary font-bold">
                {prediction?.nextStation || destinationName || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>📊 STATIONS REMAINING:</span>
              <span className="text-on-surface font-bold">
                {prediction?.stopsRemaining != null ? prediction.stopsRemaining : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between border-b border-outline-variant/10 pb-1">
              <span>🔍 GRAPH PATH INDEX:</span>
              <span className="text-on-surface-variant font-bold">
                {prediction?.currentIndex != null ? `${prediction.currentIndex + 1} / ${route?.path?.length}` : '0 / 0'}
              </span>
            </div>
          </div>

          <div className="bg-[#050608]/90 border border-outline-variant/25 rounded-lg p-2.5 max-h-24 overflow-y-auto scrollbar-thin">
            <p className="text-[9px] text-outline font-mono font-bold uppercase tracking-wider mb-1">Live Engine Log Stream</p>
            {prediction ? (
              <p className="text-[9px] text-emerald-400 font-mono leading-tight">
                [{new Date().toLocaleTimeString()}] Method: {prediction.method || 'graph_distance'}
              </p>
            ) : (
              <p className="text-[9px] text-slate-500 font-mono leading-tight">Listening for packets...</p>
            )}
          </div>
        </div>
      )}

      {/* Looping Chime Alarm Screen Overlay */}
      {currentAlarmConfig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
          <div className={`relative w-[92%] max-w-sm mx-auto rounded-2xl border-2 ${currentAlarmConfig.borderColor} bg-surface p-6 space-y-4 text-center shadow-[0_0_60px_rgba(0,0,0,0.5)]`}>
            
            <div className="w-full h-1.5 bg-outline-variant/20 rounded-full overflow-hidden absolute top-0 left-0 right-0">
              <div
                className={`h-full ${currentAlarmConfig.barColor} transition-all duration-1000`}
                style={{ width: `${Math.min(100, (alarmRingSecs % 10) * 10)}%` }}
              />
            </div>

            <div className="text-6xl mx-auto pt-2">{currentAlarmConfig.emoji}</div>
            <h2 className={`text-xl font-black ${currentAlarmConfig.textColor} tracking-wide uppercase`}>
              {currentAlarmConfig.title}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {currentAlarmConfig.subtitle}
            </p>

            {prediction?.stopsRemaining != null && (
              <div className="inline-flex items-center gap-sm px-4 py-1 bg-surface-container border border-outline-variant/30 rounded-full">
                <span className="text-xs text-on-surface-variant font-bold">Stops Left:</span>
                <span className={`text-2xl font-black ${currentAlarmConfig.textColor}`}>{prediction.stopsRemaining}</span>
              </div>
            )}

            <button
              onClick={() => {
                if (activeAlarm === 'wrong-route' && prediction?.warningMessage) {
                  dismissedWarningAlarmRef.current = prediction.warningMessage;
                }
                clearLoopingAlarm();
              }}
              className="w-full h-12 flex items-center justify-center gap-sm bg-primary text-on-primary rounded-xl font-label-md text-label-md active:scale-[0.98] transition-all text-white font-bold shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">volume_off</span>
              Dismiss Alarm Alert
            </button>
          </div>
        </div>
      )}

      {/* Interchange Alert Modal Overlay */}
      {activeInterchangeAlert && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 backdrop-blur-md animate-fade-in px-4">
          <div className="relative w-[92%] max-w-sm mx-auto rounded-2xl border-2 border-amber-500/60 bg-surface p-6 space-y-4 text-center shadow-[0_0_60px_rgba(0,0,0,0.5)] animate-scale-up">
            <div className="text-6xl mx-auto pt-2">🔄</div>
            <h2 className="text-xl font-black text-amber-600 tracking-wide uppercase">
              {activeInterchangeAlert.type === 'at' ? 'Interchange Station!' : 'Interchange Ahead!'}
            </h2>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {activeInterchangeAlert.type === 'at' ? (
                <>
                  You have arrived at <strong>{activeInterchangeAlert.stationName}</strong>. Please switch to the <span className="text-primary font-bold">{activeInterchangeAlert.targetLine} Line</span>.
                </>
              ) : (
                <>
                  The next station is <strong>{activeInterchangeAlert.stationName}</strong>. Prepare to transfer to the <span className="text-primary font-bold">{activeInterchangeAlert.targetLine} Line</span>.
                </>
              )}
            </p>

            <button
              onClick={() => {
                const alertKey = `${activeInterchangeAlert.type}_${activeInterchangeAlert.stationName}`;
                dismissedInterchangesRef.current.add(alertKey);
                setActiveInterchangeAlert(null);
              }}
              className="w-full h-12 flex items-center justify-center gap-sm bg-primary text-on-primary rounded-xl font-label-md text-label-md active:scale-[0.98] transition-all text-white font-bold shadow-md"
            >
              <span className="material-symbols-outlined text-[20px]">done</span>
              Got It, Thanks!
            </button>
          </div>
        </div>
      )}

      {/* Main Scrollable Content */}
      <main className="flex-1 mt-16 pb-28 px-margin-mobile max-w-2xl mx-auto space-y-lg pt-lg overflow-y-auto">

        {/* Bento Progress Card */}
        <section className="relative h-56 w-full rounded-xl overflow-hidden shadow-sm border border-outline-variant/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-surface-container-low to-surface-container">
            <div className="absolute inset-0 flex items-center justify-center opacity-[0.04]">
              <span className="material-symbols-outlined text-[200px] text-primary">subway</span>
            </div>
          </div>
          <div className="absolute top-4 right-4 glass-panel px-md py-sm rounded-lg border border-outline-variant/30 flex items-center gap-sm">
            <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1", animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>location_on</span>
            <span className="font-title-md text-title-md text-primary font-bold">Live</span>
          </div>
          <div className="absolute top-4 left-4 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">{route.path[0]}</span>
            <span className="text-[10px] text-on-surface-variant">→</span>
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{destinationName}</span>
          </div>
          <div className="absolute bottom-4 left-4 right-4 glass-panel p-md rounded-lg border border-outline-variant/30">
            <div className="flex justify-between items-center mb-xs">
              <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Journey Progress</span>
              <span className="font-title-md text-title-md text-primary font-bold">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-on-surface-variant">{currentIndex} of {totalStations} stations</span>
              <span className="text-[9px] text-on-surface-variant font-bold">
                {prediction?.stopsRemaining != null ? `${prediction.stopsRemaining} stops left` : 'Calculating...'}
              </span>
            </div>
          </div>
        </section>

        {/* WhatsApp QR Ticket Bento Section */}
        <section className="bg-emerald-600/10 border border-emerald-500/20 rounded-xl p-md flex items-center justify-between gap-sm animate-fade-in">
          <div className="flex items-center gap-sm">
            <span className="material-symbols-outlined text-emerald-500 text-[28px]">qr_code_2</span>
            <div className="text-left">
              <p className="text-xs font-bold text-emerald-500">Need a Metro Ticket?</p>
              <p className="text-[10px] text-on-surface-variant">Instantly book your official QR ticket on WhatsApp.</p>
            </div>
          </div>
          <button
            onClick={buyOfficialMetroTicket}
            className="px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white-force rounded-lg font-label-md text-xs font-bold shadow-sm active:scale-[0.98] transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4 fill-current text-white-force" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.374-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.454 5.709 1.455h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Buy Ticket
          </button>
        </section>

        {/* Notification Permission Banner */}
        {(permission !== 'granted' && !audioUnlocked) && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-md flex items-center justify-between gap-sm animate-fade-in">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[28px]">notifications_active</span>
              <div>
                <p className="text-xs font-bold text-primary">Enable Station Alerts</p>
                <p className="text-[10px] text-on-surface-variant">Receive chimes and warnings automatically.</p>
              </div>
            </div>
            <button
              onClick={async () => {
                playMetroChime();
                setAudioUnlocked(true);
                const res = await requestPermission();
                if (res === 'granted') {
                  notify('🚇 Alerts Activated!', 'You will receive notifications for this trip.');
                }
              }}
              className="px-3.5 py-2 bg-primary text-on-primary rounded-lg font-label-md text-xs font-bold shadow-sm"
            >
              Unlock
            </button>
          </div>
        )}

        {/* Current Station Hero */}
        <section className="bg-surface-container-low p-lg rounded-xl border border-outline-variant/30 text-center space-y-sm">
          <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest block font-bold">Current Station</span>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold">{currentStopName}</h2>
          <div className="flex items-center justify-center gap-sm text-primary">
            <span className="material-symbols-outlined">train</span>
            <span className="font-body-lg text-body-lg font-medium">
              {route.line ? `${route.line} Line` : 'Transit Node'} {route.strategy ? `• ${route.strategy}` : ''}
            </span>
          </div>
        </section>

        {/* Estimated Time Card */}
        {prediction?.stopsRemaining != null && (
          <section className="glass-panel p-md border border-outline-variant/30 rounded-xl text-center space-y-xs bg-surface-container-lowest">
            <span className="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">Time to Destination</span>
            <div className="font-display-lg text-headline-lg text-primary font-black">
              {prediction.stopsRemaining === 0 ? 'ARRIVED' : `~${prediction.stopsRemaining * 3} MINS`}
            </div>
            <p className="text-[10px] text-on-surface-variant font-bold uppercase mt-1">
              {prediction.stopsRemaining} station{prediction.stopsRemaining !== 1 ? 's' : ''} remaining
            </p>
          </section>
        )}

        {/* Off route warning banners */}
        {prediction?.warningMessage && (
          <div className={`border rounded-xl p-md flex flex-col gap-sm animate-pulse ${
            prediction.isOffRoute 
              ? 'bg-red-100 border-red-200 text-red-700' 
              : 'bg-amber-100 border-amber-200 text-amber-700'
          }`}>
            <div className="flex items-start gap-sm">
              <span className="material-symbols-outlined text-[24px]">warning</span>
              <div>
                <p className="text-xs font-bold leading-tight">
                  {prediction.isOffRoute ? '🚨 Off-Route Detected!' : '⚠️ Wrong Direction!'}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5">{prediction.warningMessage}</p>
              </div>
            </div>
            {prediction.isOffRoute && (
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="w-full py-2 bg-red-700 text-white rounded-lg text-xs font-bold active:scale-[0.97] transition-all flex items-center justify-center gap-xs"
              >
                🔄 Recalculate Route Path
              </button>
            )}
          </div>
        )}

        {/* Journey Completed Screen */}
        {prediction?.stopsRemaining === 0 && !activeAlarm ? (
          <div className="glass-panel p-lg text-center space-y-md border border-outline-variant/30 rounded-2xl shadow-xl animate-scale-up bg-surface-container-low">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl animate-bounce border border-emerald-200">
              ✓
            </div>
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold">Journey Completed!</h2>
              <p className="font-body-sm text-body-sm text-emerald-600 font-bold uppercase tracking-wider mt-1">Arrived at {destinationName}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant/80 mt-sm">
                Route finished safely. GPS scanning was terminated to prevent phone battery depletion.
              </p>
            </div>
            
            <div className="bg-surface border border-outline-variant/20 rounded-xl p-md grid grid-cols-2 gap-sm text-left">
              <div>
                <span className="text-[9px] text-on-surface-variant uppercase font-bold tracking-wider block">Stations Traveled</span>
                <span className="text-sm font-extrabold text-on-surface mt-0.5 block">{(prediction?.visitedStations?.length || 0)} stops</span>
              </div>
              <div>
                <span className="text-[9px] text-on-surface-variant uppercase font-bold tracking-wider block">Tracking Status</span>
                <span className="text-sm font-extrabold text-emerald-600 flex items-center gap-xs mt-0.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Safe & Finished
                </span>
              </div>
            </div>

            {presetSaved ? (
              <div className="bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl py-3 text-center border border-emerald-200">
                ✓ Saved as {presetSaved === 'home' ? 'Home Preset' : 'Work Preset'}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-sm w-full">
                <button
                  onClick={() => {
                    localStorage.setItem('smart_metro_home', route.path[0]);
                    localStorage.setItem('smart_metro_office', destinationName);
                    setPresetSaved('work');
                  }}
                  className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                >
                  💼 Set Work Preset
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('smart_metro_home', destinationName);
                    localStorage.setItem('smart_metro_office', route.path[0]);
                    setPresetSaved('home');
                  }}
                  className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1 transition-all"
                >
                  🏠 Set Home Preset
                </button>
              </div>
            )}

            <button
              id="end-trip-btn"
              onClick={handleEndTrip}
              className="w-full h-14 bg-primary text-on-primary rounded-xl font-title-md text-title-md shadow-lg flex items-center justify-center active:scale-[0.98] transition-all font-bold"
            >
              Done (Back to Home)
            </button>
          </div>
        ) : (
          <>
            {/* Full Route Schedule Timeline */}
            <section className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant/30 shadow-sm">
              <h3 className="font-title-md text-title-md mb-lg text-on-surface font-extrabold">Route Schedule</h3>
              
              {/* Sticky Upcoming Interchange Alert Card */}
              {upcomingInterchange && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-start gap-3 shadow-[0_4px_20px_rgba(245,158,11,0.08)] mb-6 animate-pulse">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    notifications_active
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider leading-none">Upcoming Transfer Alert</p>
                    <p className="text-xs text-on-surface font-bold leading-normal">
                      {upcomingInterchange.stopsAway === 0 ? (
                        <>
                          Transfer lines now at <span className="text-primary font-black">{upcomingInterchange.stationName}</span>!
                        </>
                      ) : (
                        <>
                          Transfer lines in <span className="text-primary font-black">{upcomingInterchange.stopsAway} stop{upcomingInterchange.stopsAway !== 1 ? 's' : ''}</span> at <strong>{upcomingInterchange.stationName}</strong>.
                        </>
                      )}
                    </p>
                    <p className="text-[10px] text-on-surface-variant leading-relaxed">
                      Change from the <span className="font-bold text-on-surface">{upcomingInterchange.currentLine} Line</span> to the <span className="font-bold text-on-surface">{upcomingInterchange.nextLine} Line</span>.
                    </p>
                  </div>
                </div>
              )}

              <div className="relative flex flex-col gap-md">
                {route.path.map((stationName, idx) => {
                  const isVisited = prediction?.visitedStations?.includes(stationName);
                  const isCurrent = stationName === currentStopName;
                  const isPast = idx < currentIndex;
                  const lineColor = route.stationDetails?.[idx]?.line;
                  const isLast = idx === route.path.length - 1;
                  const isInterchange = route.interchanges?.includes(stationName);
                  const nextLineColor = route.stationDetails?.[idx + 1]?.line;

                  return (
                    <div key={`${stationName}-${idx}`} className={`flex items-start gap-md relative z-10 ${isPast && !isCurrent ? 'opacity-50' : ''}`}>
                      {/* Station Dot & Dynamic Color-Coded Segments */}
                      <div className="flex flex-col items-center flex-shrink-0 relative">
                        {isCurrent ? (
                          <div className="w-6 h-6 rounded-full bg-white border-4 border-primary shadow-sm z-10 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-primary" style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
                          </div>
                        ) : isPast || isVisited ? (
                          <div className="w-6 h-6 rounded-full bg-primary border-4 border-white shadow-sm z-10"></div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white border-4 border-outline-variant shadow-sm z-10"></div>
                        )}
                        {!isLast && (
                          <div 
                            className="w-1 absolute top-6 bottom-[-16px] left-1/2 -translate-x-1/2" 
                            style={{ 
                              backgroundColor: LINE_COLORS[lineColor] || 'var(--outline-variant)',
                              opacity: isPast ? 0.35 : 1,
                              borderRadius: '2px'
                            }} 
                          />
                        )}
                      </div>

                      {/* Station Info */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={`font-body-lg text-body-lg font-semibold truncate ${isCurrent ? 'text-primary font-bold' : 'text-on-surface'}`}>
                          {stationName}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {isCurrent ? 'Current Station' : isPast || isVisited ? 'Departed' : `Arriving ~${(idx - currentIndex) * 3} min`}
                        </span>
                        
                        <div className="flex flex-wrap items-center gap-xs mt-1">
                          {lineColor && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider text-white"
                              style={{ backgroundColor: LINE_COLORS[lineColor] || '#4648d4' }}
                            >
                              {lineColor} Line
                            </span>
                          )}

                          {isInterchange && nextLineColor && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/25">
                              ↔ Interchange Point
                            </span>
                          )}
                        </div>

                        {/* Timeline Interchange Callout Box */}
                        {isInterchange && nextLineColor && (
                          <div className="mt-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-start gap-2.5 w-full max-w-sm">
                            <span className="material-symbols-outlined text-amber-600 text-[18px]">
                              sync_alt
                            </span>
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider">
                                Transfer Station
                              </p>
                              <p className="text-[10px] text-on-surface-variant leading-relaxed font-semibold">
                                Switch from <span className="font-bold text-on-surface">{lineColor} Line</span> to <span className="font-bold text-on-surface">{nextLineColor} Line</span>.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Current badge */}
                      {isCurrent && (
                        <div className="ml-auto flex-shrink-0">
                          <span className="bg-primary/10 text-primary px-sm py-1 rounded-full font-label-md text-label-md font-bold">CURRENT</span>
                        </div>
                      )}

                      {/* First / Last markers */}
                      {idx === 0 && !isCurrent && (
                        <div className="ml-auto flex-shrink-0">
                          <span className="bg-surface-container text-on-surface-variant px-sm py-1 rounded-full font-label-md text-[9px] font-bold border border-outline-variant/30">START</span>
                        </div>
                      )}
                      {isLast && !isCurrent && (
                        <div className="ml-auto flex-shrink-0">
                          <span className="bg-primary/10 text-primary px-sm py-1 rounded-full font-label-md text-[9px] font-bold">DESTINATION</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* End Journey Button */}
            <button
              id="end-trip-btn"
              onClick={handleEndTrip}
              className="w-full h-12 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold shadow-md hover:bg-primary-container active:scale-[0.98] transition-all"
            >
              Exit Journey Now
            </button>
          </>
        )}
      </main>
    </div>
  );
}
