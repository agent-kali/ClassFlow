import type { Config } from 'tailwindcss';
import lineClamp from '@tailwindcss/line-clamp';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ui)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-title)", "var(--font-ui)", "ui-sans-serif"],
        ui: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Apple Color Emoji', 'Noto Color Emoji'],
      },
      colors: {
        // Brand tokens with accessible shades
        brand: {
          DEFAULT: '#F97316',
          orange: {
            600: '#FF6B1A', // brighter accent for buttons/active indicators
            700: '#E65100', // darker companion for hover/focus to preserve contrast
          },
          600: '#EA580C',
          700: '#C2410C',
        },
        campus: {
          e1: '#10B981',
          e2: '#60A5FA',
        },
        grid: {
          hour: 'rgb(0 0 0 / 8%)',
          half: 'rgb(0 0 0 / 4%)',
          bg: 'rgb(0 0 0 / 2%)',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        xl: '14px',
      },
    },
  },
  plugins: [
    lineClamp,
  ],
} satisfies Config;



