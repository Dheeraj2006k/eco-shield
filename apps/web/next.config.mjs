import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` is for Docker / self-hosting. Vercel sets VERCEL=1 and produces its own output.
  ...(process.env.VERCEL ? {} : { output: 'standalone', outputFileTracingRoot: root }),
  transpilePackages: ['@iris/ui', '@iris/config', '@iris/types'],
  experimental: { externalDir: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
