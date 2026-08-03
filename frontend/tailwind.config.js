/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bunker: {
          bg: '#0a0a0a',
          panel: '#171717',
          border: '#2a2a2a',
          neon: '#39ff14',
          neonDim: '#1a8f0a',
          danger: '#ff003c',
          amber: '#ffb020',
          text: '#e5e5e5',
          muted: '#737373',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(57, 255, 20, 0.35)',
        danger: '0 0 16px rgba(255, 0, 60, 0.45)',
      },
      animation: {
        glitch: 'glitch 0.3s steps(2) infinite',
        scanline: 'scanline 8s linear infinite',
      },
      keyframes: {
        glitch: {
          '0%, 100%': { transform: 'translate(0)' },
          '25%': { transform: 'translate(-2px, 1px)' },
          '50%': { transform: 'translate(2px, -1px)' },
          '75%': { transform: 'translate(-1px, -2px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
  plugins: [],
};
