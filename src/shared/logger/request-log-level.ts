import { HttpStatus } from '@nestjs/common';

import { LogLevel } from './log-level.enum.js';

export function requestLogLevel(statusCode: number, error?: Error): LogLevel {
  if (error !== undefined || statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return LogLevel.ERROR;
  }

  if (statusCode === HttpStatus.NOT_FOUND) {
    return LogLevel.INFO;
  }

  if (statusCode >= HttpStatus.BAD_REQUEST) {
    return LogLevel.WARN;
  }

  return LogLevel.INFO;
}
