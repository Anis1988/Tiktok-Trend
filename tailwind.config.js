export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { 950: '#04050c', 900: '#090c1a', 800: '#10152b' },
        // Neon Studio: hints and small print a step lighter than Tailwind's slate-500, so they stay readable on the dark glass.
        slate: { 500: '#8592a8' },
      },
    },
  },
  plugins: [],
};
