export const REQUEST_SCOPED_ERROR_ACTIONS = [
  'stop',
  'stop-and-cooldown',
  'continue',
  'continue-and-cooldown',
] as const;

export type RequestScopedErrorAction = (typeof REQUEST_SCOPED_ERROR_ACTIONS)[number];

export interface RequestScopedErrorRule {
  status?: number;
  match?: string[];
  matchRegexr?: string[];
  action?: string;
  [key: string]: unknown;
}

export type OAuthRequestScopedErrors = Record<string, RequestScopedErrorRule[]>;
