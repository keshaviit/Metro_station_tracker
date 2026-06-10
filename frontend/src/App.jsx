import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MetroProvider } from './context/MetroContext';
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
    const savedTheme = localStorage.getItem('metro_theme') || 'light';
    if (savedTheme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, []);

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
          const hasRequested = localStorage.getItem('has_requested_notifications');
          if (!hasRequested) {
            const result = await LocalNotifications.requestPermissions();
            console.log('[App] Notification permission result:', result.display);
            localStorage.setItem('has_requested_notifications', 'true');
          }

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
          const hasRequested = localStorage.getItem('has_requested_notifications');
          if (!hasRequested) {
            await Notification.requestPermission();
            localStorage.setItem('has_requested_notifications', 'true');
          }
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

  return (
    <div className="max-w-md mx-auto relative min-h-screen">

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
