export type RuntimeProviderOption = {
  value: string;
  label: string;
};

export const RUNTIME_PROVIDER_OPTIONS: readonly RuntimeProviderOption[] = [
  { value: 'codex', label: 'Codex' },
  { value: 'chatgpt-web', label: 'ChatGPT Web' },
  { value: 'xai', label: 'Grok' },
  { value: 'claude', label: 'Claude' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'gemini', label: 'Gemini API' },
  { value: 'gemini-interactions', label: 'Google Interactions' },
  { value: 'aistudio', label: 'AI Studio' },
  { value: 'vertex', label: 'Vertex' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'iflow', label: 'iFlow' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'openai-compatibility', label: 'OpenAI Compatibility' },
];
