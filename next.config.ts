import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

const sentryOptions = {
  org: "jorge-z6",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    // Sentry's App Router auto-wrapping transforms route module exports in a way
    // that breaks Next.js 16 — causes "components.ComponentMod.handler is not a function"
    // on every request to /api/* routes. Disabling it; errors are still captured via
    // onRequestError (instrumentation.ts) and manual Sentry.captureException calls.
    autoInstrumentAppDirectory: false,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
};

// withSentryConfig corrupts App Router route-module exports under Next.js 16 + Turbopack
// (causes HTML 500 on every /api/* request in dev). Gate to production where webpack is used.
export default process.env.NODE_ENV === "production"
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;
