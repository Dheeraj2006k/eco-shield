import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}', '../../packages/config/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef3fb',
          100: '#d9e4f5',
          200: '#b5c9ea',
          300: '#86a6d9',
          400: '#5580c4',
          500: '#3563a8',
          600: '#284f8a',
          700: '#1f3f70',
          800: '#183258',
          900: '#0f2140',
          950: '#0a1729',
        },
        purple: { 50: '#f5f0ff', 100: '#ebe0ff', 200: '#d6c2fb', 500: '#7c3aed', 600: '#6d28d9', 700: '#5b21b6' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,33,64,0.05), 0 1px 3px rgba(15,33,64,0.06)',
        pop: '0 8px 24px rgba(15,33,64,0.14)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.45)' }, '100%': { boxShadow: '0 0 0 12px rgba(220,38,38,0)' } },
        flow: { '0%': { strokeDashoffset: '24' }, '100%': { strokeDashoffset: '0' } },
        slideIn: { '0%': { transform: 'translateX(12px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        flow: 'flow 1s linear infinite',
        slideIn: 'slideIn .25s ease-out',
      },
    },
  },
  plugins: [],
};
export default config;
