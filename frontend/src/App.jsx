import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** Guard: redirect to /auth if neither logged-in nor a guest */
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const isGuest = !isAuthenticated && localStorage.getItem('metro_guest') === 'true';

  if (loading) return null; // wait for session check

  if (!isAuthenticated && !isGuest) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const requestStartupPermissions = async () => {
      // 1. Unregister Service Worker & Clear Cache on native platforms to prevent loading stale cached assets
      if (Capacitor.isNativePlatform()) {
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              await registration.unregister();
              console.log('[App] Unregistered Service Worker on native platform');
            }
          }
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
              console.log('[App] Deleted cache:', name);
            }
          }
        } catch (cacheErr) {
          console.error('[App] Failed cleaning up worker/cache:', cacheErr);
        }
      }

      // 2. Request Notification permission & set up channel
      try {
        if (Capacitor.isNativePlatform()) {
          // Always request — if already granted, this is a no-op
          const result = await LocalNotifications.requestPermissions();
          console.log('[App] Notification permission result:', result.display);

          // Delete old channel first so Android re-reads our channel settings.
          // (Android caches channel config forever — delete forces a fresh creation.)
          try { await LocalNotifications.deleteChannel({ id: 'metro_alerts' }); } catch (_) {}

          await LocalNotifications.createChannel({
            id: 'metro_alerts',
            name: 'Metro Station Alerts',
            description: 'Alerts when approaching your destination station',
            importance: 5,    // IMPORTANCE_HIGH → plays sound, shows heads-up banner
            visibility: 1,    // VISIBILITY_PUBLIC → shows on lock screen
            vibration: true,
            lights: true,
            lightColor: '#6366F1',
          });
          console.log('[App] Notification channel created: metro_alerts');
        } else if ('Notification' in window && Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
      } catch (err) {
        console.error('Failed to request notifications permission:', err);
      }


      // 3. Request Geolocation permission
      try {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => console.log('Startup location access granted:', pos.coords.latitude, pos.coords.longitude),
            (err) => console.warn('Startup location access denied/error:', err.message),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        }
      } catch (err) {
        console.error('Failed to request location permission:', err);
      }
    };

    requestStartupPermissions();
  }, []);

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
        <Route path="/"        element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/route"   element={<ProtectedRoute><RouteResultPage /></ProtectedRoute>} />
        <Route path="/track"   element={<ProtectedRoute><TrackingPage /></ProtectedRoute>} />
        <Route path="/map"     element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
        <Route path="/auth"    element={<AuthPage />} />
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
