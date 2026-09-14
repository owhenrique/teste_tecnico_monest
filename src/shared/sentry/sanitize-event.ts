import type { ErrorEvent } from '@sentry/node';

function withoutQuery(url: string): string {
  const parsed = new URL(url);
  parsed.search = '';

  return parsed.toString();
}

export function sanitizeEvent(event: ErrorEvent): ErrorEvent {
  if (event.request === undefined) {
    return event;
  }

  const {
    cookies: _cookies,
    headers: _headers,
    query_string: _queryString,
    ...request
  } = event.request;

  if (request.url !== undefined) {
    request.url = withoutQuery(request.url);
  }

  const reproduce =
    request.method !== undefined && request.url !== undefined
      ? { curl: `curl -X ${request.method} '${request.url}'` }
      : undefined;

  return {
    ...event,
    request,
    ...(reproduce !== undefined && { contexts: { ...event.contexts, reproduce } }),
  };
}
