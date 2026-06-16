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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[380px] h-[60px] z-50 pointer-events-auto">
      {/* Capsule Container */}
      <div className="w-full h-full bg-white/95 dark:bg-[#1a1920]/95 border border-gray-100 dark:border-white/5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md flex items-center justify-between px-4">
        
        {/* Home Item */}
        <NavLink
          to="/"
          className={({ isActive }) => `flex items-center justify-center transition-all duration-300 ${
            isActive 
              ? 'bg-gray-100 dark:bg-white/10 px-6 py-2.5 rounded-full text-[#00664e] dark:text-[#00ab82] font-bold' 
              : 'px-6 py-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {({ isActive }) => (
            <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
              home
            </span>
          )}
        </NavLink>

        {/* Tracking Item */}
        <NavLink
          to="/track"
          className={({ isActive }) => `relative flex items-center justify-center transition-all duration-300 ${
            isActive 
              ? 'bg-gray-100 dark:bg-white/10 px-6 py-2.5 rounded-full text-[#00664e] dark:text-[#00ab82] font-bold' 
              : 'px-6 py-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {({ isActive }) => (
            <>
              <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                explore_nearby
              </span>
              {state.isTracking && (
                <span className="absolute top-1.5 right-5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-white dark:border-[#1a1920]" />
              )}
            </>
          )}
        </NavLink>

        {/* Profile Item */}
        <NavLink
          to="/profile"
          className={({ isActive }) => `flex items-center justify-center transition-all duration-300 ${
            isActive 
              ? 'bg-gray-100 dark:bg-white/10 px-6 py-2.5 rounded-full text-[#00664e] dark:text-[#00ab82] font-bold' 
              : 'px-6 py-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
          }`}
        >
          {({ isActive }) => (
            <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
              person
            </span>
          )}
        </NavLink>

      </div>
    </div>
  );
}
