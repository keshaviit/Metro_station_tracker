import { Routes, Route } from 'react-router-dom';
import { MetroProvider } from './context/MetroContext';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import RouteResultPage from './pages/RouteResultPage';
import TrackingPage from './pages/TrackingPage';
import MapPage from './pages/MapPage';

export default function App() {
  return (
    <MetroProvider>
      <div className="max-w-md mx-auto relative min-h-screen">
        <Routes>
          <Route path="/"       element={<HomePage />} />
          <Route path="/route"  element={<RouteResultPage />} />
          <Route path="/track"  element={<TrackingPage />} />
          <Route path="/map"    element={<MapPage />} />
        </Routes>
        <BottomNav />
      </div>
    </MetroProvider>
  );
}
