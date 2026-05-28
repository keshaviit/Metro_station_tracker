import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MetroProvider } from './context/MetroContext';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import RouteResultPage from './pages/RouteResultPage';
import TrackingPage from './pages/TrackingPage';
import MapPage from './pages/MapPage';
import AuthPage from './pages/AuthPage';
import ProfilePage from './pages/ProfilePage';

export default function App() {
  return (
    <AuthProvider>
      <MetroProvider>
        <div className="max-w-md mx-auto relative min-h-screen">
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
      </MetroProvider>
    </AuthProvider>
  );
}
