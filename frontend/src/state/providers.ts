// Common OpenAI-compatible provider presets. Selecting one auto-fills the
// base URL, a sensible default model, and the conventional env-var name.
export interface ProviderPreset {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  envVar: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', envVar: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic (Claude)', baseURL: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest', envVar: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', envVar: 'GEMINI_API_KEY' },
  { id: 'mistral', label: 'Mistral', baseURL: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', envVar: 'MISTRAL_API_KEY' },
  { id: 'groq', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', envVar: 'GROQ_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', envVar: 'DEEPSEEK_API_KEY' },
  { id: 'xai', label: 'xAI (Grok)', baseURL: 'https://api.x.ai/v1', model: 'grok-2-latest', envVar: 'XAI_API_KEY' },
  { id: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', envVar: 'OPENROUTER_API_KEY' },
  { id: 'together', label: 'Together AI', baseURL: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', envVar: 'TOGETHER_API_KEY' },
  { id: 'fireworks', label: 'Fireworks AI', baseURL: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', envVar: 'FIREWORKS_API_KEY' },
  { id: 'perplexity', label: 'Perplexity', baseURL: 'https://api.perplexity.ai', model: 'sonar', envVar: 'PERPLEXITY_API_KEY' },
  { id: 'cerebras', label: 'Cerebras', baseURL: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', envVar: 'CEREBRAS_API_KEY' },
  { id: 'ollama', label: 'Ollama (local)', baseURL: 'http://localhost:11434/v1', model: 'llama3.2', envVar: 'OLLAMA_API_KEY' },
  { id: 'lmstudio', label: 'LM Studio (local)', baseURL: 'http://localhost:1234/v1', model: 'local-model', envVar: 'LMSTUDIO_API_KEY' },
];
