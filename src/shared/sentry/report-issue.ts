import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';

import { Issue } from './issue-reporter.interface.js';

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

  Sentry.init({ dsn, environment, beforeSend });
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
