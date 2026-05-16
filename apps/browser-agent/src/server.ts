import { serve } from '@hono/node-server';
import { createApp } from './index.js';
import type { R2Config } from './index.js';

const port = Number(process.env['PORT']) || 8080;
const accountId = process.env['R2_ACCOUNT_ID'];
const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
const bucket = process.env['R2_BUCKET_NAME'];

const r2: R2Config | undefined =
  accountId && accessKeyId && secretAccessKey && bucket
    ? {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        publicDomain: process.env['R2_PUBLIC_DOMAIN'],
      }
    : undefined;

const app = createApp(undefined, r2);
serve({ fetch: app.fetch, port });
