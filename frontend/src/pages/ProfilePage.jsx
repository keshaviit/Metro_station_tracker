import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, ShieldCheck, Mail, Calendar, Train, MapPin, Settings2 } from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [homeStation, setHomeStation] = useState('Noida Sector 52');
  const [officeStation, setOfficeStation] = useState('Kashmere Gate');

  // Sync commutes with local storage
  useEffect(() => {
    const storedHome = localStorage.getItem('smart_metro_home');
    const storedOffice = localStorage.getItem('smart_metro_office');
    if (storedHome) setHomeStation(storedHome);
    if (storedOffice) setOfficeStation(storedOffice);
  }, []);

  // Redirect if not authenticated (after verification finishes)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleSignOut = () => {
    logout();
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

  if (!user) return null;

  // Extract date formatted nicely
  const memberSince = user.createdAt 
    ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : 'Recently';

  return (
    <div className="min-h-screen bg-[#07080d] px-4 pt-10 pb-28 relative overflow-hidden">
      {/* Background radial highlights */}
      <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-[250px] h-[250px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

      {/* Title */}
      <div className="text-center pt-8 pb-4 relative z-10 animate-fade-in">
        <h1 className="text-2xl font-black text-white leading-none tracking-tight">
          Commuter Profile
        </h1>
        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-1 block">
          Telemetry Station Node
        </span>
      </div>

      {/* Main card */}
      <div className="glass-card p-6 border border-white/5 bg-[#12141c]/50 backdrop-blur-2xl relative z-10 rounded-2xl max-w-md mx-auto shadow-2xl space-y-6">
        
        {/* Profile Avatar and Name */}
        <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-white/5">
          <div className="relative group">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-20 h-20 rounded-full border-2 border-indigo-500/30 object-cover shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <span className="text-2xl font-black text-white uppercase">{user.name?.charAt(0)}</span>
              </div>
            )}
            
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-2 border-[#12141c] rounded-full flex items-center justify-center text-[10px]" title="Telemetry Sync Verified">
              🟢
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-white">{user.name}</h3>
            <div className="inline-flex items-center gap-1 mt-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              {user.authProvider} Account
            </div>
          </div>
        </div>

        {/* User details */}
        <div className="space-y-3.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 pl-1">Telemetry Credentials</p>
          
          <div className="flex items-center gap-3.5 bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3">
            <Mail className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Registered Email</p>
              <p className="text-xs text-slate-200 font-medium truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3">
            <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold text-slate-500 uppercase">Verification Date</p>
              <p className="text-xs text-slate-200 font-medium">{memberSince}</p>
            </div>
          </div>
        </div>

        {/* Saved commutes telemetry info */}
        <div className="space-y-3.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Commute Presets</p>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[9px] font-bold uppercase">Home Node</span>
              </div>
              <p className="text-xs text-white font-bold truncate">{homeStation}</p>
            </div>

            <div className="bg-[#0a0b10]/40 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Train className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[9px] font-bold uppercase">Office Node</span>
              </div>
              <p className="text-xs text-white font-bold truncate">{officeStation}</p>
            </div>
          </div>
        </div>

        {/* Sign out button */}
        <div className="pt-2">
          <button
            onClick={handleSignOut}
            className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-400/40 text-rose-300 font-black py-3.5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all shadow-[0_2px_15px_rgba(244,63,94,0.05)]"
          >
            <LogOut className="w-4 h-4" />
            De-authenticate Profile
          </button>
        </div>

      </div>
    </div>
  );
}
