import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useNotification } from '../hooks/useNotification';
import { metroAPI } from '../services/api';
import MetroGraph from '../services/routeEngine';
import { Capacitor } from '@capacitor/core';

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
      <div className="bg-[#f8fafc] bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)] [background-size:16px_16px] min-h-screen relative flex items-center justify-center p-6 pb-[96px]">
        {/* White Card */}
        <div className="bg-white border border-gray-100 rounded-[28px] p-8 w-full max-w-[360px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] text-center flex flex-col items-center">
          
          {/* Circular Map Icon badge */}
          <div className="w-40 h-40 rounded-full bg-[#f8fafc] border border-gray-100 flex items-center justify-center relative shadow-inner mb-8 overflow-hidden">
            {/* SVG Grid */}
            <svg width="120" height="120" viewBox="0 0 120 120" className="absolute inset-0 m-auto opacity-70">
              <defs>
                <pattern id="cardGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                </pattern>
              </defs>
              <circle cx="60" cy="60" r="58" fill="url(#cardGrid)" stroke="#f1f5f9" strokeWidth="2" />
            </svg>

            {/* Teal Location Pin */}
            <span className="material-symbols-outlined text-[#4CAF50] text-[44px] relative z-10" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>

            {/* Overlapping Cancel badge at bottom right */}
            <div className="absolute bottom-6 right-6 w-8 h-8 rounded-full bg-white border border-[#4CAF50] flex items-center justify-center text-[#4CAF50] shadow-md z-20">
              <span className="material-symbols-outlined text-[16px] font-bold">close</span>
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-[22px] font-extrabold text-gray-900 tracking-tight leading-tight mb-2">
            No Active Trips
          </h2>

          {/* Description */}
          <p className="text-gray-500 text-sm leading-relaxed mb-8 max-w-[260px]">
            Start a journey from the Home Page to monitor your route and receive live updates.
          </p>

          {/* Button */}
          <button
            onClick={() => navigate('/')}
            className="w-full h-12 bg-[#4CAF50] hover:bg-[#388E3C] text-white rounded-full font-bold text-[15px] shadow-sm hover:shadow transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">map</span>
            Plan a Journey
          </button>

        </div>
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

  // 5-station slice logic
  const getMiniMapStations = () => {
    if (!route.path) return [];
    let startIdx = Math.max(0, currentIndex - 2);
    let endIdx = Math.min(route.path.length, startIdx + 5);
    
    // Adjust to always show 5 stations if the route has at least 5
    if (endIdx - startIdx < 5 && route.path.length >= 5) {
      startIdx = Math.max(0, endIdx - 5);
    }
    
    return route.path.slice(startIdx, endIdx).map((name, i) => ({
      name,
      originalIndex: startIdx + i,
      status: (startIdx + i) < currentIndex ? 'past' : (startIdx + i) === currentIndex ? 'present' : 'upcoming',
      lineColor: route.stationDetails?.[startIdx + i]?.line
    }));
  };
  const miniMapStations = getMiniMapStations();

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
      <nav className="sticky top-0 z-[8000] bg-surface/80 backdrop-blur-md text-primary font-title-md text-title-md border-b border-outline-variant/30 shadow-sm flex items-center justify-between px-margin-mobile h-16 mt-safe">
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
        </div>
      </nav>

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
      <main className="flex-1 pb-28 px-margin-mobile max-w-2xl mx-auto space-y-lg pt-lg overflow-y-auto">

        {/* Live Mini-Map Card */}
        <section className="relative w-full rounded-2xl overflow-hidden shadow-sm border border-outline-variant/30 bg-surface-container-lowest p-md py-6">
          <div className="flex justify-between items-center mb-6">
            <span className="font-title-md text-title-md text-on-surface font-extrabold flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse border border-emerald-200"></span>
              Live Track
            </span>
            <span className="font-label-md text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
              {prediction?.stopsRemaining != null ? `${prediction.stopsRemaining} stops left` : 'Calculating...'}
            </span>
          </div>

          <div className="flex items-center w-full mt-2">
            {/* Left Edge: Start Station & Ellipsis (Only if hidden) */}
            {miniMapStations[0]?.originalIndex > 0 && (
              <div className="flex items-center gap-1.5 mr-1 opacity-60">
                <div className="flex flex-col items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-outline-variant"></div>
                  <span className="text-[7px] font-bold text-on-surface-variant w-10 text-center truncate mt-1">
                    {route.path[0].split(' ').slice(0,2).join(' ')}
                  </span>
                </div>
                <span className="text-outline-variant font-black tracking-widest text-xs">...</span>
              </div>
            )}

            {/* Middle: The 5-Station Live Track */}
            <div className="relative flex-1 h-32 flex items-start pt-8 justify-between px-2">
              {/* The Background Track Line (Thick Gray to connect dots) */}
              <div className="absolute left-4 right-4 h-[6px] bg-[#E2E8F0] rounded-full top-8 -translate-y-1/2 z-0">
                {/* The Active Filled Track Line */}
                <div 
                  className="absolute left-0 h-full rounded-full transition-all duration-1000 ease-in-out" 
                  style={{ 
                    width: `${Math.min(100, Math.max(0, (miniMapStations.findIndex(s => s.status === 'present') / Math.max(1, miniMapStations.length - 1)) * 100))}%`,
                    backgroundColor: miniMapStations.find(s => s.status === 'present')?.lineColor ? (LINE_COLORS[miniMapStations.find(s => s.status === 'present').lineColor] || 'var(--primary)') : 'var(--primary)'
                  }}
                ></div>
                
                {/* Animated Train Icon with realistic driving glide */}
                <div 
                  className="absolute top-1/2 z-20 transition-all duration-1000 ease-in-out"
                  style={{ 
                    left: `${Math.min(100, Math.max(0, (miniMapStations.findIndex(s => s.status === 'present') / Math.max(1, miniMapStations.length - 1)) * 100))}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div 
                    className="w-8 h-4 bg-[#F8FAFC] rounded-[3px] border-2 border-[#94A3B8] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.15)] relative"
                  >
                    {/* Red cross pattern on train roof */}
                    <div className="relative w-2 h-2 flex items-center justify-center">
                      <div className="absolute w-2 h-[2px] bg-red-500 rounded-sm"></div>
                      <div className="absolute h-2 w-[2px] bg-red-500 rounded-sm"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Station Nodes */}
              {miniMapStations.map((station, idx) => {
                const isActive = station.status === 'present';
                const isPast = station.status === 'past';
                const isUpcoming = station.status === 'upcoming';
                // Always ensure active line color takes precedence for consistency, or use node's native line color
                const nodeColor = station.lineColor ? (LINE_COLORS[station.lineColor] || 'var(--primary)') : 'var(--primary)';

                return (
                  <div key={`${station.name}-${idx}`} className="flex flex-col items-center relative z-10 w-4">
                    {/* The dot */}
                    <div 
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-500 absolute -top-[7px] left-1/2 -translate-x-1/2 ${isActive ? 'scale-150 shadow-[0_0_12px_rgba(0,0,0,0.2)] bg-white' : isPast ? 'bg-white' : 'bg-surface-container-lowest border-outline-variant/60'}`}
                      style={{ borderColor: isUpcoming ? undefined : nodeColor }}
                    >
                      {isActive && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: nodeColor }}></div>}
                    </div>
                    {/* Station Name text - Rotated 45 degrees to avoid overlap */}
                    <span 
                      className={`absolute top-4 left-1/2 origin-top-left rotate-[40deg] w-24 text-left leading-tight tracking-wide ${isActive ? 'font-bold text-[10px] text-on-surface' : 'text-[9px] text-on-surface-variant font-medium'}`}
                    >
                      {station.name.split(' ').slice(0, 2).join(' ')}{station.name.split(' ').length > 2 ? '...' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Edge: Ellipsis & End Station (Only if hidden) */}
            {miniMapStations[miniMapStations.length - 1]?.originalIndex < route.path.length - 1 && (
              <div className="flex items-center gap-1.5 ml-1 opacity-60">
                <span className="text-outline-variant font-black tracking-widest text-xs">...</span>
                <div className="flex flex-col items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-outline-variant"></div>
                  <span className="text-[7px] font-bold text-on-surface-variant w-10 text-center truncate mt-1">
                    {destinationName.split(' ').slice(0,2).join(' ')}
                  </span>
                </div>
              </div>
            )}
          </div>
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
                    <div key={`${stationName}-${idx}`} className={`flex items-start gap-md relative z-10 ${isPast && !isCurrent ? 'opacity-50' : ''} pb-6`}>
                      
                      {/* Vertical Track Lines (positioned absolute relative to the full row) */}
                      {!isLast && (
                        <>
                          {/* Faint Background Track Line */}
                          <div 
                            className="w-1 absolute left-[18px] top-[40px] bottom-[-10px] bg-outline-variant opacity-50 rounded-[2px] z-0" 
                          />
                          
                          {/* Animated Active Track Line filling downwards */}
                          <div 
                            className="w-1 absolute left-[18px] top-[40px] bottom-[-10px] transition-transform duration-[1500ms] ease-out origin-top z-0" 
                            style={{ 
                              backgroundColor: LINE_COLORS[lineColor] || 'var(--primary)',
                              transform: isPast ? 'scaleY(1)' : 'scaleY(0)',
                              borderRadius: '2px'
                            }} 
                          />
                        </>
                      )}

                      {/* Station Dot Container */}
                      <div className="w-10 flex flex-col items-center justify-start flex-shrink-0 relative z-10">
                        {isCurrent ? (
                          <div 
                            className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center animate-radar-ripple animate-station-pop relative"
                            style={{ 
                              boxShadow: `0 0 0 0 ${LINE_COLORS[lineColor] || 'var(--primary)'}40, 0 0 0 0 ${LINE_COLORS[lineColor] || 'var(--primary)'}40` 
                            }}
                          >
                            <div className="w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center border-2" style={{ borderColor: LINE_COLORS[lineColor] || 'var(--primary)' }}>
                              <span className="material-symbols-outlined text-[16px]" style={{ color: LINE_COLORS[lineColor] || 'var(--primary)' }}>train</span>
                            </div>
                          </div>
                        ) : isPast || isVisited ? (
                          <div className="w-5 h-5 mt-2.5 rounded-full bg-primary border-4 border-white shadow-sm animate-station-pop" style={{ backgroundColor: LINE_COLORS[lineColor] || 'var(--primary)' }}></div>
                        ) : (
                          <div className="w-5 h-5 mt-2.5 rounded-full bg-surface-container border-4 border-outline-variant shadow-sm"></div>
                        )}
                      </div>

                      {/* Station Info */}
                      <div className="flex flex-col flex-1 min-w-0 pt-1">
                        <span className={`font-body-lg text-body-lg font-semibold truncate ${isCurrent ? 'text-primary font-bold text-lg' : 'text-on-surface'}`}>
                          {stationName}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                          {isCurrent ? 'Current Station' : isPast || isVisited ? 'Departed' : 'Upcoming'}
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
