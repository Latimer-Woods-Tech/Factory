import type { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    viewport: {
      options: {
        mobile: {
          name: 'Mobile 375',
          styles: { width: '375px', height: '812px' },
        },
        tablet: {
          name: 'Tablet 768',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop 1280',
          styles: { width: '1280px', height: '900px' },
        },
      },
    },
    chromatic: {
      viewports: [375, 768, 1280],
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#020617' },
        { name: 'light', value: '#f8fafc' },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const mode = context.parameters.mode as 'light' | 'dark' | 'reduced-motion' | 'rtl' | undefined;
      const reducedMotion = mode === 'reduced-motion';
      const rtl = mode === 'rtl';
      const dark = mode === 'dark' || !mode;

      return (
        <div
          dir={rtl ? 'rtl' : 'ltr'}
          style={{
            minHeight: '100vh',
            padding: '16px',
            background: dark ? '#020617' : '#f8fafc',
            color: dark ? '#e2e8f0' : '#0f172a',
            transition: reducedMotion ? 'none' : undefined,
          }}
        >
          <style>{reducedMotion ? '* { animation: none !important; transition: none !important; }' : ''}</style>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
