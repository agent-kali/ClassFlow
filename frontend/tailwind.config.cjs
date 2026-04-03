/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{css,scss}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'ui-sans-serif', 'system-ui'],
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        ui: ['"Inter"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto'],
      },
      colors: {
        // Dark background layers
        base: {
          DEFAULT: '#0a0a0f',
          50: '#0a0a0f',
        },
        surface: {
          DEFAULT: '#111118',
          bg: '#111118',
          light: '#1a1a24',
        },
        elevated: {
          DEFAULT: '#1a1a24',
        },
        overlay: {
          DEFAULT: '#22222e',
        },
        // Primary accent — electric indigo
        accent: {
          DEFAULT: '#6366f1',
          50: 'rgba(99,102,241,0.06)',
          100: 'rgba(99,102,241,0.12)',
          200: 'rgba(99,102,241,0.20)',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        // Warm secondary — coral/orange
        warm: {
          DEFAULT: '#f97316',
          50: 'rgba(249,115,22,0.06)',
          100: 'rgba(249,115,22,0.12)',
          200: 'rgba(249,115,22,0.20)',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        // Campus colors (kept for domain logic)
        campus: {
          e1: '#3b82f6',
          e2: '#10b981',
        },
        // Semantic status colors (muted for dark mode)
        success: {
          DEFAULT: '#22c55e',
          muted: 'rgba(34,197,94,0.15)',
          text: '#4ade80',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239,68,68,0.15)',
          text: '#f87171',
        },
        warning: {
          DEFAULT: '#f59e0b',
          muted: 'rgba(245,158,11,0.15)',
          text: '#fbbf24',
        },
        // Dark-mode-aware grays
        glass: {
          border: 'rgba(255,255,255,0.06)',
          'border-hover': 'rgba(255,255,255,0.10)',
          'border-active': 'rgba(255,255,255,0.15)',
        },
        // Legacy compatibility aliases
        brand: {
          DEFAULT: '#6366f1',
          orange: { DEFAULT: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412' },
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
        },
        app: { bg: '#0a0a0f' },
        grid: {
          hour: 'rgba(255,255,255,0.08)',
          half: 'rgba(255,255,255,0.04)',
          bg: 'rgba(255,255,255,0.02)',
        },
      },
      boxShadow: {
        'glass': '0 0 0 1px rgba(255,255,255,0.06)',
        'glass-hover': '0 0 0 1px rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.3)',
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.2)',
        'glow-accent': '0 0 20px rgba(99,102,241,0.3)',
        'glow-warm': '0 0 20px rgba(249,115,22,0.3)',
        '1': '0 1px 2px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.1)',
        '2': '0 2px 8px rgba(0,0,0,0.3)',
        'hover': '0 4px 16px rgba(0,0,0,0.4)',
      },
      borderRadius: {
        xl: '14px',
        '2xl': '16px',
        '3xl': '24px',
      },
      animation: {
        'float': 'float 8s ease-in-out infinite',
        'float-delayed': 'float 8s ease-in-out 3s infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'slide-in': 'slideIn 300ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-20px) rotate(2deg)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideIn: {
          '0%': { transform: 'translateX(110%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
