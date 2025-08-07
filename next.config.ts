import {withSentryConfig} from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Add Turbopack configuration to suppress warnings
  turbopack: {
    // Empty configuration to acknowledge Turbopack usage
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'inbound.new',
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply CORS headers to all API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'development'
              ? 'http://localhost:3000'
              : process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : 'https://inbound.new',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ];
  },
  // Ignore SDK directory and whop app during build
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Ignore the SDK directory and whop app from webpack processing
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**', 
        '**/@inboundemail/**',
        '**/inbound-whop-app/**'
      ]
    };
    
    // Exclude whop app from module resolution
    config.resolve.alias = {
      ...config.resolve.alias,
      // Prevent accidental imports from whop app
      '@whop': false,
    };
    
    return config;
  },
  
  // Exclude whop app from page compilation
  experimental: {
    externalDir: true,
    outputFileTracingExcludes: {
      '*': [
        './inbound-whop-app/**/*',
        './aws/**/*',
        './scripts/**/*',
        './@inboundemail/**/*'
      ]
    }
  },
};

export default withSentryConfig(nextConfig, {
// For all available options, see:
// https://www.npmjs.com/package/@sentry/webpack-plugin#options

org: "exon-z2",
project: "inbound-nextjs",

// Only print logs for uploading source maps in CI
silent: !process.env.CI,

// For all available options, see:
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

// Upload a larger set of source maps for prettier stack traces (increases build time)
widenClientFileUpload: true,

// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
// This can increase your server load as well as your hosting bill.
// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
// side errors will fail.
tunnelRoute: "/monitoring",

// Automatically tree-shake Sentry logger statements to reduce bundle size
disableLogger: true,

// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
// See the following for more information:
// https://docs.sentry.io/product/crons/
// https://vercel.com/docs/cron-jobs
automaticVercelMonitors: true,
});