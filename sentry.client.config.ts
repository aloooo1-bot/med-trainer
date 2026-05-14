import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: "https://6b868e3a1940e8c21df7e9d08aca6a91@o4511315236421632.ingest.us.sentry.io/4511315237273600",
  tracesSampleRate: 1,
  enableLogs: true,
  sendDefaultPii: true,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration()],
})
