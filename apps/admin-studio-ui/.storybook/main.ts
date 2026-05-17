import path from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const repoRoot = path.resolve(__dirname, '../../..');

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias ?? {}),
      '@latimer-woods-tech/design-tokens': path.resolve(repoRoot, 'packages/design-tokens/src/index.ts'),
    };

    viteConfig.server ??= {};
    viteConfig.server.fs ??= {};
    viteConfig.server.fs.allow = [
      ...(viteConfig.server.fs.allow ?? []),
      repoRoot,
    ];

    return viteConfig;
  },
};

export default config;
