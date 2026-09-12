import { Injectable } from '@nestjs/common';

import { Issue, IssueReporter } from './issue-reporter.interface.js';
import { reportIssue } from './report-issue.js';

@Injectable()
export class SentryIssueReporter implements IssueReporter {
  report(issue: Issue): void {
    reportIssue(issue);
  }
}
