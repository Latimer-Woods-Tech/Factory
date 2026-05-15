import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import type { R2Config } from './index.js';

const port = Number(process.env['PORT']) || 8080;

const r2: R2Config | undefined =
  process.env['R2_ACCOUNT_ID'] &&
  process.env['R2_ACCESS_KEY_ID'] &&
  process.env['R2_SECRET_ACCESS_KEY'] &&
  process.env['R2_BUCKET_NAME']
    ? {
        accountId: process.env['R2_ACCOUNT_ID']!,
        accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
        secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
        bucket: process.env['R2_BUCKET_NAME']!,
        publicDomain: process.env['R2_PUBLIC_DOMAIN'],
      }
    : undefined;

const app = createApp(undefined, r2);
serve({ fetch: app.fetch, port });
