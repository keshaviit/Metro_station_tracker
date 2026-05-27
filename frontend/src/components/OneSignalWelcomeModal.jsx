import React, { useEffect, useState } from 'react';
import { BellRing, Sparkles, X } from 'lucide-react';

/**
 * OneSignalWelcomeModal
 * 
 * A premium glassmorphism modal dialog that displays when OneSignal integration is complete.
 * It provides the required single-button action to trigger the user's first journey.
 *
 * @param {boolean} isOpen - Controls visibility of the modal
 * @param {function} onClose - Closes the modal
 * @param {function} onTriggerTap - Callback function when the "Trigger your first journey" button is tapped
 */
export default function OneSignalWelcomeModal({ isOpen, onClose, onTriggerTap }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Trigger opening micro-animations
      const timer = setTimeout(() => setAnimate(true), 50);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAction = () => {
    if (onTriggerTap) {
      onTriggerTap();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className={`absolute inset-0 bg-[#0A0B10]/70 backdrop-blur-md transition-opacity duration-500 ease-out ${
          animate ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Modal Container (Glassmorphism Card) */}
      <div 
        className={`glass-card glass-card-glow w-full max-w-sm relative z-10 p-6 flex flex-col items-center text-center transition-all duration-500 ease-out transform ${
          animate ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-8'
        }`}
      >
        {/* Background Grid Accent */}
        <div className="tech-grid opacity-30" />

        {/* Ambient Radial Leak behind Icon */}
        <div className="absolute top-0 w-40 h-40 bg-indigo-500/10 rounded-full filter blur-xl pointer-events-none -z-10" />

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/5"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glowing Pulsing Icon Header */}
        <div className="relative mb-6 mt-2 flex items-center justify-center">
          <div className="absolute inset-0 bg-indigo-500/20 rounded-full filter blur-md animate-ping" style={{ animationDuration: '3s' }} />
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center relative z-10">
            <BellRing className="w-8 h-8 text-indigo-400 animate-pulse" />
          </div>
          <div className="absolute -top-1 -right-1">
            <Sparkles className="w-5 h-5 text-purple-300 animate-bounce" />
          </div>
        </div>

        {/* Modal Title */}
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-100 to-indigo-200 tracking-tight mb-3">
          Your OneSignal integration is complete!
        </h2>

        {/* Modal Description */}
        <p className="text-slate-300 text-sm leading-relaxed mb-8 px-2">
          Click the button below to trigger your first journey via an in-app message.
        </p>

        {/* Premium Animated Gradient Action Button */}
        <button
          onClick={handleAction}
          className="btn-gradient w-full py-3.5 px-6 rounded-xl font-semibold text-white text-sm shadow-lg flex items-center justify-center gap-2 select-none border border-white/10"
        >
          <Sparkles className="w-4 h-4 text-indigo-100" />
          <span>Trigger your first journey</span>
        </button>
      </div>
    </div>
  );
}
