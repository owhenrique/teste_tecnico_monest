import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';

import { Issue } from './issue-reporter.interface.js';
import { sanitizeEvent } from './sanitize-event.js';

interface SentrySetup {
  dsn: string | undefined;
  environment: string;
  beforeSend?: NodeOptions['beforeSend'];
}

let enabled = false;

export function setupSentry({ dsn, environment, beforeSend }: SentrySetup): void {
  enabled = dsn !== undefined && dsn.length > 0;

  if (!enabled) {
    return;
  }

  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      stackFrameVariables: false,
    },
    beforeSend: (event, hint) => {
      const clean = sanitizeEvent(event);

      return beforeSend ? beforeSend(clean, hint) : clean;
    },
  });
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function reportIssue({ level, message, fingerprint, context }: Issue): void {
  if (!enabled) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setLevel(level);
    scope.setFingerprint(fingerprint);
    scope.setContext('cep', context);
    Sentry.captureMessage(message);
  });
}

export async function flushIssues(timeoutMs = 2000): Promise<void> {
  if (!enabled) {
    return;
  }

  await Sentry.flush(timeoutMs);
}
