// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { IGNORED_ERRORS } from "./src/lib/sentry-noise";

Sentry.init({
  dsn: "https://13ae44f1f0029daff827cb3540cf165c@o4512168222785536.ingest.de.sentry.io/4512168231698512",

  // Production only — keeps local dev errors out of the live project.
  // SENTRY_DISABLED=1 silences CI / e2e runs, which build in production mode.
  enabled: process.env.NODE_ENV === "production" && !process.env.SENTRY_DISABLED,
  environment: process.env.NODE_ENV,

  // Benign errors (client disconnects, tabs from an older deployment): see src/lib/sentry-noise.ts.
  ignoreErrors: IGNORED_ERRORS,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Turns off collection of data that could identify users. Adjust per category:
  // https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
  dataCollection: {
    userInfo: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    httpBodies: [],
    httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
  },
});
