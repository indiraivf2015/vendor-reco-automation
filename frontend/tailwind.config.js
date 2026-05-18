/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50:  '#f7f7f8',
          100: '#e8eaed',
          200: '#c7ccd3',
          300: '#9fa6b1',
          400: '#7a8493',
          500: '#566071',
          600: '#3d4757',
          700: '#2a3240',
          800: '#1a1f2b',
          900: '#13171f',
          950: '#0f1320',
        },
        accent: {
          50:  '#fff5ed',
          100: '#ffe7d4',
          200: '#fec6a3',
          300: '#fc9d6a',
          400: '#f97441',
          500: '#f25a14',
          600: '#dd3f0a',
          700: '#b6300a',
          800: '#902811',
          900: '#742411',
        },
        cream: {
          50:  '#fcfaf6',
          100: '#f7f3ea',
          200: '#ede4cf',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,19,32,0.04), 0 1px 1px rgba(15,19,32,0.02)',
        card: '0 4px 16px -4px rgba(15,19,32,0.08), 0 1px 4px rgba(15,19,32,0.04)',
      },
    },
  },
  plugins: [],
};
