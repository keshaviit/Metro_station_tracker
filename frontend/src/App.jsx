import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { MetroProvider } from './context/MetroContext';
import BottomNav from './components/BottomNav';
import HomePage from './pages/HomePage';
import RouteResultPage from './pages/RouteResultPage';
import TrackingPage from './pages/TrackingPage';
import MapPage from './pages/MapPage';

import OneSignalService from './services/onesignal';
import OneSignalWelcomeModal from './components/OneSignalWelcomeModal';

export default function App() {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Initialize OneSignal with App ID and handle push registration event
    OneSignalService.init('8647e74b-8524-4315-81f2-472ce4f65d52', () => {
      setShowWelcome(true);
    });
  }, []);

  const handleTriggerJourney = () => {
    // Set trigger as required by push subscription change spec
    OneSignalService.addTrigger('ai_implementation_campaign_email_journey', 'true');
  };

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

        {/* OneSignal Completion Welcome Modal */}
        <OneSignalWelcomeModal 
          isOpen={showWelcome}
          onClose={() => setShowWelcome(false)}
          onTriggerTap={handleTriggerJourney}
        />
      </div>
    </MetroProvider>
  );
}
