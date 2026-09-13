import type { HeaderEntry } from '@/utils/headers';

export const GROK_DEFAULT_KEYS = [
  'max_output_tokens',
  'reasoning.effort',
  'temperature',
  'top_p',
  'tool_choice',
  'parallel_tool_calls',
  'stream_tool_calls',
] as const;
export type GrokDefaultKey = (typeof GROK_DEFAULT_KEYS)[number];
export interface GrokVisualConfig {
  userAgent: string;
  clientVersion: string;
  clientIdentifier: string;
  headers: HeaderEntry[];
  passthrough: boolean;
  spoof: boolean;
  convergence: boolean;
  poolSize: string;
  confuse: boolean;
  webSearch: boolean;
  xSearch: boolean;
  defaults: Record<GrokDefaultKey, string>;
}
export const DEFAULT_GROK_CONFIG: GrokVisualConfig = {
  userAgent: '',
  clientVersion: '',
  clientIdentifier: '',
  headers: [],
  passthrough: false,
  spoof: false,
  convergence: false,
  poolSize: '4',
  confuse: false,
  webSearch: false,
  xSearch: false,
  defaults: {
    max_output_tokens: '',
    'reasoning.effort': '',
    temperature: '',
    top_p: '',
    tool_choice: '',
    parallel_tool_calls: '',
    stream_tool_calls: '',
  },
};
