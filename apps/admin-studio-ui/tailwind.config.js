import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        env: {
          local:      { bg: '#374151', fg: '#f9fafb', border: '#4b5563' },
          staging:    { bg: '#92400e', fg: '#fffbeb', border: '#b45309' },
          production: { bg: '#7f1d1d', fg: '#fef2f2', border: '#991b1b' },
        },
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.target-min': {
          minHeight: '2.25rem',
          minWidth: '2.25rem',
          paddingLeft: '0.75rem',
          paddingRight: '0.75rem',
        },
        '.target-primary': {
          minHeight: '2.75rem',
          minWidth: '2.75rem',
          paddingLeft: '1rem',
          paddingRight: '1rem',
        },
      });
    }),
  ],
};
