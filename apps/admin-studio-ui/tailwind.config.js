import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        env: {
          local:      { bg: '#374151', fg: '#f9fafb', border: '#4b5563' },
          staging:    { bg: '#92400e', fg: '#fffbeb', border: '#b45309' },
          production: { bg: '#7f1d1d', fg: '#fef2f2', border: '#991b1b' },
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
    },
  },
  plugins: [
    containerQueries,
    // ADM-9.4: WCAG 2.2 minimum tap-target utilities
    ({ addUtilities }: { addUtilities: (utils: Record<string, Record<string, string>>) => void }) => {
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
    },
  ],
};
