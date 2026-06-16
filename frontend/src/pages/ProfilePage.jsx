import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { metroAPI } from '../services/api';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [history, setHistory] = useState([]);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  const [homeStation, setHomeStation] = useState('Noida Sector 52');
  const [officeStation, setOfficeStation] = useState('Kashmere Gate');

  // Check if guest user
  const isGuest = !isAuthenticated && localStorage.getItem('metro_guest') === 'true';

  const [theme, setTheme] = useState(() => localStorage.getItem('metro_theme') || 'light');
  
  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    localStorage.setItem('metro_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  };

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
      <div className="min-h-screen bg-background flex items-center justify-center">
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
  const carbonSavings = parseFloat((totalDistance * 0.14).toFixed(1));

  // Render Guest Page Placeholder
  if (isGuest) {
    return (
      <div className="bg-gradient-to-b from-[#F6FBF7] via-[#fcf8ff] to-[#f4f7fc] min-h-screen relative flex items-center justify-center p-6 pb-[96px]">
        {/* White Card */}
        <div className="bg-white border border-gray-100 rounded-[28px] p-8 w-full max-w-[360px] shadow-[0_8px_30px_rgba(0,0,0,0.03)] text-center flex flex-col items-center">
          
          {/* Circular Lock Icon Badge */}
          <div className="w-20 h-20 rounded-full bg-[#F6FBF7] border border-gray-100 flex items-center justify-center text-[#4CAF50] mb-6 shadow-sm">
            <svg className="w-10 h-10 text-[#4CAF50]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          {/* Heading */}
          <h2 className="text-[20px] font-extrabold text-gray-900 tracking-tight leading-tight mb-2">
            Unlock Commuter HUD
          </h2>

          {/* Description */}
          <p className="text-gray-500 text-sm leading-relaxed mb-6 max-w-[260px]">
            Create an account or sign in to track your personal commute analytics, save favorite stations, and record past journeys!
          </p>

          {/* Button */}
          <button
            onClick={() => navigate('/auth')}
            className="w-full h-12 bg-[#4CAF50] hover:bg-[#388E3C] text-white rounded-full font-bold text-[15px] shadow-sm hover:shadow transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">login</span>
            Sign In to Account
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
    <div className="min-h-screen bg-background text-on-background px-margin-mobile pt-safe pb-28 relative overflow-y-auto">
      {/* Background radial highlights */}
      <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Title */}
      <div className="text-center pt-8 pb-4 relative z-10 animate-fade-in">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-extrabold leading-none tracking-tight">
          Commuter Profile
        </h1>
        <span className="font-label-md text-xs text-primary uppercase tracking-widest mt-1 block font-bold">
          Telemetry Station Node
        </span>
      </div>

      {/* Profile Details Container */}
      <div className="glass-panel p-md border border-outline-variant/30 rounded-2xl max-w-md mx-auto shadow-md space-y-md bg-surface">
        
        {/* Profile Avatar and Name */}
        <div className="flex flex-col items-center text-center space-y-sm pb-4 border-b border-outline-variant/20">
          <div className="relative group">
            {user.picture ? (
              <div className="w-16 h-16 rounded-full overflow-hidden border border-primary/20 shadow-sm">
                <img
                  src={user.picture}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm text-primary">
                <span className="material-symbols-outlined text-[32px]">person</span>
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-4.5 h-4.5 bg-emerald-500 border border-surface rounded-full flex items-center justify-center text-[8px] text-white">
              ✓
            </div>
          </div>

          <div>
            <h3 className="font-title-md text-title-md text-on-surface font-extrabold leading-tight">{user.name}</h3>
            <div className="inline-flex items-center gap-xs mt-1.5 bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
              <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
              {user.authProvider} verified
            </div>
          </div>
        </div>

        {/* Journey Statistics */}
        <div className="space-y-sm">
          <p className="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider pl-1 font-bold">Travel Analytics HUD</p>
          <div className="grid grid-cols-3 gap-sm">
            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-2.5 text-center">
              <span className="material-symbols-outlined text-primary text-[20px] mb-0.5">subway</span>
              <div className="text-sm font-extrabold text-on-surface leading-tight">{totalTrips}</div>
              <div className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider">Journeys</div>
            </div>
            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-2.5 text-center">
              <span className="material-symbols-outlined text-primary text-[20px] mb-0.5">route</span>
              <div className="text-sm font-extrabold text-on-surface leading-tight">{totalDistance.toFixed(0)}</div>
              <div className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider">Total Km</div>
            </div>
            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-2.5 text-center">
              <span className="material-symbols-outlined text-emerald-600 text-[20px] mb-0.5">eco</span>
              <div className="text-sm font-extrabold text-emerald-600 leading-tight">{carbonSavings}</div>
              <div className="text-[8px] text-emerald-600/80 font-bold uppercase tracking-wider">Kg CO2 Saved</div>
            </div>
          </div>
        </div>

        {/* Saved commutes presets */}
        <div className="space-y-sm">
          <p className="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider pl-1 font-bold">Route Presets</p>
          <div className="grid grid-cols-2 gap-sm">
            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">home</span>
              <div className="min-w-0">
                <span className="text-[8px] font-bold text-on-surface-variant uppercase block leading-none mb-0.5">Home Node</span>
                <p className="text-xs text-on-surface font-bold truncate leading-tight">{homeStation}</p>
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-md flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary text-[20px]">work</span>
              <div className="min-w-0">
                <span className="text-[8px] font-bold text-on-surface-variant uppercase block leading-none mb-0.5">Office Node</span>
                <p className="text-xs text-on-surface font-bold truncate leading-tight">{officeStation}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Theme Preferences */}
        <div className="space-y-sm">
          <p className="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider pl-1 font-bold">Theme Settings</p>
          <div className="bg-surface-container border border-outline-variant/20 rounded-xl p-md flex items-center justify-between">
            <div>
              <span className="text-xs text-on-surface font-bold block">App Theme</span>
              <span className="text-[10px] text-on-surface-variant font-medium block">Select preferred styling.</span>
            </div>
            <div className="flex gap-xs bg-background border border-outline-variant/30 rounded-lg p-0.5">
              <button
                onClick={() => handleThemeChange('light')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all duration-150 ${
                  theme === 'light'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all duration-150 ${
                  theme === 'dark'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        {/* Previous completed journeys log timeline */}
        <div className="space-y-sm">
          <p className="font-label-md text-[10px] text-on-surface-variant uppercase tracking-wider pl-1 font-bold">Past Journeys Log</p>
          {fetchingHistory ? (
            <div className="py-6 text-center">
              <span className="loading-dot"/><span className="loading-dot"/><span className="loading-dot"/>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center bg-surface-container border border-dashed border-outline-variant/30 rounded-xl p-5">
              <p className="text-xs text-on-surface-variant">No journeys recorded yet.</p>
              <button 
                onClick={() => navigate('/')}
                className="mt-2 text-[10px] text-primary hover:underline font-bold uppercase tracking-wider"
              >
                Start Your First Journey ➔
              </button>
            </div>
          ) : (
            <div className="space-y-sm max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
              {history.map((item) => (
                <div key={item._id || Math.random()} className="flex items-center justify-between bg-surface-container-low border border-outline-variant/20 rounded-xl p-md hover:bg-surface-container transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate leading-tight">{item.source} ➔ {item.destination}</p>
                    <span className="text-[9px] text-on-surface-variant font-bold uppercase block mt-1">
                      {new Date(item.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0 pl-2">
                    <span className="text-xs font-black text-primary font-mono block leading-none">{item.distanceKm?.toFixed(1)} km</span>
                    <span className="text-[8px] text-on-surface-variant font-bold uppercase tracking-wider block mt-1">{item.durationMinutes} min</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Details metadata */}
        <div className="flex items-center justify-between bg-surface-container border border-outline-variant/20 rounded-xl p-md text-[10px] text-on-surface-variant font-medium">
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-outline">mail</span>
            <span className="truncate max-w-[150px]">{user.email}</span>
          </div>
          <span>Verified Node since {memberSince}</span>
        </div>

        {/* Sign Out Button */}
        <div className="pt-1">
          <button
            onClick={handleSignOut}
            className="w-full h-12 bg-error/10 hover:bg-error/20 border border-error/20 text-error rounded-xl font-label-md text-label-md font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-xs"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Log Out from Node
          </button>
        </div>

      </div>
    </div>
  );
}
