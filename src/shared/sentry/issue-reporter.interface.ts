import { IssueLevel } from './issue-level.enum.js';

export interface Issue {
  level: IssueLevel;
  message: string;
  fingerprint: string[];
  context: Record<string, unknown>;
}

export interface IssueReporter {
  report(issue: Issue): void;
}

export const ISSUE_REPORTER = Symbol('ISSUE_REPORTER');
