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

  const isGuest = !isAuthenticated && localStorage.getItem('metro_guest') === 'true';
  const profilePath = isAuthenticated ? '/profile' : '/auth';

  const navItems = [
    { to: '/',           label: 'Home',     icon: 'home' },
    { to: '/map',        label: 'Map',     icon: 'map' },
    { to: '/track',      label: 'Tracking', icon: 'explore_nearby' },
    ...(!isGuest ? [{ to: profilePath, label: 'Profile', icon: 'person' }] : []),
  ];

  return (
    <footer className="fixed bottom-0 left-0 w-full flex justify-around items-center h-20 px-sm pb-safe bg-surface/80 backdrop-blur-md border-t border-outline-variant/30 shadow-lg z-50">
      {navItems.map(({ to, label, icon }) => {
        const isActive = location.pathname === to;
        return (
          <NavLink
            key={label}
            to={to}
            id={`nav-${label.toLowerCase()}`}
            className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all duration-200 active:scale-90 ${
              isActive
                ? 'text-primary bg-primary-container/20 font-bold'
                : 'text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <div className="relative">
              <span 
                className="material-symbols-outlined text-[24px]"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {icon}
              </span>
              {/* Alert indicator for tracking state */}
              {label === 'Tracking' && state.isTracking && (
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-surface animate-pulse" />
              )}
            </div>
            <span className="font-label-md text-[10px] uppercase tracking-wider mt-0.5">{label}</span>
          </NavLink>
        );
      })}
    </footer>
  );
}
