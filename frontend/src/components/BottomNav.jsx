import { NavLink } from 'react-router-dom';
import { Home, Map, Navigation2 } from 'lucide-react';
import { useMetro } from '../context/MetroContext';

const navItems = [
  { to: '/',      label: 'Home',    icon: Home },
  { to: '/map',   label: 'Stations',icon: Map },
  { to: '/track', label: 'Track',   icon: Navigation2 },
];

export default function BottomNav() {
  const { state } = useMetro();

  return (
    <nav className="bottom-nav">
      <div className="flex items-center justify-around py-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            id={`nav-${label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-all ${
                isActive
                  ? 'text-metro-accent'
                  : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`relative transition-all ${isActive ? 'scale-110' : ''}`}>
                  <Icon className="w-5 h-5" />
                  {/* Active dot */}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-metro-accent rounded-full" />
                  )}
                  {/* Tracking indicator */}
                  {to === '/track' && state.isTracking && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
