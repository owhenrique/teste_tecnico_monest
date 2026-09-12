import { CircuitState } from './circuit-state.enum.js';

export interface CircuitBreakerOptions {
  threshold: number;
  resetMs: number;
  openError: () => Error;
  ignoreFailure?: (error: unknown) => boolean;
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(private readonly options: CircuitBreakerOptions) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw this.options.openError();
    }

    try {
      const result = await operation();

      this.consecutiveFailures = 0;

      return result;
    } catch (error: unknown) {
      this.recordFailure(error);

      throw error;
    }
  }

  private recordFailure(error: unknown): void {
    if (this.options.ignoreFailure?.(error) === true) {
      return;
    }

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= this.options.threshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = Date.now();
    }
  }

  private isOpen(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return false;
    }

    if (Date.now() - this.openedAt < this.options.resetMs) {
      return true;
    }

    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;

    return false;
  }
}
