/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        metro: {
          blue:   '#2563EB',
          yellow: '#EAB308',
          red:    '#EF4444',
          green:  '#22C55E',
          violet: '#8B5CF6',
          pink:   '#EC4899',
          dark:   '#0F1117',
          card:   '#1A1D27',
          border: '#2A2D3A',
          accent: '#6366F1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':  'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':    'slideUp 0.3s ease-out',
        'fade-in':     'fadeIn 0.4s ease-out',
        'bounce-dot':  'bounceDot 1.4s infinite ease-in-out',
      },
      keyframes: {
        slideUp:   { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        bounceDot: { '0%, 80%, 100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
      },
      backgroundImage: {
        'gradient-metro': 'linear-gradient(135deg, #0F1117 0%, #1A1D27 50%, #0D1321 100%)',
        'gradient-card':  'linear-gradient(145deg, #1A1D27, #12151E)',
        'gradient-blue':  'linear-gradient(135deg, #2563EB, #1D4ED8)',
        'gradient-hero':  'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%)',
      },
    },
  },
  plugins: [],
}
