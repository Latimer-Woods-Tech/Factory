/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Safe-area aliases for notched/gesture devices.
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
      colors: {
        env: {
          local:      { bg: '#374151', fg: '#f9fafb', border: '#4b5563' },
          staging:    { bg: '#92400e', fg: '#fffbeb', border: '#b45309' },
          production: { bg: '#7f1d1d', fg: '#fef2f2', border: '#991b1b' },
        },
      },
    },
  },
  plugins: [],
};
