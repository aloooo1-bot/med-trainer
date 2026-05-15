import * as Sentry from "@sentry/nextjs";

if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: "https://6b868e3a1940e8c21df7e9d08aca6a91@o4511315236421632.ingest.us.sentry.io/4511315237273600",
    integrations: [Sentry.replayIntegration()],
    tracesSampleRate: 1,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: true,
  })
}

export const onRouterTransitionStart =
  process.env.NODE_ENV === 'production' ? Sentry.captureRouterTransitionStart : () => {}
