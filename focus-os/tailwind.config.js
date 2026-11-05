/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'], mono: ['"Cascadia Code"', 'ui-monospace', 'monospace'] },
      colors: {
        bg: '#09090b', panel: '#0f0f13', raised: '#15151b', line: '#23232c', hover: '#1b1b23',
        ink: '#f4f4f5', sub: '#a1a1aa', mute: '#71717a',
        accent: '#818cf8', prod: '#34d399', neut: '#64748b', dist: '#fb7185'
      },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        pulseDot: { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.45, transform: 'scale(0.8)' } }
      },
      animation: { fadeUp: 'fadeUp .28s ease-out both', pulseDot: 'pulseDot 2s ease-in-out infinite' }
    }
  },
  plugins: []
}
