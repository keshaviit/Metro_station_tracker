import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MetroProvider } from './context/MetroContext';
import { User } from 'lucide-react';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import RouteResultPage from './pages/RouteResultPage';
import TrackingPage from './pages/TrackingPage';
import MapPage from './pages/MapPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const isGuest = !isAuthenticated && localStorage.getItem('metro_guest') === 'true';
  const showFloatingProfile = isGuest && location.pathname !== '/auth' && location.pathname !== '/profile';

  return (
    <div className="max-w-md mx-auto relative min-h-screen">
      {showFloatingProfile && (
        <button
          onClick={() => navigate('/profile')}
          className="absolute right-4 z-[9999] p-2.5 rounded-full border border-indigo-500/30 bg-[#12141c]/80 text-indigo-300 hover:text-white hover:scale-105 hover:border-indigo-400 active:scale-95 transition-all shadow-[0_0_15px_rgba(99,102,241,0.25)] backdrop-blur-md"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
          title="Guest Profile"
        >
          <User className="w-5 h-5 animate-pulse" />
        </button>
      )}

      <Routes>
        <Route path="/"       element={<HomePage />} />
        <Route path="/route"  element={<RouteResultPage />} />
        <Route path="/track"  element={<TrackingPage />} />
        <Route path="/map"    element={<MapPage />} />
        <Route path="/auth"   element={<AuthPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MetroProvider>
        <AppContent />
      </MetroProvider>
    </AuthProvider>
  );
}
