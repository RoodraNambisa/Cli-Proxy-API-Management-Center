export type RuntimeProviderOption = {
  value: string;
  label: string;
  oauthModelConfig?: boolean;
};

// Keep built-in choices aligned with backend executor registration. Custom
// compatibility providers are supplied separately by the user's configuration.
export const RUNTIME_PROVIDER_OPTIONS: readonly RuntimeProviderOption[] = [
  { value: 'codex', label: 'Codex', oauthModelConfig: true },
  { value: 'chatgpt-web', label: 'ChatGPT Web' },
  { value: 'xai', label: 'Grok', oauthModelConfig: true },
  { value: 'claude', label: 'Claude', oauthModelConfig: true },
  { value: 'antigravity', label: 'Antigravity', oauthModelConfig: true },
  { value: 'gemini', label: 'Gemini API' },
  { value: 'gemini-interactions', label: 'Google Interactions' },
  { value: 'aistudio', label: 'AI Studio', oauthModelConfig: true },
  { value: 'vertex', label: 'Vertex', oauthModelConfig: true },
  { value: 'kimi', label: 'Kimi', oauthModelConfig: true },
  { value: 'openai-compatibility', label: 'OpenAI Compatibility' },
];

// These channels match OAuthModelAliasChannel in the backend.
export const OAUTH_PROVIDER_OPTIONS = RUNTIME_PROVIDER_OPTIONS.filter(
  (provider) => provider.oauthModelConfig
);

const RETIRED_NATIVE_PROVIDERS = new Set(['qwen', 'iflow', 'gemini-cli']);

export const isRetiredNativeProvider = (provider: string): boolean =>
  RETIRED_NATIVE_PROVIDERS.has(provider.trim().toLowerCase().replace(/_/g, '-'));
