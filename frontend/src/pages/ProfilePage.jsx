import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { metroAPI } from '../services/api';
import { User, LogOut, ShieldCheck, Mail, Calendar, Train, MapPin, Sparkles, Navigation2, CheckCircle } from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [history, setHistory] = useState([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  const [homeStation, setHomeStation] = useState('Noida Sector 52');
  const [officeStation, setOfficeStation] = useState('Kashmere Gate');

  // Check if guest user
  const isGuest = !isAuthenticated && localStorage.getItem('metro_guest') === 'true';

  // Sync commutes with local storage
  useEffect(() => {
    const storedHome = localStorage.getItem('smart_metro_home');
    const storedOffice = localStorage.getItem('smart_metro_office');
    if (storedHome) setHomeStation(storedHome);
    if (storedOffice) setOfficeStation(storedOffice);
  }, []);

  // Fetch travel history if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setFetchingHistory(true);
      metroAPI.getTripHistory()
        .then((res) => {
          setHistory(res.data || []);
        })
        .catch((err) => {
          console.warn('Failed to load travel history:', err.message);
        })
        .finally(() => {
          setFetchingHistory(false);
        });
    }
  }, [isAuthenticated]);

  // Redirect if neither authenticated nor guest
  useEffect(() => {
    if (!loading && !isAuthenticated && !isGuest) {
      navigate('/auth');
    }
  }, [isAuthenticated, isGuest, loading, navigate]);

  const handleSignOut = () => {
    logout();
    localStorage.removeItem('metro_guest');
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080d] flex items-center justify-center">
        <span className="flex gap-1.5">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </span>
      </div>
    );
  }

  // Compute travel statistics
  const totalTrips = history.length;
  const totalDistance = history.reduce((sum, item) => sum + (item.distanceKm || 0), 0);
  const totalDuration = history.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  const carbonSavings = parseFloat((totalDistance * 0.14).toFixed(1)); // 0.14kg CO2 saved per km compared to driving

  // Render Guest Page Placeholder
  if (isGuest) {
    return (
      <div className="min-h-screen bg-[#07080d] px-4 pt-10 pb-28 relative overflow-hidden flex flex-col justify-center">
        <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-[250px] h-[250px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

        <div className="glass-card p-6 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl relative z-10 rounded-2xl max-w-sm mx-auto text-center space-y-5 shadow-2xl animate-scale-up">
          <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center mx-auto text-indigo-400 text-2xl animate-pulse">
            🔒
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-black text-white">Unlock Commuter HUD</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Create an account or sign in to track your personal commute analytics, save favorite stations, and record past journeys!
            </p>
          </div>
          
          <button
            onClick={() => navigate('/auth')}
            className="w-full btn-gradient text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
          >
            <Sparkles className="w-4 h-4 text-indigo-200" />
            Sign In with Google / OTP
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const memberSince = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Recently';

  return (
    <div className="min-h-screen bg-[#07080d] px-4 pt-safe pb-28 relative overflow-hidden">
      {/* Background radial highlights */}
      <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Title */}
      <div className="text-center pt-8 pb-4 relative z-10 animate-fade-in">
        <h1 className="text-2xl font-black text-white leading-none tracking-tight">
          Commuter Profile
        </h1>
        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1 block">
          Telemetry Station Node
        </span>
      </div>

      {/* Profile Details Container */}
      <div className="glass-card p-5 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl relative z-10 rounded-2xl max-w-md mx-auto shadow-2xl space-y-5">
        
        {/* Profile Avatar and Name */}
        <div className="flex flex-col items-center text-center space-y-2.5 pb-4 border-b border-white/5">
          <div className="relative group">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-16 h-16 rounded-full border-2 border-indigo-500/30 object-cover shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <span className="text-xl font-black text-white uppercase">{user.name?.charAt(0)}</span>
              </div>
            )}
            
            <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 border border-[#12141c] rounded-full flex items-center justify-center text-[9px]">
              🟢
            </div>
          </div>

          <div>
            <h3 className="text-base font-black text-white leading-tight">{user.name}</h3>
            <div className="inline-flex items-center gap-1 mt-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[8px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              {user.authProvider} verified
            </div>
          </div>
        </div>

        {/* Journey Statistics (Pillar 2: Historical Telemetry stats) */}
        <div className="space-y-2">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Travel Analytics HUD</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-2.5 text-center">
              <span className="block text-xs mb-0.5 leading-none">🚇</span>
              <div className="text-sm font-black text-white leading-tight">{totalTrips}</div>
              <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Journeys</div>
            </div>
            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-2.5 text-center">
              <span className="block text-xs mb-0.5 leading-none">📍</span>
              <div className="text-sm font-black text-white leading-tight">{totalDistance.toFixed(0)}</div>
              <div className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">Total Km</div>
            </div>
            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-2.5 text-center">
              <span className="block text-xs mb-0.5 leading-none">🌱</span>
              <div className="text-sm font-black text-emerald-400 leading-tight">{carbonSavings}</div>
              <div className="text-[8px] text-emerald-500/80 font-bold uppercase tracking-wider">Kg CO2 Saved</div>
            </div>
          </div>
        </div>

        {/* Saved commutes presets */}
        <div className="space-y-2">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Route Presets</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3 flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-[8px] font-bold text-slate-500 uppercase block leading-none mb-0.5">Home Node</span>
                <p className="text-xs text-white font-bold truncate leading-tight">{homeStation}</p>
              </div>
            </div>

            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3 flex items-center gap-2.5">
              <Train className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="min-w-0">
                <span className="text-[8px] font-bold text-slate-500 uppercase block leading-none mb-0.5">Office Node</span>
                <p className="text-xs text-white font-bold truncate leading-tight">{officeStation}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Previous completed journeys log timeline */}
        <div className="space-y-2">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest pl-1">Past Journeys Log</p>
          {fetchingHistory ? (
            <div className="py-6 text-center">
              <span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center bg-[#0a0b10]/40 border border-dashed border-white/5 rounded-xl p-5">
              <p className="text-xs text-slate-500">No journeys recorded yet.</p>
              <button 
                onClick={() => navigate('/')}
                className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
              >
                Start Your First Journey ➔
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
              {history.map((item) => (
                <div key={item._id} className="flex items-center justify-between bg-[#0a0b10]/50 border border-white/5 rounded-xl p-3 hover:bg-[#0a0b10]/80 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-200 truncate leading-tight">{item.source} ➔ {item.destination}</p>
                    <span className="text-[9px] text-slate-500 font-bold uppercase block mt-0.5">
                      {new Date(item.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 pl-2">
                    <span className="text-xs font-black text-indigo-300 font-mono block leading-none">{item.distanceKm.toFixed(1)} km</span>
                    <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block mt-0.5">{item.durationMinutes} min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Details metadata */}
        <div className="flex items-center justify-between bg-[#0a0b10]/30 border border-white/5 rounded-xl p-3 text-[10px] text-slate-400">
          <div className="flex items-center gap-1">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[150px]">{user.email}</span>
          </div>
          <span>Verified since {memberSince}</span>
        </div>

        {/* De-authentication Button */}
        <div className="pt-1">
          <button
            onClick={handleSignOut}
            className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-400/40 text-rose-300 font-black py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all"
          >
            <LogOut className="w-4 h-4" />
            De-authenticate Profile
          </button>
        </div>

      </div>
    </div>
  );
}
