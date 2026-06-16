import { NavLink, useLocation } from 'react-router-dom';
import { useMetro } from '../context/MetroContext';
import { useAuth } from '../context/AuthContext';

export default function BottomNav() {
  const location = useLocation();
  const { state } = useMetro();
  const { isAuthenticated } = useAuth();

  if (location.pathname === '/auth') {
    return null;
  }

  const navItems = [
    { to: '/',           label: 'Home',     icon: 'home' },
    { to: '/track',      label: 'Tracking', icon: 'explore_nearby' },
    { to: '/profile',    label: 'Profile',  icon: 'person' }
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 pointer-events-none pb-safe">
      <div className="relative w-full h-[76px] pointer-events-auto">
        {/* SVG Curve Background */}
        <div className="absolute inset-0 w-full h-full drop-shadow-[0_-4px_10px_rgba(0,0,0,0.06)]">
          <svg viewBox="0 0 375 76" className="w-full h-full" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              className="fill-surface dark:fill-[#121118]"
              style={{ fill: 'var(--color-surface, white)' }}
              d="M0 24C0 10.7452 10.7452 0 24 0H121.144C130.686 0 139.141 5.56832 143.109 14.4965L147.531 24.4452C155.467 42.3021 173.344 54 193.313 54C213.282 54 231.159 42.3021 239.096 24.4452L243.518 14.4965C247.485 5.56832 255.94 0 265.483 0H351C364.255 0 375 10.7452 375 24V76H0V24Z" 
            />
          </svg>
        </div>

        {/* Navigation Items Container */}
        <div className="absolute inset-0 w-full h-full flex justify-between items-center px-4">
          
          {/* Left Item: Home */}
          <div className="w-1/3 flex justify-center pt-2">
            <NavLink
              to="/"
              className={({ isActive }) => `flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 active:scale-90 ${isActive ? 'text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>home</span>
                  <span className="text-[10px] uppercase tracking-wider mt-0.5">Home</span>
                </>
              )}
            </NavLink>
          </div>

          {/* Center Item: Tracking (Floating Button) */}
          <div className="w-1/3 flex justify-center -mt-10 relative z-10">
            <NavLink
              to="/track"
              className={({ isActive }) => `flex items-center justify-center w-[60px] h-[60px] rounded-full shadow-xl shadow-primary/30 transition-transform active:scale-90 ${isActive ? 'bg-primary text-on-primary scale-110 shadow-primary/50' : 'bg-primary/90 text-on-primary'}`}
            >
              <div className="relative">
                <span className="material-symbols-outlined text-[28px] font-bold">explore_nearby</span>
                {state.isTracking && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                )}
              </div>
            </NavLink>
          </div>

          {/* Right Item: Profile */}
          <div className="w-1/3 flex justify-center pt-2">
            <NavLink
              to="/profile"
              className={({ isActive }) => `flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 active:scale-90 ${isActive ? 'text-primary font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>person</span>
                  <span className="text-[10px] uppercase tracking-wider mt-0.5">Profile</span>
                </>
              )}
            </NavLink>
          </div>

        </div>
      </div>
    </div>
  );
}
