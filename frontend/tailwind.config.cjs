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
        sans: ["var(--font-ui)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-title)", "var(--font-ui)", "ui-sans-serif"],
        ui: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Apple Color Emoji', 'Noto Color Emoji'],
      },
      colors: {
        // Updated brand system - orange only for Today/active day
        brand: {
          DEFAULT: '#E85A0C',
          orange: {
            DEFAULT: '#E85A0C',
            600: '#E85A0C',
            700: '#D14D06', // darker for hover (6-8% darker)
            800: '#B8430B', // darker for pressed (12-15% darker)
          },
          600: '#E85A0C',
          700: '#D14D06',
          800: '#B8430B',
        },
        // Campus color system - distinct from brand orange
        campus: {
          e1: '#1790FF', // blue
          e2: '#10B981', // teal/green
        },
        // Background system
        app: {
          bg: '#F7F8FA',
        },
        surface: {
          bg: '#FFFFFF',
        },
        grid: {
          hour: 'rgb(0 0 0 / 8%)',
          half: 'rgb(0 0 0 / 4%)',
          bg: 'rgb(0 0 0 / 2%)',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)',
        1: '0 1px 2px rgba(0,0,0,.04), 0 1px 1px rgba(0,0,0,.02)',
        2: '0 2px 8px rgba(0,0,0,.06)',
        hover: '0 4px 16px rgba(0,0,0,.08)',
      },
      borderRadius: {
        xl: '14px',
      },
    },
  },
  plugins: [],
};



